import { buildApp } from "../../src/app.js";
import { FakeClock } from "./clock.js";
import { createTestDatabase } from "./db.js";

export async function createTestApp() {
  const database = await createTestDatabase();
  const clock = new FakeClock();
  const app = buildApp({ db: database.db, clock });
  await app.ready();

  return {
    app,
    db: database.db,
    clock,
    async close() {
      await app.close();
      await database.close();
    },
  };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;
