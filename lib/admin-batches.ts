import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import { db } from "@/lib/db";
import { MAX_SEARCH_CHARS } from "@/lib/search-limits";

// Admin batch roster + detail (M6-S4). List is searchable (code / name),
// keyset-paged by recency. Detail carries the batch's assigned courses, exams,
// and students for the assignment UI.

export type BatchListItem = {
  id: string;
  batchCode: string;
  batchName: string;
  description: string | null;
  studentCount: number;
  courseCount: number;
};

export type BatchListResult = {
  items: BatchListItem[];
  total: number;
  page: number;
  pageCount: number;
};

const BATCHES_PAGE_SIZE = 25;

function searchWhere(q?: string): Prisma.BatchWhereInput {
  const trimmed = q?.trim().slice(0, MAX_SEARCH_CHARS);
  if (!trimmed) return {};
  const mode = Prisma.QueryMode.insensitive;
  return {
    OR: [{ batchCode: { contains: trimmed, mode } }, { batchName: { contains: trimmed, mode } }],
  };
}

export async function listBatches(filters: {
  q?: string;
  page?: number;
  take?: number;
}): Promise<BatchListResult> {
  const take = filters.take ?? BATCHES_PAGE_SIZE;
  const where = searchWhere(filters.q);

  const total = await db.batch.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / take));
  const page = Math.min(Math.max(1, Math.floor(filters.page ?? 1)), pageCount);

  const rows = await db.batch.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * take,
    take,
    select: {
      id: true,
      batchCode: true,
      batchName: true,
      description: true,
      _count: { select: { studentBatches: true, batchCourses: true } },
    },
  });

  return {
    items: rows.map((b) => ({
      id: b.id,
      batchCode: b.batchCode,
      batchName: b.batchName,
      description: b.description,
      studentCount: b._count.studentBatches,
      courseCount: b._count.batchCourses,
    })),
    total,
    page,
    pageCount,
  };
}

export type BatchSearchHit = {
  id: string;
  batchCode: string;
  batchName: string;
  /** The courses this batch already teaches (a batch may hold several). */
  courses: { id: string; name: string }[];
};

/**
 * Type-ahead for the batch chooser (add-student / multi-select assign / roster
 * filter). Optionally scoped to a course, so the roster's course→batch filter
 * cascades.
 *
 * Carries the batch's current courses so the chooser can show what a batch
 * already teaches before more are added.
 */
export async function searchBatches(
  q: string,
  opts: { courseIds?: string[]; take?: number } = {},
): Promise<BatchSearchHit[]> {
  const courseIds = opts.courseIds?.slice(0, 50) ?? [];
  const rows = await db.batch.findMany({
    where: {
      ...searchWhere(q),
      ...(courseIds.length ? { batchCourses: { some: { courseId: { in: courseIds } } } } : {}),
    },
    orderBy: { batchName: "asc" },
    take: opts.take ?? 8,
    select: {
      id: true,
      batchCode: true,
      batchName: true,
      batchCourses: {
        select: { course: { select: { id: true, name: true } } },
        orderBy: { assignedAt: "asc" },
      },
    },
  });
  return rows.map((b) => ({
    id: b.id,
    batchCode: b.batchCode,
    batchName: b.batchName,
    courses: b.batchCourses.map((bc) => bc.course),
  }));
}

export type BatchDetail = {
  batch: { id: string; batchCode: string; batchName: string; description: string | null };
  courses: { id: string; name: string }[];
  exams: { id: string; name: string }[];
  students: { id: string; name: string; email: string; studentCode: string | null }[];
  studentCount: number;
  studentPage: number;
  studentPageCount: number;
};

const BATCH_STUDENTS_PAGE_SIZE = 20;

export async function getBatchDetail(
  id: string,
  opts: { studentPage?: number; studentQuery?: string } = {},
): Promise<BatchDetail | null> {
  const batch = await db.batch.findUnique({
    where: { id },
    select: { id: true, batchCode: true, batchName: true, description: true },
  });
  if (!batch) return null;

  // Member search filters this batch's students by name / email / code.
  const trimmed = opts.studentQuery?.trim().slice(0, MAX_SEARCH_CHARS);
  const mode = Prisma.QueryMode.insensitive;
  const memberWhere: Prisma.StudentBatchWhereInput = {
    batchId: id,
    ...(trimmed
      ? {
          student: {
            OR: [
              { name: { contains: trimmed, mode } },
              { email: { contains: trimmed, mode } },
              { studentCode: { contains: trimmed, mode } },
            ],
          },
        }
      : {}),
  };

  const take = BATCH_STUDENTS_PAGE_SIZE;
  const studentCount = await db.studentBatch.count({ where: memberWhere });
  const studentPageCount = Math.max(1, Math.ceil(studentCount / take));
  const studentPage = Math.min(Math.max(1, Math.floor(opts.studentPage ?? 1)), studentPageCount);

  const [courseRows, examRows, studentRows] = await Promise.all([
    db.batchCourse.findMany({
      where: { batchId: id },
      select: { course: { select: { id: true, name: true } } },
      orderBy: { assignedAt: "desc" },
    }),
    db.batchExam.findMany({
      where: { batchId: id },
      select: { exam: { select: { id: true, name: true } } },
      orderBy: { assignedAt: "desc" },
    }),
    db.studentBatch.findMany({
      where: memberWhere,
      select: {
        student: { select: { id: true, name: true, email: true, studentCode: true } },
      },
      orderBy: { assignedAt: "desc" },
      skip: (studentPage - 1) * take,
      take,
    }),
  ]);

  return {
    batch,
    courses: courseRows.map((r) => r.course),
    exams: examRows.map((r) => r.exam),
    students: studentRows.map((r) => r.student),
    studentCount,
    studentPage,
    studentPageCount,
  };
}
