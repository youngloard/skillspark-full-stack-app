import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import { db } from "@/lib/db";
import { MAX_SEARCH_CHARS } from "@/lib/search-limits";
import type { NamedValue, SeriesPoint } from "@/lib/admin-analytics-shared";

// Admin student roster + per-student report (M6-S3). List is searchable
// (email / student code / name) and filterable, keyset-paged by recency. The
// report powers the profile page and the per-student PDF.

export type StudentStatusFilter = "all" | "active" | "blocked";

export type StudentListItem = {
  id: string;
  studentCode: string | null;
  name: string;
  email: string;
  status: string;
  accessStartDate: string;
  accessEndDate: string;
  lastLoginAt: string | null;
  batchCount: number;
};

export type StudentListResult = {
  items: StudentListItem[];
  total: number;
  page: number;
  pageCount: number;
};

const STUDENTS_PAGE_SIZE = 25;

function searchWhere(q?: string): Prisma.StudentWhereInput {
  const trimmed = q?.trim().slice(0, MAX_SEARCH_CHARS);
  if (!trimmed) return {};
  const mode = Prisma.QueryMode.insensitive;
  return {
    OR: [
      { id: trimmed }, // exact id match (search by student id)
      { name: { contains: trimmed, mode } },
      { email: { contains: trimmed, mode } },
      { studentCode: { contains: trimmed, mode } },
    ],
  };
}

export type StudentListFilters = {
  q?: string;
  status?: StudentStatusFilter;
  /** Multi-select: a student matches if they're in ANY of these courses. */
  courseIds?: string[];
  /** Multi-select: a student matches if they're in ANY of these batches. */
  batchIds?: string[];
};

/** Bound the IN lists — they arrive from the URL and drive index lookups. */
const MAX_FILTER_IDS = 50;

/**
 * Shared WHERE for the roster: search + status + course/batch membership.
 * Membership is ONE `some` so both halves must hold for the same enrolment
 * (batch X that also teaches course Y) — the index-friendly EXISTS shape.
 */
function listWhere(filters: StudentListFilters): Prisma.StudentWhereInput {
  const batchIds = filters.batchIds?.slice(0, MAX_FILTER_IDS) ?? [];
  const courseIds = filters.courseIds?.slice(0, MAX_FILTER_IDS) ?? [];

  const membership: Prisma.StudentBatchWhereInput = {};
  if (batchIds.length) membership.batchId = { in: batchIds };
  if (courseIds.length) {
    membership.batch = { batchCourses: { some: { courseId: { in: courseIds } } } };
  }
  const hasMembership = batchIds.length > 0 || courseIds.length > 0;

  return {
    ...searchWhere(filters.q),
    ...(filters.status && filters.status !== "all" ? { status: filters.status } : {}),
    ...(hasMembership ? { studentBatches: { some: membership } } : {}),
  };
}

export async function listStudents(
  filters: StudentListFilters & { page?: number; take?: number },
): Promise<StudentListResult> {
  const take = filters.take ?? STUDENTS_PAGE_SIZE;
  const where = listWhere(filters);

  const total = await db.student.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / take));
  const page = Math.min(Math.max(1, Math.floor(filters.page ?? 1)), pageCount);

  const rows = await db.student.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * take,
    take,
    select: {
      id: true,
      studentCode: true,
      name: true,
      email: true,
      status: true,
      accessStartDate: true,
      accessEndDate: true,
      lastLoginAt: true,
      _count: { select: { studentBatches: true } },
    },
  });

  return {
    items: rows.map((s) => ({
      id: s.id,
      studentCode: s.studentCode,
      name: s.name,
      email: s.email,
      status: s.status,
      accessStartDate: s.accessStartDate.toISOString(),
      accessEndDate: s.accessEndDate.toISOString(),
      lastLoginAt: s.lastLoginAt?.toISOString() ?? null,
      batchCount: s._count.studentBatches,
    })),
    total,
    page,
    pageCount,
  };
}

/** Cap on how many IDs "select all matching" will pull, to bound the payload. */
const SELECT_ALL_CAP = 5000;

/**
 * All student IDs matching the current filter — powers "select all N across
 * pages" on the roster. Bounded by SELECT_ALL_CAP; returns whether it was hit.
 */
export async function listAllStudentIds(
  filters: StudentListFilters,
): Promise<{ ids: string[]; capped: boolean }> {
  const rows = await db.student.findMany({
    where: listWhere(filters),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: SELECT_ALL_CAP + 1,
    select: { id: true },
  });
  const capped = rows.length > SELECT_ALL_CAP;
  return { ids: rows.slice(0, SELECT_ALL_CAP).map((r) => r.id), capped };
}

export type StudentSearchHit = {
  id: string;
  name: string;
  email: string;
  studentCode: string | null;
};

/** Type-ahead for the dashboard "jump to student" box. */
export async function searchStudents(q: string, take = 8): Promise<StudentSearchHit[]> {
  const trimmed = q.trim().slice(0, MAX_SEARCH_CHARS);
  if (!trimmed) return [];
  const rows = await db.student.findMany({
    where: searchWhere(trimmed),
    orderBy: { name: "asc" },
    take,
    select: { id: true, name: true, email: true, studentCode: true },
  });
  return rows;
}

