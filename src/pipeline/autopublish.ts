/**
 * Publicación automática con control de calidad. Solo publica lo que supera TODOS los umbrales;
 * lo demás queda en revisión. Desactivada por defecto (AUTO_PUBLISH=false).
 */
import { and, eq, gte, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { repositories, trendAnalyses, trends, type Repository, type Trend } from "@/db/schema";
import type { AppConfig } from "@/lib/config";
import { parseAnalysis, type Analysis } from "./analyze";
import { PublicationError, transitionTrend } from "./publication";

export const MIN_TRUST_TO_PUBLISH = 80;

/** Motivos por los que una tendencia NO puede publicarse automáticamente (vacío = apta). */
export function publicationGate(
  t: Pick<Trend, "score" | "confidence" | "summary">,
  repo: Pick<Repository, "trustScore"> | null,
  analysis: Analysis | null,
  config: Pick<AppConfig, "PUBLISH_MIN_SCORE" | "PUBLISH_MIN_CONFIDENCE">,
  aiEnabled: boolean,
): string[] {
  const reasons: string[] = [];
  if (t.score < config.PUBLISH_MIN_SCORE) reasons.push(`puntuación ${t.score} < ${config.PUBLISH_MIN_SCORE}`);
  if (t.confidence < config.PUBLISH_MIN_CONFIDENCE) reasons.push(`confianza ${t.confidence} < ${config.PUBLISH_MIN_CONFIDENCE}`);
  if (!t.summary.trim()) reasons.push("sin resumen");
  if (repo) {
    if (repo.trustScore === null) reasons.push("repositorio sin auditar");
    else if (repo.trustScore < MIN_TRUST_TO_PUBLISH) reasons.push(`confianza del repositorio ${repo.trustScore} < ${MIN_TRUST_TO_PUBLISH}`);
  }
  if (aiEnabled) {
    if (!analysis) reasons.push("sin análisis");
    else if (analysis.veredicto === "descartar") reasons.push("el análisis recomienda descartar");
    else if (analysis.confianza === "baja") reasons.push("análisis de confianza baja");
  }
  return reasons;
}

export async function autoPublish(db: Db, config: AppConfig, now: Date, aiEnabled: boolean, log: (m: string) => void = () => {}) {
  if (!config.AUTO_PUBLISH) return { published: 0 };
  const rows = await db
    .select({ t: trends, r: repositories, a: trendAnalyses })
    .from(trends)
    .leftJoin(repositories, eq(repositories.id, trends.repoId))
    .leftJoin(trendAnalyses, eq(trendAnalyses.trendId, trends.id))
    .where(and(inArray(trends.status, ["detected", "pending_review", "approved"]), gte(trends.score, config.PUBLISH_MIN_SCORE)));

  let published = 0;
  for (const { t, r, a } of rows) {
    const reasons = publicationGate(t, r, a ? parseAnalysis(a.data) : null, config, aiEnabled);
    if (reasons.length) continue;
    try {
      let status = t.status;
      if (status === "detected") status = (await transitionTrend(db, t.id, "pending_review", { actor: "system", now })).status;
      if (status === "pending_review") {
        status = (await transitionTrend(db, t.id, "approved", { actor: "system", note: "Supera el control de calidad automático.", now })).status;
      }
      await transitionTrend(db, t.id, "published", { actor: "system", note: "Publicación automática.", now });
      published++;
    } catch (err) {
      if (!(err instanceof PublicationError)) throw err;
      // Duplicado u otra regla editorial: vuelve a revisión humana con el motivo.
      const [cur] = await db.select({ status: trends.status }).from(trends).where(eq(trends.id, t.id));
      if (cur?.status === "approved") await transitionTrend(db, t.id, "pending_review", { actor: "system", note: err.message, now });
    }
  }
  log(`Publicación automática: ${published} nuevas`);
  return { published };
}
