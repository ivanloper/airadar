import { sql } from "drizzle-orm";
import { getDb, isDbConfigured } from "@/db/client";

export const dynamic = "force-dynamic";

/** Comprobación de salud para el hosting / monitorización. No expone datos sensibles. */
export async function GET() {
  if (!isDbConfigured()) return Response.json({ ok: false, db: "not_configured" }, { status: 503 });
  try {
    const rows = await getDb().execute(sql`select max(finished_at) as last_run from connector_runs`);
    const list = (Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? [])) as { last_run: string | null }[];
    return Response.json({ ok: true, db: "ok", lastRun: list[0]?.last_run ?? null });
  } catch {
    return Response.json({ ok: false, db: "error" }, { status: 503 });
  }
}
