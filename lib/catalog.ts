import "server-only";
import type { ContentItem, Course, Module } from "@/lib/generated/prisma/client";
import { Prisma } from "@/lib/generated/prisma/client";
import { db } from "@/lib/db";
import { DRIVE_FETCH_DURATION } from "@/lib/drive-jobs";
import { DomainError, isUniqueViolation } from "@/lib/errors";
import { enqueueJob } from "@/lib/jobs";
import { deleteMaterialObjects } from "@/lib/storage";

// Catalog domain mutations (M2-S2). Structural invariants (one parent, type
// fields, attachment rules) are DB-enforced by the M2-S1 migration — this
// layer adds the business rules on top and translates constraint violations
// into actionable envelope errors.

export type CourseCreateData = {
  name: string;
  description?: string;
  imageUrl?: string;
  layout: "module" | "flat";
};

export async function createCourse(data: CourseCreateData): Promise<Course> {
  try {
    return await db.course.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        imageUrl: data.imageUrl ?? null,
        layout: data.layout,
      },
    });
  } catch (cause) {
    if (isUniqueViolation(cause)) {
      throw new DomainError("CONFLICT", "A course with this name already exists", {
        name: "Already in use",
      });
    }
    throw cause;
  }
}

export type CourseUpdateData = {
  name?: string;
  description?: string | null;
  imageUrl?: string | null;
  layout?: "module" | "flat";
  status?: "active" | "inactive";
};

export async function updateCourse(
  id: string,
  data: CourseUpdateData,
): Promise<{ before: Course; after: Course }> {
  const before = await db.course.findUnique({
    where: { id },
    include: { _count: { select: { modules: true, items: true } } },
  });
  if (!before) throw new DomainError("NOT_FOUND", "Course not found");

  // Switching layout would orphan existing content (module items become
  // unreachable in flat view and vice versa) — reference-app rule.
  if (data.layout && data.layout !== before.layout) {
    if (before._count.modules > 0 || before._count.items > 0) {
      throw new DomainError(
        "CONFLICT",
        "Cannot change layout while the course has modules or content — remove them first",
      );
    }
  }

  try {
    const after = await db.course.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
        ...(data.layout !== undefined && { layout: data.layout }),
        ...(data.status !== undefined && { status: data.status }),
      },
    });
    return { before, after };
  } catch (cause) {
    if (isUniqueViolation(cause)) {
      throw new DomainError("CONFLICT", "A course with this name already exists", {
        name: "Already in use",
      });
    }
    throw cause;
  }
}

export async function deleteCourse(
  id: string,
): Promise<{ course: Course; moduleCount: number; itemCount: number }> {
  const course = await db.course.findUnique({
    where: { id },
    include: { _count: { select: { modules: true } } },
  });
  if (!course) throw new DomainError("NOT_FOUND", "Course not found");
  // Everything the cascade will remove: flat items, module items, and the
  // attachments hanging off either — recorded in the audit row since the rows
  // themselves are about to disappear.
  const inCourse = [{ courseId: id }, { module: { courseId: id } }];
  const cascadeScope = { OR: [...inCourse, { parentItem: { OR: inCourse } }] };
  const itemCount = await db.contentItem.count({ where: cascadeScope });
  const uploadPaths = await collectUploadPaths(cascadeScope);
  // Hard delete; FK cascades remove modules and items (docs/DECISIONS.md).
  await db.course.delete({ where: { id } });
  await deleteMaterialObjects(uploadPaths);
  const { _count, ...row } = course;
  return { course: row as Course, moduleCount: _count.modules, itemCount };
}

/** Storage keys of uploaded materials inside a scope, for post-delete cleanup. */
async function collectUploadPaths(where: Prisma.ContentItemWhereInput): Promise<string[]> {
  const rows = await db.contentItem.findMany({
    where: { AND: [where, { sourceType: "upload", storagePath: { not: null } }] },
    select: { storagePath: true },
  });
  return rows.map((r) => r.storagePath).filter((p): p is string => p !== null);
}

