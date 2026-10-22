/**
 * Auditoría de repositorios (GraphQL de GitHub + OpenSSF Scorecard):
 * muestra de stargazers y forkers, propietario, commits y autores recientes,
 * README (compatibilidades y señuelos de malware), binarios en releases.
 * Se reaudita cada pocos días y solo los repositorios con más interés.
 */
import { and, asc, desc, eq, gte, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { connectorRuns, repoAudits, repositories, trends } from "@/db/schema";
import { fetchWithRetry } from "@/connectors/http";
import type { AppConfig } from "@/lib/config";
import { detectCompat } from "@/lib/compat";
import { computeAudit, type AccountSample } from "@/lib/trust";

const REAUDIT_DAYS = 3;
const BATCH = 2;

const USER_FIELDS = `createdAt followers { totalCount } following { totalCount } repositories(privacy: PUBLIC) { totalCount }`;
const AUDIT_FIELDS = `
  databaseId
  owner { __typename login ... on User { ${USER_FIELDS} } ... on Organization { createdAt } }
  isSecurityPolicyEnabled
  codeOfConduct { key }
  readme: object(expression: "HEAD:README.md") { ... on Blob { byteSize text } }
  readmeLower: object(expression: "HEAD:readme.md") { ... on Blob { byteSize text } }
  defaultBranchRef { target { ... on Commit { history(first: 100) { totalCount nodes { committedDate author { email user { login } } } } } } }
  releases(first: 5, orderBy: { field: CREATED_AT, direction: DESC }) { totalCount nodes { releaseAssets(first: 30) { nodes { name } } } }
  watchers(first: 100) { totalCount nodes { ${USER_FIELDS} } }
  forks(first: 50, orderBy: { field: CREATED_AT, direction: DESC }) { nodes { createdAt owner { ... on User { ${USER_FIELDS} } } } }`;

interface GqlUser {
  createdAt: string;
  followers?: { totalCount: number };
  following?: { totalCount: number };
  repositories?: { totalCount: number };
}

interface GqlAudit {
  databaseId: number;
  owner: { __typename: string; login: string } & Partial<GqlUser>;
  isSecurityPolicyEnabled: boolean | null;
  codeOfConduct: { key: string } | null;
  readme: { byteSize: number; text: string | null } | null;
  readmeLower: { byteSize: number; text: string | null } | null;
  defaultBranchRef: {
    target: {
      history?: { totalCount: number; nodes: { committedDate: string; author: { email: string | null; user: { login: string } | null } | null }[] };
    };
  } | null;
  releases: { totalCount: number; nodes: { releaseAssets: { nodes: { name: string }[] } }[] };
  watchers: { totalCount: number; nodes: GqlUser[] };
  forks: { nodes: { createdAt: string; owner: Partial<GqlUser> }[] };
}

function sample(u: Partial<GqlUser> | null | undefined, actedAt: string): AccountSample | null {
  if (!u?.createdAt || !u.followers) return null; // organizaciones u objetos sin datos de usuario
  return {
    createdAt: new Date(u.createdAt),
    followers: u.followers.totalCount,
    following: u.following?.totalCount ?? 0,
    repos: u.repositories?.totalCount ?? 0,
    actedAt: new Date(actedAt),
  };
}

export interface AuditDeps {
  db: Db;
  config: AppConfig;
  now: Date;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  log: (m: string) => void;
  limit?: number;
}

async function scorecard(deps: AuditDeps, fullName: string) {
  try {
    const res = await fetchWithRetry(`https://api.securityscorecards.dev/projects/github.com/${fullName}`, {
      fetchImpl: deps.fetch,
      sleep: deps.sleep,
      retries: 1,
      timeoutMs: 8000,
    });
    const data = (await res.json()) as { score?: number; checks?: { name: string; score: number }[] };
    return typeof data.score === "number" ? { score: data.score, checks: (data.checks ?? []).map((c) => ({ name: c.name, score: c.score })) } : null;
  } catch {
    return null; // 404: el proyecto no está en el índice de Scorecard
  }
}

export async function auditRepos(deps: AuditDeps) {
  const { db, config, now } = deps;
  const token = config.GITHUB_TOKEN;
  const [run] = await db.insert(connectorRuns).values({ sourceKey: "github:audit", startedAt: now }).returning();
  const started = Date.now();
  if (!token) {
    await db
      .update(connectorRuns)
      .set({ status: "skipped", finishedAt: new Date(), error: "Requiere GITHUB_TOKEN (GraphQL)." })
      .where(eq(connectorRuns.id, run.id));
    return { audited: 0, skipped: true };
  }

  const staleBefore = new Date(now.getTime() - REAUDIT_DAYS * 86_400_000);
  const candidates = await db
    .select({ id: repositories.id, nodeId: repositories.nodeId, fullName: repositories.fullName, stars: repositories.stars })
    .from(repositories)
    .leftJoin(trends, eq(trends.repoId, repositories.id))
    .where(
      and(
        isNotNull(repositories.nodeId),
        gte(repositories.stars, 10),
        or(isNull(repositories.auditedAt), lt(repositories.auditedAt, staleBefore)),
      ),
    )
    // Primero lo más visible: lo mejor puntuado y lo que encabeza los rankings por estrellas (≈ 1k ★ → 55, ≥ 250k ★ → 100).
    .orderBy(
      desc(sql`greatest(coalesce(${trends.score}, 0), least(100, ln(1 + ${repositories.stars}) * 8))`),
      desc(repositories.stars),
      asc(repositories.id),
    )
    .limit(deps.limit ?? config.GITHUB_MAX_AUDITS);

  const warnings: string[] = [];
  let audited = 0;
  let scorecards = 0;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    let nodes: (GqlAudit | null)[] = [];
    try {
      const res = await fetchWithRetry("https://api.github.com/graphql", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          query: `query($ids: [ID!]!) { nodes(ids: $ids) { ... on Repository { ${AUDIT_FIELDS} } } }`,
          variables: { ids: batch.map((b) => b.nodeId) },
        }),
        fetchImpl: deps.fetch,
        sleep: deps.sleep,
        timeoutMs: 45_000,
      });
      const body = (await res.json()) as { data?: { nodes: (GqlAudit | null)[] }; errors?: { message: string }[] };
      if (body.errors?.length) warnings.push(body.errors.slice(0, 2).map((e) => e.message).join("; "));
      nodes = body.data?.nodes ?? [];
    } catch (err) {
      warnings.push(`Lote ${i / BATCH + 1}: ${(err as Error).message}`);
      continue;
    }

    for (const node of nodes) {
      if (!node?.databaseId) continue;
      try {
        const [repo] = await db.select().from(repositories).where(eq(repositories.githubId, node.databaseId));
        if (!repo) continue;
        const readme = (node.readme?.text ?? node.readmeLower?.text ?? "").slice(0, 40_000);
        const history = node.defaultBranchRef?.target?.history;
        const commits = (history?.nodes ?? []).filter((c): c is NonNullable<typeof c> => Boolean(c));
        const authors = new Set(
          commits.map((c) => c.author?.user?.login ?? c.author?.email ?? "").filter((x) => x && !/\[bot\]|noreply@github\.com$/.test(x)),
        );
        const sc = repo.stars >= 100 && scorecards < 40 ? await scorecard(deps, repo.fullName) : null;
        if (repo.stars >= 100) scorecards++;
        // GitHub no publica cuándo empezó alguien a seguir el repo: se toma su creación como referencia.
        const watcherAccounts = (node.watchers?.nodes ?? [])
          .map((u) => sample(u, repo.createdAtGh.toISOString()))
          .filter((x): x is AccountSample => Boolean(x));
        const forkers = (node.forks?.nodes ?? []).filter(Boolean).map((f) => sample(f.owner, f.createdAt)).filter((x): x is AccountSample => Boolean(x));
        const assets = (node.releases?.nodes ?? []).flatMap((r) => (r?.releaseAssets?.nodes ?? []).map((a) => a.name));
        const ownerCreatedAt = node.owner.createdAt ? new Date(node.owner.createdAt) : null;

        const result = computeAudit({
          now,
          repoCreatedAt: repo.createdAtGh,
          stars: repo.stars,
          forks: repo.forks,
          watchers: node.watchers?.totalCount ?? null,
          openIssues: repo.openIssues,
          license: repo.license,
          isArchived: repo.isArchived,
          pushedAt: repo.pushedAt,
          ownerType: node.owner.__typename,
          ownerCreatedAt,
          ownerFollowers: node.owner.followers?.totalCount ?? null,
          commitCount: history?.totalCount ?? null,
          recentAuthors: history ? authors.size : null,
          hasReadme: Boolean(node.readme ?? node.readmeLower),
          readmeText: readme,
          hasSecurityPolicy: Boolean(node.isSecurityPolicyEnabled),
          hasCodeOfConduct: Boolean(node.codeOfConduct),
          releaseCount: node.releases?.totalCount ?? null,
          releaseAssets: assets,
          watcherAccounts,
          forkers,
          scorecard: sc?.score ?? null,
        });
        const compat = detectCompat(repo.name, repo.description, repo.topics.join(" "), readme);
        const row = {
          repoId: repo.id,
          auditedAt: now,
          ownerLogin: node.owner.login,
          ownerType: node.owner.__typename,
          ownerCreatedAt,
          ownerFollowers: node.owner.followers?.totalCount ?? null,
          ownerRepos: node.owner.repositories?.totalCount ?? null,
          commitCount: history?.totalCount ?? null,
          recentAuthors: history ? authors.size : null,
          lastCommitAt: commits[0] ? new Date(commits[0].committedDate) : null,
          hasReadme: Boolean(node.readme ?? node.readmeLower),
          readmeBytes: node.readme?.byteSize ?? node.readmeLower?.byteSize ?? null,
          hasSecurityPolicy: Boolean(node.isSecurityPolicyEnabled),
          hasCodeOfConduct: Boolean(node.codeOfConduct),
          releaseCount: node.releases?.totalCount ?? null,
          executableAssets: result.executableAssets,
          stargazerSample: 0,
          suspiciousStarShare: result.inflationRisk,
          watchersCount: node.watchers?.totalCount ?? null,
          watcherSample: watcherAccounts.length,
          suspiciousWatcherShare: result.suspiciousWatcherShare,
          forksPerStar: result.forksPerStar,
          watchersPerStar: result.watchersPerStar,
          forkSample: forkers.length,
          suspiciousForkShare: result.suspiciousForkShare,
          scorecard: sc?.score ?? null,
          scorecardChecks: sc?.checks ?? null,
          lurePatterns: result.lurePatterns,
          flags: result.flags,
          trustScore: result.trustScore,
          qualityScore: result.qualityScore,
        };
        await db.insert(repoAudits).values(row).onConflictDoUpdate({ target: repoAudits.repoId, set: row });
        await db
          .update(repositories)
          .set({ trustScore: result.trustScore, qualityScore: result.qualityScore, auditedAt: now, compat })
          .where(eq(repositories.id, repo.id));
        audited++;
      } catch (err) {
        warnings.push(`Repo ${node.databaseId}: ${(err as Error).message}`);
      }
    }
  }

  await db
    .update(connectorRuns)
    .set({
      status: warnings.length ? "partial" : "ok",
      finishedAt: new Date(),
      itemsFetched: candidates.length,
      itemsUpdated: audited,
      durationMs: Date.now() - started,
      error: warnings.length ? warnings.join("\n").slice(0, 4000) : null,
    })
    .where(eq(connectorRuns.id, run.id));
  deps.log(`Auditoría: ${audited}/${candidates.length} repositorios (${scorecards} consultas Scorecard)`);
  return { audited, skipped: false };
}
