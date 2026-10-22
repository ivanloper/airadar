/**
 * Puntuación AI Radar (0–100): determinista, reproducible y explicable.
 * Cada factor se normaliza a 0..1 y lleva su propia "evidencia" (0..1): cuánto
 * del valor procede de datos observados y cuánto es una estimación provisional.
 * La confianza se deriva de esa evidencia, nunca de la puntuación.
 */
import type { Category, ProjectType } from "./taxonomy";

export const DEFAULT_WEIGHTS = {
  utility: 25,
  novelty: 20,
  commercial: 20,
  adoption: 15,
  maturity: 10,
  relevance: 10,
} as const;
export type FactorKey = keyof typeof DEFAULT_WEIGHTS;
export type Weights = Record<FactorKey, number>;

export const FACTOR_LABELS: Record<FactorKey, string> = {
  utility: "Utilidad práctica",
  novelty: "Novedad",
  commercial: "Potencial comercial/profesional",
  adoption: "Adopción y crecimiento",
  maturity: "Madurez y viabilidad",
  relevance: "Relevancia para el radar",
};

export const STAGES = {
  emergent: "Emergente",
  growing: "En crecimiento",
  popular: "Popular",
  consolidated: "Consolidada",
  declining: "En declive",
  to_validate: "Oportunidad por validar",
} as const;
export type Stage = keyof typeof STAGES;

export type TrendKind = "repository" | "article" | "launch" | "discussion" | "paper";
export type Level = "bajo" | "medio" | "alto";
export type VelocityBasis = "measured" | "since_creation" | "engagement" | "none";

export interface RepoScoreInput {
  stars: number;
  forks: number;
  openIssues: number;
  createdAt: Date;
  pushedAt: Date | null;
  latestReleaseAt: Date | null;
  license: string | null;
  isArchived: boolean;
  hasDescription: boolean;
  hasHomepage: boolean;
  starsDelta24h: number | null;
  starsDelta7d: number | null;
  growthValidated: boolean;
  /** Auditoría de autenticidad y calidad (null = aún no auditado). */
  audit?: { trustScore: number; qualityScore: number; inflationRisk: number | null } | null;
}

export interface ScoreInput {
  now: Date;
  kind: TrendKind;
  title: string;
  category: Category;
  relevanceHits: number;
  projectType: ProjectType | null;
  originDate: Date | null;
  firstDetectedAt: Date;
  repo: RepoScoreInput | null;
  engagement: { points: number; comments: number; publishedAt: Date | null } | null;
  platforms: string[];
  distinctSources: number;
  sourceQuality: number;
  officialSource: boolean;
}

export interface FactorResult {
  value: number;
  evidence: number;
  points: number;
  note: string;
}

export interface ScoreResult {
  score: number;
  confidence: number;
  stage: Stage;
  velocity: number | null;
  velocityBasis: VelocityBasis;
  experimentCost: Level;
  risk: Level;
  breakdown: {
    version: number;
    weights: Weights;
    factors: Record<FactorKey, FactorResult>;
    missing: string[];
  };
}

export const SCORING_VERSION = 2;

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
/** Escala logarítmica: evita que los valores de una fuente de mucho volumen dominen. */
export const logNorm = (x: number, ref: number) => clamp(Math.log10(1 + Math.max(0, x)) / Math.log10(1 + ref));
const days = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 86_400_000;

// Valores heurísticos deliberadamente moderados: sin evidencia directa de uso no deben dominar.
const TYPE_UTILITY: Record<ProjectType, number> = {
  "mcp-server": 0.7,
  "agent-skill": 0.65,
  cli: 0.65,
  library: 0.6,
  framework: 0.6,
  tool: 0.55,
  app: 0.55,
  extension: 0.55,
  template: 0.45,
  model: 0.5,
  "resource-list": 0.35,
};

