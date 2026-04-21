import { conflict, notFound } from "../../errors.js";
import type { Customer, CustomerRepository, NewCustomer } from "./customer.repository.js";

export class CustomerService {
  constructor(private readonly customers: CustomerRepository) {}

  async create(input: NewCustomer): Promise<Customer> {
    const customer = await this.customers.insert({ ...input, email: input.email.toLowerCase() });
    if (!customer) throw conflict(`A customer with email ${input.email} already exists`);
    return customer;
  }

  async get(id: string): Promise<Customer> {
    const customer = await this.customers.findById(id);
    if (!customer) throw notFound(`Customer ${id} not found`);
    return customer;
  }
}
