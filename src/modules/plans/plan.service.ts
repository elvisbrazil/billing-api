import { conflict, notFound } from "../../errors.js";
import type { NewPlan, Plan, PlanRepository } from "./plan.repository.js";

export class PlanService {
  constructor(private readonly plans: PlanRepository) {}

  async create(input: NewPlan): Promise<Plan> {
    const plan = await this.plans.insert(input);
    if (!plan) throw conflict(`Plan code '${input.code}' is already in use`);
    return plan;
  }

  async get(id: string): Promise<Plan> {
    const plan = await this.plans.findById(id);
    if (!plan) throw notFound(`Plan ${id} not found`);
    return plan;
  }

  list(): Promise<Plan[]> {
    return this.plans.list();
  }
}
