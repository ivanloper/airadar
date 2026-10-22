import "../lib/load-env";
import type { Db } from "./client";
import { closeDb, getDb } from "./client";
import { sources } from "./schema";
import { SOURCE_CATALOG } from "./sources-catalog";

/** Inserta las fuentes que falten. Nunca modifica las existentes (respeta la configuración del usuario). */
export async function seedSources(db: Db) {
  const rows = SOURCE_CATALOG.map((s) => ({
    key: s.key,
    kind: s.kind,
    platform: s.platform,
    name: s.name,
    url: s.url ?? null,
    category: s.category ?? null,
    official: s.official ?? false,
    enabled: s.enabled ?? true,
    quality: s.quality,
    config: s.config ?? {},
    notes: s.notes ?? null,
  }));
  const inserted = await db.insert(sources).values(rows).onConflictDoNothing().returning({ key: sources.key });
  return inserted.length;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("src/db/seed.ts")) {
  (async () => {
    const n = await seedSources(getDb());
    console.log(`Fuentes insertadas: ${n} (las existentes no se modifican).`);
    await closeDb();
  })().catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
}
