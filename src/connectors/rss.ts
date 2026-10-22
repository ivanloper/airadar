/**
 * Conector RSS / Atom / RDF genérico. Peticiones condicionales (ETag / Last-Modified)
 * para no descargar ni reprocesar feeds sin cambios. Solo se guarda un extracto breve:
 * AI Radar publica análisis propio con enlace a la fuente, nunca el artículo completo.
 */
import { XMLParser } from "fast-xml-parser";
import { classifyText } from "@/lib/taxonomy";
import { stripHtml, truncate } from "@/lib/text";
import { extractGithubRepo, isSafeHttpUrl } from "@/lib/url";
import { fetchWithRetry } from "./http";
import type { CollectResult, Connector, ConnectorContext, SignalInput } from "./types";
import { TREND_KINDS } from "./types";

export interface RssSourceConfig {
  maxItems?: number;
  maxAgeDays?: number;
  kind?: (typeof TREND_KINDS)[number];
  /** Solo conservar entradas relacionadas con las áreas del radar (feeds generalistas o de mucho volumen). */
  requireRelevance?: boolean;
  etag?: string;
  lastModified?: string;
}

type Node = Record<string, unknown>;

function text(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === "object") {
    const o = v as Node;
    return text(o["#text"] ?? o["@_href"] ?? o.name ?? "");
  }
  return "";
}

function atomLink(v: unknown): string {
  const links = (Array.isArray(v) ? v : [v]) as unknown[];
  const pick =
    links.find((l) => typeof l === "object" && l && ((l as Node)["@_rel"] ?? "alternate") === "alternate") ?? links[0];
  if (typeof pick === "string") return pick;
  return pick && typeof pick === "object" ? text((pick as Node)["@_href"]) : "";
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface ParsedFeedItem {
  id: string;
  title: string;
  link: string;
  published: Date | null;
  summary: string;
  author: string;
}

export function parseFeed(xml: string): ParsedFeedItem[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    processEntities: false, // las entidades se decodifican en stripHtml (evita expansión de entidades DTD)
    removeNSPrefix: false,
    isArray: (name) => ["item", "entry"].includes(name),
  });
  const doc = parser.parse(xml) as Node;
  const rss = doc.rss as Node | undefined;
  const rdf = (doc["rdf:RDF"] ?? doc.RDF) as Node | undefined;
  const feed = doc.feed as Node | undefined;
  const rawItems = ((rss?.channel as Node | undefined)?.item ?? rdf?.item ?? feed?.entry ?? []) as Node[];

  return rawItems.map((it) => {
    const link = it.link !== undefined && typeof it.link === "object" ? atomLink(it.link) : text(it.link);
    const guid = text(it.guid) || text(it.id);
    return {
      id: (guid || link).trim(),
      title: stripHtml(text(it.title)),
      link: link.trim(),
      published: parseDate(text(it.pubDate) || text(it.published) || text(it["dc:date"]) || text(it.updated)),
      summary: stripHtml(text(it.description) || text(it.summary) || text(it["content:encoded"]) || text(it.content)),
      author: stripHtml(text(it["dc:creator"]) || text(it.author)),
    };
  });
}

export function feedItemsToSignals(items: ParsedFeedItem[], cfg: RssSourceConfig, now: Date): SignalInput[] {
  const maxAge = (cfg.maxAgeDays ?? 30) * 86_400_000;
  const out: SignalInput[] = [];
  for (const it of items) {
    if (!it.title || !isSafeHttpUrl(it.link)) continue;
    if (it.published && now.getTime() - it.published.getTime() > maxAge) continue;
    if (it.published && it.published.getTime() - now.getTime() > 86_400_000) it.published = null; // fechas futuras no fiables
    if (cfg.requireRelevance) {
      const c = classifyText(`${it.title} ${it.summary}`);
      if (c.category === "other" && !extractGithubRepo(it.link)) continue;
    }
    out.push({
      externalId: it.id.slice(0, 500),
      url: it.link,
      title: truncate(it.title, 300),
      excerpt: it.summary ? truncate(it.summary, 280) : null,
      author: it.author ? truncate(it.author, 120) : null,
      publishedAt: it.published,
      metrics: {},
      kind: cfg.kind ?? "article",
      repoFullName: extractGithubRepo(it.link),
    });
    if (out.length >= (cfg.maxItems ?? 30)) break;
  }
  return out;
}

export const rssConnector: Connector = {
  kind: "rss",
  status() {
    return { configured: true, limits: "Sin clave. Peticiones condicionales; respetar la frecuencia de cada sitio." };
  },
  async collect(ctx: ConnectorContext): Promise<CollectResult> {
    const url = ctx.source.url;
    if (!url || !isSafeHttpUrl(url)) throw new Error("La fuente RSS no tiene una URL http(s) válida.");
    const cfg = ctx.source.config as RssSourceConfig;
    const headers: Record<string, string> = { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9" };
    if (cfg.etag) headers["if-none-match"] = cfg.etag;
    if (cfg.lastModified) headers["if-modified-since"] = cfg.lastModified;
    const res = await fetchWithRetry(url, { headers, fetchImpl: ctx.fetch, sleep: ctx.sleep, retries: 2 });
    if (res.status === 304) {
      return { signals: [], repos: [], raw: { status: 304 }, warnings: ["Feed sin cambios (304)."] };
    }
    const xml = await res.text();
    if (xml.length > 8_000_000) throw new Error("Feed demasiado grande (>8 MB).");
    const items = parseFeed(xml);
    const signals = feedItemsToSignals(items, cfg, ctx.now);
    return {
      signals,
      repos: [],
      raw: { url, status: res.status, items: items.slice(0, 200) },
      warnings: items.length === 0 ? ["El feed no contiene entradas reconocibles."] : [],
      configPatch: {
        etag: res.headers.get("etag") ?? undefined,
        lastModified: res.headers.get("last-modified") ?? undefined,
      },
    };
  },
};
