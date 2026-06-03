import type { FastifyBaseLogger } from "fastify";
import type { Services } from "../services.js";

export async function runBillingCycle(
  { renewal, dunning }: Pick<Services, "renewal" | "dunning">,
  logger: Pick<FastifyBaseLogger, "info">,
) {
  logger.info(await renewal.run(), "renewals processed");
  logger.info(await dunning.run(), "payment retries processed");
}