const CATEGORY_COMMERCIAL: Record<Category, number> = {
  "seo-marketing": 0.75,
  automation: 0.7,
  content: 0.65,
  agents: 0.65,
  mcp: 0.6,
  "agent-skills": 0.6,
  "llm-apps": 0.55,
  devtools: 0.5,
  "data-infra": 0.45,
  "models-research": 0.3,
  other: 0.2,
};

const TYPE_COMMERCIAL_ADJ: Partial<Record<ProjectType, number>> = {
  app: 0.1,
  "mcp-server": 0.05,
  "agent-skill": 0.05,
  "resource-list": -0.2,
  model: -0.1,
};

export function computeVelocity(input: ScoreInput): { velocity: number | null; basis: VelocityBasis } {
  const r = input.repo;
  if (r) {
    if (r.growthValidated && r.starsDelta24h !== null) return { velocity: r.starsDelta24h, basis: "measured" };
    if (r.growthValidated && r.starsDelta7d !== null) return { velocity: round(r.starsDelta7d / 7, 2), basis: "measured" };
    const age = Math.max(1, days(r.createdAt, input.now));
    return { velocity: round(r.stars / age, 2), basis: "since_creation" };
  }
  const e = input.engagement;
  if (e && e.publishedAt) {
    const hours = Math.max(1, (input.now.getTime() - e.publishedAt.getTime()) / 3_600_000);
    return { velocity: round(e.points / hours, 2), basis: "engagement" };
  }
  return { velocity: null, basis: "none" };
}

