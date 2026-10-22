/**
 * Recalcula agregados, puntuación, estado y textos de las tendencias.
 * Todo es determinista: mismas entradas → misma puntuación. El histórico de puntuaciones
 * solo crece cuando cambian las entradas o la puntuación se mueve de forma apreciable.
 */
import { desc, eq, gte, inArray, or } from "drizzle-orm";
import type { Db } from "@/db/client";
import { repoAudits, repositories, signals, sources, trendScoreHistory, trends, type RepoAudit, type Repository, type Signal, type Source, type Trend } from "@/db/schema";
import type { AppConfig } from "@/lib/config";
import { DEFAULT_WEIGHTS, SCORING_VERSION, scoreTrend, type ScoreInput, type TrendKind, type Weights } from "@/lib/scoring";
import { getSetting } from "@/lib/settings";
import { classifyRepo, classifyText, type Category, type ProjectType } from "@/lib/taxonomy";
import { sha256, stableStringify } from "@/lib/text";
import { buildRecommendation, buildSummary, SUMMARY_VERSION } from "./summary";
import { transitionTrend } from "./publication";

const KIND_PRIORITY: TrendKind[] = ["repository", "launch", "paper", "article", "discussion"];

export interface TrendContext {
  trend: Trend;
  signals: Signal[];
  sources: Map<string, Source>;
  repo: Repository | null;
  audit?: RepoAudit | null;
}

export function buildScoreInput(ctx: TrendContext, now: Date): { input: ScoreInput; title: string; category: Category; primaryUrl: string; tags: string[] } {
  const { trend, repo } = ctx;
  const sigs = ctx.signals;
  const srcs = sigs.map((s) => ctx.sources.get(s.sourceKey)).filter((s): s is Source => Boolean(s));
  const official = sigs.filter((s) => ctx.sources.get(s.sourceKey)?.official);
  const hn = sigs
    .filter((s) => s.platform === "hackernews")
    .sort((a, b) => (b.metrics.points ?? 0) - (a.metrics.points ?? 0))[0];

  const kind: TrendKind = repo
    ? "repository"
    : (KIND_PRIORITY.find((k) => sigs.some((s) => s.kind === k)) ?? (trend.kind as TrendKind));

  const bestSignal = official[0] ?? hn ?? [...sigs].sort((a, b) => a.id - b.id)[0];
  const title = repo ? repo.displayName : (bestSignal?.title ?? trend.title);
  const primaryUrl = repo ? repo.url : (official[0]?.url ?? sigs.find((s) => s.platform !== "hackernews")?.url ?? bestSignal?.url ?? trend.primaryUrl);

  let category: Category;
  let relevanceHits: number;
  if (repo) {
    category = repo.category as Category;
    const c = classifyText(`${repo.name} ${repo.description ?? ""} ${repo.topics.join(" ")}`);
    relevanceHits = c.hits;
  } else {
    const c = classifyText(sigs.map((s) => `${s.title} ${s.excerpt ?? ""}`).join(" \n "));
    category = c.category;
    relevanceHits = c.hits;
    if (category === "other") {
      const fromSource = srcs.find((s) => s.category)?.category as Category | undefined;
      if (fromSource) category = fromSource;
    }
  }

  const published = sigs.map((s) => s.publishedAt).filter((d): d is Date => Boolean(d));
  const originDate = repo ? repo.createdAtGh : published.length ? new Date(Math.min(...published.map((d) => d.getTime()))) : null;

  const input: ScoreInput = {
    now,
    kind,
    title,
    category,
    relevanceHits,
    projectType: (repo?.projectType as ProjectType | undefined) ?? null,
    originDate,
    firstDetectedAt: trend.firstDetectedAt,
    repo: repo
      ? {
          stars: repo.stars,
          forks: repo.forks,
          openIssues: repo.openIssues,
          createdAt: repo.createdAtGh,
          pushedAt: repo.pushedAt,
          latestReleaseAt: repo.latestReleaseAt,
          license: repo.license,
          isArchived: repo.isArchived,
          hasDescription: Boolean(repo.description?.trim()),
          hasHomepage: Boolean(repo.homepage?.trim()),
          starsDelta24h: repo.starsDelta24h,
          starsDelta7d: repo.starsDelta7d,
          growthValidated: repo.growthValidated,
          audit: ctx.audit
            ? {
                trustScore: ctx.audit.trustScore,
                qualityScore: ctx.audit.qualityScore,
                inflationRisk: ctx.audit.suspiciousStarShare,
              }
            : null,
        }
      : null,
    engagement: hn ? { points: hn.metrics.points ?? 0, comments: hn.metrics.comments ?? 0, publishedAt: hn.publishedAt } : null,
    platforms: [...new Set(sigs.map((s) => s.platform))].sort(),
    distinctSources: new Set(sigs.map((s) => s.sourceKey)).size,
    sourceQuality: Math.max(0, ...srcs.map((s) => s.quality)),
    officialSource: official.length > 0,
  };
  const tags = [...new Set([...(repo?.topics ?? []).slice(0, 6), ...(repo?.language ? [repo.language.toLowerCase()] : [])])];
  return { input, title, category, primaryUrl, tags };
}

