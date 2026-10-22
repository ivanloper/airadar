/**
 * Agrupación de señales en tendencias (resolución de identidades):
 *  1. Repositorio de GitHub (propio o enlazado desde otra plataforma) → "repo:owner/name".
 *  2. Misma URL canónica que una señal ya agrupada → misma tendencia.
 *  3. Título casi idéntico (Jaccard de tokens) a una tendencia reciente → misma tendencia.
 *  4. En otro caso, nueva tendencia "url:<canónica>".
 * Las señales nunca se fusionan ni se borran: cada una conserva su fuente y fecha.
 */
import { and, eq, gte, inArray, isNotNull, isNull, not, like, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { signals, trends } from "@/db/schema";
import { jaccard, sha256, slugify, titleTokens } from "@/lib/text";

export const TITLE_SIMILARITY_THRESHOLD = 0.72;
const MIN_TOKENS_FOR_TITLE_MATCH = 4;
const TITLE_WINDOW_DAYS = 7;

export function trendSlug(title: string, entityKey: string) {
  return `${slugify(title, 60)}-${sha256(entityKey).slice(0, 6)}`;
}

export async function assignTrends(db: Db, now: Date): Promise<{ assigned: number; created: number; touched: Set<number> }> {
  const pending = await db.select().from(signals).where(isNull(signals.trendId)).orderBy(signals.id);
  const touched = new Set<number>();
  if (!pending.length) return { assigned: 0, created: 0, touched };

  // Tendencias existentes por clave de entidad.
  const repoKeys = [...new Set(pending.filter((s) => s.linkedRepo).map((s) => `repo:${s.linkedRepo}`))];
  const byKey = new Map<string, number>();
  for (let i = 0; i < repoKeys.length; i += 500) {
    const rows = await db
      .select({ id: trends.id, key: trends.entityKey })
      .from(trends)
      .where(inArray(trends.entityKey, repoKeys.slice(i, i + 500)));
    for (const r of rows) byKey.set(r.key, r.id);
  }

  // Tendencias existentes por URL canónica de sus señales.
  const urls = [...new Set(pending.filter((s) => !s.linkedRepo).map((s) => s.canonicalUrl))];
  const byUrl = new Map<string, number>();
  for (let i = 0; i < urls.length; i += 500) {
    const rows = await db
      .selectDistinctOn([signals.canonicalUrl], { url: signals.canonicalUrl, trendId: signals.trendId })
      .from(signals)
      .where(and(inArray(signals.canonicalUrl, urls.slice(i, i + 500)), isNotNull(signals.trendId)));
    for (const r of rows) if (r.trendId) byUrl.set(r.url, r.trendId);
  }
  const urlKeys = urls.map((u) => `url:${u}`);
  for (let i = 0; i < urlKeys.length; i += 500) {
    const rows = await db
      .select({ id: trends.id, key: trends.entityKey })
      .from(trends)
      .where(inArray(trends.entityKey, urlKeys.slice(i, i + 500)));
    for (const r of rows) byUrl.set(r.key.slice(4), r.id);
  }

  // Candidatas para coincidencia por título (no repositorios, actividad reciente).
  const recent = await db
    .select({ id: trends.id, title: trends.title })
    .from(trends)
    .where(
      and(
        not(like(trends.entityKey, "repo:%")),
        gte(trends.lastSignalAt, new Date(now.getTime() - TITLE_WINDOW_DAYS * 86_400_000)),
      ),
    );
  const titleIndex = recent.map((t) => ({ id: t.id, tokens: titleTokens(t.title) }));

  let created = 0;
  for (const s of pending) {
    let trendId: number | undefined;
    let entityKey: string;
    if (s.linkedRepo) {
      entityKey = `repo:${s.linkedRepo}`;
      trendId = byKey.get(entityKey);
    } else {
      entityKey = `url:${s.canonicalUrl}`;
      trendId = byUrl.get(s.canonicalUrl);
      if (!trendId) {
        const tokens = titleTokens(s.title);
        if (tokens.length >= MIN_TOKENS_FOR_TITLE_MATCH) {
          let best = { id: 0, sim: 0 };
          for (const t of titleIndex) {
            const sim = jaccard(tokens, t.tokens);
            if (sim > best.sim) best = { id: t.id, sim };
          }
          if (best.sim >= TITLE_SIMILARITY_THRESHOLD) trendId = best.id;
        }
      }
    }

    if (!trendId) {
      const title = s.title;
      const [row] = await db
        .insert(trends)
        .values({
          entityKey,
          slug: trendSlug(s.linkedRepo ?? title, entityKey),
          kind: s.linkedRepo ? "repository" : s.kind,
          title,
          primaryUrl: s.linkedRepo ? `https://github.com/${s.linkedRepo}` : s.url,
          repoId: s.repoId,
          platforms: [s.platform],
          signalCount: 0,
          firstDetectedAt: now,
          lastSignalAt: now,
        })
        .onConflictDoUpdate({ target: trends.entityKey, set: { updatedAt: now } })
        .returning({ id: trends.id });
      trendId = row.id;
      created++;
      if (s.linkedRepo) byKey.set(entityKey, trendId);
      else {
        byUrl.set(s.canonicalUrl, trendId);
        titleIndex.push({ id: trendId, tokens: titleTokens(s.title) });
      }
    } else if (!s.linkedRepo) {
      byUrl.set(s.canonicalUrl, trendId);
    }

    await db.update(signals).set({ trendId }).where(eq(signals.id, s.id));
    touched.add(trendId);
  }

  // Tendencias de repositorio cuyo repositorio ya está en la base de datos.
  await db.execute(sql`
    update ${trends} t set repo_id = r.id
    from repositories r
    where t.repo_id is null and t.entity_key = 'repo:' || r.full_name`);

  return { assigned: pending.length, created, touched };
}
