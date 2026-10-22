/**
 * Filtrado y orden de repositorios en el navegador (sirve igual en servidor y en GitHub Pages).
 * Funciones puras: se prueban con datos reales del pipeline.
 */
import { periodRange, type Period } from "./time";

export type PeriodOrAll = Period | "all";

export interface RepoRow {
  id: number;
  name: string;
  url: string;
  slug: string | null;
  hasPage: boolean;
  desc: string | null;
  lang: string | null;
  cat: string;
  type: string;
  mat: string;
  stars: number;
  forks: number;
  issues: number;
  created: string;
  seen: string;
  pushed: string | null;
  /** ★/día medidas con histórico propio (null = no validado). */
  g24: number | null;
  /** Estrellas ganadas en HOY / SEMANA / MES respecto a la última observación anterior al inicio. */
  gp: [number | null, number | null, number | null];
  /** Promedio de ★/día desde la creación (no es crecimiento validado). */
  avg: number;
  score: number | null;
  conf: number | null;
  stage: string | null;
  /** Valores y evidencias de los 6 factores (orden de DEFAULT_WEIGHTS). */
  fv: number[] | null;
  fe: number[] | null;
  trust: number | null;
  quality: number | null;
  flags: { c: string; l: "info" | "warn" | "high" }[];
  compat: string[];
  plats: string[];
  license: string | null;
  release: string | null;
}

export const CRITERIA = {
  created: "Creados",
  discovered: "Descubiertos",
  grown: "Con crecimiento",
  updated: "Actualizados",
} as const;
export type Criterion = keyof typeof CRITERIA;

export const REPO_SORTS = {
  relevance: "Relevancia",
  score: "Puntuación AI Radar",
  stars: "Más estrellas",
  forks: "Más forks",
  growth: "Más crecimiento",
  trust: "Más fiables",
  quality: "Mejor calidad",
  newest: "Más recientes",
  oldest: "Más antiguos",
} as const;
export type RepoSort = keyof typeof REPO_SORTS;

export const AGE_BUCKETS = {
  "7": "Menos de 7 días",
  "30": "Menos de 30 días",
  "90": "Menos de 3 meses",
  "180": "Menos de 6 meses",
  "365": "Menos de 1 año",
  "old": "Más de 1 año",
} as const;
export type AgeBucket = keyof typeof AGE_BUCKETS;

export interface RepoFilters {
  period: PeriodOrAll;
  criterion: Criterion;
  q?: string;
  lang?: string;
  cat?: string;
  type?: string;
  mat?: string;
  compat?: string;
  minStars?: number;
  minForks?: number;
  minGrowth?: number;
  activeDays?: number;
  age?: AgeBucket;
  from?: string; // YYYY-MM-DD (creación)
  to?: string;
  potential?: "high" | "medium";
  trust?: "reliable" | "hide-risky";
  sort: RepoSort;
}

const DAY = 86_400_000;
const PERIOD_INDEX: Record<Period, 0 | 1 | 2> = { today: 0, week: 1, month: 2 };

export function relevance(r: RepoRow) {
  const base = (r.score ?? 0) * (0.5 + 0.5 * (r.conf ?? 0));
  // La confianza en la autenticidad modula la relevancia: lo inflado no debe subir.
  return r.trust === null ? base : base * (0.6 + 0.4 * (r.trust / 100));
}

export function periodGrowth(r: RepoRow, period: PeriodOrAll) {
  return period === "all" ? r.g24 : r.gp[PERIOD_INDEX[period]];
}