export type StudentReport = {
  student: {
    id: string;
    name: string;
    email: string;
    studentCode: string | null;
    status: string;
    accessStartDate: string;
    accessEndDate: string;
    lastLoginAt: string | null;
    createdAt: string;
  };
  batches: { id: string; batchCode: string; batchName: string }[];
  courses: { id: string; name: string }[];
  kpis: {
    attempts: number;
    avgScorePct: number;
    bestScorePct: number;
    passRatePct: number;
    lessonsCompleted: number;
  };
  video: {
    watchMinutes: number;
    videosStarted: number;
    videosFullyWatched: number;
    videosSkipped: number; // completed but < 80% actually watched
    downloads: number;
    byCourse: SeriesPoint[]; // watch minutes per course
  };
  scoreSeries: SeriesPoint[];
  performance: NamedValue[];
  attempts: {
    id: string;
    examName: string;
    level: string;
    score: number;
    totalQuestions: number;
    percentage: number;
    performanceLabel: string;
    completedAt: string;
  }[];
};

const PERFORMANCE_ORDER = ["Excellent", "Very Good", "Good", "Poor"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export async function getStudentReport(id: string): Promise<StudentReport | null> {
  const student = await db.student.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      studentCode: true,
      status: true,
      accessStartDate: true,
      accessEndDate: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  if (!student) return null;

  const [batchRows, attempts, lessonsCompleted, progressRows, downloads] = await Promise.all([
    db.studentBatch.findMany({
      where: { studentId: id },
      select: { batch: { select: { id: true, batchCode: true, batchName: true } } },
      orderBy: { assignedAt: "desc" },
    }),
    db.attempt.findMany({
      where: { studentId: id },
      orderBy: { completedAt: "asc" },
      select: {
        id: true,
        level: true,
        score: true,
        totalQuestions: true,
        percentage: true,
        performanceLabel: true,
        completedAt: true,
        exam: { select: { name: true } },
      },
    }),
    db.videoProgress.count({ where: { studentId: id, completed: true } }),
    db.videoProgress.findMany({
      where: { studentId: id },
      select: {
        watchSeconds: true,
        completed: true,
        item: {
          select: {
            duration: true,
            course: { select: { id: true, name: true } },
            module: { select: { course: { select: { id: true, name: true } } } },
          },
        },
      },
    }),
    db.materialDownload.count({ where: { studentId: id } }),
  ]);

  // Video/material analytics. A content item reaches its course either directly
  // (flat layout: item.course) or via its module (module layout: module.course).
  // Skip = completed but the student actually played < 80% of the duration.
  const watchByCourse = new Map<string, { name: string; seconds: number }>();
  let totalWatchSeconds = 0;
  let videosFullyWatched = 0;
  let videosSkipped = 0;
  for (const p of progressRows) {
    totalWatchSeconds += p.watchSeconds;
    const course = p.item.course ?? p.item.module?.course ?? null;
    if (course) {
      const prev = watchByCourse.get(course.id);
      watchByCourse.set(course.id, {
        name: course.name,
        seconds: (prev?.seconds ?? 0) + p.watchSeconds,
      });
    }
    if (p.completed) {
      videosFullyWatched++;
      const dur = p.item.duration ?? 0;
      if (dur > 0 && p.watchSeconds < 0.8 * dur) videosSkipped++;
    }
  }
  const videoAnalytics = {
    watchMinutes: Math.round(totalWatchSeconds / 60),
    videosStarted: progressRows.length,
    videosFullyWatched,
    videosSkipped,
    downloads,
    byCourse: [...watchByCourse.entries()]
      .map(([key, v]) => ({ key, label: v.name, value: Math.round(v.seconds / 60) }))
      .sort((a, b) => b.value - a.value),
  };

  const batches = batchRows.map((b) => b.batch);
  // Courses the student can reach = union of their batches' courses.
  const courseRows = batches.length
    ? await db.course.findMany({
        where: {
          batchCourses: { some: { batch: { studentBatches: { some: { studentId: id } } } } },
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  const pcts = attempts.map((a) => Number(a.percentage));
  const attemptCount = attempts.length;
  const avgScorePct =
    attemptCount > 0 ? Math.round((pcts.reduce((s, p) => s + p, 0) / attemptCount) * 100) : 0;
  const bestScorePct = attemptCount > 0 ? Math.round(Math.max(...pcts) * 100) : 0;
  const passCount = attempts.filter((a) => a.performanceLabel !== "Poor").length;
  const passRatePct = attemptCount > 0 ? Math.round((passCount / attemptCount) * 100) : 0;

  const perfByLabel = new Map<string, number>();
  for (const a of attempts)
    perfByLabel.set(a.performanceLabel, (perfByLabel.get(a.performanceLabel) ?? 0) + 1);
  const performance: NamedValue[] = PERFORMANCE_ORDER.map((name) => ({
    name,
    value: perfByLabel.get(name) ?? 0,
  }));

  const scoreSeries: SeriesPoint[] = attempts.map((a) => {
    const d = a.completedAt;
    return {
      key: a.id,
      label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`,
      value: Math.round(Number(a.percentage) * 100),
    };
  });

  return {
    student: {
      id: student.id,
      name: student.name,
      email: student.email,
      studentCode: student.studentCode,
      status: student.status,
      accessStartDate: student.accessStartDate.toISOString(),
      accessEndDate: student.accessEndDate.toISOString(),
      lastLoginAt: student.lastLoginAt?.toISOString() ?? null,
      createdAt: student.createdAt.toISOString(),
    },
    batches,
    courses: courseRows,
    kpis: { attempts: attemptCount, avgScorePct, bestScorePct, passRatePct, lessonsCompleted },
    video: videoAnalytics,
    scoreSeries,
    performance,
    attempts: attempts.map((a) => ({
      id: a.id,
      examName: a.exam.name,
      level: a.level,
      score: a.score,
      totalQuestions: a.totalQuestions,
      percentage: Number(a.percentage),
      performanceLabel: a.performanceLabel,
      completedAt: a.completedAt.toISOString(),
    })),
  };
}
