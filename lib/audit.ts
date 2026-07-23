import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

// Audit trail (FR-9.1). Pulled forward from M1-S3 because login denials
// (M1-S2) must be audited — disclosed in the slice note.

export type AuditEntry = {
  actorId?: string;
  actorEmail?: string;
  actorType: "admin" | "student" | "system";
  action: string;
  entityType?: string;
  entityId?: string;
  oldValue?: Prisma.InputJsonValue;
  newValue?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
};

/**
 * Serializes an entity (Dates and all) into a JSON-safe audit snapshot for
 * oldValue/newValue — Prisma's InputJsonValue rejects Date instances.
 */
export function auditSnapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Audit action name for a status-bearing update: `X_ACTIVATED` /
 * `X_INACTIVATED` when the status actually changed, `X_UPDATED` otherwise.
 */
export function statusAuditAction(
  entity: "COURSE" | "ITEM",
  beforeStatus: string,
  requestedStatus: string | undefined,
): string {
  if (requestedStatus && requestedStatus !== beforeStatus) {
    return `${entity}_${requestedStatus === "active" ? "ACTIVATED" : "INACTIVATED"}`;
  }
  return `${entity}_UPDATED`;
}

/**
 * Writes an audit row. Never throws — a failed audit write must not break the
 * mutation it describes (it is logged as an error instead).
 */
export async function createAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({ data: entry });
  } catch (cause) {
    logger.error("audit.write_failed", {
      action: entry.action,
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
}
