import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import { getConfig } from "@/lib/config";

/** Postgres real (WASM) en memoria con las migraciones versionadas aplicadas. */
export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../drizzle") });
  return { db: db as unknown as Db, close: () => client.close() };
}

export function testConfig(overrides: Record<string, string> = {}) {
  return getConfig({ APP_TIMEZONE: "Europe/Madrid", STORAGE_DRIVER: "none", ...overrides } as unknown as NodeJS.ProcessEnv);
}

export function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });
}

export function xmlResponse(xml: string, status = 200) {
  return new Response(xml, { status, headers: { "content-type": "application/rss+xml" } });
}
