/**
 * Conector GitHub (API oficial REST + GraphQL).
 *  1. Búsqueda REST de repositorios creados en las ventanas HOY / SEMANA / MES y por temas del radar.
 *  2. Enriquecimiento GraphQL (releases, issues abiertas) de lo encontrado — requiere GITHUB_TOKEN.
 *  3. Refresco de repositorios ya monitorizados para medir crecimiento con snapshots propios.
 *  4. Resolución de repositorios enlazados desde otras fuentes (HN, blogs) que aún no conocemos.
 */
import { and, asc, desc, gte, isNotNull, lt, notInArray, or, sql } from "drizzle-orm";
import { repositories, signals, trends } from "@/db/schema";
import { periodRange } from "@/lib/time";
import { fetchWithRetry } from "./http";
import type { CollectResult, Connector, ConnectorContext, RepoObservation, SignalInput } from "./types";

export interface GithubQuery {
  q: string;
  pages?: number;
  sort?: "stars" | "forks" | "updated";
}

export const DEFAULT_GITHUB_QUERIES: GithubQuery[] = [
  { q: "created:>={month} stars:>=25", pages: 3 },
  { q: "created:>={week} stars:>=8", pages: 2 },
  { q: "created:>={today} stars:>=1", pages: 1 },
  { q: "topic:mcp created:>={month} stars:>=3" },
  { q: "topic:model-context-protocol created:>={month} stars:>=3" },
  { q: '"mcp server" in:name,description created:>={month} stars:>=5' },
  { q: "topic:ai-agents created:>={month} stars:>=3" },
  { q: "topic:agents created:>={month} stars:>=3" },
  { q: "topic:claude-code created:>={month} stars:>=2" },
  { q: '"claude code" in:name,description created:>={month} stars:>=3' },
  { q: "skills in:name,description agent created:>={month} stars:>=3" },
  { q: "topic:codex created:>={month} stars:>=2" },
  { q: "topic:llm created:>={month} stars:>=5" },
  { q: "topic:rag created:>={month} stars:>=3" },
  { q: "topic:seo created:>={month} stars:>=2" },
  { q: "topic:marketing created:>={month} stars:>=2" },
  { q: "topic:automation created:>={month} stars:>=3" },
  { q: "topic:n8n created:>={month} stars:>=2" },
  { q: "topic:generative-ai created:>={month} stars:>=3" },
  // Proyectos ya establecidos con actividad reciente: los más estrellados y los más bifurcados.
  { q: "topic:llm stars:>3000 pushed:>={week}" },
  { q: "topic:ai-agents stars:>1000 pushed:>={week}" },
  { q: "topic:mcp stars:>500 pushed:>={week}" },
  { q: "topic:claude-code stars:>200 pushed:>={month}" },
  { q: "topic:rag stars:>1000 pushed:>={month}" },
  { q: "topic:seo stars:>300 pushed:>={month}" },
  { q: "topic:automation stars:>2000 pushed:>={month}" },
  { q: "topic:llm forks:>500 pushed:>={week}", sort: "forks" },
  { q: "topic:ai-agents forks:>200 pushed:>={week}", sort: "forks" },
];

const GQL_REPO_FIELDS = `databaseId id nameWithOwner url description homepageUrl stargazerCount forkCount isFork isArchived
  createdAt pushedAt updatedAt primaryLanguage { name } licenseInfo { spdxId }
  repositoryTopics(first: 15) { nodes { topic { name } } } issues(states: OPEN) { totalCount }
  latestRelease { tagName publishedAt }`;

interface RestRepo {
  id: number;
  node_id: string;
  full_name: string;
  html_url: string;
  description: string | null;
  homepage: string | null;
  language: string | null;
  topics?: string[];
  license: { spdx_id: string | null } | null;
  fork: boolean;
  archived: boolean;
  created_at: string;
  pushed_at: string | null;
  updated_at: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
}

interface GqlRepo {
  databaseId: number;
  id: string;
  nameWithOwner: string;
  url: string;
  description: string | null;
  homepageUrl: string | null;
  stargazerCount: number;
  forkCount: number;
  isFork: boolean;
  isArchived: boolean;
  createdAt: string;
  pushedAt: string | null;
  updatedAt: string | null;
  primaryLanguage: { name: string } | null;
  licenseInfo: { spdxId: string | null } | null;
  repositoryTopics: { nodes: { topic: { name: string } }[] };
  issues: { totalCount: number };
  latestRelease: { tagName: string; publishedAt: string | null } | null;
}

const date = (s: string | null | undefined) => (s ? new Date(s) : null);
const license = (spdx: string | null | undefined) => (spdx ? (spdx === "NOASSERTION" ? "Other" : spdx) : null);

