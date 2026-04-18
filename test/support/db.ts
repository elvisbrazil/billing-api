import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "../../src/db/client.js";
import { migrationsFolder } from "../../src/db/migrations.js";
import * as schema from "../../src/db/schema.js";

export async function createTestDatabase() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return { db: db as Database, close: () => client.close() };
}
