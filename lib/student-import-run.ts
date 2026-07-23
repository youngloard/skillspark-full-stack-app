import "server-only";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { normalizeEmail } from "@/lib/identity";
import * as students from "@/lib/students";
import {
  findOrCreateBatchByName,
  findOrCreateCourseByName,
  linkBatchToCourse,
} from "@/lib/admin-provisioning";
import type { ParsedRow } from "@/lib/student-import";

// Bulk student import runner (M6). One row → find/create the student (by email),
// optionally find/create the batch (col 3) and its course(s) (col 4, which may
// list several) and link them. Returns a per-row outcome for the progress UI.

export type ImportOutcome = {
  email: string;
  status: "created" | "exists" | "error";
  message?: string;
};

export type StudentImportFallbacks = {
  batchId?: string;
  /** Applied to rows that name no course of their own. */
  courseIds?: string[];
};

const YEAR_MS = 365 * 86_400_000;

/** Idempotent batch membership — re-importing an already-enrolled student is fine. */
async function ensureStudentInBatch(studentId: string, batchId: string): Promise<void> {
  await db.studentBatch.upsert({
    where: { studentId_batchId: { studentId, batchId } },
    update: {},
    create: { studentId, batchId },
  });
}

export async function importStudentRows(
  rows: ParsedRow[],
  fallbacks: StudentImportFallbacks = {},
): Promise<ImportOutcome[]> {
  const fallbackCourseIds = fallbacks.courseIds ?? [];
  const [fallbackBatch, fallbackCourses] = await Promise.all([
    fallbacks.batchId
      ? db.batch.findUnique({ where: { id: fallbacks.batchId }, select: { id: true } })
      : null,
    fallbackCourseIds.length
      ? db.course.findMany({ where: { id: { in: fallbackCourseIds } }, select: { id: true } })
      : [],
  ]);

  if (fallbacks.batchId && !fallbackBatch) {
    throw new DomainError("NOT_FOUND", "The selected fallback batch no longer exists.");
  }
  if (fallbackCourseIds.length !== fallbackCourses.length) {
    throw new DomainError("NOT_FOUND", "A selected fallback course no longer exists.");
  }

  const batchIdsByName = new Map<string, string>();
  const courseIdsByName = new Map<string, string>();
  // batchId → the course ids already linked this run, so a repeated pairing
  // costs nothing.
  const linkedCoursesByBatch = new Map<string, Set<string>>();

  const resolveBatch = async (name: string): Promise<string> => {
    const key = name.trim().toLocaleLowerCase("en-US");
    const cached = batchIdsByName.get(key);
    if (cached) return cached;
    const batch = await findOrCreateBatchByName(name);
    batchIdsByName.set(key, batch.id);
    return batch.id;
  };

  const resolveCourse = async (name: string): Promise<string> => {
    const key = name.trim().toLocaleLowerCase("en-US");
    const cached = courseIdsByName.get(key);
    if (cached) return cached;
    const course = await findOrCreateCourseByName(name);
    courseIdsByName.set(key, course.id);
    return course.id;
  };

  const ensureCoursesForBatch = async (batchId: string, courseIds: string[]): Promise<void> => {
    let linked = linkedCoursesByBatch.get(batchId);
    if (!linked) {
      linked = new Set<string>();
      linkedCoursesByBatch.set(batchId, linked);
    }
    for (const courseId of courseIds) {
      if (linked.has(courseId)) continue;
      await linkBatchToCourse(batchId, courseId);
      linked.add(courseId);
    }
  };

  const results: ImportOutcome[] = [];
  for (const row of rows) {
    if (row.error) {
      results.push({ email: row.email, status: "error", message: row.error });
      continue;
    }
    try {
      const email = normalizeEmail(row.email);

      const batchId = row.batchName
        ? await resolveBatch(row.batchName)
        : (fallbackBatch?.id ?? null);
      // A batch may hold several courses, so the row's list (or the fallback
      // list) is linked in full.
      let courseIds: string[] = [];
      if (batchId) {
        courseIds = row.courseNames.length
          ? await Promise.all(row.courseNames.map(resolveCourse))
          : fallbackCourses.map((c) => c.id);
        if (courseIds.length) await ensureCoursesForBatch(batchId, courseIds);
      }

      const existing = await db.student.findUnique({ where: { email }, select: { id: true } });
      if (existing) {
        if (batchId) await ensureStudentInBatch(existing.id, batchId);
        results.push({ email, status: "exists" });
        continue;
      }

      const now = Date.now();
      await students.createStudent({
        name: row.name,
        email,
        studentCode: row.code || undefined,
        batchIds: batchId ? [batchId] : [],
        accessStartDate: new Date(now),
        accessEndDate: new Date(now + YEAR_MS),
      });
      results.push({ email, status: "created" });
    } catch (cause) {
      const message = cause instanceof DomainError ? cause.message : "Import failed for this row";
      results.push({ email: row.email, status: "error", message });
    }
  }
  return results;
}
