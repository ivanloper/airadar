/**
 * Clasificación determinista (sin IA) de repositorios y artículos.
 * Las reglas son palabras clave ponderadas sobre nombre, descripción y topics.
 */

export const CATEGORIES = {
  agents: "Agentes de IA",
  mcp: "MCP e interoperabilidad",
  "agent-skills": "Skills y plugins para agentes",
  "llm-apps": "Apps y frameworks LLM",
  "models-research": "Modelos e investigación",
  devtools: "Herramientas de desarrollo",
  automation: "Automatización",
  "seo-marketing": "SEO y marketing",
  content: "Contenido y medios",
  "data-infra": "Datos e infraestructura",
  other: "Otros",
} as const;
export type Category = keyof typeof CATEGORIES;

export const PROJECT_TYPES = {
  "mcp-server": "Servidor MCP",
  "agent-skill": "Skill / plugin",
  framework: "Framework",
  library: "Librería",
  cli: "CLI",
  app: "Aplicación",
  extension: "Extensión",
  template: "Plantilla",
  "resource-list": "Lista de recursos",
  model: "Modelo / dataset",
  tool: "Herramienta",
} as const;
export type ProjectType = keyof typeof PROJECT_TYPES;

export const MATURITY = {
  experimental: "Experimental",
  early: "Temprano",
  active: "Activo",
  mature: "Maduro",
  inactive: "Inactivo",
} as const;
export type Maturity = keyof typeof MATURITY;

type Rule = [pattern: RegExp, weight: number];

const CATEGORY_RULES: Record<Exclude<Category, "other">, Rule[]> = {
  mcp: [
    [/\bmcp\b/, 3],
    [/model[- ]context[- ]protocol/, 4],
    [/\bmcp[- ]server/, 4],
    [/\ba2a\b|agent2agent|agent-to-agent/, 3],
  ],
  "agent-skills": [
    [/claude[- ]code/, 1.2],
    [/\bskills?\b/, 1.5],
    [/agent[- ]skills?/, 4],
    [/\bcodex\b/, 1],
    [/cursor[- ]rules|\.cursorrules|\bcursor\b/, 1.5],
    [/subagents?|slash[- ]commands?|claude\.md|agents\.md/, 3],
    [/\bplugins?\b.*\b(claude|codex|agent)|\b(claude|codex|agent)\b.*\bplugins?\b/, 2.5],
    [/gemini[- ]cli|opencode|\baider\b|windsurf|copilot/, 2],
  ],
  agents: [
    [/\bagents?\b/, 2],
    [/\bagentic\b/, 3],
    [/multi[- ]agent|autonomous/, 2],
    [/computer[- ]use|browser[- ]use|web[- ]agent/, 3],
    [/crewai|autogen|langgraph|swarm/, 2],
  ],
  "llm-apps": [
    [/\bllms?\b|large language model/, 2],
    [/\brag\b|retrieval[- ]augmented/, 3],
    [/\bgpt|openai|anthropic|claude|gemini|llama|mistral|qwen|deepseek/, 1.5],
    [/prompt|embedding|vector|inference|chatbot|\bchat\b/, 1],
    [/langchain|llamaindex|ollama|vllm|llama\.cpp/, 2],
  ],
  "models-research": [
    [/\bpaper\b|arxiv|benchmark|\bsota\b|state[- ]of[- ]the[- ]art/, 2],
    [/fine[- ]tun|training|pretrain|\blora\b|diffusion|transformer|reinforcement/, 2],
    [/dataset|weights|checkpoint|\bmodel\b/, 1],
    [/open[- ]weights?|embedding model|multimodal model|foundation model|language model/, 2],
  ],
  devtools: [
    [/\bcli\b|terminal|\bide\b|vscode|neovim|debugg|lint|compiler|sdk\b|\bapi\b/, 1],
    [/developer|devtools?|code[- ]review|testing|refactor|codegen|coding/, 1.5],
    [/typescript|rust|python|golang|\bgo\b/, 0.5],
  ],
  automation: [
    [/automat/, 2.5],
    [/workflow|n8n|zapier|make\.com|pipeline|orchestrat|scrap|crawl/, 1.5],
    [/\brpa\b|no[- ]code|low[- ]code/, 2],
  ],
  "seo-marketing": [
    [/\bseo\b|search engine optim|serp|keyword|backlink/, 4],
    [/marketing|growth hack|google ads|meta ads|\bppc\b|advertis|web analytics|\bcrm\b|newsletter|e-?mail campaign/, 2.5],
    [/\bgeo\b|generative engine|ai overviews?|llms\.txt/, 3],
    [/social media|tiktok|instagram|linkedin|youtube/, 1.5],
  ],
  content: [
    [/content (creation|generation)|copywrit|blog post|article writ/, 3],
    [/text[- ]to[- ](speech|video|image)|\btts\b|voice|video gen|image gen|podcast|subtit/, 2],
    [/\bvideo\b|\baudio\b|\bimage\b|design/, 0.8],
  ],
  "data-infra": [
    [/database|postgres|sqlite|vector db|\betl\b|data pipeline|observab|monitor|kubernetes|docker|serverless/, 1.5],
    [/\bgpu\b|cuda|cluster|deploy|hosting|self[- ]host/, 1],
  ],
};

