/**
 * Orquestador: Recopilar → Validar → Normalizar → Deduplicar → Agrupar → Puntuar → Priorizar.
 * Cada fuente se ejecuta aislada: el fallo de una API se registra y no detiene el resto.
 */
import { asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { connectorRuns, settings, sources, type Source } from "@/db/schema";
import { getConnector } from "@/connectors/registry";
import { repoObservationSchema, signalInputSchema, type ValidRepo, type ValidSignal } from "@/connectors/types";
import type { AppConfig } from "@/lib/config";
import { putJsonSnapshot, type ObjectStore } from "@/storage";
import { getAIProvider } from "@/ai";
import { sendAlerts } from "./alerts";
import { analyzeTopTrends } from "./analyze";
import { auditRepos } from "./audit";
import { autoPublish } from "./autopublish";
import { assignTrends } from "./group";
import { persistRepos, persistSignals } from "./persist";
import { refreshTrends } from "./refresh";

export interface PipelineDeps {
  db: Db;
  config: AppConfig;
  store: ObjectStore;
  now?: () => Date;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
  /** Recarga histórica única (días hacia atrás) para las fuentes que la admiten. */
  backfillDays?: number;
}

export interface SourceRunReport {
  sourceKey: string;
  status: "ok" | "partial" | "error" | "skipped";
  fetched: number;
  inserted: number;
  updated: number;
  invalid: number;
  warnings: string[];
  error?: string;
  durationMs: number;
}

export interface PipelineReport {
  startedAt: string;
  finishedAt: string;
  sources: SourceRunReport[];
  grouping: { assigned: number; created: number };
  refresh: { refreshed: number; changed: number; historyRows: number; statusChanges: number };
}

/** Las fuentes que alimentan enlaces a repos se ejecutan antes que GitHub. */
const KIND_ORDER: Record<string, number> = { rss: 0, hackernews: 1, github: 2 };

const LOCK_KEY = "pipeline.lock";
const LOCK_TTL_MINUTES = 30;

async function acquireLock(db: Db, holder: string): Promise<boolean> {
  const rows = await db.execute(sql`
    insert into ${settings} (key, value, updated_at) values (${LOCK_KEY}, ${JSON.stringify({ holder })}::jsonb, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
    where ${settings.updatedAt} < now() - make_interval(mins => ${LOCK_TTL_MINUTES})
    returning key`);
  const list = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows) ?? [];
  return list.length > 0;
}

async function releaseLock(db: Db) {
  await db.delete(settings).where(eq(settings.key, LOCK_KEY));
}

export async function runSource(source: Source, deps: PipelineDeps): Promise<SourceRunReport> {
  const { db, config, store } = deps;
  const now = deps.now?.() ?? new Date();
  const log = deps.log ?? (() => {});
  const started = Date.now();
  const report: SourceRunReport = {
    sourceKey: source.key,
    status: "ok",
    fetched: 0,
    inserted: 0,
    updated: 0,
    invalid: 0,
    warnings: [],
    durationMs: 0,
  };
  const connector = getConnector(source.kind);
  const [run] = await db.insert(connectorRuns).values({ sourceKey: source.key, startedAt: now }).returning();

  try {
    if (!connector) throw new Error(`No existe un conector para el tipo «${source.kind}».`);
    const status = connector.status(config);
    if (!status.configured) {
      report.status = "skipped";
      report.warnings.push(status.reason ?? "Conector no configurado.");
    } else {
      const result = await connector.collect({
        source,
        now,
        config,
        db,
        fetch: deps.fetch ?? fetch,
        sleep: deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
        log,
        backfillDays: deps.backfillDays,
      });
      report.warnings.push(...result.warnings);

      // Snapshot en bruto (MinIO / disco). Un fallo aquí no invalida la ejecución.
      let snapshotKey: string | null = null;
      if (store.driver !== "none") {
        const d = now.toISOString();
        const key = `snapshots/${source.key.replace(/[^a-z0-9-]/gi, "_")}/${d.slice(0, 4)}/${d.slice(5, 7)}/${d.slice(8, 10)}/${run.id}.json.gz`;
        try {
          snapshotKey = await putJsonSnapshot(store, key, { source: source.key, observedAt: d, raw: result.raw });
        } catch (err) {
          report.warnings.push(`Snapshot no guardado: ${(err as Error).message}`);
        }
      }

      // Validación: el contenido externo es no confiable y se filtra antes de persistir.
      const repos: ValidRepo[] = [];
      for (const r of result.repos) {
        const parsed = repoObservationSchema.safeParse(r);
        if (parsed.success) repos.push(parsed.data);
        else report.invalid++;
      }
      const sigs: ValidSignal[] = [];
      for (const s of result.signals) {
        const parsed = signalInputSchema.safeParse(s);
        if (parsed.success) sigs.push(parsed.data);
        else report.invalid++;
      }
      if (report.invalid) report.warnings.push(`${report.invalid} elementos descartados por formato no válido.`);
      report.fetched = result.signals.length;

      if (repos.length) await persistRepos(db, repos, now);
      const stats = await persistSignals(db, source.key, source.platform, sigs, now);
      report.inserted = stats.inserted;
      report.updated = stats.updated;

      if (result.configPatch) {
        const patch = Object.fromEntries(Object.entries(result.configPatch).filter(([, v]) => v !== undefined));
        if (Object.keys(patch).length) {
          await db.update(sources).set({ config: { ...source.config, ...patch } }).where(eq(sources.key, source.key));
        }
      }
      await db.update(connectorRuns).set({ snapshotKey }).where(eq(connectorRuns.id, run.id));
      if (report.warnings.some((w) => !/sin cambios/i.test(w))) report.status = "partial";
    }
  } catch (err) {
    report.status = "error";
    report.error = (err as Error).message.slice(0, 1000);
    log(`✗ ${source.key}: ${report.error}`);
  }

  report.durationMs = Date.now() - started;
  const finished = deps.now?.() ?? new Date();
  await db
    .update(connectorRuns)
    .set({
      finishedAt: finished,
      status: report.status,
      itemsFetched: report.fetched,
      itemsNew: report.inserted,
      itemsUpdated: report.updated,
      durationMs: report.durationMs,
      error: report.error ?? (report.warnings.length ? report.warnings.join("\n").slice(0, 4000) : null),
    })
    .where(eq(connectorRuns.id, run.id));
  await db
    .update(sources)
    .set({
      lastRunAt: finished,
      lastStatus: report.status,
      lastError: report.error ?? null,
      lastItemCount: report.fetched,
      updatedAt: finished,
    })
    .where(eq(sources.key, source.key));
  log(`${report.status === "error" ? "✗" : "✓"} ${source.key}: ${report.fetched} señales (${report.inserted} nuevas, ${report.updated} actualizadas) en ${report.durationMs} ms`);
  return report;
}

