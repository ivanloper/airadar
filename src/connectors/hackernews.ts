/**
 * Hacker News vía la API pública de Algolia (sin clave). Aporta métricas reales de
 * interés (puntos y comentarios) y enlaces a repositorios y lanzamientos.
 */
import { classifyText } from "@/lib/taxonomy";
import { stripHtml, truncate } from "@/lib/text";
import { extractGithubRepo, isSafeHttpUrl } from "@/lib/url";
import { fetchWithRetry } from "./http";
import type { CollectResult, Connector, ConnectorContext, SignalInput } from "./types";

interface HnHit {
  objectID: string;
  title: string | null;
  url: string | null;
  author: string | null;
  points: number | null;
  num_comments: number | null;
  created_at: string;
  created_at_i: number;
  _tags?: string[];
  story_text?: string | null;
}

export interface HnConfig {
  lookbackHours?: number;
  minPoints?: number;
  maxPages?: number;
  requireRelevance?: boolean;
}

export function hnHitToSignal(hit: HnHit, cfg: HnConfig): SignalInput | null {
  const title = stripHtml(hit.title ?? "");
  if (!title) return null;
  const discussionUrl = `https://news.ycombinator.com/item?id=${encodeURIComponent(hit.objectID)}`;
  const url = hit.url && isSafeHttpUrl(hit.url) ? hit.url : discussionUrl;
  const repo = extractGithubRepo(url);
  const excerpt = hit.story_text ? truncate(stripHtml(hit.story_text), 280) : null;
  if (cfg.requireRelevance !== false && !repo && classifyText(`${title} ${excerpt ?? ""}`).category === "other") return null;
  const isShow = /^show hn\b/i.test(title) || hit._tags?.includes("show_hn");
  return {
    externalId: `hn:${hit.objectID}`,
    url,
    discussionUrl,
    title: truncate(title, 300),
    excerpt,
    author: hit.author,
    publishedAt: new Date(hit.created_at),
    metrics: { points: hit.points ?? 0, comments: hit.num_comments ?? 0 },
    kind: isShow ? "launch" : "discussion",
    repoFullName: repo,
  };
}

export const hackerNewsConnector: Connector = {
  kind: "hackernews",
  status() {
    return { configured: true, limits: "API Algolia HN: sin clave, ~10.000 req/h por IP" };
  },
  async collect(ctx: ConnectorContext): Promise<CollectResult> {
    const cfg = ctx.source.config as HnConfig;
    const since = Math.floor(ctx.now.getTime() / 1000) - (cfg.lookbackHours ?? 72) * 3600;
    const minPoints = cfg.minPoints ?? 30;
    const signals: SignalInput[] = [];
    const raw: unknown[] = [];
    const warnings: string[] = [];
    for (let page = 0; page < (cfg.maxPages ?? 3); page++) {
      const url =
        `https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=100&page=${page}` +
        `&numericFilters=${encodeURIComponent(`created_at_i>${since},points>=${minPoints}`)}`;
      const res = await fetchWithRetry(url, { fetchImpl: ctx.fetch, sleep: ctx.sleep });
      const data = (await res.json()) as { hits: HnHit[]; nbPages: number };
      raw.push({ page, hits: data.hits });
      for (const hit of data.hits) {
        const s = hnHitToSignal(hit, cfg);
        if (s) signals.push(s);
      }
      if (page + 1 >= data.nbPages) break;
    }
    ctx.log(`Hacker News: ${signals.length} historias relevantes`);
    return { signals, repos: [], raw, warnings };
  },
};
