/**
 * Conjuntos de datos compactos que las páginas pasan a los componentes de cliente.
 * Se calculan en cada petición (servidor) o una vez en el build (GitHub Pages).
 */
import { and, desc, eq, gte, inArray, isNotNull, or, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { connectorRuns, repoAudits, repoSnapshots, repositories, signals, sources, trendAnalyses, trends, type Trend } from "@/db/schema";
import { parseAnalysis } from "@/pipeline/analyze";
import { IS_STATIC } from "./mode";
import type { RepoRow } from "./repo-filter";
import { DEFAULT_WEIGHTS, type FactorKey } from "./scoring";
import { truncate } from "./text";
import { periodRange, PERIODS, type Period } from "./time";

const FACTORS = Object.keys(DEFAULT_WEIGHTS) as FactorKey[];

/** Número máximo de fichas de repositorio que se exportan como páginas estáticas. */
export const STATIC_REPO_PAGES = 900;
export const REPO_DATASET_LIMIT = 3000;

type Breakdown = { factors?: Partial<Record<FactorKey, { value: number; evidence: number }>> };

export function factorArrays(breakdown: unknown): { fv: number[] | null; fe: number[] | null } {
  const b = breakdown as Breakdown | null;
  if (!b?.factors) return { fv: null, fe: null };
  return {
    fv: FACTORS.map((k) => Math.round((b.factors?.[k]?.value ?? 0) * 1000) / 1000),
    fe: FACTORS.map((k) => b.factors?.[k]?.evidence ?? 0),
  };
}

const tsParam = (d: Date) => sql`${d.toISOString()}::timestamptz`;

export async function repoDataset(db: Db, now: Date, timeZone: string) {
  const starts = PERIODS.map((p) => periodRange(p, now, timeZone).start);
  const baseline = (start: Date) => sql<number | null>`(${repositories.stars} - (select s.stars from ${repoSnapshots} s
    where s.repo_id = ${repositories.id} and s.observed_at <= ${tsParam(start)} order by s.observed_at desc limit 1))`;
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);

  const rows = await db
    .select({
      r: repositories,
      slug: trends.slug,
      score: trends.score,
      conf: trends.confidence,
      stage: trends.stage,
      breakdown: trends.breakdown,
      plats: trends.platforms,
      flags: repoAudits.flags,
      g0: baseline(starts[0]),
      g1: baseline(starts[1]),
      g2: baseline(starts[2]),
    })
    .from(repositories)
    .leftJoin(trends, eq(trends.repoId, repositories.id))
    .leftJoin(repoAudits, eq(repoAudits.repoId, repositories.id))
    .where(
      and(
        eq(repositories.isFork, false),
        or(
          gte(repositories.createdAtGh, monthAgo),
          gte(repositories.stars, 500),
          gte(trends.score, 55),
          isNotNull(repositories.auditedAt),
        ),
      ),
    )
    .orderBy(desc(sql`coalesce(${trends.score}, 0)`), desc(repositories.stars))
    .limit(REPO_DATASET_LIMIT);

  const exported = new Set(rows.slice(0, STATIC_REPO_PAGES).map((x) => x.slug).filter(Boolean));
  const data: RepoRow[] = rows.map(({ r, ...x }) => {
    const ageDays = Math.max(1, (now.getTime() - r.createdAtGh.getTime()) / 86_400_000);
    const measured = r.growthValidated ? (r.starsDelta24h ?? (r.starsDelta7d !== null ? r.starsDelta7d / 7 : null)) : null;
    const { fv, fe } = factorArrays(x.breakdown);
    return {
      id: r.id,
      name: r.displayName,
      url: r.url,
      slug: x.slug,
      hasPage: Boolean(x.slug) && (!IS_STATIC || exported.has(x.slug)),
      desc: r.description ? truncate(r.description, 220) : null,
      lang: r.language,
      cat: r.category,
      type: r.projectType,
      mat: r.maturity,
      stars: r.stars,
      forks: r.forks,
      issues: r.openIssues,
      created: r.createdAtGh.toISOString(),
      seen: r.firstSeenAt.toISOString(),
      pushed: r.pushedAt?.toISOString() ?? null,
      g24: measured === null ? null : Math.round(measured * 10) / 10,
      gp: [x.g0, x.g1, x.g2],
      avg: Math.round((r.stars / ageDays) * 10) / 10,
      score: x.score,
      conf: x.conf,
      stage: x.stage,
      fv,
      fe,
      trust: r.trustScore,
      quality: r.qualityScore,
      flags: (x.flags ?? []).filter((f) => f.level !== "info").map((f) => ({ c: f.code, l: f.level })),
      compat: r.compat,
      plats: x.plats ?? ["github"],
      license: r.license,
      release: r.latestReleaseTag,
    };
  });

  const [{ first }] = await db.select({ first: sql<string | null>`min(${repoSnapshots.observedAt})::text` }).from(repoSnapshots);
  const langCount = new Map<string, number>();
  for (const d of data) if (d.lang) langCount.set(d.lang, (langCount.get(d.lang) ?? 0) + 1);
  const languages = [...langCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([l]) => l);
  const compatCount = new Map<string, number>();
  for (const d of data) for (const c of d.compat) compatCount.set(c, (compatCount.get(c) ?? 0) + 1);
  return {
    rows: data,
    languages,
    compat: [...compatCount.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n })),
    firstSnapshotAt: first ? new Date(first).toISOString() : null,
    generatedAt: now.toISOString(),
  };
}

