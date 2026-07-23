"use server";

import { z } from "zod";
import type { ApiResult } from "@/lib/api-response";
import { err, ok } from "@/lib/api-response";
import { invalidInput, runAction } from "@/lib/action-runner";
import { auditSnapshot, createAuditLog } from "@/lib/audit";
import { requireSuperAdmin } from "@/lib/authorization";
import * as admins from "@/lib/admins";

// Admin management actions (M6-S9). Superadmin-only. Self-safety: you can rename
// yourself, but not block or demote your own account (locking yourself out) —
// and the last active super admin is protected in the domain layer.

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().email("Enter a valid email"),
  isSuperAdmin: z.boolean().default(false),
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200).optional(),
  status: z.enum(["active", "blocked"]).optional(),
  isSuperAdmin: z.boolean().optional(),
});

const idSchema = z.object({ id: z.string().min(1) });

export async function createAdmin(input: unknown): Promise<ApiResult<{ id: string }>> {
  return runAction("admin.create", async () => {
    const { admin } = await requireSuperAdmin();
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const created = await admins.createAdmin(parsed.data);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "ADMIN_CREATED",
      entityType: "Admin",
      entityId: created.id,
      newValue: auditSnapshot(created),
    });
    return ok({ id: created.id });
  });
}

export async function updateAdmin(input: unknown): Promise<ApiResult<{ id: string }>> {
  return runAction("admin.update", async () => {
    const { admin } = await requireSuperAdmin();
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { id, ...data } = parsed.data;

    // Self-safety: no blocking or demoting your own account.
    if (id === admin.id && (data.status === "blocked" || data.isSuperAdmin === false)) {
      return err("VALIDATION", "You can't block or demote your own account");
    }

    const { before, after } = await admins.updateAdmin(id, data);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "ADMIN_UPDATED",
      entityType: "Admin",
      entityId: id,
      oldValue: auditSnapshot(before),
      newValue: auditSnapshot(after),
    });
    return ok({ id });
  });
}

export async function deleteAdmin(input: unknown): Promise<ApiResult<{ id: string }>> {
  return runAction("admin.delete", async () => {
    const { admin } = await requireSuperAdmin();
    const parsed = idSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    if (parsed.data.id === admin.id) {
      return err("VALIDATION", "You can't delete your own account");
    }
    const deleted = await admins.deleteAdmin(parsed.data.id);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "ADMIN_DELETED",
      entityType: "Admin",
      entityId: deleted.id,
      oldValue: auditSnapshot(deleted),
    });
    return ok({ id: deleted.id });
  });
}
