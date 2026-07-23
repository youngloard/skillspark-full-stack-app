// In-process token-bucket rate limiter (ARCHITECTURE §3: single-container
// deploy — move to Redis only at the multi-node threshold in §5). Fixed
// memory per key, periodic sweep of idle buckets.

type Bucket = { tokens: number; lastRefillMs: number };

export type RateLimitRule = {
  /** Max requests in a full window. */
  capacity: number;
  /** Window length that refills `capacity` tokens. */
  windowMs: number;
};

// Named rules per trust-boundary surface (SECURITY_BASELINE / PRD NFR-3).
export const RATE_RULES = {
  login: { capacity: 10, windowMs: 15 * 60_000 },
  quizSubmit: { capacity: 5, windowMs: 60_000 },
  ai: { capacity: 20, windowMs: 60_000 },
  mutation: { capacity: 120, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;

export type RateScope = keyof typeof RATE_RULES;

const SWEEP_INTERVAL_MS = 10 * 60_000;

type LimiterState = { buckets: Map<string, Bucket>; lastSweepMs: number };
const globalState = globalThis as unknown as { __rateLimiter?: LimiterState };
const state: LimiterState = (globalState.__rateLimiter ??= {
  buckets: new Map(),
  lastSweepMs: Date.now(),
});

function sweep(now: number): void {
  if (now - state.lastSweepMs < SWEEP_INTERVAL_MS) return;
  state.lastSweepMs = now;
  const maxIdle = Math.max(...Object.values(RATE_RULES).map((r) => r.windowMs)) * 2;
  for (const [key, bucket] of state.buckets) {
    if (now - bucket.lastRefillMs > maxIdle) state.buckets.delete(key);
  }
}

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

/**
 * Consume one token for `key` under `scope`'s rule. Key should combine the
 * account and the IP (e.g. `email|ip`) so neither can be farmed alone.
 */
export function checkRateLimit(scope: RateScope, key: string, now = Date.now()): RateLimitResult {
  const rule = RATE_RULES[scope];
  sweep(now);

  const bucketKey = `${scope}:${key}`;
  const refillPerMs = rule.capacity / rule.windowMs;
  let bucket = state.buckets.get(bucketKey);
  if (!bucket) {
    bucket = { tokens: rule.capacity, lastRefillMs: now };
    state.buckets.set(bucketKey, bucket);
  } else {
    bucket.tokens = Math.min(
      rule.capacity,
      bucket.tokens + (now - bucket.lastRefillMs) * refillPerMs,
    );
    bucket.lastRefillMs = now;
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }
  const deficitMs = (1 - bucket.tokens) / refillPerMs;
  return { allowed: false, retryAfterSeconds: Math.ceil(deficitMs / 1000) };
}

/** Test-only: clear all buckets. */
export function resetRateLimiter(): void {
  state.buckets.clear();
}
