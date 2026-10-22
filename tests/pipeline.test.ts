/**
 * Integración extremo a extremo sobre Postgres real (PGlite) con respuestas HTTP simuladas:
 * persistencia, deduplicación, agrupación entre plataformas, aislamiento de fallos,
 * filtros HOY/SEMANA/MES combinados, crecimiento medido y publicación sin duplicados.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { seedSources } from "@/db/seed";
import { connectorRuns, repoSnapshots, repositories, signals, sources, trends } from "@/db/schema";
import type { Db } from "@/db/client";
import { repoDataset } from "@/lib/datasets";
import { filterRepos, type RepoFilters } from "@/lib/repo-filter";
import { correctTrend, PublicationError, transitionTrend } from "@/pipeline/publication";
import { runPipeline } from "@/pipeline/run";
import { createObjectStore } from "@/storage";
import { createTestDb, jsonResponse, testConfig, xmlResponse } from "./helpers";

const T0 = new Date("2026-10-22T10:00:00Z"); // 12:00 Madrid
const TZ = "Europe/Madrid";

function repo(id: number, fullName: string, createdAt: string, stars: number, language: string, description: string, topics: string[] = []) {
  return {
    id,
    node_id: `R_${id}`,
    full_name: fullName,
    html_url: `https://github.com/${fullName}`,
    description,
    homepage: null,
    language,
    topics,
    license: { spdx_id: "MIT" },
    fork: false,
    archived: false,
    created_at: createdAt,
    pushed_at: "2026-10-22T09:00:00Z",
    updated_at: "2026-10-22T09:00:00Z",
    stargazers_count: stars,
    forks_count: 1,
    open_issues_count: 0,
  };
}

let starsBoost = 0;
const REPOS = () => [
  repo(1, "a/today-agent", "2026-10-22T06:00:00Z", 50, "Python", "An autonomous AI agent framework", ["ai-agents"]),
  repo(2, "b/week-mcp", "2026-10-17T12:00:00Z", 300 + starsBoost, "TypeScript", "MCP server for Postgres", ["mcp"]),
  repo(3, "c/month-seo", "2026-09-25T12:00:00Z", 900, "Python", "SEO keyword research automation", ["seo"]),
  repo(4, "d/old-lib", "2025-01-01T00:00:00Z", 20000, "Rust", "LLM inference library", ["llm"]),
  repo(5, "e/just-out", "2026-10-15T21:59:59Z", 40, "Go", "Agent tooling created one second before the week"),
  repo(6, "f/just-in", "2026-10-15T22:00:00Z", 40, "Go", "Agent tooling created exactly at the week start"),
];

const HN = {
  nbPages: 1,
  hits: [
    { objectID: "1", title: "Show HN: MCP server for Postgres", url: "https://github.com/B/week-mcp", author: "b", points: 150, num_comments: 30, created_at: "2026-10-22T07:00:00Z", created_at_i: 0 },
    { objectID: "2", title: "OpenAI launches Foo API for agents", url: "https://openai.com/index/foo?utm_source=hn", author: "x", points: 400, num_comments: 200, created_at: "2026-10-21T20:00:00Z", created_at_i: 0 },
    { objectID: "3", title: "My grandmother's pasta recipe", url: "https://cooking.example/pasta", author: "y", points: 90, num_comments: 5, created_at: "2026-10-21T20:00:00Z", created_at_i: 0 },
  ],
};

const OPENAI_RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>OpenAI</title>
<item><title>Introducing the Foo API for agents</title><link>https://openai.com/index/foo/</link><guid>foo</guid><pubDate>Wed, 21 Oct 2026 18:00:00 GMT</pubDate><description>Foo lets developers build agents.</description></item>
<item><title>Introducing the Foo API for agents</title><link>https://openai.com/index/foo/</link><guid>foo-dup</guid><pubDate>Wed, 21 Oct 2026 18:00:00 GMT</pubDate></item>
</channel></rss>`;

const fakeFetch = (async (input: RequestInfo | URL) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.host === "api.github.com" && url.pathname === "/search/repositories") {
    return jsonResponse({ total_count: REPOS().length, incomplete_results: false, items: REPOS() });
  }
  if (url.host === "hn.algolia.com") return jsonResponse(HN);
  if (url.host === "openai.com") return xmlResponse(OPENAI_RSS);
  if (url.host === "broken.example") return new Response("boom", { status: 500 });
  return new Response("not found", { status: 404 });
}) as typeof fetch;

let db: Db;
let close: () => Promise<void>;
const config = testConfig();
const deps = (now: Date) => ({
  db,
  config,
  store: createObjectStore(config),
  now: () => now,
  fetch: fakeFetch,
  sleep: async () => {},
});

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seedSources(db);
  // Solo las fuentes del escenario de prueba (el resto del catálogo se desactiva).
  await db.update(sources).set({ enabled: false });
  await db.update(sources).set({ enabled: true }).where(sql`${sources.key} in ('github', 'hackernews', 'rss:openai')`);
  await db.insert(sources).values({ key: "rss:broken", kind: "rss", platform: "web", name: "Feed roto", url: "https://broken.example/feed", quality: 0.5 });
  await runPipeline(deps(T0));
}, 120_000);

afterAll(async () => close());

const filters = (f: Partial<RepoFilters>): RepoFilters => ({ period: "today", criterion: "created", sort: "newest", ...f });
const search = async (f: Partial<RepoFilters>, now = T0) => filterRepos((await repoDataset(db, now, TZ)).rows, filters(f), now, TZ);
const names = async (f: Partial<RepoFilters>, now = T0) => (await search(f, now)).map((r) => r.name.toLowerCase()).sort();

describe("pipeline con datos simulados", () => {
  it("almacena repositorios, señales y ejecuciones", async () => {
    expect((await db.select().from(repositories)).length).toBe(6);
    const runs = await db.select().from(connectorRuns);
    expect(runs.map((r) => r.sourceKey).sort()).toEqual(["github", "github:audit", "hackernews", "rss:broken", "rss:openai"]);
  });

  it("un fallo de API no detiene el resto del sistema", async () => {
    const [broken] = await db.select().from(sources).where(eq(sources.key, "rss:broken"));
    expect(broken.lastStatus).toBe("error");
    expect(broken.lastError).toMatch(/HTTP 500/);
    const [gh] = await db.select().from(sources).where(eq(sources.key, "github"));
    expect(["ok", "partial"]).toContain(gh.lastStatus);
  });

  it("descarta duplicados exactos dentro de una fuente y filtra temas irrelevantes", async () => {
    const rss = await db.select().from(signals).where(eq(signals.sourceKey, "rss:openai"));
    expect(rss).toHaveLength(1);
    const hn = await db.select().from(signals).where(eq(signals.sourceKey, "hackernews"));
    expect(hn.map((s) => s.externalId).sort()).toEqual(["hn:1", "hn:2"]);
  });

  it("agrupa la misma entidad entre plataformas sin perder las fuentes originales", async () => {
    const [mcp] = await db.select().from(trends).where(eq(trends.entityKey, "repo:b/week-mcp"));
    expect(mcp.platforms).toEqual(["github", "hackernews"]);
    expect(mcp.signalCount).toBe(2);
    const foo = await db.select().from(trends).where(eq(trends.entityKey, "url:https://openai.com/index/foo"));
    expect(foo).toHaveLength(1);
    expect(foo[0].platforms).toEqual(["hackernews", "web"]);
    // El título y el enlace principal proceden de la fuente oficial.
    expect(foo[0].title).toBe("Introducing the Foo API for agents");
    expect(foo[0].primaryUrl).toBe("https://openai.com/index/foo/");
  });

  it("re-ejecutar no duplica señales ni tendencias", async () => {
    const before = { s: (await db.select().from(signals)).length, t: (await db.select().from(trends)).length };
    await runPipeline(deps(new Date(T0.getTime() + 10 * 60_000)));
    expect((await db.select().from(signals)).length).toBe(before.s);
    expect((await db.select().from(trends)).length).toBe(before.t);
  });

  it("la puntuación es reproducible al recalcular sin cambios", async () => {
    const before = await db.select({ id: trends.id, score: trends.score }).from(trends).orderBy(trends.id);
    await runPipeline({ ...deps(new Date(T0.getTime() + 10 * 60_000)), collect: false });
    const after = await db.select({ id: trends.id, score: trends.score }).from(trends).orderBy(trends.id);
    expect(after).toEqual(before);
  });
});

describe("filtros HOY / ESTA SEMANA / ESTE MES", () => {
  it("HOY: solo creados desde las 00:00 locales", async () => {
    expect(await names({ period: "today" })).toEqual(["a/today-agent"]);
  });
  it("ESTA SEMANA: límite exacto a medianoche local de hace 6 días", async () => {
    expect(await names({ period: "week" })).toEqual(["a/today-agent", "b/week-mcp", "f/just-in"]);
  });
  it("ESTE MES: 30 días naturales", async () => {
    expect(await names({ period: "month" })).toEqual(["a/today-agent", "b/week-mcp", "c/month-seo", "e/just-out", "f/just-in"]);
  });
  it("creado ≠ descubierto ≠ actualizado", async () => {
    expect(await names({ period: "today", criterion: "discovered" })).toContain("d/old-lib");
    expect(await names({ period: "today", criterion: "created" })).not.toContain("d/old-lib");
    expect((await names({ period: "today", criterion: "updated" })).length).toBe(6);
  });
  it("los filtros se combinan", async () => {
    expect(await names({ period: "month", lang: "Python" })).toEqual(["a/today-agent", "c/month-seo"]);
    expect(await names({ period: "month", lang: "Python", minStars: 100 })).toEqual(["c/month-seo"]);
    expect(await names({ period: "month", cat: "mcp" })).toEqual(["b/week-mcp"]);
    expect(await names({ period: "week", q: "postgres" })).toEqual(["b/week-mcp"]);
    expect(await names({ period: "month", age: "old" })).toEqual([]);
    expect(await names({ period: "all", age: "old" })).toEqual(["d/old-lib"]);
    expect(await names({ period: "all", from: "2026-10-17", to: "2026-10-22" })).toEqual(["a/today-agent", "b/week-mcp"]);
    expect(await names({ period: "all", compat: "mcp" })).toEqual(["b/week-mcp"]);
  });
  it("rankings por estrellas, forks y antigüedad", async () => {
    const byStars = await search({ period: "month", sort: "stars" });
    expect(byStars[0].name).toBe("c/month-seo");
    expect(byStars).toHaveLength(5);
    expect((await search({ period: "all", sort: "stars" }))[0].name).toBe("d/old-lib");
    expect((await search({ period: "all", sort: "oldest" }))[0].name).toBe("d/old-lib");
    expect((await search({ period: "all", sort: "newest" }))[0].name).toBe("a/today-agent");
  });
});

describe("crecimiento medido con histórico propio", () => {
  it("valida el crecimiento solo con observaciones separadas ≥ 20 h", async () => {
    const [b] = await db.select().from(repositories).where(eq(repositories.fullName, "b/week-mcp"));
    expect(b.growthValidated).toBe(false);
    starsBoost = 48;
    const T1 = new Date(T0.getTime() + 24 * 3_600_000);
    await runPipeline({ ...deps(T1), sourceKeys: ["github"] });
    const [b2] = await db.select().from(repositories).where(eq(repositories.fullName, "b/week-mcp"));
    expect(b2.growthValidated).toBe(true);
    expect(b2.starsDelta24h).toBe(48);
    expect((await db.select().from(repoSnapshots).where(eq(repoSnapshots.repoId, b2.id))).length).toBe(2);
    // "Con crecimiento en el periodo": estrellas ganadas desde la última observación anterior al inicio de HOY (T0 es de ayer).
    expect(await names({ period: "today", criterion: "grown" }, T1)).toEqual(["b/week-mcp"]);
    const g = await search({ period: "today", criterion: "grown" }, T1);
    expect(g[0].gp[0]).toBe(48);
    expect(g[0].g24).toBe(48);
    const [t] = await db.select().from(trends).where(eq(trends.entityKey, "repo:b/week-mcp"));
    expect(t.velocityBasis).toBe("measured");
  });
});

describe("publicación", () => {
  it("rechaza transiciones no permitidas", async () => {
    const [t] = await db.select().from(trends).where(eq(trends.entityKey, "repo:a/today-agent"));
    await expect(transitionTrend(db, t.id, "published", { actor: "admin" })).rejects.toBeInstanceOf(PublicationError);
  });

  it("publica una vez y evita duplicados por URL o título", async () => {
    const [foo] = await db.select().from(trends).where(eq(trends.entityKey, "url:https://openai.com/index/foo"));
    if (foo.status === "detected") await transitionTrend(db, foo.id, "pending_review", { actor: "admin" });
    await transitionTrend(db, foo.id, "approved", { actor: "admin" });
    const published = await transitionTrend(db, foo.id, "published", { actor: "admin" });
    expect(published.publishedAt).not.toBeNull();

    // Otra tendencia con título casi idéntico no puede publicarse.
    const [dup] = await db
      .insert(trends)
      .values({
        entityKey: "url:https://mirror.example/foo",
        slug: "foo-mirror",
        kind: "article",
        title: "Introducing the Foo API for agents!",
        summary: "Copia",
        primaryUrl: "https://mirror.example/foo",
        status: "approved",
      })
      .returning();
    await expect(transitionTrend(db, dup.id, "published", { actor: "admin" })).rejects.toThrow(/Duplicado/);
  });

  it("las correcciones conservan historial y no se sobrescriben en el siguiente recálculo", async () => {
    const [foo] = await db.select().from(trends).where(eq(trends.entityKey, "url:https://openai.com/index/foo"));
    await correctTrend(db, foo.id, { title: "Foo API: análisis", summary: "Resumen corregido." });
    await runPipeline({ ...deps(new Date(T0.getTime() + 25 * 3_600_000)), collect: false });
    const [after] = await db.select().from(trends).where(eq(trends.id, foo.id));
    expect(after.title).toBe("Foo API: análisis");
    expect(after.revision).toBe(foo.revision + 1);
  });

  it("no permite dos ejecuciones simultáneas del pipeline", async () => {
    await expect(Promise.all([runPipeline({ ...deps(T0), collect: false }), runPipeline({ ...deps(T0), collect: false })])).rejects.toThrow(/en curso/);
  });
});
