"use server";

import type { ApiResult } from "@/lib/api-response";
import { ok } from "@/lib/api-response";
import { invalidInput, runAction } from "@/lib/action-runner";
import { auditSnapshot, createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/authorization";
import * as catalog from "@/lib/catalog";
import {
  idInputSchema,
  moduleCreateSchema,
  moduleUpdateSchema,
  reorderModulesSchema,
} from "@/lib/catalog-validation";

// Module actions (M2-S2) — same pattern as actions/courses.ts.

export async function createModule(input: unknown): Promise<ApiResult<{ id: string }>> {
  return runAction("module.create", async () => {
    const { admin } = await requireAdmin();
    const parsed = moduleCreateSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const created = await catalog.createModule(parsed.data);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "MODULE_CREATED",
      entityType: "Module",
      entityId: created.id,
      newValue: auditSnapshot(created),
    });
    return ok({ id: created.id });
  });
}

export async function updateModule(input: unknown): Promise<ApiResult<{ id: string }>> {
  return runAction("module.update", async () => {
    const { admin } = await requireAdmin();
    const parsed = moduleUpdateSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { id, ...data } = parsed.data;
    const { before, after } = await catalog.updateModule(id, data);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "MODULE_UPDATED",
      entityType: "Module",
      entityId: id,
      oldValue: auditSnapshot(before),
      newValue: auditSnapshot(after),
    });
    return ok({ id });
  });
}

export async function deleteModule(input: unknown): Promise<ApiResult<{ id: string }>> {
  return runAction("module.delete", async () => {
    const { admin } = await requireAdmin();
    const parsed = idInputSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { module: row, itemCount } = await catalog.deleteModule(parsed.data.id);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "MODULE_DELETED",
      entityType: "Module",
      entityId: row.id,
      oldValue: auditSnapshot({ ...row, itemCount }),
    });
    return ok({ id: row.id });
  });
}

export async function reorderModules(input: unknown): Promise<ApiResult<{ courseId: string }>> {
  return runAction("module.reorder", async () => {
    const { admin } = await requireAdmin();
    const parsed = reorderModulesSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { courseId, moduleIds } = parsed.data;
    await catalog.reorderModules(courseId, moduleIds);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "MODULES_REORDERED",
      entityType: "Course",
      entityId: courseId,
      newValue: auditSnapshot({ moduleIds }),
    });
    return ok({ courseId });
  });
}