export type ModuleCreateData = { courseId: string; title: string; description?: string };

export async function createModule(data: ModuleCreateData): Promise<Module> {
  const course = await db.course.findUnique({ where: { id: data.courseId } });
  if (!course) throw new DomainError("NOT_FOUND", "Course not found");
  if (course.layout !== "module") {
    throw new DomainError("CONFLICT", "This course uses the flat layout and has no modules");
  }
  // Append at the end. Two simultaneous creates can tie on moduleOrder; the
  // ordered read breaks ties by id, and any reorder renumbers cleanly.
  const max = await db.module.aggregate({
    where: { courseId: data.courseId },
    _max: { moduleOrder: true },
  });
  return db.module.create({
    data: {
      courseId: data.courseId,
      title: data.title,
      description: data.description ?? null,
      moduleOrder: (max._max.moduleOrder ?? -1) + 1,
    },
  });
}

export type ModuleUpdateData = { title?: string; description?: string | null };

export async function updateModule(
  id: string,
  data: ModuleUpdateData,
): Promise<{ before: Module; after: Module }> {
  const before = await db.module.findUnique({ where: { id } });
  if (!before) throw new DomainError("NOT_FOUND", "Module not found");
  const after = await db.module.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
    },
  });
  return { before, after };
}

export async function deleteModule(id: string): Promise<{ module: Module; itemCount: number }> {
  const found = await db.module.findUnique({ where: { id } });
  if (!found) throw new DomainError("NOT_FOUND", "Module not found");
  // Direct items plus their attachments — everything the cascade removes.
  const cascadeScope = { OR: [{ moduleId: id }, { parentItem: { moduleId: id } }] };
  const itemCount = await db.contentItem.count({ where: cascadeScope });
  const uploadPaths = await collectUploadPaths(cascadeScope);
  await db.module.delete({ where: { id } });
  await deleteMaterialObjects(uploadPaths);
  return { module: found, itemCount };
}

/**
 * The reorder contract shared by modules and items: the proposed list must be
 * a complete permutation of what exists — a stale board (row added/removed
 * elsewhere) is rejected rather than silently renumbered.
 */
function assertCompletePermutation(
  existingIds: string[],
  proposedIds: string[],
  subject: string,
): void {
  const current = new Set(existingIds);
  const proposed = new Set(proposedIds);
  const sameSet =
    current.size === proposed.size &&
    proposedIds.length === existingIds.length &&
    [...current].every((id) => proposed.has(id));
  if (!sameSet) {
    throw new DomainError(
      "VALIDATION",
      `The order list no longer matches ${subject} — reload and try again`,
    );
  }
}

export async function reorderModules(courseId: string, moduleIds: string[]): Promise<void> {
  const existing = await db.module.findMany({ where: { courseId }, select: { id: true } });
  if (existing.length === 0) throw new DomainError("NOT_FOUND", "Course has no modules");
  assertCompletePermutation(
    existing.map((m) => m.id),
    moduleIds,
    "the course's modules",
  );
  await db.$transaction(
    moduleIds.map((id, index) => db.module.update({ where: { id }, data: { moduleOrder: index } })),
  );
}

// ---------- Content items (M2-S3: video; M2-S4 adds material) ----------

/** A content item's direct container: a module, or the course itself (flat). */
export type ItemParent = { moduleId: string } | { courseId: string };

/**
 * Validates the parent exists and its course layout matches how it's being
 * addressed (reference-app rule): moduleId only inside module-layout courses,
 * courseId only for flat-layout courses.
 */
