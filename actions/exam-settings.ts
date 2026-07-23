"use server";

import { z } from "zod";
import type { ApiResult } from "@/lib/api-response";
import { ok } from "@/lib/api-response";
import { invalidInput, runAction } from "@/lib/action-runner";
import { auditSnapshot, createAuditLog } from "@/lib/audit";
import { requireSuperAdmin } from "@/lib/authorization";
import * as exams from "@/lib/exam-settings";

// JET exam settings actions (M6-S9, superadmin). Manual create + settings edit;
// the workbook importer (M7) is the bulk path.

const levelsSchema = z
  .array(z.string().trim().min(1).max(50))
  .min(1, "Add at least one level")
  .max(10)
  .refine((ls) => new Set(ls).size === ls.length, "Levels must be unique");

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  levels: levelsSchema.default(["basic", "medium", "hard"]),
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  questionsPerQuiz: z.number().int().min(1).max(200).optional(),
  timeLimitMinutes: z.number().int().min(1).max(600).optional(),
  levels: levelsSchema.optional(),
});

export async function createExam(input: unknown): Promise<ApiResult<{ id: string }>> {
  return runAction("exam.create", async () => {
    const { admin } = await requireSuperAdmin();
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const exam = await exams.createExam(parsed.data);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "EXAM_CREATED",
      entityType: "Exam",
      entityId: exam.id,
      newValue: auditSnapshot(exam),
    });
    return ok({ id: exam.id });
  });
}

export async function updateExamSettings(input: unknown): Promise<ApiResult<{ id: string }>> {
  return runAction("exam.update", async () => {
    const { admin } = await requireSuperAdmin();
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { id, ...data } = parsed.data;
    const { before, after } = await exams.updateExamSettings(id, data);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "EXAM_SETTINGS_UPDATED",
      entityType: "Exam",
      entityId: id,
      oldValue: auditSnapshot(before),
      newValue: auditSnapshot(after),
    });
    return ok({ id });
  });
}

const idSchema = z.object({ id: z.string().min(1) });

export async function deleteExam(input: unknown): Promise<ApiResult<{ id: string }>> {
  return runAction("exam.delete", async () => {
    const { admin } = await requireSuperAdmin();
    const parsed = idSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { exam, questionCount, attemptCount } = await exams.deleteExam(parsed.data.id);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "EXAM_DELETED",
      entityType: "Exam",
      entityId: exam.id,
      oldValue: auditSnapshot({ ...exam, questionCount, attemptCount }),
    });
    return ok({ id: exam.id });
  });
}
