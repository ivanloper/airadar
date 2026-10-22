/** Utilidades de servidor para páginas: conexión, configuración y parseo seguro de searchParams. */
import { getDb, isDbConfigured } from "@/db/client";
import { getConfig } from "./config";
import { isPeriod, type Period } from "./time";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function appContext() {
  const config = getConfig();
  return { config, db: isDbConfigured() ? getDb() : null, tz: config.APP_TIMEZONE, now: new Date() };
}

export function param(sp: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = sp[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.length <= 200 ? s : undefined;
}

export function intParam(sp: Record<string, string | string[] | undefined>, key: string, min = 0, max = 10_000_000) {
  const v = Number(param(sp, key));
  return Number.isInteger(v) && v >= min && v <= max ? v : undefined;
}

export function enumParam<T extends string>(sp: Record<string, string | string[] | undefined>, key: string, allowed: readonly T[] | Record<T, unknown>, fallback: T): T {
  const v = param(sp, key);
  const list = (Array.isArray(allowed) ? allowed : Object.keys(allowed)) as readonly string[];
  return v && list.includes(v) ? (v as T) : fallback;
}

export function periodParam(sp: Record<string, string | string[] | undefined>, fallback: Period = "week"): Period {
  const v = param(sp, "period");
  return isPeriod(v) ? v : fallback;
}

/** Construye una URL conservando los parámetros actuales y aplicando cambios (undefined elimina). */
export function hrefWith(path: string, current: Record<string, string | undefined>, patch: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  const merged = { ...current, ...patch };
  for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "" && v !== null) params.set(k, String(v));
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export function flatParams(sp: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
}
