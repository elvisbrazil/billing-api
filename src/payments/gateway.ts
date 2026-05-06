export interface ChargeRequest {
  invoiceId: string;
  customer: { id: string; email: string };
  amountCents: number;
  currency: string;
  idempotencyKey: string;
}

export type ChargeResult =
  | { status: "succeeded"; reference: string }
  | { status: "failed"; reason: string };

export interface PaymentGateway {
  charge(request: ChargeRequest): Promise<ChargeResult>;
}