async function resolveItemParent(parent: ItemParent): Promise<void> {
  if ("moduleId" in parent) {
    const mod = await db.module.findUnique({
      where: { id: parent.moduleId },
      select: { course: { select: { layout: true } } },
    });
    if (!mod) throw new DomainError("NOT_FOUND", "Module not found");
    if (mod.course.layout !== "module") {
      throw new DomainError(
        "CONFLICT",
        "This module belongs to a flat-layout course — add items to the course directly",
      );
    }
  } else {
    const course = await db.course.findUnique({
      where: { id: parent.courseId },
      select: { layout: true },
    });
    if (!course) throw new DomainError("NOT_FOUND", "Course not found");
    if (course.layout !== "flat") {
      throw new DomainError(
        "CONFLICT",
        "This course uses modules — add items to one of its modules",
      );
    }
  }
}

export type VideoItemCreateData = {
  parent: ItemParent;
  title: string;
  description?: string;
  driveFileId: string;
};

/**
 * Creates a video item and enqueues its duration fetch in the same
 * transaction (outbox rule) — the request never waits on the Drive API.
 */
export async function createVideoItem(
  data: VideoItemCreateData,
): Promise<{ item: ContentItem; jobId: string }> {
  await resolveItemParent(data.parent);
  const max = await db.contentItem.aggregate({
    where: data.parent,
    _max: { itemOrder: true },
  });
  return db.$transaction(async (tx) => {
    const item = await tx.contentItem.create({
      data: {
        type: "video",
        ...data.parent,
        title: data.title,
        description: data.description ?? null,
        driveFileId: data.driveFileId,
        itemOrder: (max._max.itemOrder ?? -1) + 1,
      },
    });
    const jobId = await enqueueJob(tx, DRIVE_FETCH_DURATION, {
      itemId: item.id,
      driveFileId: data.driveFileId,
    });
    return { item, jobId };
  });
}

export type VideoItemUpdateData = {
  title?: string;
  description?: string | null;
  status?: "active" | "inactive";
  driveFileId?: string;
};

export async function updateVideoItem(
  id: string,
  data: VideoItemUpdateData,
): Promise<{ before: ContentItem; after: ContentItem; durationJobId: string | null }> {
  const before = await db.contentItem.findUnique({ where: { id } });
  if (!before || before.type !== "video") {
    throw new DomainError("NOT_FOUND", "Video item not found");
  }
  const filePointerChanged =
    data.driveFileId !== undefined && data.driveFileId !== before.driveFileId;
  return db.$transaction(async (tx) => {
    const after = await tx.contentItem.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.status !== undefined && { status: data.status }),
        // A repointed file's old duration is meaningless — clear until fetched.
        ...(filePointerChanged && {
          driveFileId: data.driveFileId,
          duration: null,
          durationFetchedAt: null,
        }),
      },
    });
    const durationJobId = filePointerChanged
      ? await enqueueJob(tx, DRIVE_FETCH_DURATION, {
          itemId: id,
          driveFileId: data.driveFileId,
        })
      : null;
    return { before, after, durationJobId };
  });
}

export async function deleteItem(
  id: string,
): Promise<{ item: ContentItem; attachmentCount: number }> {
  const item = await db.contentItem.findUnique({
    where: { id },
    include: { _count: { select: { attachments: true } } },
  });
  if (!item) throw new DomainError("NOT_FOUND", "Content item not found");
  // The item's own upload plus any uploaded attachments the cascade removes.
  const uploadPaths = await collectUploadPaths({ OR: [{ id }, { parentItemId: id }] });
  await db.contentItem.delete({ where: { id } });
  await deleteMaterialObjects(uploadPaths);
  const { _count, ...row } = item;
  return { item: row as ContentItem, attachmentCount: _count.attachments };
}

/**
 * Applies a complete new order for a parent's items — mixed video/material
 * in one sequence (FR-2.3). Same permutation contract as reorderModules.
 */
