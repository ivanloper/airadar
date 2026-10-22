import "../lib/load-env";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { closeDb, getDb } from "./client";

async function main() {
  const db = getDb() as unknown as PostgresJsDatabase;
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("Migraciones aplicadas.");
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
