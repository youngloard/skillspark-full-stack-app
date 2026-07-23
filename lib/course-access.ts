import "server-only";
import type { Course } from "@/lib/generated/prisma/client";
import { db } from "@/lib/db";

// Object-level course access (M3-S3) — the batch-centric core invariant:
// a student can access a course iff some batch they belong to has it assigned
// AND the course is active. No packages, no direct enrollment, no denials.
//
// CONTRACT: these helpers check the OBJECT side only. The SUBJECT side —
// student active + inside their access window — is requireStudent()'s job
// (M1-S3); every student-facing surface calls the gate first, then one of
// these. Splitting the two keeps each helper a single indexed probe.

/**
 * All unique active courses a student can access — the union across every
 * batch they belong to. Two indexed queries (grants, then courses by PK).
 */
export async function getAccessibleCourses(studentId: string): Promise<Course[]> {
  const grants = await db.batchCourse.findMany({
    where: { batch: { studentBatches: { some: { studentId } } } },
    select: { courseId: true },
  });
  const courseIds = [...new Set(grants.map((g) => g.courseId))];
  if (courseIds.length === 0) return [];
  return db.course.findMany({
    where: { id: { in: courseIds }, status: "active" },
    orderBy: { name: "asc" },
  });
}

/**
 * One EXISTS probe over (courseId) ⋈ (batchId) ⋈ unique(studentId, batchId),
 * with the course-active check folded into the same query (ARCHITECTURE §5:
 * p95 < 15ms at 100k students / 3M StudentBatch — verified in M3-S3).
 */
export async function canAccessCourse(studentId: string, courseId: string): Promise<boolean> {
  const grant = await db.batchCourse.findFirst({
    where: {
      courseId,
      course: { status: "active" },
      batch: { studentBatches: { some: { studentId } } },
    },
    select: { id: true },
  });
  return grant !== null;
}

/**
 * Module access inherits entirely from its course (modules carry no status
 * of their own). Single query: the module's course must be granted + active.
 */
export async function canAccessModule(studentId: string, moduleId: string): Promise<boolean> {
  const grant = await db.batchCourse.findFirst({
    where: {
      course: { status: "active", modules: { some: { id: moduleId } } },
      batch: { studentBatches: { some: { studentId } } },
    },
    select: { id: true },
  });
  return grant !== null;
}

/**
 * Item access = item active ∧ (for attachments) parent video active ∧ the
 * owning course granted + active — whichever of the three parent shapes the
 * item has (module / flat course / attachment under a video). Two indexed
 * queries: resolve the item's course, then the standard probe.
 */
export async function canAccessItem(studentId: string, itemId: string): Promise<boolean> {
  const item = await db.contentItem.findUnique({
    where: { id: itemId },
    select: {
      status: true,
      courseId: true,
      module: { select: { courseId: true } },
      parentItem: {
        select: { status: true, courseId: true, module: { select: { courseId: true } } },
      },
    },
  });
  if (!item || item.status !== "active") return false;
  if (item.parentItem && item.parentItem.status !== "active") return false;

  const courseId =
    item.courseId ??
    item.module?.courseId ??
    item.parentItem?.courseId ??
    item.parentItem?.module?.courseId;
  if (!courseId) return false;

  return canAccessCourse(studentId, courseId);
}
