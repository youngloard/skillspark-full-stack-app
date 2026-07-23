"use server";

import { z } from "zod";
import type { ApiResult } from "@/lib/api-response";
import { ok } from "@/lib/api-response";
import { invalidInput, runAction } from "@/lib/action-runner";
import { auditSnapshot, createAuditLog, statusAuditAction } from "@/lib/audit";
import { requireAdmin } from "@/lib/authorization";
import * as catalog from "@/lib/catalog";
import {
  courseCreateSchema,
  courseStatusSchema,
  courseUpdateSchema,
  idInputSchema,
} from "@/lib/catalog-validation";

const bulkIdsSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(200) });

// Course actions (M2-S2): validate → requireAdmin → mutate via lib/catalog →
// audit → envelope (docs/CONVENTIONS.md). No cache revalidation yet — the
// admin/student pages that read the catalog arrive with M4/M6 and bring their
// own cache tags.

export async function createCourse(input: unknown): Promise<ApiResult<{ id: string }>> {
  return runAction("course.create", async () => {
    const { admin } = await requireAdmin();
    const parsed = courseCreateSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const course = await catalog.createCourse(parsed.data);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "COURSE_CREATED",
      entityType: "Course",
      entityId: course.id,
      newValue: auditSnapshot(course),
    });
    return ok({ id: course.id });
  });
}

export async function updateCourse(input: unknown): Promise<ApiResult<{ id: string }>> {
  return runAction("course.update", async () => {
    const { admin } = await requireAdmin();
    const parsed = courseUpdateSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { id, ...data } = parsed.data;
    const { before, after } = await catalog.updateCourse(id, data);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "COURSE_UPDATED",
      entityType: "Course",
      entityId: id,
      oldValue: auditSnapshot(before),
      newValue: auditSnapshot(after),
    });
    return ok({ id });
  });
}

export async function setCourseStatus(input: unknown): Promise<ApiResult<{ id: string }>> {
  return runAction("course.status", async () => {
    const { admin } = await requireAdmin();
    const parsed = courseStatusSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { id, status } = parsed.data;
    const { before, after } = await catalog.updateCourse(id, { status });
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: statusAuditAction("COURSE", before.status, status),
      entityType: "Course",
      entityId: id,
      oldValue: auditSnapshot({ status: before.status }),
      newValue: auditSnapshot({ status: after.status }),
    });
    return ok({ id });
  });
}

export async function deleteCourses(input: unknown): Promise<ApiResult<{ deleted: number }>> {
  return runAction("course.bulkDelete", async () => {
    const { admin } = await requireAdmin();
    const parsed = bulkIdsSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    let deleted = 0;
    for (const id of parsed.data.ids) {
      try {
        const { course, moduleCount, itemCount } = await catalog.deleteCourse(id);
        await createAuditLog({
          actorId: admin.id,
          actorEmail: admin.email,
          actorType: "admin",
          action: "COURSE_DELETED",
          entityType: "Course",
          entityId: course.id,
          oldValue: auditSnapshot({ ...course, moduleCount, itemCount }),
        });
        deleted++;
      } catch {
        // skip missing
      }
    }
    return ok({ deleted });
  });
}

export async function deleteCourse(input: unknown): Promise<ApiResult<{ id: string }>> {
  return runAction("course.delete", async () => {
    const { admin } = await requireAdmin();
    const parsed = idInputSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { course, moduleCount, itemCount } = await catalog.deleteCourse(parsed.data.id);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "COURSE_DELETED",
      entityType: "Course",
      entityId: course.id,
      oldValue: auditSnapshot({ ...course, moduleCount, itemCount }),
    });
    return ok({ id: course.id });
  });
}
