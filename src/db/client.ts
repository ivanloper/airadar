import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

type Holder = { db: Db; sql: postgres.Sql };
const globalForDb = globalThis as unknown as { __airadarDb?: Holder };

/**
 * Conexión única por proceso. Compatible con Supabase (usar la cadena del pooler;
 * `prepare: false` es obligatorio con el pooler en modo transacción).
 */
export function getDb(): Db {
  if (globalForDb.__airadarDb) return globalForDb.__airadarDb.db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no está configurada. Consulta .env.example.");
  const sql = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 15,
  });
  const db = drizzle(sql, { schema }) as unknown as Db;
  globalForDb.__airadarDb = { db, sql };
  return db;
}

export async function closeDb() {
  const holder = globalForDb.__airadarDb;
  if (!holder) return;
  globalForDb.__airadarDb = undefined;
  await holder.sql.end({ timeout: 5 });
}

export function isDbConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export { schema };
