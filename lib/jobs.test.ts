import { afterAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { backoffMs, enqueueJob, registerJobHandler, runTick, unregisterJobHandler } from "./jobs";

// Integration tests against the real database (test rows are namespaced by a
// unique type prefix and removed afterwards).

const PREFIX = `test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const type = (name: string) => `${PREFIX}-${name}`;

afterAll(async () => {
  await db.job.deleteMany({ where: { type: { startsWith: PREFIX } } });
  await db.$disconnect();
});

describe("job runner", () => {
  it("job-executes-once", async () => {
    let calls = 0;
    registerJobHandler(type("exec"), async () => {
      calls += 1;
    });
    const id = await enqueueJob(db, type("exec"), { hello: "world" });

    await runTick();
    await runTick(); // second tick must not re-run a done job

    expect(calls).toBe(1);
    const job = await db.job.findUniqueOrThrow({ where: { id } });
    expect(job.status).toBe("done");
    expect(job.attempts).toBe(1);
    unregisterJobHandler(type("exec"));
  });

  it("tick-skips-future-jobs", async () => {
    let calls = 0;
    registerJobHandler(type("future"), async () => {
      calls += 1;
    });
    const id = await enqueueJob(
      db,
      type("future"),
      {},
      {
        runAt: new Date(Date.now() + 60 * 60_000),
      },
    );

    await runTick();

    expect(calls).toBe(0);
    const job = await db.job.findUniqueOrThrow({ where: { id } });
    expect(job.status).toBe("pending");
    expect(job.attempts).toBe(0);
    unregisterJobHandler(type("future"));
  });

  it("job-retries-then-dead", async () => {
    registerJobHandler(type("boom"), async () => {
      throw new Error("boom failure");
    });
    const id = await enqueueJob(db, type("boom"), {}, { maxAttempts: 2 });

    await runTick();
    let job = await db.job.findUniqueOrThrow({ where: { id } });
    expect(job.status).toBe("pending"); // retried with backoff
    expect(job.attempts).toBe(1);
    expect(job.lastError).toContain("boom failure");
    expect(job.runAt.getTime()).toBeGreaterThan(Date.now());

    // Advance "now" past any possible backoff instead of sleeping.
    await runTick({ now: new Date(Date.now() + 60 * 60_000) });
    job = await db.job.findUniqueOrThrow({ where: { id } });
    expect(job.status).toBe("dead");
    expect(job.attempts).toBe(2);
    unregisterJobHandler(type("boom"));
  });

  it("concurrent-tick-no-double-run", async () => {
    let calls = 0;
    registerJobHandler(type("race"), async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    const id = await enqueueJob(db, type("race"));

    await Promise.all([runTick(), runTick(), runTick()]);

    expect(calls).toBe(1);
    const job = await db.job.findUniqueOrThrow({ where: { id } });
    expect(job.status).toBe("done");
    expect(job.attempts).toBe(1);
    unregisterJobHandler(type("race"));
  });

  it("unknown-type-dead-letters-after-max-attempts", async () => {
    const id = await enqueueJob(db, type("orphan"), {}, { maxAttempts: 1 });
    await runTick();
    const job = await db.job.findUniqueOrThrow({ where: { id } });
    expect(job.status).toBe("dead");
    expect(job.lastError).toContain("No handler registered");
  });

  it("backoff grows exponentially within jitter bounds and caps", () => {
    for (const [attempt, base] of [
      [1, 30_000],
      [2, 60_000],
      [3, 120_000],
    ] as const) {
      const ms = backoffMs(attempt);
      expect(ms).toBeGreaterThanOrEqual(base * 0.8);
      expect(ms).toBeLessThanOrEqual(base * 1.2);
    }
    expect(backoffMs(30)).toBeLessThanOrEqual(10 * 60_000 * 1.2);
  });
});