export function scoreTrend(input: ScoreInput, weights: Weights = { ...DEFAULT_WEIGHTS }): ScoreResult {
  const { now, repo } = input;
  const missing: string[] = [];
  const { velocity, basis } = computeVelocity(input);

  // Utilidad práctica
  let utility: Omit<FactorResult, "points">;
  if (repo && input.projectType) {
    let v = TYPE_UTILITY[input.projectType];
    if (repo.hasHomepage) v += 0.1;
    if (repo.latestReleaseAt) v += 0.1;
    if (!repo.hasDescription) v -= 0.2;
    utility = { value: clamp(v), evidence: 0.5, note: `Tipo de proyecto: ${input.projectType}` };
  } else {
    const t = input.title.toLowerCase();
    let v = 0.4;
    let note = "Anuncio o artículo genérico";
    if (/how to|guide|tutorial|cómo|guía|walkthrough|cookbook/.test(t)) [v, note] = [0.6, "Contenido práctico (guía/tutorial)"];
    else if (/introduc|launch|release|now available|open[- ]source|\bapi\b|\bsdk\b|ga\b|general availability|show hn/.test(t))
      [v, note] = [0.55, "Lanzamiento o disponibilidad de una herramienta"];
    else if (input.kind === "paper") [v, note] = [0.35, "Investigación: aplicación práctica por validar"];
    utility = { value: v, evidence: 0.4, note };
  }

  // Novedad
  let novelty: Omit<FactorResult, "points">;
  if (input.originDate) {
    const age = Math.max(0, days(input.originDate, now));
    novelty = { value: clamp(Math.exp(-age / 21)), evidence: 1, note: `Antigüedad: ${age.toFixed(1)} días` };
  } else {
    const age = Math.max(0, days(input.firstDetectedAt, now));
    novelty = { value: clamp(Math.exp(-age / 21)) * 0.8, evidence: 0.5, note: "Sin fecha de origen; se usa la fecha de detección" };
    missing.push("Fecha de creación/publicación original");
  }

  // Potencial comercial o profesional (heurístico por categoría y tipo)
  const commercial = {
    value: clamp(CATEGORY_COMMERCIAL[input.category] + (input.projectType ? (TYPE_COMMERCIAL_ADJ[input.projectType] ?? 0) : 0)),
    evidence: 0.4,
    note: `Estimación por categoría (${input.category})`,
  };

  // Adopción y crecimiento: la aceleración pesa más que la popularidad acumulada.
  let adoption: Omit<FactorResult, "points">;
  const parts: { value: number; evidence: number; note: string }[] = [];
  if (repo) {
    const pop = logNorm(repo.stars, 5000);
    if (basis === "measured" && velocity !== null) {
      parts.push({ value: 0.45 * pop + 0.55 * logNorm(velocity, 300), evidence: 1, note: `${velocity} ★/día medidas` });
    } else {
      const age = Math.max(1, days(repo.createdAt, now));
      if (age <= 90) {
        parts.push({
          value: 0.45 * pop + 0.55 * logNorm(repo.stars / age, 300),
          evidence: 0.7,
          note: `Promedio desde creación: ${(repo.stars / age).toFixed(1)} ★/día (crecimiento no validado)`,
        });
      } else {
        parts.push({ value: 0.8 * pop, evidence: 0.6, note: "Solo popularidad acumulada (crecimiento no validado)" });
      }
      missing.push("Histórico propio de estrellas (≥24 h) para validar el crecimiento");
    }
  }
  if (input.engagement) {
    const e = input.engagement;
    parts.push({
      value: 0.7 * logNorm(e.points, 800) + 0.3 * logNorm(e.comments, 400),
      evidence: 0.9,
      note: `Hacker News: ${e.points} puntos, ${e.comments} comentarios`,
    });
  }
  // Interacción artificial estimada (cuentas fantasma + proporción de interacción): se descuenta de la adopción.
  const fake = repo?.audit?.inflationRisk ?? null;
  if (repo && parts.length && fake !== null) {
    const penalty = Math.min(0.8, fake * 1.5);
    parts[0] = {
      value: parts[0].value * (1 - penalty),
      evidence: Math.min(1, parts[0].evidence + 0.15),
      note: `${parts[0].note} · riesgo de interacción artificial ${Math.round(fake * 100)}%${penalty > 0 ? ` (−${Math.round(penalty * 100)}% adopción)` : ""}`,
    };
  } else if (repo && repo.stars >= 20 && !repo.audit) {
    missing.push("Auditoría de autenticidad de estrellas y forks");
  }
  if (parts.length) {
    const best = parts.reduce((a, b) => (b.value > a.value ? b : a));
    const crossBonus = Math.min(0.2, 0.1 * (input.platforms.length - 1)) + Math.min(0.1, 0.05 * (input.distinctSources - 1));
    adoption = {
      value: clamp(best.value + Math.max(0, crossBonus)),
      evidence: Math.max(...parts.map((p) => p.evidence)),
      note: parts.map((p) => p.note).join(" · ") + (crossBonus > 0 ? ` · detectado en ${input.distinctSources} fuentes` : ""),
    };
  } else {
    adoption = { value: 0.3, evidence: 0, note: "Sin métricas de adopción: valor provisional" };
    missing.push("Métricas de adopción (estrellas, puntos, interacciones)");
  }

  // Madurez y viabilidad
  let maturity: Omit<FactorResult, "points">;
  if (repo) {
    if (repo.isArchived) maturity = { value: 0, evidence: 1, note: "Repositorio archivado" };
    else {
      const idle = repo.pushedAt ? days(repo.pushedAt, now) : Infinity;
      let v = 0;
      if (repo.license) v += 0.2;
      else missing.push("Licencia declarada");
      if (repo.latestReleaseAt) v += 0.25;
      if (days(repo.createdAt, now) > 30) v += 0.15;
      if (idle <= 14) v += 0.25;
      if (repo.hasDescription) v += 0.05;
      if (repo.openIssues > 0) v += 0.1;
      maturity = { value: clamp(v), evidence: 0.8, note: `Licencia, releases y actividad (último push hace ${Number.isFinite(idle) ? Math.round(idle) : "?"} d)` };
      if (repo.audit) {
        maturity = {
          value: clamp(0.5 * maturity.value + 0.5 * (repo.audit.qualityScore / 100)),
          evidence: 0.95,
          note: `${maturity.note} · calidad auditada ${repo.audit.qualityScore}/100`,
        };
      }
    }
  } else {
    maturity = {
      value: input.officialSource ? 0.75 : 0.5,
      evidence: 0.5,
      note: input.officialSource ? "Fuente oficial" : "Fuente no oficial",
    };
  }

  const relevance = {
    value: input.category === "other" ? 0.15 : clamp(0.6 + Math.min(0.4, input.relevanceHits * 0.08)),
    evidence: 0.8,
    note: input.category === "other" ? "Fuera de las áreas principales" : `${input.relevanceHits} coincidencias temáticas`,
  };

  const raw: Record<FactorKey, Omit<FactorResult, "points">> = {
    utility,
    novelty,
    commercial,
    adoption,
    maturity,
    relevance,
  };
  const totalW = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const factors = {} as Record<FactorKey, FactorResult>;
  let score = 0;
  let evidence = 0;
  for (const key of Object.keys(DEFAULT_WEIGHTS) as FactorKey[]) {
    const w = (weights[key] / totalW) * 100;
    const f = raw[key];
    const points = round(w * f.value, 2);
    factors[key] = { value: round(f.value, 3), evidence: f.evidence, points, note: f.note };
    score += points;
    evidence += w * f.evidence;
  }
  const confidence = round(clamp((evidence / 100) * (0.7 + 0.3 * clamp(input.sourceQuality))), 2);

  const stage = classifyStage(input, velocity, basis, confidence);
  return {
    score: round(clamp(score, 0, 100), 1),
    confidence,
    stage,
    velocity,
    velocityBasis: basis,
    experimentCost: experimentCost(input),
    risk: riskLevel(input, confidence),
    breakdown: { version: SCORING_VERSION, weights: { ...weights }, factors, missing: [...new Set(missing)] },
  };
}

