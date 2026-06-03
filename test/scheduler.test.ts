import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startScheduler } from "../src/jobs/scheduler.js";

describe("startScheduler", () => {
  const logger = { error: vi.fn() };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs the task on every interval", async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    const scheduler = startScheduler({ intervalMs: 1000, task, logger });

    await vi.advanceTimersByTimeAsync(3000);
    await scheduler.stop();

    expect(task).toHaveBeenCalledTimes(3);
  });

  it("skips a tick while the previous run is still going", async () => {
    let finish!: () => void;
    const task = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const scheduler = startScheduler({ intervalMs: 1000, task, logger });

    await vi.advanceTimersByTimeAsync(3000);
    expect(task).toHaveBeenCalledTimes(1);

    finish();
    await scheduler.stop();
  });

  it("keeps going after a failed run", async () => {
    const task = vi.fn().mockRejectedValueOnce(new Error("db down")).mockResolvedValue(undefined);
    const scheduler = startScheduler({ intervalMs: 1000, task, logger });

    await vi.advanceTimersByTimeAsync(2000);
    await scheduler.stop();

    expect(task).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
