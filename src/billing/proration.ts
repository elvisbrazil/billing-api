export interface ProrationInput {
  currentPriceCents: number;
  newPriceCents: number;
  periodStart: Date;
  periodEnd: Date;
  changeAt: Date;
}

export interface Proration {
  creditCents: number;
  chargeCents: number;
  netCents: number;
}

function seconds(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
}

export function prorateAmount(
  priceCents: number,
  usedSeconds: number,
  totalSeconds: number,
): number {
  if (totalSeconds <= 0) return 0;
  const price = BigInt(priceCents);
  const part = BigInt(usedSeconds);
  const total = BigInt(totalSeconds);
  return Number((2n * price * part + total) / (2n * total));
}

export function calculateProration(input: ProrationInput): Proration {
  const total = seconds(input.periodStart, input.periodEnd);
  const remaining = Math.min(total, seconds(input.changeAt, input.periodEnd));

  const creditCents = -prorateAmount(input.currentPriceCents, remaining, total);
  const chargeCents = prorateAmount(input.newPriceCents, remaining, total);

  return { creditCents, chargeCents, netCents: chargeCents + creditCents };
}
