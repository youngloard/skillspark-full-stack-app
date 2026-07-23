import "server-only";
import { createAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { fetchDriveVideoMetadata } from "@/lib/drive";
import { registerJobHandler } from "@/lib/jobs";
import { logger } from "@/lib/logger";

// Duration fetch as a Job (FR-2.3 "duration auto-fetched"; CONVENTIONS
// §Background work). Enqueued in the same transaction as the item write —
// the request path never waits on the Drive API.

export const DRIVE_FETCH_DURATION = "drive.fetch-duration";

export type FetchDurationPayload = { itemId: string; driveFileId: string };

/** Exported for direct-invocation tests; production runs it via the queue. */
export async function handleFetchDuration(payload: unknown): Promise<void> {
  const { itemId, driveFileId } = payload as FetchDurationPayload;
  if (!itemId || !driveFileId) throw new Error("malformed drive.fetch-duration payload");

  const meta = await fetchDriveVideoMetadata(driveFileId);
  // null = Drive unreachable/denied/no auth — throw so the queue retries with
  // backoff and dead-letters after maxAttempts (visible in admin, M10).
  if (!meta) throw new Error(`Drive metadata unavailable for file ${driveFileId}`);

  // The item may be gone or repointed by the time the job runs — then this
  // result is stale; drop it without failing the job.
  const updated = await db.contentItem.updateMany({
    where: { id: itemId, type: "video", driveFileId },
    data: { duration: meta.durationSeconds, durationFetchedAt: new Date() },
  });
  if (updated.count === 0) {
    logger.info("drive.duration_target_gone", { itemId });
    return;
  }
  if (meta.durationSeconds !== null) {
    await createAuditLog({
      actorType: "system",
      action: "ITEM_DURATION_FETCHED",
      entityType: "ContentItem",
      entityId: itemId,
      newValue: { durationSeconds: meta.durationSeconds },
    });
  }
}

let registered = false;

/** Idempotent — safe under dev hot-reload and repeated scheduler starts. */
export function registerDriveJobHandlers(): void {
  if (registered) return;
  registerJobHandler(DRIVE_FETCH_DURATION, handleFetchDuration);
  registered = true;
}
