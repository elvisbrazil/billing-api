import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { loadConfig } from "../config.js";
import { migrationsFolder } from "./migrations.js";

const config = loadConfig();
const pool = new pg.Pool({ connectionString: config.DATABASE_URL });

try {
  await migrate(drizzle(pool), { migrationsFolder });
} finally {
  await pool.end();
}
