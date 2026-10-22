"use client";

import { useEffect, useState } from "react";
import { relativeTime } from "@/lib/time";

/**
 * Tiempo relativo calculado en el navegador ("hace 3 h"). En el HTML inicial (y en la
 * versión estática) muestra la fecha absoluta, para no dejar textos relativos caducados.
 */
export function RelTime({ date, prefix = "", timeZone = "Europe/Madrid" }: { date: string | Date | null | undefined; prefix?: string; timeZone?: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  if (!date) return <span>—</span>;
  const d = typeof date === "string" ? new Date(date) : date;
  const absolute = new Intl.DateTimeFormat("es-ES", { timeZone, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
  return (
    <time dateTime={d.toISOString()} title={absolute} suppressHydrationWarning>
      {prefix}
      {now ? relativeTime(d, now) : absolute}
    </time>
  );
}
