import "server-only";
import { db } from "@/lib/db";
import { canAccessItem } from "@/lib/course-access";
import { COMPLETE_AT_RATIO } from "@/lib/progress-shared";

// VideoProgress writes (M4-S3 owns these; M4-S1/S2 only read). Fail-closed:
// every write re-checks object-level access. Completion is computed HERE from
// the stored duration — never trusted from the client — and is sticky.

export { COMPLETE_AT_RATIO };

/** Writes closer together than this (and with no completion change) are dropped. */
const MIN_DELTA_SECONDS = 5;

export type SaveProgressInput = {
  studentId: string;
  itemId: string;
  positionSeconds: number;
  /** The client reported the media fired `ended`. */
  ended?: boolean;
  /** Whole seconds actually played since the last save (accumulates watchSeconds). */
  watchedDelta?: number;
};

/**
 * Upserts the student's position for an item on the unique (studentId, itemId).
 * Returns false when access is denied or the item isn't a playable video —
 * callers (the beacon route) drop silently rather than surfacing an error.
 */
export async function saveVideoProgress(input: SaveProgressInput): Promise<boolean> {
  const { studentId, itemId, ended = false } = input;
  const position = Math.max(0, Math.floor(input.positionSeconds));
  if (!Number.isFinite(position)) return false;
  const watchedDelta = Math.max(0, Math.floor(input.watchedDelta ?? 0));

  // Object-level gate on every write (fail closed).
  if (!(await canAccessItem(studentId, itemId))) return false;

  const item = await db.contentItem.findUnique({
    where: { id: itemId },
    select: { type: true, duration: true },
  });
  if (!item || item.type !== "video") return false;

  const existing = await db.videoProgress.findUnique({
    where: { studentId_itemId: { studentId, itemId } },
    select: { positionSeconds: true, completed: true },
  });

  // Completion: sticky once true; else the client's `ended`, else the
  // threshold against the duration we stored (client can't fake it).
  const reachedThreshold =
    item.duration !== null && item.duration > 0
      ? position >= item.duration * COMPLETE_AT_RATIO
      : false;
  const completed = existing?.completed === true || ended || reachedThreshold;

  // Defensive throttle (the player throttles too): skip writes that don't
  // meaningfully move the row — unless there's watch time to accumulate.
  if (
    existing &&
    watchedDelta === 0 &&
    Math.abs(existing.positionSeconds - position) < MIN_DELTA_SECONDS &&
    existing.completed === completed
  ) {
    return true;
  }

  await db.videoProgress.upsert({
    where: { studentId_itemId: { studentId, itemId } },
    create: { studentId, itemId, positionSeconds: position, completed, watchSeconds: watchedDelta },
    update: { positionSeconds: position, completed, watchSeconds: { increment: watchedDelta } },
  });
  return true;
}

export type VideoProgressState = { positionSeconds: number; completed: boolean };

/** The student's saved position for one item (null when never watched). */
export async function getVideoProgress(
  studentId: string,
  itemId: string,
): Promise<VideoProgressState | null> {
  const row = await db.videoProgress.findUnique({
    where: { studentId_itemId: { studentId, itemId } },
    select: { positionSeconds: true, completed: true },
  });
  return row ? { positionSeconds: row.positionSeconds, completed: row.completed } : null;
}
