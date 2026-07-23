import "server-only";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

// Outbox-pattern job queue (docs/CONVENTIONS.md §Background work).
// Enqueue inside the same transaction as the business change; a scheduler
// tick (lib/job-scheduler.ts) drains due jobs. Claiming is concurrency-safe:
// an optimistic updateMany on (id, status="pending") — whoever flips the row
// owns it, so two overlapping ticks can never run the same job twice.

export type JobHandler = (payload: Prisma.JsonValue) => Promise<void>;

const handlers = new Map<string, JobHandler>();

export function registerJobHandler(type: string, handler: JobHandler): void {
  if (handlers.has(type)) {
    throw new Error(`Job handler for type "${type}" is already registered`);
  }
  handlers.set(type, handler);
}

/** Test-only: remove a registered handler. */
export function unregisterJobHandler(type: string): void {
  handlers.delete(type);
}

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function enqueueJob(
  client: DbClient,
  type: string,
  payload: Prisma.InputJsonValue = {},
  options: { runAt?: Date; maxAttempts?: number } = {},
): Promise<string> {
  const job = await client.job.create({
    data: {
      type,
      payload,
      runAt: options.runAt ?? new Date(),
      maxAttempts: options.maxAttempts ?? 5,
    },
    select: { id: true },
  });
  return job.id;
}

const BACKOFF_BASE_MS = 30_000;
const BACKOFF_CAP_MS = 10 * 60_000;
const BACKOFF_JITTER = 0.2;

/** Exponential backoff with ±20% jitter; attempt is 1-based. */
export function backoffMs(attempt: number): number {
  const raw = Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1), BACKOFF_CAP_MS);
  const jitter = 1 + (Math.random() * 2 - 1) * BACKOFF_JITTER;
  return Math.round(raw * jitter);
}

export type TickStats = { claimed: number; done: number; retried: number; dead: number };

export async function runTick(options: { limit?: number; now?: Date } = {}): Promise<TickStats> {
  const limit = options.limit ?? 20;
  const now = options.now ?? new Date();
  const stats: TickStats = { claimed: 0, done: 0, retried: 0, dead: 0 };

  const candidates = await db.job.findMany({
    where: { status: "pending", runAt: { lte: now } },
    orderBy: { runAt: "asc" },
    take: limit,
    select: { id: true },
  });

  for (const { id } of candidates) {
    const claim = await db.job.updateMany({
      where: { id, status: "pending" },
      data: { status: "running", attempts: { increment: 1 } },
    });
    if (claim.count === 0) continue; // another tick owns it
    stats.claimed += 1;

    const job = await db.job.findUnique({ where: { id } });
    if (!job) continue;

    const handler = handlers.get(job.type);
    try {
      if (!handler) {
        throw new Error(`No handler registered for job type "${job.type}"`);
      }
      await handler(job.payload);
      await db.job.update({ where: { id }, data: { status: "done", lastError: null } });
      stats.done += 1;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const exhausted = job.attempts >= job.maxAttempts;
      await db.job.update({
        where: { id },
        data: exhausted
          ? { status: "dead", lastError: message }
          : {
              status: "pending",
              lastError: message,
              runAt: new Date(now.getTime() + backoffMs(job.attempts)),
            },
      });
      if (exhausted) {
        stats.dead += 1;
        logger.error("jobs.dead", { jobId: id, type: job.type, attempts: job.attempts, message });
      } else {
        stats.retried += 1;
        logger.warn("jobs.retry", { jobId: id, type: job.type, attempts: job.attempts, message });
      }
    }
  }

  return stats;
}
