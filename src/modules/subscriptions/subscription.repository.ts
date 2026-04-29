import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { subscriptions } from "../../db/schema.js";

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

export class SubscriptionRepository {
  constructor(private readonly db: Database) {}

  async insert(subscription: NewSubscription): Promise<Subscription> {
    const [created] = await this.db.insert(subscriptions).values(subscription).returning();
    return created!;
  }

  async findById(id: string): Promise<Subscription | undefined> {
    const [subscription] = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, id));
    return subscription;
  }
}