/** Hash de las entradas sin el instante actual: detecta cambios reales de evidencia. */
export function inputsHash(input: ScoreInput) {
  const { now: _now, ...rest } = input;
  void _now;
  return sha256(stableStringify({ ...rest, scoringVersion: SCORING_VERSION, summaryVersion: SUMMARY_VERSION }));
}

export async function loadWeights(db: Db): Promise<Weights> {
  const w = await getSetting<Partial<Weights>>(db, "scoring.weights");
  return { ...DEFAULT_WEIGHTS, ...(w ?? {}) };
}

/** Aplica las reglas de clasificación vigentes (permite reclasificar sin volver a llamar a GitHub). */
async function reclassifyRepo(db: Db, repo: Repository, now: Date): Promise<Repository> {
  const c = classifyRepo(
    {
      name: repo.name,
      description: repo.description,
      topics: repo.topics,
      language: repo.language,
      isArchived: repo.isArchived,
      createdAt: repo.createdAtGh,
      pushedAt: repo.pushedAt,
      stars: repo.stars,
      license: repo.license,
      latestReleaseAt: repo.latestReleaseAt,
    },
    now,
  );
  if (c.category === repo.category && c.projectType === repo.projectType && c.maturity === repo.maturity) return repo;
  await db
    .update(repositories)
    .set({ category: c.category, projectType: c.projectType, maturity: c.maturity })
    .where(eq(repositories.id, repo.id));
  return { ...repo, category: c.category, projectType: c.projectType, maturity: c.maturity };
}

export interface RefreshOptions {
  trendIds?: Iterable<number>;
  /** Además de las indicadas, recalcula las tendencias activas en esta ventana (novedad decae con el tiempo). */
  activeWindowDays?: number;
}

