import { z } from "zod";

// Input schemas for enrollment actions (M3). Client-safe: no server imports.
// batchCode charset carried from the reference app (bulk tools key on it).

const batchCode = z
  .string()
  .trim()
  .min(1, "Batch code is required")
  .max(64, "Batch code is too long")
  .regex(/^[A-Za-z0-9 _-]+$/, "Batch code can only use letters, numbers, spaces, _ or -");

export const batchCreateSchema = z.object({
  batchCode,
  batchName: z.string().trim().min(1, "Batch name is required").max(200, "Name is too long"),
  description: z.string().trim().max(2000, "Description is too long").optional(),
  // A batch may hold many courses.
  courseIds: z.array(z.string().min(1)).max(50).default([]),
});

export const batchUpdateSchema = z.object({
  id: z.string().min(1),
  batchCode: batchCode.optional(),
  batchName: z
    .string()
    .trim()
    .min(1, "Batch name is required")
    .max(200, "Name is too long")
    .optional(),
  description: z.string().trim().max(2000, "Description is too long").nullable().optional(),
});

export const studentBatchSchema = z.object({
  studentId: z.string().min(1),
  batchId: z.string().min(1),
});

export const studentsBatchSchema = z.object({
  studentIds: z.array(z.string().min(1)).min(1).max(500),
  batchId: z.string().min(1),
});

export const batchCourseSchema = z.object({
  batchId: z.string().min(1),
  courseId: z.string().min(1),
});
