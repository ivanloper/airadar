import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { settings } from "@/db/schema";

export async function getSetting<T>(db: Db, key: string): Promise<T | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  return row ? (row.value as T) : null;
}

export async function setSetting(db: Db, key: string, value: unknown) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: sql`now()` } });
}
