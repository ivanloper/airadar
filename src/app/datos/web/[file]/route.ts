/**
 * Histórico web por periodos largos (3 meses, 6 meses, último año) como JSON aparte:
 * la página carga primero el último mes y solo descarga más cuando se pide.
 * En GitHub Pages se genera como archivo estático (/datos/web/quarter.json…).
 */
import { getDb, isDbConfigured } from "@/db/client";
import { webDataset } from "@/lib/datasets";
import { renderPerRequest } from "@/lib/mode";
import { LONG_PERIODS, PERIOD_DAYS, type LongPeriod } from "@/lib/time";

export const dynamicParams = false;

export function generateStaticParams() {
  return LONG_PERIODS.map((p) => ({ file: `${p}.json` }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  await renderPerRequest();
  const { file } = await params;
  const period = file.replace(/\.json$/, "") as LongPeriod;
  if (!(LONG_PERIODS as readonly string[]).includes(period)) return Response.json({ error: "Periodo no válido" }, { status: 404 });
  if (!isDbConfigured()) return Response.json({ rows: [], sourceList: [] });
  return Response.json(await webDataset(getDb(), new Date(), PERIOD_DAYS[period] + 1));
}
