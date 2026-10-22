import { TZDate } from "@date-fns/tz";
import { startOfDay, subDays } from "date-fns";

export const PERIODS = ["today", "week", "month"] as const;
export type Period = (typeof PERIODS)[number];

export const PERIOD_LABELS: Record<Period, string> = {
  today: "Hoy",
  week: "Esta semana",
  month: "Este mes",
};

/** Días naturales (incluido hoy) que cubre cada periodo. */
const PERIOD_DAYS: Record<Period, number> = { today: 1, week: 7, month: 30 };

export function isPeriod(v: unknown): v is Period {
  return typeof v === "string" && (PERIODS as readonly string[]).includes(v);
}

/**
 * Intervalo [start, end] de un periodo en la zona horaria configurada.
 *  - today: desde las 00:00 locales de hoy.
 *  - week:  desde las 00:00 locales de hace 6 días (7 días naturales, incluido hoy).
 *  - month: desde las 00:00 locales de hace 29 días (30 días naturales, incluido hoy).
 * `end` es el instante actual. El cálculo se hace en calendario local, por lo que
 * los cambios de horario (DST) no desplazan los límites.
 */
export function periodRange(period: Period, now: Date, timeZone: string): { start: Date; end: Date } {
  const localNow = new TZDate(now.getTime(), timeZone);
  const start = subDays(startOfDay(localNow), PERIOD_DAYS[period] - 1);
  return { start: new Date(start.getTime()), end: new Date(now.getTime()) };
}

export function daysBetween(a: Date, b: Date) {
  return Math.abs(b.getTime() - a.getTime()) / 86_400_000;
}

export function formatDate(d: Date | string | null | undefined, timeZone: string, withTime = false) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("es-ES", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

export function relativeTime(d: Date | string | null | undefined, now = new Date()) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = (now.getTime() - date.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(-Math.round(diff), "second");
  if (abs < 3600) return rtf.format(-Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(-Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(-Math.round(diff / 86400), "day");
  if (abs < 86400 * 365) return rtf.format(-Math.round(diff / (86400 * 30)), "month");
  return rtf.format(-Math.round(diff / (86400 * 365)), "year");
}
