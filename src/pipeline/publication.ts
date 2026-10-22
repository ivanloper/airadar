/**
 * Ciclo de vida editorial de una tendencia con historial completo de cambios.
 * Publicar exige no duplicar otra tendencia ya publicada (misma URL o título casi idéntico).
 */
import { and, eq, gte, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { publicationEvents, trends, type Trend } from "@/db/schema";
import { jaccard, titleTokens } from "@/lib/text";
import { canonicalizeUrl } from "@/lib/url";

import { STATUSES, type Status } from "@/lib/statuses";

export { STATUSES, type Status };

const TRANSITIONS: Record<Status, Status[]> = {
  detected: ["pending_analysis", "pending_review", "approved", "archived"],
  pending_analysis: ["pending_review", "archived"],
  pending_review: ["approved", "archived", "detected"],
  approved: ["published", "pending_review", "archived"],
  published: ["archived"],
  archived: ["pending_review", "detected"],
};

export function canTransition(from: Status, to: Status) {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export class PublicationError extends Error {}

const DUPLICATE_WINDOW_DAYS = 30;
const DUPLICATE_TITLE_THRESHOLD = 0.75;

export async function findPublishedDuplicate(db: Db, trend: Trend, now: Date): Promise<Trend | null> {
  const published = await db
    .select()
    .from(trends)
    .where(
      and(
        eq(trends.status, "published"),
        ne(trends.id, trend.id),
        gte(trends.publishedAt, new Date(now.getTime() - DUPLICATE_WINDOW_DAYS * 86_400_000)),
      ),
    );
  const url = canonicalizeUrl(trend.primaryUrl);
  const tokens = titleTokens(trend.title);
  for (const p of published) {
    if (canonicalizeUrl(p.primaryUrl) === url) return p;
    if (tokens.length >= 3 && jaccard(tokens, titleTokens(p.title)) >= DUPLICATE_TITLE_THRESHOLD) return p;
  }
  return null;
}

function snapshot(t: Trend) {
  return { title: t.title, summary: t.summary, recommendation: t.recommendation, score: t.score, confidence: t.confidence, revision: t.revision };
}

export async function transitionTrend(
  db: Db,
  trendId: number,
  to: Status,
  opts: { actor: "system" | "admin"; note?: string; now?: Date },
): Promise<Trend> {
  const now = opts.now ?? new Date();
  const [trend] = await db.select().from(trends).where(eq(trends.id, trendId));
  if (!trend) throw new PublicationError("Tendencia no encontrada.");
  const from = trend.status as Status;
  if (from === to) throw new PublicationError(`La tendencia ya está en estado «${STATUSES[to]}».`);
  if (!canTransition(from, to)) throw new PublicationError(`Transición no permitida: ${STATUSES[from]} → ${STATUSES[to]}.`);

  if (to === "published") {
    if (!trend.summary.trim()) throw new PublicationError("No se puede publicar sin resumen.");
    const dup = await findPublishedDuplicate(db, trend, now);
    if (dup) throw new PublicationError(`Duplicado de una tendencia ya publicada: «${dup.title}» (#${dup.id}).`);
  }

  // Actualización condicionada al estado leído: evita carreras entre dos publicaciones simultáneas.
  const [updated] = await db
    .update(trends)
    .set({
      status: to,
      updatedAt: now,
      ...(to === "published" ? { publishedAt: trend.publishedAt ?? now } : {}),
    })
    .where(and(eq(trends.id, trendId), eq(trends.status, from)))
    .returning();
  if (!updated) throw new PublicationError("La tendencia cambió de estado durante la operación; reintenta.");

  await db.insert(publicationEvents).values({
    trendId,
    at: now,
    actor: opts.actor,
    action: to === "archived" && from === "published" ? "retract" : to === "published" ? "publish" : "status",
    fromStatus: from,
    toStatus: to,
    note: opts.note ?? null,
    snapshot: snapshot(updated),
  });
  return updated;
}

/** Corrección manual: guarda la versión anterior en el historial y protege el texto frente al pipeline. */
export async function correctTrend(
  db: Db,
  trendId: number,
  patch: { title?: string; summary?: string; recommendation?: string },
  opts: { note?: string; now?: Date } = {},
): Promise<Trend> {
  const now = opts.now ?? new Date();
  const [trend] = await db.select().from(trends).where(eq(trends.id, trendId));
  if (!trend) throw new PublicationError("Tendencia no encontrada.");
  const clean = Object.fromEntries(
    Object.entries(patch)
      .filter(([, v]) => typeof v === "string")
      .map(([k, v]) => [k, (v as string).trim().slice(0, k === "title" ? 300 : 4000)]),
  );
  if (clean.title === "") throw new PublicationError("El título no puede estar vacío.");
  const [updated] = await db
    .update(trends)
    .set({ ...clean, manualOverride: true, revision: trend.revision + 1, updatedAt: now })
    .where(eq(trends.id, trendId))
    .returning();
  await db.insert(publicationEvents).values({
    trendId,
    at: now,
    actor: "admin",
    action: "correction",
    fromStatus: trend.status,
    toStatus: trend.status,
    note: opts.note ?? null,
    snapshot: { before: snapshot(trend), after: snapshot(updated) },
  });
  return updated;
}
