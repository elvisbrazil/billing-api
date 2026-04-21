import { buildApp } from "../../src/app.js";
import { createTestDatabase } from "./db.js";

export async function createTestApp() {
  const database = await createTestDatabase();
  const app = buildApp({ db: database.db });
  await app.ready();

  return {
    app,
    db: database.db,
    async close() {
      await app.close();
      await database.close();
    },
  };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;
