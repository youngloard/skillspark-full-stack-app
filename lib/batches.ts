import "server-only";
import type { Batch } from "@/lib/generated/prisma/client";
import { db } from "@/lib/db";
import { DomainError, isFkViolation, isUniqueViolation } from "@/lib/errors";

// Enrollment domain (M3): batch CRUD and the two assignment mappings that ARE
// course access — a student's accessible courses = union over their batches'
// courses (reference-app core invariant). Duplicate assignments are rejected
// by the DB unique constraints, insert-first (no check-then-act).

export type BatchCreateData = {
  batchCode: string;
  batchName: string;
  description?: string;
  courseIds?: string[];
};

/** Creates the batch and its initial course assignments in one transaction. */
export async function createBatch(data: BatchCreateData): Promise<Batch> {
  try {
    return await db.$transaction(async (tx) => {
      const batch = await tx.batch.create({
        data: {
          batchCode: data.batchCode,
          batchName: data.batchName,
          description: data.description ?? null,
        },
      });
      if (data.courseIds?.length) {
        await tx.batchCourse.createMany({
          data: data.courseIds.map((courseId) => ({ batchId: batch.id, courseId })),
        });
      }
      return batch;
    });
  } catch (cause) {
    if (isUniqueViolation(cause)) {
      throw new DomainError("CONFLICT", "A batch with this code already exists", {
        batchCode: "Already in use",
      });
    }
    if (isFkViolation(cause))
      throw new DomainError("NOT_FOUND", "A selected course no longer exists");
    throw cause;
  }
}

export type BatchUpdateData = {
  batchCode?: string;
  batchName?: string;
  description?: string | null;
};

export async function updateBatch(
  id: string,
  data: BatchUpdateData,
): Promise<{ before: Batch; after: Batch }> {
  const before = await db.batch.findUnique({ where: { id } });
  if (!before) throw new DomainError("NOT_FOUND", "Batch not found");
  try {
    const after = await db.batch.update({
      where: { id },
      data: {
        ...(data.batchCode !== undefined && { batchCode: data.batchCode }),
        ...(data.batchName !== undefined && { batchName: data.batchName }),
        ...(data.description !== undefined && { description: data.description }),
      },
    });
    return { before, after };
  } catch (cause) {
    if (isUniqueViolation(cause)) {
      throw new DomainError("CONFLICT", "A batch with this code already exists", {
        batchCode: "Already in use",
      });
    }
    throw cause;
  }
}

export async function deleteBatch(
  id: string,
): Promise<{ batch: Batch; studentCount: number; courseCount: number }> {
  const batch = await db.batch.findUnique({
    where: { id },
    include: { _count: { select: { studentBatches: true, batchCourses: true } } },
  });
  if (!batch) throw new DomainError("NOT_FOUND", "Batch not found");
  // Hard delete (DECISIONS); cascades remove only the assignment rows —
  // students and courses themselves are untouched.
  await db.batch.delete({ where: { id } });
  const { _count, ...row } = batch;
  return {
    batch: row as Batch,
    studentCount: _count.studentBatches,
    courseCount: _count.batchCourses,
  };
}

/** Insert-first; a concurrent duplicate loses to unique(studentId, batchId). */
export async function assignStudentToBatch(studentId: string, batchId: string): Promise<void> {
  try {
    await db.studentBatch.create({ data: { studentId, batchId } });
  } catch (cause) {
    if (isUniqueViolation(cause)) {
      throw new DomainError("CONFLICT", "This student is already in the batch");
    }
    if (isFkViolation(cause)) throw new DomainError("NOT_FOUND", "Student or batch not found");
    throw cause;
  }
}

/** Idempotent: removing an assignment that isn't there is a no-op. */
export async function removeStudentFromBatch(
  studentId: string,
  batchId: string,
): Promise<{ removed: boolean }> {
  const result = await db.studentBatch.deleteMany({ where: { studentId, batchId } });
  return { removed: result.count > 0 };
}

/**
 * Assign many students to one batch. Insert-first with skipDuplicates so
 * already-enrolled students are silently ignored; returns how many rows were
 * actually added.
 */
export async function assignStudentsToBatch(
  studentIds: string[],
  batchId: string,
): Promise<{ added: number }> {
  if (studentIds.length === 0) return { added: 0 };
  try {
    const result = await db.studentBatch.createMany({
      data: studentIds.map((studentId) => ({ studentId, batchId })),
      skipDuplicates: true,
    });
    return { added: result.count };
  } catch (cause) {
    if (isFkViolation(cause)) throw new DomainError("NOT_FOUND", "Student or batch not found");
    throw cause;
  }
}

/** Insert-first; a concurrent duplicate loses to unique(batchId, courseId). */
export async function assignCourseToBatch(batchId: string, courseId: string): Promise<void> {
  try {
    await db.batchCourse.create({ data: { batchId, courseId } });
  } catch (cause) {
    if (isUniqueViolation(cause)) {
      throw new DomainError("CONFLICT", "This course is already assigned to the batch");
    }
    if (isFkViolation(cause)) throw new DomainError("NOT_FOUND", "Batch or course not found");
    throw cause;
  }
}

/** Idempotent: removing an assignment that isn't there is a no-op. */
export async function removeCourseFromBatch(
  batchId: string,
  courseId: string,
): Promise<{ removed: boolean }> {
  const result = await db.batchCourse.deleteMany({ where: { batchId, courseId } });
  return { removed: result.count > 0 };
}
