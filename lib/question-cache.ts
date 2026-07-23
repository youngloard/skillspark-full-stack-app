import "server-only";
import { db } from "@/lib/db";

// In-process question-id cache per (examId, level) — ARCHITECTURE §5
// QuizSession: quiz start samples K ids in memory instead of ORDER BY
// random() table scans. Invalidation-based (no TTL): every question
// mutation calls invalidateQuestionIds. Single-node safe (§6); the
// multi-node threshold moves this to Redis.

const cache = new Map<string, readonly string[]>();

const keyOf = (examId: string, level: string) => `${examId}:${level}`;

/**
 * Cached id list for (exam, level). The HIT path allocates nothing — it
 * returns the frozen cached array itself; callers must not mutate it
 * (sampling copies indices, not the list).
 */
export async function getQuestionIdList(examId: string, level: string): Promise<readonly string[]> {
  const key = keyOf(examId, level);
  const hit = cache.get(key);
  if (hit) return hit;
  const rows = await db.question.findMany({
    where: { examId, level },
    select: { id: true },
  });
  const ids = Object.freeze(rows.map((row) => row.id));
  cache.set(key, ids);
  return ids;
}

/** Called by every question mutation; level omitted = whole exam. */
export function invalidateQuestionIds(examId: string, level?: string): void {
  if (level !== undefined) {
    cache.delete(keyOf(examId, level));
    return;
  }
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${examId}:`)) cache.delete(key);
  }
}

/** Test-only: reset between suites. */
export function clearQuestionIdCache(): void {
  cache.clear();
}
