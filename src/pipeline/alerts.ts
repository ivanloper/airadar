/**
 * Alertas de Telegram: avisa una sola vez de cada tendencia que supera TELEGRAM_MIN_SCORE
 * (y, si es un repositorio, que esté auditado como fiable). Requiere TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID.
 */
import { and, desc, eq, gte, isNull, ne, or } from "drizzle-orm";
import { fetchWithRetry } from "@/connectors/http";
import type { Db } from "@/db/client";
import { repositories, trendAnalyses, trends } from "@/db/schema";
import type { AppConfig } from "@/lib/config";
import { truncate } from "@/lib/text";
import { parseAnalysis, VERDICTS } from "./analyze";

const MAX_PER_RUN = 5;

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export function formatAlert(t: { title: string; score: number; summary: string; slug: string }, url: string, extra: { verdict?: string; trust?: number | null }) {
  return [
    `<b>${escapeHtml(t.title)}</b>`,
    `Puntuación ${Math.round(t.score)}${extra.trust != null ? ` · confianza ${extra.trust}` : ""}${extra.verdict ? ` · ${escapeHtml(extra.verdict)}` : ""}`,
    escapeHtml(truncate(t.summary, 280)),
    `<a href="${escapeHtml(url)}">Ver ficha en AI Radar</a>`,
  ].join("\n");
}

export async function sendAlerts(db: Db, config: AppConfig, now: Date, fetchImpl: typeof fetch = fetch, log: (m: string) => void = () => {}) {
  if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_CHAT_ID) return { sent: 0 };
  const rows = await db
    .select({ t: trends, trust: repositories.trustScore, a: trendAnalyses })
    .from(trends)
    .leftJoin(repositories, eq(repositories.id, trends.repoId))
    .leftJoin(trendAnalyses, eq(trendAnalyses.trendId, trends.id))
    .where(
      and(
        isNull(trends.alertedAt),
        gte(trends.score, config.TELEGRAM_MIN_SCORE),
        // Solo novedades: al activar las alertas no se avisa de todo el histórico.
        gte(trends.lastSignalAt, new Date(now.getTime() - 7 * 86_400_000)),
        ne(trends.status, "archived"),
        or(isNull(trends.repoId), gte(repositories.trustScore, 80)),
      ),
    )
    .orderBy(desc(trends.score))
    .limit(MAX_PER_RUN);

  let sent = 0;
  const base = config.APP_URL.replace(/\/$/, "");
  for (const { t, trust, a } of rows) {
    const analysis = a ? parseAnalysis(a.data) : null;
    const text = formatAlert(
      { title: t.title, score: t.score, summary: analysis?.resumen ?? t.summary, slug: t.slug },
      `${base}/t/${t.slug}/`,
      { verdict: analysis ? VERDICTS[analysis.veredicto] : undefined, trust },
    );
    try {
      await fetchWithRetry(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: config.TELEGRAM_CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true }),
        fetchImpl,
        retries: 1,
      });
      await db.update(trends).set({ alertedAt: now }).where(eq(trends.id, t.id));
      sent++;
    } catch (err) {
      // Nunca se registra el token: el mensaje de error de fetchWithRetry solo incluye el host.
      log(`✗ Telegram: ${truncate((err as Error).message, 120)}`);
      break;
    }
  }
  log(`Alertas Telegram: ${sent}`);
  return { sent };
}