export async function reorderItems(parent: ItemParent, itemIds: string[]): Promise<void> {
  const existing = await db.contentItem.findMany({ where: parent, select: { id: true } });
  if (existing.length === 0) throw new DomainError("NOT_FOUND", "No items under this parent");
  assertCompletePermutation(
    existing.map((i) => i.id),
    itemIds,
    "this parent's items",
  );
  await db.$transaction(
    itemIds.map((id, index) =>
      db.contentItem.update({ where: { id }, data: { itemOrder: index } }),
    ),
  );
}

/** Where a material can live: a module, a flat course, or under a video. */
export type MaterialParent = ItemParent | { parentItemId: string };

export type MaterialSource =
  | { sourceType: "upload"; storagePath: string; mimeType: string; originalFileName: string }
  | { sourceType: "drive"; driveFileId: string }
  | { sourceType: "url"; externalUrl: string };

export type MaterialItemCreateData = {
  parent: MaterialParent;
  title: string;
  description?: string;
  downloadEnabled: boolean;
  source: MaterialSource;
};

export async function createMaterialItem(data: MaterialItemCreateData): Promise<ContentItem> {
  if ("parentItemId" in data.parent) {
    // Friendly pre-check; the DB trigger is the backstop (M2-S1).
    const parentItem = await db.contentItem.findUnique({
      where: { id: data.parent.parentItemId },
      select: { type: true, parentItemId: true },
    });
    if (!parentItem) throw new DomainError("NOT_FOUND", "Parent video not found");
    if (parentItem.type !== "video" || parentItem.parentItemId !== null) {
      throw new DomainError("CONFLICT", "Attachments can only be added to video items");
    }
  } else {
    await resolveItemParent(data.parent);
  }

  const max = await db.contentItem.aggregate({ where: data.parent, _max: { itemOrder: true } });
  const source = data.source;
  return db.contentItem.create({
    data: {
      type: "material",
      ...data.parent,
      title: data.title,
      description: data.description ?? null,
      downloadEnabled: data.downloadEnabled,
      itemOrder: (max._max.itemOrder ?? -1) + 1,
      sourceType: source.sourceType,
      ...(source.sourceType === "upload" && {
        storagePath: source.storagePath,
        mimeType: source.mimeType,
        originalFileName: source.originalFileName,
      }),
      ...(source.sourceType === "drive" && { driveFileId: source.driveFileId }),
      ...(source.sourceType === "url" && { externalUrl: source.externalUrl }),
    },
  });
}

export type MaterialItemUpdateData = {
  title?: string;
  description?: string | null;
  status?: "active" | "inactive";
  downloadEnabled?: boolean;
};

export async function getMaterialItem(id: string): Promise<ContentItem> {
  const item = await db.contentItem.findUnique({ where: { id } });
  if (!item || item.type !== "material") {
    throw new DomainError("NOT_FOUND", "Material item not found");
  }
  return item;
}

/** Source fields are immutable in V1 (docs/DECISIONS.md) — delete + recreate. */
export async function updateMaterialItem(
  id: string,
  data: MaterialItemUpdateData,
): Promise<{ before: ContentItem; after: ContentItem }> {
  const before = await db.contentItem.findUnique({ where: { id } });
  if (!before || before.type !== "material") {
    throw new DomainError("NOT_FOUND", "Material item not found");
  }
  const after = await db.contentItem.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.downloadEnabled !== undefined && { downloadEnabled: data.downloadEnabled }),
    },
  });
  return { before, after };
}

/** Re-enqueues the duration fetch for a video item (admin "refresh" button). */
export async function refreshItemDuration(id: string): Promise<{ jobId: string }> {
  const item = await db.contentItem.findUnique({ where: { id } });
  if (!item || item.type !== "video" || !item.driveFileId) {
    throw new DomainError("NOT_FOUND", "Video item not found");
  }
  const jobId = await enqueueJob(db, DRIVE_FETCH_DURATION, {
    itemId: id,
    driveFileId: item.driveFileId,
  });
  return { jobId };
}
