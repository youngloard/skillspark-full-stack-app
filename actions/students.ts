"use server";

import { z } from "zod";
import type { ApiResult } from "@/lib/api-response";
import { ok } from "@/lib/api-response";
import { invalidInput, runAction } from "@/lib/action-runner";
import { auditSnapshot, createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/authorization";
import { idInputSchema } from "@/lib/catalog-validation";
import { studentCreateSchema, studentUpdateSchema } from "@/lib/student-validation";
import * as students from "@/lib/students";

const bulkIdsSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(200) });

// Student actions (M3-S2). Audit action names carried from the reference.
// PII (name/email) is allowed in audit oldValue/newValue per the security
// baseline — but never in logs (runAction logs only event + message).
// The welcome-email option arrives with M8 (email module); no input field
// for it exists here yet — M6's form renders the checkbox disabled.

/** Reference rule for update audit naming, incl. window-change detection. */
function updateAuditAction(
  before: { status: string; accessStartDate: Date; accessEndDate: Date },
  data: { status?: string; accessStartDate?: Date; accessEndDate?: Date },
): string {
  if (data.status === "blocked" && before.status !== "blocked") return "STUDENT_BLOCKED";
  if (data.status === "active" && before.status !== "active") return "STUDENT_ACTIVATED";
  const windowChanged =
    (data.accessStartDate && +data.accessStartDate !== +before.accessStartDate) ||
    (data.accessEndDate && +data.accessEndDate !== +before.accessEndDate);
  return windowChanged ? "STUDENT_ACCESS_DATES_CHANGED" : "STUDENT_UPDATED";
}

export async function createStudent(input: unknown): Promise<ApiResult<{ id: string }>> {
  return runAction("student.create", async () => {
    const { admin } = await requireAdmin();
    const parsed = studentCreateSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const student = await students.createStudent(parsed.data);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "STUDENT_CREATED",
      entityType: "Student",
      entityId: student.id,
      newValue: auditSnapshot({ ...student, batchIds: parsed.data.batchIds }),
    });
    for (const batchId of parsed.data.batchIds) {
      await createAuditLog({
        actorId: admin.id,
        actorEmail: admin.email,
        actorType: "admin",
        action: "STUDENT_BATCH_ASSIGNED",
        entityType: "Student",
        entityId: student.id,
        newValue: { batchId },
      });
    }
    return ok({ id: student.id });
  });
}

export async function updateStudent(input: unknown): Promise<ApiResult<{ id: string }>> {
  return runAction("student.update", async () => {
    const { admin } = await requireAdmin();
    const parsed = studentUpdateSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { id, ...data } = parsed.data;
    const { before, after } = await students.updateStudent(id, data);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: updateAuditAction(before, data),
      entityType: "Student",
      entityId: id,
      oldValue: auditSnapshot(before),
      newValue: auditSnapshot(after),
    });
    return ok({ id });
  });
}

export async function deleteStudents(input: unknown): Promise<ApiResult<{ deleted: number }>> {
  return runAction("student.bulkDelete", async () => {
    const { admin } = await requireAdmin();
    const parsed = bulkIdsSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    let deleted = 0;
    for (const id of parsed.data.ids) {
      try {
        const { student, batchCount } = await students.deleteStudent(id);
        await createAuditLog({
          actorId: admin.id,
          actorEmail: admin.email,
          actorType: "admin",
          action: "STUDENT_DELETED",
          entityType: "Student",
          entityId: student.id,
          oldValue: auditSnapshot({ ...student, batchCount }),
        });
        deleted++;
      } catch {
        // Skip rows that vanished between selection and delete.
      }
    }
    return ok({ deleted });
  });
}

export async function deleteStudent(input: unknown): Promise<ApiResult<{ id: string }>> {
  return runAction("student.delete", async () => {
    const { admin } = await requireAdmin();
    const parsed = idInputSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { student, batchCount } = await students.deleteStudent(parsed.data.id);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "STUDENT_DELETED",
      entityType: "Student",
      entityId: student.id,
      oldValue: auditSnapshot({ ...student, batchCount }),
    });
    return ok({ id: student.id });
  });
}
