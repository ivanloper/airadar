/**
 * Worker desacoplado del frontend. Pensado para cron (host, contenedor o GitHub Actions):
 *   npm run worker                      → todas las fuentes activas
 *   npm run worker -- --source=github   → solo algunas fuentes
 *   npm run worker -- --rescore-only    → reagrupa y recalcula sin llamar a APIs
 */
import "../lib/load-env";
import { closeDb, getDb } from "@/db/client";
import { inArray } from "drizzle-orm";
import { sources } from "@/db/schema";
import { seedSources } from "@/db/seed";
import { getConfig } from "@/lib/config";
import { runPipeline } from "@/pipeline/run";
import { createObjectStore } from "@/storage";

async function historicalSourceKeys(db: ReturnType<typeof getDb>) {
  const rows = await db.select({ key: sources.key }).from(sources).where(inArray(sources.kind, ["rss", "hackernews"]));
  return rows.map((r) => r.key);
}

async function main() {
  const args = process.argv.slice(2);
  const sourceKeys = args
    .filter((a) => a.startsWith("--source="))
    .flatMap((a) => a.slice("--source=".length).split(","))
    .filter(Boolean);
  const collect = !args.includes("--rescore-only");
  const backfillArg = args.find((a) => a.startsWith("--backfill="));
  const backfillDays = backfillArg ? Math.min(365, Math.max(0, Number(backfillArg.split("=")[1]) || 0)) : 0;
  const config = getConfig();
  const db = getDb();
  await seedSources(db);
  const log = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);
  if (backfillDays) log(`Recarga histórica de ${backfillDays} días (RSS y Hacker News).`);
  const report = await runPipeline({
    db,
    config,
    store: createObjectStore(config),
    log,
    // La recarga histórica solo aplica a fuentes que conservan pasado (RSS, Hacker News).
    sourceKeys: backfillDays && !sourceKeys.length ? await historicalSourceKeys(db) : sourceKeys,
    collect,
    backfillDays: backfillDays || undefined,
  });
  const failed = report.sources.filter((s) => s.status === "error");
  log(`Fin: ${report.sources.length} fuentes, ${failed.length} con error.`);
  for (const s of report.sources.filter((x) => x.warnings.length)) log(`  ⚠ ${s.sourceKey}: ${s.warnings.slice(0, 3).join(" | ")}`);
  await closeDb();
  // Sale con código 0 aunque falle alguna fuente: el fallo queda registrado y no bloquea el cron.
  // Sale con 2 solo si fallaron todas (problema general: red, credenciales…).
  if (report.sources.length && failed.length === report.sources.length) process.exit(2);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
