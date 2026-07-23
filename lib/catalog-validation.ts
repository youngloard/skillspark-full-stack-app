import { z } from "zod";

// Input schemas for catalog actions (M2). Client-safe: no server imports.

export const courseCreateSchema = z.object({
  name: z.string().trim().min(1, "Course name is required").max(200, "Name is too long"),
  description: z.string().trim().max(2000, "Description is too long").optional(),
  imageUrl: z.url("Enter a valid image URL").optional(),
  layout: z.enum(["module", "flat"]).default("module"),
});

export const courseUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "Course name is required").max(200, "Name is too long").optional(),
  description: z.string().trim().max(2000, "Description is too long").nullable().optional(),
  imageUrl: z.url("Enter a valid image URL").nullable().optional(),
  layout: z.enum(["module", "flat"]).optional(),
});

export const courseStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["active", "inactive"]),
});

export const idInputSchema = z.object({ id: z.string().min(1) });

export const moduleCreateSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().trim().min(1, "Module title is required").max(200, "Title is too long"),
  description: z.string().trim().max(2000, "Description is too long").optional(),
});

export const moduleUpdateSchema = z.object({
  id: z.string().min(1),
  title: z
    .string()
    .trim()
    .min(1, "Module title is required")
    .max(200, "Title is too long")
    .optional(),
  description: z.string().trim().max(2000, "Description is too long").nullable().optional(),
});

export const reorderModulesSchema = z.object({
  courseId: z.string().min(1),
  // The complete new order — a permutation of the course's module ids,
  // verified against the database in lib/catalog.ts.
  moduleIds: z.array(z.string().min(1)).min(1).max(500),
});

// --- Content items (M2-S3) ---

const DRIVE_URL_MESSAGE =
  "Paste a Google Drive link (any format) or the bare file ID — e.g. drive.google.com/file/d/…";

/** Exactly one container: moduleId (module layout) or courseId (flat). */
const itemParentFields = {
  moduleId: z.string().min(1).optional(),
  courseId: z.string().min(1).optional(),
};

const exactlyOneParent = (value: { moduleId?: string; courseId?: string }) =>
  (value.moduleId === undefined) !== (value.courseId === undefined);

export const videoItemCreateSchema = z
  .object({
    ...itemParentFields,
    title: z.string().trim().min(1, "Title is required").max(200, "Title is too long"),
    description: z.string().trim().max(2000, "Description is too long").optional(),
    // Any Drive URL shape or bare ID; parsed to the canonical ID in the action.
    driveUrl: z.string().trim().min(1, DRIVE_URL_MESSAGE),
  })
  .refine(exactlyOneParent, {
    message: "Provide exactly one of moduleId or courseId",
    path: ["moduleId"],
  });

export const videoItemUpdateSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1, "Title is required").max(200, "Title is too long").optional(),
  description: z.string().trim().max(2000, "Description is too long").nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  driveUrl: z.string().trim().min(1, DRIVE_URL_MESSAGE).optional(),
});

export const reorderItemsSchema = z
  .object({
    ...itemParentFields,
    itemIds: z.array(z.string().min(1)).min(1).max(1000),
  })
  .refine(exactlyOneParent, {
    message: "Provide exactly one of moduleId or courseId",
    path: ["moduleId"],
  });

// --- Material items (M2-S4) ---

/** Exactly one container: module, flat course, or parent video (attachment). */
const materialParentFields = {
  moduleId: z.string().min(1).optional(),
  courseId: z.string().min(1).optional(),
  parentItemId: z.string().min(1).optional(),
};

const exactlyOneMaterialParent = (value: {
  moduleId?: string;
  courseId?: string;
  parentItemId?: string;
}) =>
  [value.moduleId, value.courseId, value.parentItemId].filter((v) => v !== undefined).length === 1;

export const materialItemCreateSchema = z
  .object({
    ...materialParentFields,
    title: z.string().trim().min(1, "Title is required").max(200, "Title is too long"),
    description: z.string().trim().max(2000, "Description is too long").optional(),
    downloadEnabled: z.boolean().default(false),
    sourceType: z.enum(["upload", "drive", "url"], {
      error: "Pick a source: upload, drive, or url",
    }),
    driveUrl: z.string().trim().min(1, DRIVE_URL_MESSAGE).optional(),
    externalUrl: z.url("Enter a valid URL (https://…)").optional(),
  })
  .refine(exactlyOneMaterialParent, {
    message: "Provide exactly one of moduleId, courseId, or parentItemId",
    path: ["moduleId"],
  })
  .refine((v) => v.sourceType !== "drive" || v.driveUrl !== undefined, {
    message: DRIVE_URL_MESSAGE,
    path: ["driveUrl"],
  })
  .refine((v) => v.sourceType !== "url" || v.externalUrl !== undefined, {
    message: "Enter the external URL",
    path: ["externalUrl"],
  });

export const materialItemUpdateSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1, "Title is required").max(200, "Title is too long").optional(),
  description: z.string().trim().max(2000, "Description is too long").nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  downloadEnabled: z.boolean().optional(),
});

export { DRIVE_URL_MESSAGE };
