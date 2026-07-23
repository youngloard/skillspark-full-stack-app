"use server";

import { z } from "zod";
import type { ApiResult } from "@/lib/api-response";
import { ok } from "@/lib/api-response";
import { invalidInput, runAction } from "@/lib/action-runner";
import { auditSnapshot, createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/authorization";
import * as batches from "@/lib/batches";
import * as provisioning from "@/lib/admin-provisioning";
import {
  batchCourseSchema,
  batchCreateSchema,
  batchUpdateSchema,
  studentBatchSchema,
  studentsBatchSchema,
} from "@/lib/batch-validation";
import { idInputSchema } from "@/lib/catalog-validation";

// Enrollment actions (M3-S1): batch CRUD + the two assignment mappings.
// Audit action names carried from the reference app (BATCH_CREATED,
// STUDENT_BATCH_ASSIGNED, …) so migrated audit history stays coherent.

export async function createBatch(input: unknown): Promise<ApiResult<{ id: string }>> {
  return runAction("batch.create", async () => {
    const { admin } = await requireAdmin();
    const parsed = batchCreateSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const batch = await batches.createBatch(parsed.data);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "BATCH_CREATED",
      entityType: "Batch",
      entityId: batch.id,
      newValue: auditSnapshot({ ...batch, courseIds: parsed.data.courseIds }),
    });
    return ok({ id: batch.id });
  });
}

export async function updateBatch(input: unknown): Promise<ApiResult<{ id: string }>> {
  return runAction("batch.update", async () => {
    const { admin } = await requireAdmin();
    const parsed = batchUpdateSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { id, ...data } = parsed.data;
    const { before, after } = await batches.updateBatch(id, data);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "BATCH_UPDATED",
      entityType: "Batch",
      entityId: id,
      oldValue: auditSnapshot(before),
      newValue: auditSnapshot(after),
    });
    return ok({ id });
  });
}

const bulkIdsSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(200) });

export async function deleteBatches(input: unknown): Promise<ApiResult<{ deleted: number }>> {
  return runAction("batch.bulkDelete", async () => {
    const { admin } = await requireAdmin();
    const parsed = bulkIdsSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    let deleted = 0;
    for (const id of parsed.data.ids) {
      try {
        const { batch, studentCount, courseCount } = await batches.deleteBatch(id);
        await createAuditLog({
          actorId: admin.id,
          actorEmail: admin.email,
          actorType: "admin",
          action: "BATCH_DELETED",
          entityType: "Batch",
          entityId: batch.id,
          oldValue: auditSnapshot({ ...batch, studentCount, courseCount }),
        });
        deleted++;
      } catch {
        // skip missing
      }
    }
    return ok({ deleted });
  });
}

export async function deleteBatch(input: unknown): Promise<ApiResult<{ id: string }>> {
  return runAction("batch.delete", async () => {
    const { admin } = await requireAdmin();
    const parsed = idInputSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { batch, studentCount, courseCount } = await batches.deleteBatch(parsed.data.id);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "BATCH_DELETED",
      entityType: "Batch",
      entityId: batch.id,
      oldValue: auditSnapshot({ ...batch, studentCount, courseCount }),
    });
    return ok({ id: batch.id });
  });
}

export async function assignStudentToBatch(input: unknown): Promise<ApiResult<null>> {
  return runAction("batch.student.assign", async () => {
    const { admin } = await requireAdmin();
    const parsed = studentBatchSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { studentId, batchId } = parsed.data;
    await batches.assignStudentToBatch(studentId, batchId);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "STUDENT_BATCH_ASSIGNED",
      entityType: "Student",
      entityId: studentId,
      newValue: { batchId },
    });
    return ok(null);
  });
}

export async function assignStudentsToBatch(input: unknown): Promise<ApiResult<{ added: number }>> {
  return runAction("batch.students.assign", async () => {
    const { admin } = await requireAdmin();
    const parsed = studentsBatchSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { studentIds, batchId } = parsed.data;
    const { added } = await batches.assignStudentsToBatch(studentIds, batchId);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "STUDENT_BATCH_ASSIGNED",
      entityType: "Batch",
      entityId: batchId,
      newValue: { studentIds, added },
    });
    return ok({ added });
  });
}

const bulkCourseSchema = z.object({
  batchIds: z.array(z.string().min(1)).min(1).max(200),
  courseId: z.string().min(1),
});

/** Assign one course to many batches (additive — a batch may hold several). */
export async function assignCourseToBatches(
  input: unknown,
): Promise<ApiResult<{ assigned: number; alreadyHad: number }>> {
  return runAction("batch.courses.assign", async () => {
    const { admin } = await requireAdmin();
    const parsed = bulkCourseSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { batchIds, courseId } = parsed.data;
    const { assigned, alreadyHad } = await provisioning.assignCourseToBatches(batchIds, courseId);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "BATCH_COURSE_ASSIGNED",
      entityType: "Batch",
      entityId: "bulk",
      newValue: { courseId, batchIds, assigned, alreadyHad },
    });
    return ok({ assigned, alreadyHad });
  });
}

export async function removeStudentFromBatch(input: unknown): Promise<ApiResult<null>> {
  return runAction("batch.student.remove", async () => {
    const { admin } = await requireAdmin();
    const parsed = studentBatchSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { studentId, batchId } = parsed.data;
    const { removed } = await batches.removeStudentFromBatch(studentId, batchId);
    // Removing a non-existent assignment is a no-op, not an audited removal.
    if (removed) {
      await createAuditLog({
        actorId: admin.id,
        actorEmail: admin.email,
        actorType: "admin",
        action: "STUDENT_BATCH_REMOVED",
        entityType: "Student",
        entityId: studentId,
        oldValue: { batchId },
      });
    }
    return ok(null);
  });
}

export async function assignCourseToBatch(input: unknown): Promise<ApiResult<null>> {
  return runAction("batch.course.assign", async () => {
    const { admin } = await requireAdmin();
    const parsed = batchCourseSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { batchId, courseId } = parsed.data;
    await batches.assignCourseToBatch(batchId, courseId);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "BATCH_COURSE_ASSIGNED",
      entityType: "Batch",
      entityId: batchId,
      newValue: { courseId },
    });
    return ok(null);
  });
}

export async function removeCourseFromBatch(input: unknown): Promise<ApiResult<null>> {
  return runAction("batch.course.remove", async () => {
    const { admin } = await requireAdmin();
    const parsed = batchCourseSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { batchId, courseId } = parsed.data;
    const { removed } = await batches.removeCourseFromBatch(batchId, courseId);
    if (removed) {
      await createAuditLog({
        actorId: admin.id,
        actorEmail: admin.email,
        actorType: "admin",
        action: "BATCH_COURSE_REMOVED",
        entityType: "Batch",
        entityId: batchId,
        oldValue: { courseId },
      });
    }
    return ok(null);
  });
}
