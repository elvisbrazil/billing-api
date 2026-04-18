import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export function connect(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db: Database = drizzle(pool, { schema });
  return { db, close: () => pool.end() };
}
