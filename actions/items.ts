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
  reorderItemsSchema,
  videoItemCreateSchema,
  videoItemUpdateSchema,
} from "@/lib/catalog-validation";
import { parseDriveFileId } from "@/lib/drive-urls";

// Content-item actions (M2-S3: video items; M2-S4 adds materials). Same
// pattern as actions/courses.ts. driveFileId lives in admin payloads only —
// student-facing reads (M4) go through access helpers that gate it.

export async function createVideoItem(input: unknown): Promise<ApiResult<{ id: string }>> {
  return runAction("item.video.create", async () => {
    const { admin } = await requireAdmin();
    const parsed = videoItemCreateSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const driveFileId = parseDriveFileId(parsed.data.driveUrl);
    if (!driveFileId) return err("VALIDATION", DRIVE_URL_MESSAGE, { driveUrl: DRIVE_URL_MESSAGE });

    const parent = parsed.data.moduleId
      ? { moduleId: parsed.data.moduleId }
      : { courseId: parsed.data.courseId! };
    const { item } = await catalog.createVideoItem({
      parent,
      title: parsed.data.title,
      description: parsed.data.description,
      driveFileId,
    });
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

export async function updateVideoItem(input: unknown): Promise<ApiResult<{ id: string }>> {
  return runAction("item.video.update", async () => {
    const { admin } = await requireAdmin();
    const parsed = videoItemUpdateSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { id, driveUrl, ...rest } = parsed.data;

    let driveFileId: string | undefined;
    if (driveUrl !== undefined) {
      const parsedId = parseDriveFileId(driveUrl);
      if (!parsedId) return err("VALIDATION", DRIVE_URL_MESSAGE, { driveUrl: DRIVE_URL_MESSAGE });
      driveFileId = parsedId;
    }

    const { before, after } = await catalog.updateVideoItem(id, { ...rest, driveFileId });
    const action = statusAuditAction("ITEM", before.status, rest.status);
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

export async function deleteItem(input: unknown): Promise<ApiResult<{ id: string }>> {
  return runAction("item.delete", async () => {
    const { admin } = await requireAdmin();
    const parsed = idInputSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { item, attachmentCount } = await catalog.deleteItem(parsed.data.id);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "ITEM_DELETED",
      entityType: "ContentItem",
      entityId: item.id,
      oldValue: auditSnapshot({ ...item, attachmentCount }),
    });
    return ok({ id: item.id });
  });
}

export async function reorderItems(input: unknown): Promise<ApiResult<{ reordered: number }>> {
  return runAction("item.reorder", async () => {
    const { admin } = await requireAdmin();
    const parsed = reorderItemsSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const parent = parsed.data.moduleId
      ? { moduleId: parsed.data.moduleId }
      : { courseId: parsed.data.courseId! };
    await catalog.reorderItems(parent, parsed.data.itemIds);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "ITEMS_REORDERED",
      entityType: parsed.data.moduleId ? "Module" : "Course",
      entityId: parsed.data.moduleId ?? parsed.data.courseId!,
      newValue: auditSnapshot({ itemIds: parsed.data.itemIds }),
    });
    return ok({ reordered: parsed.data.itemIds.length });
  });
}

export async function refreshItemDuration(input: unknown): Promise<ApiResult<{ id: string }>> {
  return runAction("item.duration.refresh", async () => {
    const { admin } = await requireAdmin();
    const parsed = idInputSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    await catalog.refreshItemDuration(parsed.data.id);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "ITEM_DURATION_REFRESH_REQUESTED",
      entityType: "ContentItem",
      entityId: parsed.data.id,
    });
    return ok({ id: parsed.data.id });
  });
}