export function fromRest(r: RestRepo): RepoObservation {
  return {
    githubId: r.id,
    nodeId: r.node_id,
    fullName: r.full_name,
    url: r.html_url,
    description: r.description?.slice(0, 2000) ?? null,
    homepage: r.homepage?.slice(0, 500) || null,
    language: r.language,
    topics: (r.topics ?? []).slice(0, 50),
    license: license(r.license?.spdx_id),
    isFork: r.fork,
    isArchived: r.archived,
    createdAt: new Date(r.created_at),
    pushedAt: date(r.pushed_at),
    updatedAt: date(r.updated_at),
    stars: r.stargazers_count,
    forks: r.forks_count,
    openIssues: r.open_issues_count,
    enriched: false,
  };
}

export function fromGraphql(r: GqlRepo): RepoObservation {
  return {
    githubId: r.databaseId,
    nodeId: r.id,
    fullName: r.nameWithOwner,
    url: r.url,
    description: r.description?.slice(0, 2000) ?? null,
    homepage: r.homepageUrl?.slice(0, 500) || null,
    language: r.primaryLanguage?.name ?? null,
    topics: r.repositoryTopics.nodes.map((n) => n.topic.name),
    license: license(r.licenseInfo?.spdxId),
    isFork: r.isFork,
    isArchived: r.isArchived,
    createdAt: new Date(r.createdAt),
    pushedAt: date(r.pushedAt),
    updatedAt: date(r.updatedAt),
    stars: r.stargazerCount,
    forks: r.forkCount,
    openIssues: r.issues.totalCount,
    latestReleaseTag: r.latestRelease?.tagName ?? null,
    latestReleaseAt: date(r.latestRelease?.publishedAt),
    enriched: true,
  };
}

export function repoToSignal(r: RepoObservation): SignalInput {
  return {
    externalId: `repo:${r.githubId}`,
    url: r.url,
    title: r.fullName,
    excerpt: r.description ?? null,
    author: r.fullName.split("/")[0],
    publishedAt: r.createdAt,
    metrics: { stars: r.stars, forks: r.forks, openIssues: r.openIssues },
    kind: "repository",
    repoFullName: r.fullName.toLowerCase(),
  };
}

export function expandQuery(q: string, now: Date, tz: string) {
  const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
  return q
    .replaceAll("{today}", iso(periodRange("today", now, tz).start))
    .replaceAll("{week}", iso(periodRange("week", now, tz).start))
    .replaceAll("{month}", iso(periodRange("month", now, tz).start));
}

