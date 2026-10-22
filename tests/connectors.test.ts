import { describe, expect, it, vi } from "vitest";
import { hnHitToSignal } from "@/connectors/hackernews";
import { fetchWithRetry, HttpError } from "@/connectors/http";
import { feedItemsToSignals, parseFeed } from "@/connectors/rss";

const now = new Date("2026-10-22T10:00:00Z");

const RSS = `<?xml version="1.0"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>T</title>
<item><title><![CDATA[Introducing the Agents SDK &amp; MCP]]></title><link>https://example.com/a?utm_source=rss</link>
<guid>a-1</guid><pubDate>Wed, 21 Oct 2026 15:00:00 GMT</pubDate><description>&lt;p&gt;Build &lt;b&gt;agents&lt;/b&gt;&lt;/p&gt;</description><dc:creator>Ann</dc:creator></item>
<item><title>Bad link</title><link>javascript:alert(1)</link><guid>a-2</guid></item>
<item><title>Too old</title><link>https://example.com/old</link><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>Atom post about RAG</title><link rel="alternate" href="https://example.org/p1"/><id>tag:p1</id>
<updated>2026-10-20T10:00:00Z</updated><summary type="html">Summary</summary><author><name>Bob</name></author></entry></feed>`;

const RDF = `<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<item><title>Google ranking update</title><link>https://example.net/seo</link><dc:date>2026-10-21T08:00:00Z</dc:date></item></rdf:RDF>`;

describe("RSS / Atom / RDF", () => {
  it("parsea RSS 2.0, limpia HTML y descarta enlaces inseguros y antiguos", () => {
    const signals = feedItemsToSignals(parseFeed(RSS), {}, now);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      externalId: "a-1",
      title: "Introducing the Agents SDK & MCP",
      excerpt: "Build agents",
      author: "Ann",
      kind: "article",
    });
    expect(signals[0].publishedAt?.toISOString()).toBe("2026-10-21T15:00:00.000Z");
  });
  it("parsea Atom y RDF", () => {
    expect(parseFeed(ATOM)[0]).toMatchObject({ id: "tag:p1", link: "https://example.org/p1", author: "Bob" });
    expect(parseFeed(RDF)[0]).toMatchObject({ title: "Google ranking update", link: "https://example.net/seo" });
  });
  it("el filtro de relevancia descarta temas fuera del radar", () => {
    const items = parseFeed(RSS.replace("Introducing the Agents SDK &amp; MCP", "Recipe for pasta").replace("Build &lt;b&gt;agents&lt;/b&gt;", "tomato"));
    expect(feedItemsToSignals(items, { requireRelevance: true }, now)).toHaveLength(0);
  });
  it("no expande entidades DTD (protección frente a XML malicioso)", () => {
    const evil = `<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x "AAAAAAAAAA">]><rss><channel><item><title>&x;&x;</title><link>https://e.com/1</link></item></channel></rss>`;
    const [item] = parseFeed(evil);
    expect(item.title).not.toContain("AAAAAAAAAA");
  });
});

describe("Hacker News", () => {
  const hit = {
    objectID: "123",
    title: "Show HN: An MCP server for Postgres",
    url: "https://github.com/Acme/pg-mcp",
    author: "acme",
    points: 120,
    num_comments: 40,
    created_at: "2026-10-22T08:00:00Z",
    created_at_i: 0,
  };
  it("convierte historias con métricas reales y enlace al repositorio", () => {
    expect(hnHitToSignal(hit, {})).toMatchObject({
      externalId: "hn:123",
      kind: "launch",
      repoFullName: "acme/pg-mcp",
      metrics: { points: 120, comments: 40 },
      discussionUrl: "https://news.ycombinator.com/item?id=123",
    });
  });
  it("descarta temas fuera del radar", () => {
    expect(hnHitToSignal({ ...hit, title: "The history of the bicycle", url: "https://e.com/bike" }, {})).toBeNull();
  });
});

describe("fetchWithRetry", () => {
  const sleep = vi.fn(async () => {});
  it("reintenta errores 5xx y devuelve la respuesta correcta", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response("x", { status: 502 })).mockResolvedValueOnce(new Response("ok"));
    const res = await fetchWithRetry("https://api.example.com", { fetchImpl: f as unknown as typeof fetch, sleep });
    expect(await res.text()).toBe("ok");
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("no reintenta errores 4xx no recuperables", async () => {
    const f = vi.fn().mockResolvedValue(new Response("nope", { status: 404 }));
    await expect(fetchWithRetry("https://api.example.com", { fetchImpl: f as unknown as typeof fetch, sleep })).rejects.toBeInstanceOf(HttpError);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("respeta Retry-After en 429", async () => {
    sleep.mockClear();
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "3" } }))
      .mockResolvedValueOnce(new Response("ok"));
    await fetchWithRetry("https://api.example.com", { fetchImpl: f as unknown as typeof fetch, sleep });
    expect(sleep).toHaveBeenCalledWith(3000);
  });
  it("abandona si el límite de cuota exige esperar demasiado", async () => {
    const f = vi.fn().mockResolvedValue(new Response("", { status: 429, headers: { "retry-after": "3600" } }));
    await expect(fetchWithRetry("https://api.example.com", { fetchImpl: f as unknown as typeof fetch, sleep })).rejects.toThrow(/cuota/);
  });
});
