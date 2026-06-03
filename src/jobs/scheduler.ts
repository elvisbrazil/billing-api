import type { FastifyBaseLogger } from "fastify";

export interface SchedulerOptions {
  intervalMs: number;
  task: () => Promise<unknown>;
  logger: Pick<FastifyBaseLogger, "error">;
}

export function startScheduler({ intervalMs, task, logger }: SchedulerOptions) {
  let current: Promise<void> | undefined;

  const tick = () => {
    if (current) return;
    current = task()
      .then(() => undefined)
      .catch((err: unknown) => logger.error(err, "scheduled billing run failed"))
      .finally(() => {
        current = undefined;
      });
  };

  const timer = setInterval(tick, intervalMs);

  return {
    async stop() {
      clearInterval(timer);
      await current;
    },
  };
}