export const githubConnector: Connector = {
  kind: "github",
  status(config) {
    return config.GITHUB_TOKEN
      ? { configured: true, limits: "REST 5.000 req/h · Search 30 req/min · GraphQL 5.000 puntos/h" }
      : {
          configured: true,
          reason: "Sin GITHUB_TOKEN: modo anónimo (60 req/h, 10 búsquedas/min, sin GraphQL ni releases).",
          limits: "Anónimo: 60 req/h",
        };
  },

  async collect(ctx: ConnectorContext): Promise<CollectResult> {
    const token = ctx.config.GITHUB_TOKEN;
    const headers: Record<string, string> = {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
    const warnings: string[] = [];
    const raw: Record<string, unknown> = { search: [] as unknown[], graphql: [] as unknown[] };
    const found = new Map<number, RepoObservation>();
    const cfg = ctx.source.config as { queries?: GithubQuery[]; maxPagesPerQuery?: number };
    const queries = cfg.queries?.length ? cfg.queries : DEFAULT_GITHUB_QUERIES;
    const maxRequests = token ? ctx.config.GITHUB_MAX_SEARCH_REQUESTS : Math.min(8, ctx.config.GITHUB_MAX_SEARCH_REQUESTS);
    // Search API: 30 req/min con token, 10 sin token.
    const spacing = token ? 2_100 : 6_500;
    let requests = 0;

    // 1. Búsqueda
    outer: for (const query of queries) {
      const q = expandQuery(query.q, ctx.now, ctx.config.APP_TIMEZONE);
      for (let page = 1; page <= Math.min(query.pages ?? 1, cfg.maxPagesPerQuery ?? 5); page++) {
        if (requests >= maxRequests) {
          warnings.push(`Límite de ${maxRequests} búsquedas por ejecución alcanzado.`);
          break outer;
        }
        if (requests > 0) await ctx.sleep(spacing);
        requests++;
        const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=${query.sort ?? "stars"}&order=desc&per_page=100&page=${page}`;
        try {
          const res = await fetchWithRetry(url, { headers, fetchImpl: ctx.fetch, sleep: ctx.sleep });
          const data = (await res.json()) as { total_count: number; items: RestRepo[]; incomplete_results?: boolean };
          (raw.search as unknown[]).push({ q, page, total: data.total_count, items: data.items });
          for (const item of data.items) if (!item.fork) found.set(item.id, fromRest(item));
          if (data.incomplete_results) warnings.push(`Resultados incompletos para "${q}".`);
          if (data.items.length < 100) break;
        } catch (err) {
          warnings.push(`Búsqueda "${q}" p${page}: ${(err as Error).message}`);
          break;
        }
      }
    }
    ctx.log(`GitHub: ${found.size} repos únicos en ${requests} búsquedas`);

    if (!token) {
      warnings.push("Sin GITHUB_TOKEN: no se obtienen releases ni se refrescan repositorios monitorizados.");
      return { signals: [...found.values()].map(repoToSignal), repos: [...found.values()], raw, warnings };
    }

    const graphql = async (query: string, variables: Record<string, unknown>) => {
      const res = await fetchWithRetry("https://api.github.com/graphql", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
        fetchImpl: ctx.fetch,
        sleep: ctx.sleep,
      });
      const body = (await res.json()) as { data?: Record<string, unknown>; errors?: { message: string }[] };
      (raw.graphql as unknown[]).push(body);
      if (body.errors?.length) warnings.push(`GraphQL: ${body.errors.slice(0, 3).map((e) => e.message).join("; ")}`);
      return body.data ?? {};
    };

    // 2 y 3. Enriquecimiento de lo encontrado + refresco de monitorizados (por node id, lotes de 100).
    // Monitorizados: no vistos en las últimas 6 h y recientes, bien puntuados o mencionados en otras plataformas.
    const staleBefore = new Date(ctx.now.getTime() - 6 * 3_600_000);
    const tracked = await ctx.db
      .select({ nodeId: repositories.nodeId })
      .from(repositories)
      .leftJoin(trends, sql`${trends.repoId} = ${repositories.id}`)
      .where(
        and(
          isNotNull(repositories.nodeId),
          lt(repositories.lastSeenAt, staleBefore),
          or(
            gte(repositories.createdAtGh, new Date(ctx.now.getTime() - 45 * 86_400_000)),
            gte(trends.score, 50),
            sql`exists (select 1 from ${signals} s where s.repo_id = ${repositories.id} and s.platform <> 'github')`,
          ),
        ),
      )
      .orderBy(desc(sql`coalesce(${trends.score}, 0)`), asc(repositories.lastSeenAt))
      .limit(ctx.config.GITHUB_MAX_REFRESH_REPOS);
    const nodeIds = [
      ...new Set([...[...found.values()].map((r) => r.nodeId!), ...tracked.map((t) => t.nodeId!)].filter(Boolean)),
    ];
    for (let i = 0; i < nodeIds.length; i += 100) {
      try {
        const data = await graphql(`query($ids: [ID!]!) { nodes(ids: $ids) { ... on Repository { ${GQL_REPO_FIELDS} } } }`, {
          ids: nodeIds.slice(i, i + 100),
        });
        for (const node of (data.nodes as (GqlRepo | null)[] | undefined) ?? []) {
          if (node?.databaseId) found.set(node.databaseId, fromGraphql(node));
        }
      } catch (err) {
        warnings.push(`GraphQL lote ${i / 100 + 1}: ${(err as Error).message}`);
      }
    }

    // 4. Repositorios enlazados desde otras plataformas que aún no están en la base de datos.
    const known = [...found.values()].map((r) => r.fullName.toLowerCase());
    const linked = await ctx.db
      .selectDistinct({ name: signals.linkedRepo })
      .from(signals)
      .where(
        and(
          isNotNull(signals.linkedRepo),
          sql`${signals.repoId} is null`,
          known.length ? notInArray(signals.linkedRepo, known) : undefined,
        ),
      )
      .limit(60);
    const missing = linked.map((l) => l.name!).filter((n) => /^[a-z0-9-]+\/[a-z0-9._-]+$/.test(n));
    for (let i = 0; i < missing.length; i += 20) {
      const batch = missing.slice(i, i + 20);
      const vars: Record<string, string> = {};
      const decl: string[] = [];
      const parts = batch.map((full, j) => {
        const [owner, name] = full.split("/");
        vars[`o${j}`] = owner;
        vars[`n${j}`] = name;
        decl.push(`$o${j}: String!, $n${j}: String!`);
        return `r${j}: repository(owner: $o${j}, name: $n${j}) { ${GQL_REPO_FIELDS} }`;
      });
      try {
        const data = await graphql(`query(${decl.join(", ")}) { ${parts.join("\n")} }`, vars);
        for (const value of Object.values(data) as (GqlRepo | null)[]) {
          if (value?.databaseId && !value.isFork) found.set(value.databaseId, fromGraphql(value));
        }
      } catch (err) {
        warnings.push(`Repos enlazados: ${(err as Error).message}`);
      }
    }

    const repos = [...found.values()];
    ctx.log(`GitHub: ${repos.length} repos tras enriquecimiento (${tracked.length} refrescados, ${missing.length} enlazados)`);
    return { signals: repos.map(repoToSignal), repos, raw, warnings };
  },
};