/** Slugs que tendrán ficha estática en GitHub Pages. */
export async function staticTrendSlugs(db: Db, now: Date, timeZone: string) {
  const repos = await repoDataset(db, now, timeZone);
  const repoSlugs = repos.rows.filter((r) => r.hasPage && r.slug).map((r) => r.slug!);
  const others = await db
    .select({ slug: trends.slug })
    .from(trends)
    .where(
      or(
        and(sql`${trends.entityKey} not like 'repo:%'`, gte(trends.lastSignalAt, new Date(now.getTime() - 30 * 86_400_000))),
        eq(trends.status, "published"),
      ),
    );
  return [...new Set([...repoSlugs, ...others.map((o) => o.slug)])];
}

// ---------- Tendencias (overview, oportunidades, publicadas) ----------

export interface TrendLite {
  slug: string;
  title: string;
  kind: string;
  stage: string;
  status: string;
  cat: string;
  plats: string[];
  last: string;
  first: string;
  published: string | null;
  score: number;
  conf: number;
  fv: number[] | null;
  fe: number[] | null;
  summary: string;
}

export function toLite(t: Trend): TrendLite {
  return {
    slug: t.slug,
    title: t.title,
    kind: t.kind,
    stage: t.stage,
    status: t.status,
    cat: t.category,
    plats: t.platforms,
    last: t.lastSignalAt.toISOString(),
    first: t.firstDetectedAt.toISOString(),
    published: t.publishedAt?.toISOString() ?? null,
    score: t.score,
    conf: t.confidence,
    ...factorArrays(t.breakdown),
    summary: truncate(t.summary, 260),
  };
}