/**
 * Retención del histórico: se conservan todas las observaciones de los últimos 7 días,
 * una por día hasta 180 días y ninguna más antigua.
 */
export async function pruneSnapshots(db: Db, now: Date) {
  const week = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const limit = new Date(now.getTime() - 180 * 86_400_000).toISOString();
  await db.execute(sql`delete from repo_snapshots where observed_at < ${limit}::timestamptz`);
  await db.execute(sql`
    delete from repo_snapshots s using (
      select id, row_number() over (partition by repo_id, date_trunc('day', observed_at) order by observed_at desc) as rn
      from repo_snapshots where observed_at < ${week}::timestamptz
    ) d where s.id = d.id and d.rn > 1`);
}

export async function runPipeline(
  deps: PipelineDeps & { sourceKeys?: string[]; collect?: boolean; audit?: boolean; ai?: boolean },
): Promise<PipelineReport> {
  const { db, config } = deps;
  const log = deps.log ?? (() => {});
  const startedAt = (deps.now?.() ?? new Date()).toISOString();
  if (!(await acquireLock(db, `pid:${process.pid}`))) {
    throw new Error("Ya hay una ejecución del pipeline en curso (bloqueo activo).");
  }
  try {
    const reports: SourceRunReport[] = [];
    if (deps.collect !== false) {
      const list = (
        await db
          .select()
          .from(sources)
          .where(deps.sourceKeys?.length ? inArray(sources.key, deps.sourceKeys) : eq(sources.enabled, true))
          .orderBy(asc(sources.key))
      ).sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9));
      for (const source of list) reports.push(await runSource(source, deps));
      // Auditoría de calidad/confianza tras refrescar GitHub (aislada: un fallo no detiene el resto).
      if (list.some((s) => s.kind === "github") && deps.audit !== false) {
        try {
          await auditRepos({
            db,
            config,
            now: deps.now?.() ?? new Date(),
            fetch: deps.fetch ?? fetch,
            sleep: deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
            log,
          });
        } catch (err) {
          log(`✗ auditoría: ${(err as Error).message}`);
        }
      }
      await pruneSnapshots(db, deps.now?.() ?? new Date());
    }
    const now = deps.now?.() ?? new Date();
    const grouping = await assignTrends(db, now);
    log(`Agrupación: ${grouping.assigned} señales asignadas, ${grouping.created} tendencias nuevas`);
    const refresh = await refreshTrends(db, config, now, { trendIds: grouping.touched });
    log(`Puntuación: ${refresh.refreshed} tendencias evaluadas, ${refresh.changed} actualizadas, ${refresh.statusChanges} cambios de estado`);

    // Fase 2: análisis con IA, publicación con control de calidad y alertas. Cada paso aislado.
    const provider = deps.ai === false ? null : getAIProvider(config, deps.fetch);
    try {
      if (provider) await analyzeTopTrends({ db, config, provider, now, log });
    } catch (err) {
      log(`✗ análisis IA: ${(err as Error).message}`);
    }
    try {
      await autoPublish(db, config, now, Boolean(provider), log);
    } catch (err) {
      log(`✗ publicación automática: ${(err as Error).message}`);
    }
    try {
      await sendAlerts(db, config, now, deps.fetch ?? fetch, log);
    } catch (err) {
      log(`✗ alertas: ${(err as Error).message}`);
    }
    return {
      startedAt,
      finishedAt: (deps.now?.() ?? new Date()).toISOString(),
      sources: reports,
      grouping: { assigned: grouping.assigned, created: grouping.created },
      refresh,
    };
  } finally {
    await releaseLock(db);
  }
}
