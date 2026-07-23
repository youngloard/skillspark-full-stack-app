"use server";

import { z } from "zod";
import type { ApiResult } from "@/lib/api-response";
import { ok } from "@/lib/api-response";
import { invalidInput, runAction } from "@/lib/action-runner";
import { auditSnapshot, createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/authorization";
import * as grants from "@/lib/exam-grants";
import { dateInput } from "@/lib/student-validation";

// Exam grant actions (M3-S4). New feature (no reference precedent) —
// audit names follow the house *_GRANTED/_REVOKED convention.

const batchExamSchema = z.object({
  batchId: z.string().min(1),
  examId: z.string().min(1),
});

const studentExamSchema = z.object({
  studentId: z.string().min(1),
  examId: z.string().min(1),
  accessStartDate: dateInput.nullable().optional(),
  accessEndDate: dateInput.nullable().optional(),
});

const bulkBatchExamSchema = z.object({
  batchIds: z.array(z.string().min(1)).min(1).max(200),
  examId: z.string().min(1),
});

/** Grant one exam to many batches (additive; re-granting is a no-op). */
export async function grantExamToBatches(
  input: unknown,
): Promise<ApiResult<{ granted: number; alreadyHad: number }>> {
  return runAction("exam.grant.batches", async () => {
    const { admin } = await requireAdmin();
    const parsed = bulkBatchExamSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { batchIds, examId } = parsed.data;
    const { granted, alreadyHad } = await grants.grantExamToBatches(batchIds, examId);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "BATCH_EXAM_GRANTED",
      entityType: "Batch",
      entityId: "bulk",
      newValue: { examId, batchIds, granted, alreadyHad },
    });
    return ok({ granted, alreadyHad });
  });
}

export async function grantExamToBatch(input: unknown): Promise<ApiResult<null>> {
  return runAction("exam.grant.batch", async () => {
    const { admin } = await requireAdmin();
    const parsed = batchExamSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { batchId, examId } = parsed.data;
    await grants.grantExamToBatch(batchId, examId);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "BATCH_EXAM_GRANTED",
      entityType: "Batch",
      entityId: batchId,
      newValue: { examId },
    });
    return ok(null);
  });
}

export async function revokeExamFromBatch(input: unknown): Promise<ApiResult<null>> {
  return runAction("exam.revoke.batch", async () => {
    const { admin } = await requireAdmin();
    const parsed = batchExamSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { batchId, examId } = parsed.data;
    const { removed } = await grants.revokeExamFromBatch(batchId, examId);
    if (removed) {
      await createAuditLog({
        actorId: admin.id,
        actorEmail: admin.email,
        actorType: "admin",
        action: "BATCH_EXAM_REVOKED",
        entityType: "Batch",
        entityId: batchId,
        oldValue: { examId },
      });
    }
    return ok(null);
  });
}

export async function grantExamToStudent(input: unknown): Promise<ApiResult<{ id: string }>> {
  return runAction("exam.grant.student", async () => {
    const { admin } = await requireAdmin();
    const parsed = studentExamSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { studentId, examId, accessStartDate, accessEndDate } = parsed.data;
    const { grant, replacedWindow } = await grants.grantExamToStudent(studentId, examId, {
      accessStartDate,
      accessEndDate,
    });
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: replacedWindow ? "STUDENT_EXAM_WINDOW_CHANGED" : "STUDENT_EXAM_GRANTED",
      entityType: "Student",
      entityId: studentId,
      newValue: auditSnapshot(grant),
    });
    return ok({ id: grant.id });
  });
}

export async function revokeExamFromStudent(input: unknown): Promise<ApiResult<null>> {
  return runAction("exam.revoke.student", async () => {
    const { admin } = await requireAdmin();
    const parsed = studentExamSchema.pick({ studentId: true, examId: true }).safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { studentId, examId } = parsed.data;
    const { removed } = await grants.revokeExamFromStudent(studentId, examId);
    if (removed) {
      await createAuditLog({
        actorId: admin.id,
        actorEmail: admin.email,
        actorType: "admin",
        action: "STUDENT_EXAM_REVOKED",
        entityType: "Student",
        entityId: studentId,
        oldValue: { examId },
      });
    }
    return ok(null);
  });
}
