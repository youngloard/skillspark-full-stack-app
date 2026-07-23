import "server-only";
import type { StudentExam } from "@/lib/generated/prisma/client";
import { db } from "@/lib/db";
import { DomainError, isFkViolation, isUniqueViolation } from "@/lib/errors";

// Exam grant mutations (M3-S4). Batch grants mirror M3-S1's assignment
// semantics (insert-first, dup → CONFLICT, removal idempotent). Individual
// grants UPSERT instead: "grant with this window" is an absolute admin
// intent, so re-granting updates the window rather than erroring.

export async function grantExamToBatch(batchId: string, examId: string): Promise<void> {
  try {
    await db.batchExam.create({ data: { batchId, examId } });
  } catch (cause) {
    if (isUniqueViolation(cause)) {
      throw new DomainError("CONFLICT", "This exam is already granted to the batch");
    }
    if (isFkViolation(cause)) throw new DomainError("NOT_FOUND", "Batch or exam not found");
    throw cause;
  }
}

/**
 * Grant one exam to many batches. Unlike a course (one per batch), exam grants
 * are additive — a batch can hold several — so this only ever ADDS. Batches
 * that already have the exam are skipped, making a re-run a safe no-op.
 */
export async function grantExamToBatches(
  batchIds: string[],
  examId: string,
): Promise<{ granted: number; alreadyHad: number }> {
  if (batchIds.length === 0) return { granted: 0, alreadyHad: 0 };
  try {
    const result = await db.batchExam.createMany({
      data: batchIds.map((batchId) => ({ batchId, examId })),
      skipDuplicates: true,
    });
    return { granted: result.count, alreadyHad: batchIds.length - result.count };
  } catch (cause) {
    if (isFkViolation(cause)) throw new DomainError("NOT_FOUND", "Batch or exam not found");
    throw cause;
  }
}

export async function revokeExamFromBatch(
  batchId: string,
  examId: string,
): Promise<{ removed: boolean }> {
  const result = await db.batchExam.deleteMany({ where: { batchId, examId } });
  return { removed: result.count > 0 };
}

export type IndividualGrantWindow = {
  accessStartDate?: Date | null;
  accessEndDate?: Date | null;
};

/** Upsert: re-granting replaces the window (absolute intent, audited). */
export async function grantExamToStudent(
  studentId: string,
  examId: string,
  window: IndividualGrantWindow = {},
): Promise<{ grant: StudentExam; replacedWindow: boolean }> {
  const start = window.accessStartDate ?? null;
  const end = window.accessEndDate ?? null;
  if (start && end && end < start) {
    throw new DomainError("VALIDATION", "Grant end date must be on or after its start date", {
      accessEndDate: "Ends before the grant starts",
    });
  }
  try {
    const existing = await db.studentExam.findUnique({
      where: { studentId_examId: { studentId, examId } },
      select: { id: true },
    });
    const grant = await db.studentExam.upsert({
      where: { studentId_examId: { studentId, examId } },
      update: { accessStartDate: start, accessEndDate: end },
      create: { studentId, examId, accessStartDate: start, accessEndDate: end },
    });
    return { grant, replacedWindow: existing !== null };
  } catch (cause) {
    if (isFkViolation(cause)) throw new DomainError("NOT_FOUND", "Student or exam not found");
    throw cause;
  }
}

export async function revokeExamFromStudent(
  studentId: string,
  examId: string,
): Promise<{ removed: boolean }> {
  const result = await db.studentExam.deleteMany({ where: { studentId, examId } });
  return { removed: result.count > 0 };
}
