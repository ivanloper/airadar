/**
 * Disparador HTTP del pipeline para hostings con cron por URL.
 *   POST /api/cron            Authorization: Bearer <CRON_SECRET>
 *   POST /api/cron?source=github,hackernews
 * Para ejecuciones largas (GitHub tarda varios minutos) es preferible `npm run worker`.
 */
import { getDb, isDbConfigured } from "@/db/client";
import { seedSources } from "@/db/seed";
import { safeEqual } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { runPipeline } from "@/pipeline/run";
import { createObjectStore } from "@/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

export async function POST(req: Request) {
  const config = getConfig();
  if (!config.CRON_SECRET || config.CRON_SECRET.length < 24) {
    return Response.json({ error: "CRON_SECRET no configurado (mínimo 24 caracteres)." }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${config.CRON_SECRET}`)) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  if (!isDbConfigured()) return Response.json({ error: "DATABASE_URL no configurada." }, { status: 503 });

  const url = new URL(req.url);
  const sourceKeys = (url.searchParams.get("source") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[a-z0-9:_-]{1,60}$/.test(s));
  const db = getDb();
  try {
    await seedSources(db);
    const report = await runPipeline({
      db,
      config,
      store: createObjectStore(config),
      sourceKeys,
      collect: url.searchParams.get("rescore") !== "1",
    });
    return Response.json(report);
  } catch (err) {
    const message = (err as Error).message;
    return Response.json({ error: message }, { status: /en curso/.test(message) ? 409 : 500 });
  }
}
