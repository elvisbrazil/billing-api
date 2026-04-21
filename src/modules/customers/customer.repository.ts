import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { customers } from "../../db/schema.js";

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;

export class CustomerRepository {
  constructor(private readonly db: Database) {}

  async insert(customer: NewCustomer): Promise<Customer | undefined> {
    const [created] = await this.db
      .insert(customers)
      .values(customer)
      .onConflictDoNothing()
      .returning();
    return created;
  }

  async findById(id: string): Promise<Customer | undefined> {
    const [customer] = await this.db.select().from(customers).where(eq(customers.id, id));
    return customer;
  }
}