export async function refreshTrends(db: Db, config: AppConfig, now: Date, opts: RefreshOptions = {}) {
  const weights = await loadWeights(db);
  const ids = [...new Set(opts.trendIds ?? [])];
  const window = new Date(now.getTime() - (opts.activeWindowDays ?? 60) * 86_400_000);
  const conds = [gte(trends.lastSignalAt, window), eq(trends.status, "published")];
  if (ids.length) conds.push(inArray(trends.id, ids));
  const list = await db.select().from(trends).where(or(...conds));
  if (!list.length) return { refreshed: 0, changed: 0, historyRows: 0, statusChanges: 0 };

  const allSources = new Map((await db.select().from(sources)).map((s) => [s.key, s]));
  const trendIds = list.map((t) => t.id);
  const sigByTrend = new Map<number, Signal[]>();
  for (let i = 0; i < trendIds.length; i += 1000) {
    const rows = await db.select().from(signals).where(inArray(signals.trendId, trendIds.slice(i, i + 1000)));
    for (const s of rows) {
      const arr = sigByTrend.get(s.trendId!) ?? [];
      arr.push(s);
      sigByTrend.set(s.trendId!, arr);
    }
  }
  const repoIds = list.map((t) => t.repoId).filter((x): x is number => x !== null);
  const repoById = new Map<number, Repository>();
  for (let i = 0; i < repoIds.length; i += 1000) {
    for (const r of await db.select().from(repositories).where(inArray(repositories.id, repoIds.slice(i, i + 1000)))) repoById.set(r.id, r);
  }
  const auditById = new Map<number, RepoAudit>();
  for (let i = 0; i < repoIds.length; i += 1000) {
    for (const a of await db.select().from(repoAudits).where(inArray(repoAudits.repoId, repoIds.slice(i, i + 1000)))) auditById.set(a.repoId, a);
  }

  let changed = 0;
  let historyRows = 0;
  let statusChanges = 0;
  for (const trend of list) {
    const sigs = sigByTrend.get(trend.id) ?? [];
    if (!sigs.length) continue;
    let repo = trend.repoId ? (repoById.get(trend.repoId) ?? null) : null;
    if (repo) repo = await reclassifyRepo(db, repo, now);
    const ctx: TrendContext = { trend, signals: sigs, sources: allSources, repo, audit: repo ? (auditById.get(repo.id) ?? null) : null };
    const { input, title, category, primaryUrl, tags } = buildScoreInput(ctx, now);
    const result = scoreTrend(input, weights);
    const hash = inputsHash(input);
    const summaryInput = {
      kind: input.kind,
      title,
      category,
      repo,
      score: result,
      sources: [...new Set(sigs.map((s) => s.sourceKey))].map((k) => ({ name: allSources.get(k)?.name ?? k, official: Boolean(allSources.get(k)?.official) })),
      originDate: input.originDate,
      engagement: input.engagement,
      platforms: input.platforms,
      timeZone: config.APP_TIMEZONE,
    };
    const lastSignalAt = new Date(Math.max(...sigs.map((s) => s.lastObservedAt.getTime())));

    const patch = {
      kind: input.kind,
      category,
      tags,
      platforms: input.platforms,
      signalCount: sigs.length,
      score: result.score,
      confidence: result.confidence,
      stage: result.stage,
      breakdown: result.breakdown as unknown as Record<string, unknown>,
      velocity: result.velocity,
      velocityBasis: result.velocityBasis,
      maturity: repo?.maturity ?? null,
      experimentCost: result.experimentCost,
      risk: result.risk,
      sourceQuality: input.sourceQuality,
      inputsHash: hash,
      lastSignalAt,
      scoredAt: now,
      updatedAt: now,
      ...(trend.manualOverride
        ? {}
        : { title, primaryUrl, summary: buildSummary(summaryInput), recommendation: buildRecommendation(summaryInput) }),
    };

    const scoreMoved = Math.abs(trend.score - result.score) >= 1 || trend.stage !== result.stage;
    if (trend.inputsHash !== hash || scoreMoved || trend.scoredAt === null) {
      await db.update(trends).set(patch).where(eq(trends.id, trend.id));
      changed++;
      const [last] = await db
        .select({ score: trendScoreHistory.score, stage: trendScoreHistory.stage, hash: trendScoreHistory.inputsHash })
        .from(trendScoreHistory)
        .where(eq(trendScoreHistory.trendId, trend.id))
        .orderBy(desc(trendScoreHistory.computedAt))
        .limit(1);
      if (!last || last.hash !== hash || scoreMoved) {
        await db.insert(trendScoreHistory).values({
          trendId: trend.id,
          computedAt: now,
          score: result.score,
          confidence: result.confidence,
          stage: result.stage,
          breakdown: patch.breakdown,
          inputsHash: hash,
        });
        historyRows++;
      }
    } else if (Math.abs(trend.score - result.score) >= 0.05) {
      await db.update(trends).set({ score: result.score, confidence: result.confidence, scoredAt: now }).where(eq(trends.id, trend.id));
    }

    // Regla editorial: lo que supera el umbral pasa a revisión (la publicación automática se decide después del análisis).
    if (trend.status === "detected" && result.score >= config.REVIEW_MIN_SCORE) {
      await transitionTrend(db, trend.id, "pending_review", {
        actor: "system",
        note: `Puntuación ${result.score} ≥ ${config.REVIEW_MIN_SCORE}: enviada a revisión.`,
        now,
      });
      statusChanges++;
    }
  }
  return { refreshed: list.length, changed, historyRows, statusChanges };
}
