import "server-only";
import { registerDriveJobHandlers } from "@/lib/drive-jobs";
import { logger } from "@/lib/logger";
import { runTick } from "@/lib/jobs";

// In-process scheduler started once per server instance from instrumentation.ts
// (single-container deployment — ARCHITECTURE.md §1 Jobs row). Overlap-safe:
// a tick that outlives the interval just causes the next firing to skip.

const TICK_INTERVAL_MS = 60_000;

type SchedulerState = {
  timer: ReturnType<typeof setInterval> | null;
  ticking: boolean;
  stopping: boolean;
};

const globalState = globalThis as unknown as { __jobScheduler?: SchedulerState };

/** Every production job handler registers here, before the first tick. */
function registerAllJobHandlers(): void {
  registerDriveJobHandlers();
}

export function startJobScheduler(): void {
  if (globalState.__jobScheduler?.timer) return; // dev hot-reload / double register guard
  registerAllJobHandlers();

  const state: SchedulerState = { timer: null, ticking: false, stopping: false };
  globalState.__jobScheduler = state;

  const tick = async () => {
    if (state.ticking || state.stopping) return;
    state.ticking = true;
    try {
      const stats = await runTick();
      if (stats.claimed > 0) logger.info("jobs.tick", { ...stats });
    } catch (cause) {
      logger.error("jobs.tick_failed", {
        message: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      state.ticking = false;
    }
  };

  state.timer = setInterval(() => void tick(), TICK_INTERVAL_MS);
  // Don't keep the process alive just for the scheduler.
  state.timer.unref?.();

  const shutdown = (signal: string) => {
    state.stopping = true;
    if (state.timer) clearInterval(state.timer);
    logger.info("jobs.scheduler_stopped", { signal });
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));

  logger.info("jobs.scheduler_started", { intervalMs: TICK_INTERVAL_MS });
  // Drain anything already due shortly after boot rather than waiting a minute.
  setTimeout(() => void tick(), 3_000).unref?.();
}