export async function overviewDataset(db: Db, now: Date, timeZone: string) {
  const day = new Date(now.getTime() - 86_400_000);
  const perPeriod = {} as Record<Period, { top: TrendLite[]; newTrends: number; platforms: { platform: string; n: number }[] }>;
  for (const p of PERIODS) {
    const { start } = periodRange(p, now, timeZone);
    const [top, [{ n }], platforms] = await Promise.all([
      db.select().from(trends).where(gte(trends.lastSignalAt, start)).orderBy(desc(trends.score)).limit(80),
      db.select({ n: sql<number>`count(*)::int` }).from(trends).where(gte(trends.firstDetectedAt, start)),
      db
        .select({ platform: signals.platform, n: sql<number>`count(*)::int` })
        .from(signals)
        .where(sql`coalesce(${signals.publishedAt}, ${signals.observedAt}) >= ${tsParam(start)}`)
        .groupBy(signals.platform)
        .orderBy(desc(sql`count(*)`)),
    ]);
    perPeriod[p] = { top: top.map(toLite), newTrends: n, platforms };
  }

  const measured = sql<number>`coalesce(${repositories.starsDelta24h}::float, ${repositories.starsDelta7d}::float / 7)`;
  const [kpi] = await db
    .select({
      signals24h: sql<number>`(select count(*)::int from ${signals} where ${signals.observedAt} >= ${tsParam(day)})`,
      pendingReview: sql<number>`(select count(*)::int from ${trends} where ${trends.status} = 'pending_review')`,
      published: sql<number>`(select count(*)::int from ${trends} where ${trends.status} = 'published')`,
      repos: sql<number>`(select count(*)::int from ${repositories})`,
      audited: sql<number>`(select count(*)::int from ${repoAudits})`,
      lastRun: sql<string | null>`(select max(${connectorRuns.finishedAt})::text from ${connectorRuns})`,
    })
    .from(sql`(select 1) as one`);

  const [accelerating, recent, timeline, connectors] = await Promise.all([
    db
      .select({ name: repositories.displayName, slug: trends.slug, growth: measured, trust: repositories.trustScore, compat: repositories.compat })
      .from(repositories)
      .innerJoin(trends, eq(trends.repoId, repositories.id))
      .where(and(eq(repositories.growthValidated, true), sql`${measured} > 0`))
      .orderBy(sql`${measured} desc`)
      .limit(8),
    db
      .select({ s: signals, sourceName: sources.name, slug: trends.slug })
      .from(signals)
      .innerJoin(sources, eq(sources.key, signals.sourceKey))
      .leftJoin(trends, eq(trends.id, signals.trendId))
      .where(sql`${signals.platform} <> 'github'`)
      .orderBy(desc(sql`coalesce(${signals.publishedAt}, ${signals.observedAt})`))
      .limit(10),
    signalsPerDay(db, 30, now, timeZone),
    db.select().from(sources),
  ]);

  return {
    perPeriod,
    kpi: { ...kpi, lastRun: kpi.lastRun ? new Date(kpi.lastRun).toISOString() : null },
    accelerating: accelerating.map((a) => ({ ...a, growth: Math.round(a.growth * 10) / 10 })),
    recent: recent.map(({ s, sourceName, slug }) => ({
      id: s.id,
      title: s.title,
      url: s.url,
      slug,
      source: sourceName,
      published: s.publishedAt?.toISOString() ?? null,
      observed: s.observedAt.toISOString(),
      points: s.metrics.points ?? null,
    })),
    timeline,
    connectors: summarizeConnectors(connectors),
  };
}

function summarizeConnectors(list: (typeof sources.$inferSelect)[]) {
  const acc: Record<string, { name: string; enabled: number; status: string | null; last: string | null }> = {};
  for (const c of list) {
    const k = c.kind === "rss" ? "rss" : c.key;
    const cur = acc[k] ?? { name: c.kind === "rss" ? "Feeds RSS" : c.name, enabled: 0, status: null, last: null };
    if (c.enabled) cur.enabled++;
    if (c.enabled && (c.lastStatus === "error" || (c.lastStatus && cur.status !== "error"))) cur.status = c.lastStatus;
    const last = c.lastRunAt?.toISOString() ?? null;
    if (last && (!cur.last || last > cur.last)) cur.last = last;
    acc[k] = cur;
  }
  const order = ["github", "hackernews", "rss", "x", "reddit", "youtube"];
  return Object.entries(acc)
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([, v]) => v);
}

export async function signalsPerDay(db: Db, days: number, now: Date, timeZone: string) {
  const since = new Date(now.getTime() - days * 86_400_000);
  const when = sql`coalesce(${signals.publishedAt}, ${signals.observedAt})`;
  return db
    .select({
      day: sql<string>`to_char((${when} at time zone ${timeZone})::date, 'YYYY-MM-DD')`,
      platform: signals.platform,
      n: sql<number>`count(*)::int`,
    })
    .from(signals)
    .where(sql`${when} >= ${tsParam(since)}`)
    .groupBy(sql.raw("1"), sql.raw("2"));
}

// ---------- Web y lanzamientos ----------

