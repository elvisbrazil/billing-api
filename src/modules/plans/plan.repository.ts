import { asc, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { plans } from "../../db/schema.js";

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;

export class PlanRepository {
  constructor(private readonly db: Database) {}

  async insert(plan: NewPlan): Promise<Plan | undefined> {
    const [created] = await this.db.insert(plans).values(plan).onConflictDoNothing().returning();
    return created;
  }

  async findById(id: string): Promise<Plan | undefined> {
    const [plan] = await this.db.select().from(plans).where(eq(plans.id, id));
    return plan;
  }

  list(): Promise<Plan[]> {
    return this.db.select().from(plans).orderBy(asc(plans.priceCents), asc(plans.code));
  }
}