export interface Classification {
  category: Category;
  hits: number;
  scores: Partial<Record<Category, number>>;
}

/** Menciones de la herramienta con la que se construyó algo no lo convierten en esa categoría. */
const BUILT_WITH =
  /\b(built|made|created|written|generated|vibe[- ]?coded|developed|coded)\s+(entirely\s+)?(with|using|by|in)\s+[\w.\- ]{1,30}?(?=[.,;:!)\n]|$)/gim;

/** "…with Claude Code or Codex": el agente es el instrumento, no el tema del proyecto. */
const USED_AS_TOOL =
  /\b(with|using|via)\s+(claude( code)?|codex|cursor|copilot|chatgpt|gemini( cli)?)(\s+(or|and)\s+(claude( code)?|codex|cursor|copilot|chatgpt|gemini( cli)?))?\b/gi;

export function classifyText(text: string): Classification {
  const t = text.toLowerCase().replace(BUILT_WITH, " ").replace(USED_AS_TOOL, " ");
  const scores: Partial<Record<Category, number>> = {};
  let hits = 0;
  for (const [cat, rules] of Object.entries(CATEGORY_RULES) as [Exclude<Category, "other">, Rule[]][]) {
    let s = 0;
    for (const [re, w] of rules) {
      if (re.test(t)) {
        s += w;
        hits++;
      }
    }
    if (s > 0) scores[cat] = s;
  }
  // Orden determinista: mayor puntuación y, a igualdad, el orden de declaración de CATEGORY_RULES.
  let best: Category = "other";
  let bestScore = 1.6; // umbral mínimo para no clasificar por una coincidencia débil
  for (const cat of Object.keys(CATEGORY_RULES) as Category[]) {
    const s = scores[cat] ?? 0;
    if (s > bestScore) {
      best = cat;
      bestScore = s;
    }
  }
  return { category: best, hits, scores };
}

export interface RepoLike {
  name: string;
  description?: string | null;
  topics?: string[];
  language?: string | null;
  isArchived?: boolean;
  createdAt: Date;
  pushedAt?: Date | null;
  stars: number;
  license?: string | null;
  latestReleaseAt?: Date | null;
}

export function repoText(r: Pick<RepoLike, "name" | "description" | "topics">) {
  return [r.name.replace(/[-_]/g, " "), r.description ?? "", (r.topics ?? []).join(" ")].join(" \n ");
}

export function detectProjectType(r: Pick<RepoLike, "name" | "description" | "topics">): ProjectType {
  const t = repoText(r).toLowerCase();
  if (/\bmcp[- ]?server|model context protocol server|\bmcp\b.*\bserver\b/.test(t)) return "mcp-server";
  if (/^awesome|\bawesome\b|curated list|list of|resources?\b.*\blist/.test(t)) return "resource-list";
  if (/agent[- ]skills?|claude[- ]code (skill|plugin|command)|\bskills?\b.*\b(claude|codex|agent)|subagents?|slash[- ]commands?|cursor[- ]rules/.test(t))
    return "agent-skill";
  if (/\bextension\b|chrome extension|vscode extension|browser extension|\baddon\b/.test(t)) return "extension";
  if (/\btemplate\b|boilerplate|starter( kit)?\b/.test(t)) return "template";
  if (/\bframework\b/.test(t)) return "framework";
  if (/\bcli\b|command[- ]line|terminal/.test(t)) return "cli";
  if (/\b(library|sdk|package|bindings?)\b/.test(t)) return "library";
  if (/\b(weights|checkpoint|dataset|model card)\b/.test(t)) return "model";
  if (/\b(app|application|dashboard|platform|desktop|web ?ui|self[- ]hosted)\b/.test(t)) return "app";
  return "tool";
}

export function detectMaturity(r: RepoLike, now: Date): Maturity {
  if (r.isArchived) return "inactive";
  const ageDays = (now.getTime() - r.createdAt.getTime()) / 86_400_000;
  const idleDays = r.pushedAt ? (now.getTime() - r.pushedAt.getTime()) / 86_400_000 : Infinity;
  if (idleDays > 180) return "inactive";
  const hasRelease = Boolean(r.latestReleaseAt);
  if (ageDays > 365 && hasRelease && r.stars >= 500 && idleDays <= 60) return "mature";
  if (ageDays > 60 && (hasRelease || r.stars >= 200) && idleDays <= 60) return "active";
  if (ageDays > 14 || hasRelease || r.license) return "early";
  return "experimental";
}

export function classifyRepo(r: RepoLike, now: Date) {
  const c = classifyText(repoText(r));
  let category = c.category;
  const projectType = detectProjectType(r);
  // El tipo de proyecto, cuando es inequívoco, fija la categoría.
  if (projectType === "mcp-server") category = "mcp";
  if (projectType === "agent-skill" && category !== "mcp") category = "agent-skills";
  return { category, projectType, maturity: detectMaturity(r, now), relevanceHits: c.hits };
}