export function filterRepos(rows: RepoRow[], f: RepoFilters, now: Date, timeZone: string): RepoRow[] {
  const range = f.period === "all" ? null : periodRange(f.period, now, timeZone);
  const start = range?.start.getTime() ?? -Infinity;
  const end = range?.end.getTime() ?? Infinity;
  const inRange = (iso: string | null) => {
    if (!iso) return false;
    const t = Date.parse(iso);
    return t >= start && t <= end;
  };
  const q = f.q?.trim().toLowerCase();
  const from = f.from ? Date.parse(`${f.from}T00:00:00Z`) : null;
  const to = f.to ? Date.parse(`${f.to}T23:59:59Z`) : null;

  const out = rows.filter((r) => {
    if (range) {
      if (f.criterion === "created" && !inRange(r.created)) return false;
      if (f.criterion === "discovered" && !inRange(r.seen)) return false;
      if (f.criterion === "updated" && !inRange(r.pushed)) return false;
    }
    if (f.criterion === "grown" && !((periodGrowth(r, f.period) ?? 0) > 0)) return false;
    if (q && !`${r.name} ${r.desc ?? ""}`.toLowerCase().includes(q)) return false;
    if (f.lang && r.lang !== f.lang) return false;
    if (f.cat && r.cat !== f.cat) return false;
    if (f.type && r.type !== f.type) return false;
    if (f.mat && r.mat !== f.mat) return false;
    if (f.compat && !r.compat.includes(f.compat)) return false;
    if (f.minStars && r.stars < f.minStars) return false;
    if (f.minForks && r.forks < f.minForks) return false;
    if (f.minGrowth && !((r.g24 ?? -1) >= f.minGrowth)) return false;
    if (f.activeDays && !(r.pushed && now.getTime() - Date.parse(r.pushed) <= f.activeDays * DAY)) return false;
    const ageDays = (now.getTime() - Date.parse(r.created)) / DAY;
    if (f.age === "old" ? ageDays < 365 : f.age ? ageDays >= Number(f.age) : false) return false;
    const created = Date.parse(r.created);
    if (from !== null && created < from) return false;
    if (to !== null && created > to) return false;
    if (f.potential && (r.fv?.[2] ?? 0) < (f.potential === "high" ? 0.65 : 0.5)) return false;
    if (f.trust === "reliable" && !((r.trust ?? -1) >= 80)) return false;
    if (f.trust === "hide-risky" && r.trust !== null && r.trust < 55) return false;
    return true;
  });

  const key: Record<RepoSort, (r: RepoRow) => number> = {
    relevance,
    score: (r) => r.score ?? -1,
    stars: (r) => r.stars,
    forks: (r) => r.forks,
    // Crecimiento medido primero; sin histórico, se ordena por el promedio desde la creación (detrás).
    growth: (r) => {
      if (f.criterion === "grown") return periodGrowth(r, f.period) ?? -1;
      return r.g24 !== null ? 1e9 + r.g24 : r.avg;
    },
    trust: (r) => (r.trust ?? -1) * 1000 + (r.quality ?? 0),
    quality: (r) => r.quality ?? -1,
    newest: (r) => Date.parse(r.created),
    oldest: (r) => -Date.parse(r.created),
  };
  const k = key[f.sort];
  return out.sort((a, b) => k(b) - k(a) || b.stars - a.stars || a.id - b.id);
}

/** Lee filtros desde la URL (valores inválidos se ignoran). */
export function parseRepoFilters(sp: URLSearchParams): RepoFilters {
  const pick = <T extends string>(k: string, allowed: readonly T[], def?: T) => {
    const v = sp.get(k);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : def;
  };
  const int = (k: string) => {
    const n = Number(sp.get(k));
    return Number.isInteger(n) && n > 0 ? n : undefined;
  };
  const date = (k: string) => {
    const v = sp.get(k);
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
  };
  const str = (k: string) => sp.get(k)?.slice(0, 100) || undefined;
  return {
    period: pick("period", ["today", "week", "month", "all"] as const, "week")!,
    criterion: pick("criterion", Object.keys(CRITERIA) as Criterion[], "created")!,
    q: str("q"),
    lang: str("lang"),
    cat: str("cat"),
    type: str("type"),
    mat: str("mat"),
    compat: str("compat"),
    minStars: int("minStars"),
    minForks: int("minForks"),
    minGrowth: int("minGrowth"),
    activeDays: int("activeDays"),
    age: pick("age", Object.keys(AGE_BUCKETS) as AgeBucket[]),
    from: date("from"),
    to: date("to"),
    potential: pick("potential", ["high", "medium"] as const),
    trust: pick("trust", ["reliable", "hide-risky"] as const),
    sort: pick("sort", Object.keys(REPO_SORTS) as RepoSort[], "relevance")!,
  };
}
