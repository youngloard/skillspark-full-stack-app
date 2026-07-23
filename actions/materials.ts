"use server";

import type { ApiResult } from "@/lib/api-response";
import { err, ok } from "@/lib/api-response";
import { invalidInput, runAction } from "@/lib/action-runner";
import { auditSnapshot, createAuditLog, statusAuditAction } from "@/lib/audit";
import { requireAdmin } from "@/lib/authorization";
import * as catalog from "@/lib/catalog";
import {
  DRIVE_URL_MESSAGE,
  idInputSchema,
  materialItemCreateSchema,
  materialItemUpdateSchema,
} from "@/lib/catalog-validation";
import { buildDriveViewUrl, parseDriveFileId } from "@/lib/drive-urls";
import {
  createSignedMaterialUrl,
  deleteMaterialObjects,
  SIGNED_URL_TTL_SECONDS,
  uploadMaterial,
} from "@/lib/storage";

// Material item actions (M2-S4). Create takes FormData because the upload
// source carries a File (reference notes.ts pattern); the other sources ride
// the same form. Source is immutable after create (DECISIONS) — delete and
// recreate to change it.

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value !== "" ? value : undefined;
}

export async function createMaterialItem(formData: FormData): Promise<ApiResult<{ id: string }>> {
  return runAction("item.material.create", async () => {
    const { admin } = await requireAdmin();
    const parsed = materialItemCreateSchema.safeParse({
      moduleId: formValue(formData, "moduleId"),
      courseId: formValue(formData, "courseId"),
      parentItemId: formValue(formData, "parentItemId"),
      title: formValue(formData, "title") ?? "",
      description: formValue(formData, "description"),
      downloadEnabled: formData.get("downloadEnabled") === "on",
      sourceType: formValue(formData, "sourceType"),
      driveUrl: formValue(formData, "driveUrl"),
      externalUrl: formValue(formData, "externalUrl"),
    });
    if (!parsed.success) return invalidInput(parsed.error);
    const input = parsed.data;

    let source: catalog.MaterialSource;
    if (input.sourceType === "upload") {
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return err("VALIDATION", "Attach a file to upload", { file: "Choose a file" });
      }
      source = { sourceType: "upload", ...(await uploadMaterial(file)) };
    } else if (input.sourceType === "drive") {
      const driveFileId = parseDriveFileId(input.driveUrl);
      if (!driveFileId) {
        return err("VALIDATION", DRIVE_URL_MESSAGE, { driveUrl: DRIVE_URL_MESSAGE });
      }
      source = { sourceType: "drive", driveFileId };
    } else {
      source = { sourceType: "url", externalUrl: input.externalUrl! };
    }

    const parent: catalog.MaterialParent = input.moduleId
      ? { moduleId: input.moduleId }
      : input.courseId
        ? { courseId: input.courseId }
        : { parentItemId: input.parentItemId! };

    let item;
    try {
      item = await catalog.createMaterialItem({
        parent,
        title: input.title,
        description: input.description,
        downloadEnabled: input.downloadEnabled,
        source,
      });
    } catch (cause) {
      // The object was uploaded before the row failed — don't leak it.
      if (source.sourceType === "upload") await deleteMaterialObjects([source.storagePath]);
      throw cause;
    }

    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "ITEM_CREATED",
      entityType: "ContentItem",
      entityId: item.id,
      newValue: auditSnapshot(item),
    });
    return ok({ id: item.id });
  });
}

export async function updateMaterialItem(input: unknown): Promise<ApiResult<{ id: string }>> {
  return runAction("item.material.update", async () => {
    const { admin } = await requireAdmin();
    const parsed = materialItemUpdateSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { id, ...data } = parsed.data;
    const { before, after } = await catalog.updateMaterialItem(id, data);
    const action = statusAuditAction("ITEM", before.status, data.status);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action,
      entityType: "ContentItem",
      entityId: id,
      oldValue: auditSnapshot(before),
      newValue: auditSnapshot(after),
    });
    return ok({ id });
  });
}

/**
 * Resolves the URL an admin uses to open a material: short-lived signed URL
 * for uploads, derived view URL for Drive, the stored URL otherwise. Reads
 * aren't audited. The student-facing variant arrives with M4 and gates on
 * canAccessItem before minting anything.
 */
export async function getMaterialUrl(
  input: unknown,
): Promise<ApiResult<{ url: string; expiresInSeconds: number | null }>> {
  return runAction<{ url: string; expiresInSeconds: number | null }>(
    "item.material.url",
    async () => {
      await requireAdmin();
      const parsed = idInputSchema.safeParse(input);
      if (!parsed.success) return invalidInput(parsed.error);
      const item = await catalog.getMaterialItem(parsed.data.id);
      if (item.sourceType === "upload" && item.storagePath) {
        const url = await createSignedMaterialUrl(item.storagePath);
        return ok({ url, expiresInSeconds: SIGNED_URL_TTL_SECONDS });
      }
      if (item.sourceType === "drive" && item.driveFileId) {
        return ok({ url: buildDriveViewUrl(item.driveFileId), expiresInSeconds: null });
      }
      if (item.sourceType === "url" && item.externalUrl) {
        return ok({ url: item.externalUrl, expiresInSeconds: null });
      }
      return err("INTERNAL", "This material has no resolvable source");
    },
  );
}
