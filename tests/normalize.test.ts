import { describe, expect, it } from "vitest";
import { classifyRepo, classifyText } from "@/lib/taxonomy";
import { jaccard, stripHtml, titleTokens } from "@/lib/text";
import { canonicalizeUrl, extractGithubRepo, isSafeHttpUrl } from "@/lib/url";

describe("canonicalizeUrl", () => {
  it("elimina tracking, fragmento, www y barra final", () => {
    expect(canonicalizeUrl("http://www.OpenAI.com/index/foo/?utm_source=hn&ref=x#top")).toBe("https://openai.com/index/foo");
  });
  it("conserva parámetros significativos ordenados", () => {
    expect(canonicalizeUrl("https://news.ycombinator.com/item?id=1&b=2&utm_medium=x")).toBe("https://news.ycombinator.com/item?b=2&id=1");
  });
  it("normaliza mayúsculas en rutas de GitHub", () => {
    expect(canonicalizeUrl("https://github.com/Owner/Repo/")).toBe("https://github.com/owner/repo");
  });
});

describe("extractGithubRepo", () => {
  it("detecta repositorios", () => {
    expect(extractGithubRepo("https://github.com/Anthropics/claude-code/tree/main/docs")).toBe("anthropics/claude-code");
    expect(extractGithubRepo("https://www.github.com/a/b.git")).toBe("a/b");
  });
  it("ignora rutas que no son repositorios", () => {
    expect(extractGithubRepo("https://github.com/topics/mcp")).toBeNull();
    expect(extractGithubRepo("https://github.com/anthropics")).toBeNull();
    expect(extractGithubRepo("https://gitlab.com/a/b")).toBeNull();
  });
});

describe("contenido externo no confiable", () => {
  it("stripHtml elimina scripts y etiquetas, incluso escapadas", () => {
    expect(stripHtml('<p>Hola <script>alert(1)</script><b>mundo</b></p>')).toBe("Hola mundo");
    expect(stripHtml("&lt;img src=x onerror=alert(1)&gt;Texto")).toBe("Texto");
  });
  it("solo acepta URLs http(s)", () => {
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("data:text/html,x")).toBe(false);
    expect(isSafeHttpUrl("https://example.com")).toBe(true);
  });
});

describe("similitud de títulos", () => {
  it("detecta el mismo anuncio con redacción casi idéntica", () => {
    const a = titleTokens("Introducing GPT-6: our most capable model for agents");
    const b = titleTokens("Introducing GPT-6 – our most capable model for agents (2026)");
    expect(jaccard(a, b)).toBeGreaterThanOrEqual(0.72);
  });
  it("no agrupa títulos distintos", () => {
    expect(jaccard(titleTokens("New MCP server for Postgres"), titleTokens("Google ranking update October"))).toBeLessThan(0.2);
  });
});

describe("clasificación determinista", () => {
  const now = new Date("2026-10-22T10:00:00Z");
  it("clasifica servidores MCP y skills", () => {
    expect(classifyRepo({ name: "pg-mcp", description: "MCP server for Postgres", topics: ["mcp"], createdAt: now, stars: 1 }, now)).toMatchObject({
      category: "mcp",
      projectType: "mcp-server",
    });
    expect(classifyRepo({ name: "skills", description: "Agent skills for Claude Code", topics: [], createdAt: now, stars: 1 }, now).category).toBe(
      "agent-skills",
    );
  });
  it("mencionar la herramienta con la que se construyó no cambia la categoría", () => {
    expect(classifyText("A fast home screen for Google TV. Built with Claude Code.").category).toBe("other");
  });
  it("detecta SEO", () => {
    expect(classifyText("Keyword research and SERP tracking tool").category).toBe("seo-marketing");
  });
});
