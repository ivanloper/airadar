/** Consultas de lectura para fichas, histórico y fuentes (servidor). */
import { asc, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { connectorRuns, publicationEvents, repoAudits, repoSnapshots, repositories, signals, sources, trendScoreHistory, trends } from "@/db/schema";
import { signalsPerDay } from "./datasets";

export async function trendDetail(db: Db, slug: string) {
  const [trend] = await db.select().from(trends).where(eq(trends.slug, slug));
  if (!trend) return null;
  const [repo] = trend.repoId ? await db.select().from(repositories).where(eq(repositories.id, trend.repoId)) : [null];
  const [evidence, history, events, snapshots, audit] = await Promise.all([
    db
      .select({ signal: signals, sourceName: sources.name, official: sources.official, quality: sources.quality })
      .from(signals)
      .innerJoin(sources, eq(sources.key, signals.sourceKey))
      .where(eq(signals.trendId, trend.id))
      .orderBy(desc(sql`coalesce(${signals.publishedAt}, ${signals.observedAt})`)),
    db.select().from(trendScoreHistory).where(eq(trendScoreHistory.trendId, trend.id)).orderBy(asc(trendScoreHistory.computedAt)),
    db.select().from(publicationEvents).where(eq(publicationEvents.trendId, trend.id)).orderBy(desc(publicationEvents.at)),
    repo ? db.select().from(repoSnapshots).where(eq(repoSnapshots.repoId, repo.id)).orderBy(asc(repoSnapshots.observedAt)) : Promise.resolve([]),
    repo ? db.select().from(repoAudits).where(eq(repoAudits.repoId, repo.id)) : Promise.resolve([]),
  ]);
  return { trend, repo: repo ?? null, evidence, history, events, snapshots, audit: audit[0] ?? null };
}

export async function historyData(db: Db, now: Date, timeZone: string) {
  const [runs, events, movers, perDay] = await Promise.all([
    db.select().from(connectorRuns).orderBy(desc(connectorRuns.startedAt)).limit(60),
    db
      .select({ event: publicationEvents, title: trends.title, slug: trends.slug })
      .from(publicationEvents)
      .innerJoin(trends, eq(trends.id, publicationEvents.trendId))
      .orderBy(desc(publicationEvents.at))
      .limit(30),
    db.execute(sql`
      select t.slug, t.title, t.score, h.first_score, h.n
      from ${trends} t
      join (
        select trend_id, count(*)::int as n, (array_agg(score order by computed_at asc))[1] as first_score
        from ${trendScoreHistory} group by trend_id having count(*) > 1
      ) h on h.trend_id = t.id
      order by abs(t.score - h.first_score) desc
      limit 15`),
    signalsPerDay(db, 30, now, timeZone),
  ]);
  const moverRows = (Array.isArray(movers) ? movers : ((movers as { rows?: unknown[] }).rows ?? [])) as {
    slug: string;
    title: string;
    score: number;
    first_score: number;
    n: number;
  }[];
  return { runs, events, movers: moverRows, perDay };
}

export async function sourcesWithRuns(db: Db) {
  const list = await db.select().from(sources).orderBy(asc(sources.platform), asc(sources.name));
  const counts = await db.select({ key: signals.sourceKey, n: sql<number>`count(*)::int` }).from(signals).groupBy(signals.sourceKey);
  const byKey = new Map(counts.map((c) => [c.key, c.n]));
  return list.map((s) => ({ ...s, signalTotal: byKey.get(s.key) ?? 0 }));
}
