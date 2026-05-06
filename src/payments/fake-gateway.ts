import { randomUUID } from "node:crypto";
import type { ChargeRequest, ChargeResult, PaymentGateway } from "./gateway.js";

type Outcome = "succeed" | "fail";

export class FakePaymentGateway implements PaymentGateway {
  readonly charges: ChargeRequest[] = [];
  private readonly outcomes = new Map<string, Outcome>();
  private readonly declinedEmails: Set<string>;

  constructor(options: { declinedEmails?: string[] } = {}) {
    this.declinedEmails = new Set(options.declinedEmails?.map((email) => email.toLowerCase()));
  }

  willSucceedFor(customerId: string) {
    this.outcomes.set(customerId, "succeed");
  }

  willFailFor(customerId: string) {
    this.outcomes.set(customerId, "fail");
  }

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    this.charges.push(request);

    const outcome =
      this.outcomes.get(request.customer.id) ??
      (this.declinedEmails.has(request.customer.email) ? "fail" : "succeed");

    if (outcome === "fail") {
      return { status: "failed", reason: "card_declined" };
    }
    return { status: "succeeded", reference: `fake_ch_${randomUUID()}` };
  }
}