export interface WebRow {
  id: number;
  title: string;
  url: string;
  discussion: string | null;
  source: string;
  sourceKey: string;
  official: boolean;
  platform: string;
  kind: string;
  published: string | null;
  observed: string;
  excerpt: string | null;
  points: number | null;
  comments: number | null;
  slug: string | null;
  cat: string | null;
  score: number | null;
  conf: number | null;
  fv: number[] | null;
  fe: number[] | null;
  plats: string[];
}

export async function webDataset(db: Db, now: Date) {
  const since = new Date(now.getTime() - 31 * 86_400_000);
  const rows = await db
    .select({ s: signals, sourceName: sources.name, official: sources.official, t: trends })
    .from(signals)
    .innerJoin(sources, eq(sources.key, signals.sourceKey))
    .leftJoin(trends, eq(trends.id, signals.trendId))
    .where(and(inArray(signals.platform, ["web", "hackernews"]), sql`coalesce(${signals.publishedAt}, ${signals.observedAt}) >= ${tsParam(since)}`))
    .orderBy(desc(sql`coalesce(${signals.publishedAt}, ${signals.observedAt})`))
    .limit(1500);
  const data: WebRow[] = rows.map(({ s, sourceName, official, t }) => ({
    id: s.id,
    title: s.title,
    url: s.url,
    discussion: s.discussionUrl,
    source: sourceName,
    sourceKey: s.sourceKey,
    official,
    platform: s.platform,
    kind: s.kind,
    published: s.publishedAt?.toISOString() ?? null,
    observed: s.observedAt.toISOString(),
    excerpt: s.excerpt ? truncate(s.excerpt, 200) : null,
    points: s.metrics.points ?? null,
    comments: s.metrics.comments ?? null,
    slug: t?.slug ?? null,
    cat: t?.category ?? null,
    score: t?.score ?? null,
    conf: t?.confidence ?? null,
    ...factorArrays(t?.breakdown),
    plats: t?.platforms ?? [s.platform],
  }));
  const sourceList = [...new Map(data.map((d) => [d.sourceKey, d.source])).entries()]
    .map(([key, name]) => ({ key, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { rows: data, sourceList };
}

// ---------- Oportunidades ----------

export async function opportunityDataset(db: Db) {
  const rows = await db
    .select({ t: trends, r: repositories, a: trendAnalyses })
    .from(trends)
    .leftJoin(repositories, eq(repositories.id, trends.repoId))
    .leftJoin(trendAnalyses, eq(trendAnalyses.trendId, trends.id))
    .where(and(gte(trends.score, 60), sql`${trends.status} <> 'archived'`))
    .orderBy(desc(sql`${trends.score} * (0.5 + 0.5 * ${trends.confidence}) * (case when ${repositories.trustScore} is null then 1 else 0.6 + 0.4 * ${repositories.trustScore} / 100.0 end)`))
    .limit(80);
  return rows.map(({ t, r, a }) => ({
    ...toLite(t),
    analysis: a ? parseAnalysis(a.data) : null,
    summary: t.summary,
    recommendation: t.recommendation,
    missing: ((t.breakdown as { missing?: string[] }).missing ?? []).slice(0, 5),
    velocity: t.velocity,
    velocityBasis: t.velocityBasis,
    experimentCost: t.experimentCost,
    risk: t.risk,
    signalCount: t.signalCount,
    repoDesc: r?.description ? truncate(r.description, 300) : null,
    trust: r?.trustScore ?? null,
    quality: r?.qualityScore ?? null,
    compat: r?.compat ?? [],
    stars: r?.stars ?? null,
  }));
}
export type OpportunityRow = Awaited<ReturnType<typeof opportunityDataset>>[number];

export async function publishedDataset(db: Db) {
  const rows = await db
    .select({ t: trends, a: trendAnalyses })
    .from(trends)
    .leftJoin(trendAnalyses, eq(trendAnalyses.trendId, trends.id))
    .where(eq(trends.status, "published"))
    .orderBy(desc(trends.publishedAt))
    .limit(500);
  return rows.map(({ t, a }) => {
    const analysis = a ? parseAnalysis(a.data) : null;
    return { ...toLite(t), summary: analysis ? truncate(analysis.resumen, 260) : truncate(t.summary, 260), verdict: analysis?.veredicto ?? null, revision: t.revision };
  });
}