function classifyStage(input: ScoreInput, velocity: number | null, basis: VelocityBasis, confidence: number): Stage {
  const { repo, now } = input;
  const age = input.originDate ? days(input.originDate, now) : days(input.firstDetectedAt, now);
  if (repo) {
    const idle = repo.pushedAt ? days(repo.pushedAt, now) : Infinity;
    if (repo.isArchived) return "declining";
    if (repo.growthValidated && repo.starsDelta7d !== null && repo.starsDelta7d <= 0 && idle > 60) return "declining";
    if (confidence < 0.35) return "to_validate";
    // Solo el crecimiento medido con histórico propio cuenta como aceleración.
    const accelerating = basis === "measured" && velocity !== null && velocity >= Math.max(5, repo.stars * 0.02);
    if (age > 365 && repo.stars >= 5000 && !accelerating) return "consolidated";
    if (accelerating) return "growing";
    if (age <= 14) return "emergent";
    if (repo.stars >= 1000 && idle <= 30) return "popular";
    if (idle > 120) return "declining";
    return "to_validate";
  }
  if (confidence < 0.35) return "to_validate";
  const e = input.engagement;
  if (e && e.points >= 300) return "popular";
  if (e && e.points >= 100 && age <= 3) return "growing";
  if (age <= 7) return "emergent";
  return "to_validate";
}

function experimentCost(input: ScoreInput): Level {
  if (!input.repo || !input.projectType) return "medio";
  if (input.projectType === "model") return "alto";
  if (["app", "framework"].includes(input.projectType)) return "medio";
  if (input.projectType === "resource-list") return "bajo";
  return input.repo.license ? "bajo" : "medio";
}

function riskLevel(input: ScoreInput, confidence: number): Level {
  if (input.repo?.isArchived) return "alto";
  const trust = input.repo?.audit?.trustScore;
  if (trust !== undefined && trust < 55) return "alto";
  if (confidence < 0.4) return "alto";
  if (input.repo) {
    const age = days(input.repo.createdAt, input.now);
    if (age < 30 || !input.repo.license) return confidence >= 0.6 ? "medio" : "alto";
    if (trust !== undefined && trust < 80) return "medio";
  }
  return confidence >= 0.6 ? "bajo" : "medio";
}
