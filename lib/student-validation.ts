import { z } from "zod";

// Input schemas for student actions (M3-S2). Client-safe: no server imports.

const email = z.string().trim().toLowerCase().email("Enter a valid email").max(255);

const studentCode = z
  .string()
  .trim()
  .min(1, "Student code cannot be empty")
  .max(64, "Student code is too long")
  // Admin-given IDs may contain spaces, e.g. "KLM 2606 1282" (reference rule).
  .regex(/^[A-Za-z0-9 _-]+$/, "Student code can only use letters, numbers, spaces, _ or -");

/** Accepts a Date or a parseable string; also used by exam-grant windows. */
export const dateInput = z
  .union([z.string(), z.date()])
  .transform((v) => (v instanceof Date ? v : new Date(v)))
  .refine((d) => !Number.isNaN(d.getTime()), "Enter a valid date");

export const studentCreateSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200, "Name is too long"),
    email,
    studentCode: studentCode.optional(),
    // Existing batches to add the student to; empty = no course access yet.
    batchIds: z.array(z.string().min(1)).max(100).default([]),
    accessStartDate: dateInput,
    accessEndDate: dateInput,
  })
  .refine((s) => s.accessEndDate >= s.accessStartDate, {
    path: ["accessEndDate"],
    message: "Access end date must be on or after the start date",
  });

// The merged-window rule (new end vs existing start etc.) is enforced in
// lib/students.ts where the current row is known — the schema only checks
// the pair when both arrive together.
export const studentUpdateSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1, "Name is required").max(200, "Name is too long").optional(),
    email: email.optional(),
    studentCode: studentCode.nullable().optional(),
    status: z.enum(["active", "blocked"]).optional(),
    accessStartDate: dateInput.optional(),
    accessEndDate: dateInput.optional(),
  })
  .refine((s) => !(s.accessStartDate && s.accessEndDate) || s.accessEndDate >= s.accessStartDate, {
    path: ["accessEndDate"],
    message: "Access end date must be on or after the start date",
  });
