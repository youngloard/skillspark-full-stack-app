"use server";

import { z } from "zod";
import type { ApiResult } from "@/lib/api-response";
import { ok } from "@/lib/api-response";
import { invalidInput, runAction } from "@/lib/action-runner";
import { createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/authorization";
import { importStudentRows, type ImportOutcome } from "@/lib/student-import-run";

// Bulk student import (M6). The client parses the CSV, previews it, then streams
// rows here in chunks so the UI can show live progress. Each chunk is imported
// server-side (student upsert + find/create batch & course, one course per
// batch) and returns per-row outcomes. One audit entry per chunk keeps the log
// readable — the per-row detail lives in the returned outcomes.

const rowSchema = z.object({
  email: z.string(),
  code: z.string(),
  name: z.string(),
  batchName: z.string().nullable(),
  courseNames: z.array(z.string()).max(20).default([]),
  error: z.string().nullable(),
});

const chunkSchema = z.object({
  rows: z.array(rowSchema).min(1).max(100),
  fallbackBatchId: z.string().trim().min(1).optional(),
  fallbackCourseIds: z.array(z.string().trim().min(1)).max(50).default([]),
});

export async function importStudentChunk(
  input: unknown,
): Promise<ApiResult<{ outcomes: ImportOutcome[] }>> {
  return runAction("student.import", async () => {
    const { admin } = await requireAdmin();
    const parsed = chunkSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);

    const outcomes = await importStudentRows(parsed.data.rows, {
      batchId: parsed.data.fallbackBatchId,
      courseIds: parsed.data.fallbackCourseIds,
    });

    const created = outcomes.filter((o) => o.status === "created").length;
    const existing = outcomes.filter((o) => o.status === "exists").length;
    const failed = outcomes.filter((o) => o.status === "error").length;
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "STUDENTS_IMPORTED",
      entityType: "Student",
      entityId: "bulk",
      newValue: {
        created,
        existing,
        failed,
        usedFallbackBatch: Boolean(parsed.data.fallbackBatchId),
        usedFallbackCourses: parsed.data.fallbackCourseIds.length,
      },
    });

    return ok({ outcomes });
  });
}
