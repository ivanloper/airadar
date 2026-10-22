/** Catálogo inicial de fuentes. Se insertan una sola vez; después se gestionan desde /fuentes. */
export interface SourceSeed {
  key: string;
  kind: string;
  platform: string;
  name: string;
  url?: string;
  category?: string;
  official?: boolean;
  enabled?: boolean;
  quality: number;
  config?: Record<string, unknown>;
  notes?: string;
}

export const SOURCE_CATALOG: SourceSeed[] = [
  { key: "github", kind: "github", platform: "github", name: "GitHub", url: "https://github.com", quality: 0.7 },
  {
    key: "hackernews",
    kind: "hackernews",
    platform: "hackernews",
    name: "Hacker News",
    url: "https://news.ycombinator.com",
    quality: 0.6,
    config: { lookbackHours: 72, minPoints: 30, maxPages: 3, requireRelevance: true },
  },
  { key: "rss:openai", kind: "rss", platform: "web", name: "OpenAI News", url: "https://openai.com/news/rss.xml", official: true, quality: 0.95, category: "llm-apps", config: { maxItems: 20 } },
  {
    key: "rss:anthropic",
    kind: "rss",
    platform: "web",
    name: "Anthropic News (feed comunitario)",
    url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_news.xml",
    quality: 0.8,
    category: "llm-apps",
    config: { maxItems: 20 },
    notes: "Anthropic no publica RSS oficial; feed generado por la comunidad a partir de anthropic.com/news. Los enlaces apuntan a la fuente oficial.",
  },
  { key: "rss:google-ai", kind: "rss", platform: "web", name: "Google AI Blog", url: "https://blog.google/technology/ai/rss/", official: true, quality: 0.9, category: "llm-apps" },
  { key: "rss:deepmind", kind: "rss", platform: "web", name: "Google DeepMind", url: "https://deepmind.google/blog/rss.xml", official: true, quality: 0.9, category: "models-research" },
  { key: "rss:google-developers", kind: "rss", platform: "web", name: "Google Developers Blog", url: "https://developers.googleblog.com/feeds/posts/default", official: true, quality: 0.85, config: { requireRelevance: true } },
  { key: "rss:microsoft", kind: "rss", platform: "web", name: "Microsoft Official Blog", url: "https://blogs.microsoft.com/feed/", official: true, quality: 0.85, config: { requireRelevance: true } },
  { key: "rss:microsoft-foundry", kind: "rss", platform: "web", name: "Microsoft Foundry Blog", url: "https://devblogs.microsoft.com/foundry/feed/", official: true, quality: 0.85, category: "llm-apps" },
  { key: "rss:huggingface", kind: "rss", platform: "web", name: "Hugging Face Blog", url: "https://huggingface.co/blog/feed.xml", official: true, quality: 0.85, category: "models-research", config: { maxItems: 20 } },
  { key: "rss:github-changelog", kind: "rss", platform: "web", name: "GitHub Changelog", url: "https://github.blog/changelog/feed/", official: true, quality: 0.85, category: "devtools", config: { requireRelevance: true } },
  { key: "rss:producthunt", kind: "rss", platform: "web", name: "Product Hunt", url: "https://www.producthunt.com/feed", quality: 0.6, config: { kind: "launch", requireRelevance: true } },
  { key: "rss:arxiv-cs-ai", kind: "rss", platform: "web", name: "arXiv cs.AI", url: "https://export.arxiv.org/rss/cs.AI", quality: 0.7, category: "models-research", config: { kind: "paper", maxItems: 15, requireRelevance: true } },
  { key: "rss:google-search-central", kind: "rss", platform: "web", name: "Google Search Central", url: "https://developers.google.com/search/blog/feed.xml", official: true, quality: 0.9, category: "seo-marketing" },
  { key: "rss:searchenginejournal", kind: "rss", platform: "web", name: "Search Engine Journal", url: "https://www.searchenginejournal.com/feed/", quality: 0.65, category: "seo-marketing", config: { maxItems: 20 } },
  { key: "rss:seroundtable", kind: "rss", platform: "web", name: "Search Engine Roundtable", url: "https://www.seroundtable.com/index.rdf", quality: 0.65, category: "seo-marketing", config: { maxItems: 20 } },
  { key: "rss:simonwillison", kind: "rss", platform: "web", name: "Simon Willison", url: "https://simonwillison.net/atom/everything/", quality: 0.75, config: { maxItems: 20, requireRelevance: true } },
  { key: "x", kind: "x", platform: "x", name: "X / Twitter", enabled: false, quality: 0.5, notes: "Requiere acceso de pago a la API oficial de X." },
  { key: "reddit", kind: "reddit", platform: "reddit", name: "Reddit", enabled: false, quality: 0.55, notes: "Requiere app OAuth de Reddit (Fase 3)." },
  { key: "youtube", kind: "youtube", platform: "youtube", name: "YouTube", enabled: false, quality: 0.55, notes: "Requiere YOUTUBE_API_KEY (Fase 3)." },
];
