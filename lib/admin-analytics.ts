import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import { db } from "@/lib/db";
import {
  enumerateBuckets,
  fillSeries,
  PERFORMANCE_ORDER,
  type AdminAnalytics,
  type AnalyticsFilters,
  type NamedValue,
} from "@/lib/admin-analytics-shared";

// Admin analytics aggregation (M6-S2). One call powers the dashboard: cheap
// catalog counts + time-bucketed series (enrolments, exam attempts) + ordinal
// rollups (performance, average score by level) + course activity, under a
// {from, to, granularity, courseId} filter. Time buckets use Postgres
// date_trunc; empty buckets are zero-filled (see admin-analytics-shared).
//
// SCALE NOTE: these are live aggregates — fine at pilot volume. At the 100k-
// student target the attempt/enrolment rollups should read the pre-aggregated
// DailyStat table (M10-S1); this module is the seam that swaps to it.

// Re-export the client-safe surface so server callers can keep importing
// everything from "@/lib/admin-analytics".
export * from "@/lib/admin-analytics-shared";

/** Student ids with access to a course (batch path). Used when courseId filters. */
async function accessibleStudentIds(courseId: string): Promise<string[]> {
  const rows = await db.studentBatch.findMany({
    where: { batch: { batchCourses: { some: { courseId } } } },
    select: { studentId: true },
    distinct: ["studentId"],
  });
  return rows.map((r) => r.studentId);
}

/** Student ids in a specific batch. */
async function batchStudentIds(batchId: string): Promise<string[]> {
  const rows = await db.studentBatch.findMany({
    where: { batchId },
    select: { studentId: true },
    distinct: ["studentId"],
  });
  return rows.map((r) => r.studentId);
}

// In-process TTL cache. The DB is remote (Supabase, ap-south) and each load
// fans out to ~20 queries, so re-visiting a filter combo (toggling lens, going
// back) would otherwise re-pay all that round-trip latency. A short TTL keeps
// repeat views instant while staying near-live; the real scale answer is the
// pre-aggregated DailyStat table (M10). Single-node deploy → one process, one map.
type AnalyticsCacheEntry = { at: number; data: AdminAnalytics };
const analyticsCache = new Map<string, AnalyticsCacheEntry>();
const ANALYTICS_TTL_MS = 60_000;

export async function getAdminAnalytics(filters: AnalyticsFilters): Promise<AdminAnalytics> {
  const key = [
    filters.from.toISOString(),
    filters.to.toISOString(),
    filters.granularity,
    filters.courseId ?? "",
    filters.batchId ?? "",
  ].join("|");
  const nowMs = Date.now();
  const hit = analyticsCache.get(key);
  if (hit && nowMs - hit.at < ANALYTICS_TTL_MS) return hit.data;

  const data = await computeAdminAnalytics(filters);
  analyticsCache.set(key, { at: nowMs, data });
  if (analyticsCache.size > 200) {
    for (const [k, v] of analyticsCache) {
      if (nowMs - v.at >= ANALYTICS_TTL_MS) analyticsCache.delete(k);
    }
  }
  return data;
}

async function computeAdminAnalytics(filters: AnalyticsFilters): Promise<AdminAnalytics> {
  const { from, to, granularity } = filters;
  const courseId = filters.courseId ?? null;
  const batchId = filters.batchId ?? null;

  // Cohort scope: a chosen batch is the most specific (the course→batch drill),
  // else the course cohort, else everyone.
  const ids = batchId
    ? await batchStudentIds(batchId)
    : courseId
      ? await accessibleStudentIds(courseId)
      : null;
  const studentWhere: Prisma.StudentWhereInput = ids ? { id: { in: ids } } : {};
  const attemptStudentWhere = ids ? { studentId: { in: ids } } : {};

  const enrolIdClause = ids ? Prisma.sql`AND id = ANY(${ids}::text[])` : Prisma.empty;
  const attemptIdClause = ids ? Prisma.sql`AND student_id = ANY(${ids}::text[])` : Prisma.empty;
  // Per-alias cohort filters for the joined analytics queries below.
  const vpIds = ids ? Prisma.sql`AND vp.student_id = ANY(${ids}::text[])` : Prisma.empty;
  const sbIds = ids ? Prisma.sql`AND sb.student_id = ANY(${ids}::text[])` : Prisma.empty;
  const aIds = ids ? Prisma.sql`AND a.student_id = ANY(${ids}::text[])` : Prisma.empty;
  const mdIds = ids ? Prisma.sql`AND md.student_id = ANY(${ids}::text[])` : Prisma.empty;
  const idWhere = ids ? { studentId: { in: ids } } : {};
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 86_400_000);
  const recent = new Date(now.getTime() - 30 * 86_400_000);

  const [
    totalStudents,
    activeStudents,
    newStudents,
    coursesCount,
    batchesCount,
    questionsCount,
    lessonsCompleted,
    enrolRows,
    attemptRows,
    attemptAgg,
    perfGroups,
    levelGroups,
    courseRows,
    watchAgg,
    downloadsTotal,
    watchByCourseRows,
    trendingRows,
    topStudentRows,
    topDownloadRows,
    completionRow,
    expiringSoon,
    loggedInRecently,
    scoreDistRow,
    batchPerfRows,
    topBatchRows,
  ] = await Promise.all([
    db.student.count({ where: studentWhere }),
    db.student.count({ where: { ...studentWhere, status: "active" } }),
    db.student.count({ where: { ...studentWhere, createdAt: { gte: from, lt: to } } }),
    db.course.count(),
    db.batch.count(),
    db.question.count(),
    db.videoProgress.count({
      where: { completed: true, ...(ids ? { studentId: { in: ids } } : {}) },
    }),
    db.$queryRaw<{ bucket: Date; value: bigint }[]>(Prisma.sql`
      SELECT date_trunc(${granularity}, created_at) AS bucket, count(*) AS value
      FROM students
      WHERE created_at >= ${from} AND created_at < ${to} ${enrolIdClause}
      GROUP BY 1 ORDER BY 1
    `),
    db.$queryRaw<{ bucket: Date; value: bigint }[]>(Prisma.sql`
      SELECT date_trunc(${granularity}, completed_at) AS bucket, count(*) AS value
      FROM attempts
      WHERE completed_at >= ${from} AND completed_at < ${to} ${attemptIdClause}
      GROUP BY 1 ORDER BY 1
    `),
    db.attempt.aggregate({
      where: { ...attemptStudentWhere, completedAt: { gte: from, lt: to } },
      _avg: { percentage: true },
      _count: { _all: true },
    }),
    db.attempt.groupBy({
      by: ["performanceLabel"],
      where: { ...attemptStudentWhere, completedAt: { gte: from, lt: to } },
      _count: { _all: true },
    }),
    db.attempt.groupBy({
      by: ["level"],
      where: { ...attemptStudentWhere, completedAt: { gte: from, lt: to } },
      _avg: { percentage: true },
      _count: { _all: true },
    }),
    db.$queryRaw<{ name: string; value: bigint }[]>(Prisma.sql`
      SELECT c.name AS name, count(DISTINCT sb.student_id) AS value
      FROM courses c
      JOIN batch_courses bc ON bc.course_id = c.id
      JOIN student_batches sb ON sb.batch_id = bc.batch_id
      GROUP BY c.id, c.name
      ORDER BY value DESC, c.name ASC
      LIMIT 8
    `),
    // Total watch time (lifetime for the cohort — watchSeconds is a running sum).
    db.videoProgress.aggregate({ where: idWhere, _sum: { watchSeconds: true } }),
    // Total downloads in the window.
    db.materialDownload.count({ where: { ...idWhere, createdAt: { gte: from, lt: to } } }),
    // Watch minutes per course (lifetime).
    db.$queryRaw<{ name: string; value: bigint }[]>(Prisma.sql`
      SELECT co.name AS name, SUM(vp.watch_seconds) AS value
      FROM video_progress vp
      JOIN content_items ci ON ci.id = vp.item_id
      LEFT JOIN modules m ON m.id = ci.module_id
      JOIN courses co ON co.id = COALESCE(ci.course_id, m.course_id)
      WHERE vp.watch_seconds > 0 ${vpIds}
      GROUP BY co.id, co.name ORDER BY value DESC, co.name ASC LIMIT 8
    `),
    // Trending courses = most new enrolments in the window.
    db.$queryRaw<{ name: string; value: bigint }[]>(Prisma.sql`
      SELECT co.name AS name, COUNT(DISTINCT sb.student_id) AS value
      FROM student_batches sb
      JOIN batch_courses bc ON bc.batch_id = sb.batch_id
      JOIN courses co ON co.id = bc.course_id
      WHERE sb.assigned_at >= ${from} AND sb.assigned_at < ${to} ${sbIds}
      GROUP BY co.id, co.name ORDER BY value DESC, co.name ASC LIMIT 6
    `),
    // Top-performing students by average score in the window.
    db.$queryRaw<{ name: string; value: number }[]>(Prisma.sql`
      SELECT s.name AS name, ROUND(AVG(a.percentage) * 100) AS value
      FROM attempts a JOIN students s ON s.id = a.student_id
      WHERE a.completed_at >= ${from} AND a.completed_at < ${to} ${aIds}
      GROUP BY s.id, s.name ORDER BY value DESC, s.name ASC LIMIT 8
    `),
    // Most-downloaded materials in the window.
    db.$queryRaw<{ name: string; value: bigint }[]>(Prisma.sql`
      SELECT ci.title AS name, COUNT(*) AS value
      FROM material_downloads md JOIN content_items ci ON ci.id = md.item_id
      WHERE md.created_at >= ${from} AND md.created_at < ${to} ${mdIds}
      GROUP BY ci.id, ci.title ORDER BY value DESC, ci.title ASC LIMIT 8
    `),
    // Watch completion: fully watched vs skipped (marked done but jumped) vs in progress.
    db.$queryRaw<{ fully: bigint; skipped: bigint; partial: bigint }[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE ci.duration IS NOT NULL AND ci.duration > 0 AND vp.watch_seconds >= ci.duration * 0.9) AS fully,
        COUNT(*) FILTER (WHERE vp.completed AND NOT (ci.duration IS NOT NULL AND ci.duration > 0 AND vp.watch_seconds >= ci.duration * 0.9)) AS skipped,
        COUNT(*) FILTER (WHERE NOT vp.completed AND NOT (ci.duration IS NOT NULL AND ci.duration > 0 AND vp.watch_seconds >= ci.duration * 0.9)) AS partial
      FROM video_progress vp JOIN content_items ci ON ci.id = vp.item_id
      WHERE TRUE ${vpIds}
    `),
    // Active students whose access ends within 30 days.
    db.student.count({
      where: { ...studentWhere, status: "active", accessEndDate: { gte: now, lt: soon } },
    }),
    // Students who logged in within the last 30 days.
    db.student.count({ where: { ...studentWhere, lastLoginAt: { gte: recent } } }),
    // Score distribution (histogram) over attempts in the window.
    db.$queryRaw<{ b1: bigint; b2: bigint; b3: bigint; b4: bigint }[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE a.percentage < 0.4) AS b1,
        COUNT(*) FILTER (WHERE a.percentage >= 0.4 AND a.percentage < 0.7) AS b2,
        COUNT(*) FILTER (WHERE a.percentage >= 0.7 AND a.percentage < 0.9) AS b3,
        COUNT(*) FILTER (WHERE a.percentage >= 0.9) AS b4
      FROM attempts a
      WHERE a.completed_at >= ${from} AND a.completed_at < ${to} ${aIds}
    `),
    // Average score per batch in the window.
    db.$queryRaw<{ name: string; value: number }[]>(Prisma.sql`
      SELECT bt.batch_name AS name, ROUND(AVG(a.percentage) * 100) AS value
      FROM attempts a
      JOIN student_batches sb ON sb.student_id = a.student_id
      JOIN batches bt ON bt.id = sb.batch_id
      WHERE a.completed_at >= ${from} AND a.completed_at < ${to} ${aIds}
      GROUP BY bt.id, bt.batch_name ORDER BY value DESC, bt.batch_name ASC LIMIT 8
    `),
    // Students per batch.
    db.$queryRaw<{ name: string; value: bigint }[]>(Prisma.sql`
      SELECT bt.batch_name AS name, COUNT(DISTINCT sb.student_id) AS value
      FROM student_batches sb JOIN batches bt ON bt.id = sb.batch_id
      WHERE TRUE ${sbIds}
      GROUP BY bt.id, bt.batch_name ORDER BY value DESC, bt.batch_name ASC LIMIT 8
    `),
  ]);

  const buckets = enumerateBuckets(from, to, granularity);

  const perfByLabel = new Map(perfGroups.map((g) => [g.performanceLabel, g._count._all]));
  const performance: NamedValue[] = PERFORMANCE_ORDER.map((name) => ({
    name,
    value: perfByLabel.get(name) ?? 0,
  }));

  const avgByLevel: NamedValue[] = levelGroups
    .map((g) => ({ name: g.level, value: Math.round(Number(g._avg.percentage ?? 0) * 100) }))
    .sort((a, b) => b.value - a.value);

  const topCourses: NamedValue[] = courseRows.map((r) => ({
    name: r.name,
    value: Number(r.value),
  }));

  const totalAttempts = attemptAgg._count._all;
  const poor = perfByLabel.get("Poor") ?? 0;
  const passRatePct =
    totalAttempts > 0 ? Math.round(((totalAttempts - poor) / totalAttempts) * 100) : 0;

  const toMin = (seconds: number) => Math.round(seconds / 60);
  const watchByCourse: NamedValue[] = watchByCourseRows.map((r) => ({
    name: r.name,
    value: toMin(Number(r.value)),
  }));
  const trendingCourses: NamedValue[] = trendingRows.map((r) => ({
    name: r.name,
    value: Number(r.value),
  }));
  const topStudents: NamedValue[] = topStudentRows.map((r) => ({
    name: r.name,
    value: Number(r.value),
  }));
  const topDownloads: NamedValue[] = topDownloadRows.map((r) => ({
    name: r.name,
    value: Number(r.value),
  }));
  const comp = completionRow[0];
  const watchCompletion: NamedValue[] = [
    { name: "Fully watched", value: Number(comp?.fully ?? 0) },
    { name: "Skipped ahead", value: Number(comp?.skipped ?? 0) },
    { name: "In progress", value: Number(comp?.partial ?? 0) },
  ];
  const watchMinutes = toMin(Number(watchAgg._sum.watchSeconds ?? 0));

  const sd = scoreDistRow[0];
  const scoreDistribution: NamedValue[] = [
    { name: "0–39%", value: Number(sd?.b1 ?? 0) },
    { name: "40–69%", value: Number(sd?.b2 ?? 0) },
    { name: "70–89%", value: Number(sd?.b3 ?? 0) },
    { name: "90–100%", value: Number(sd?.b4 ?? 0) },
  ];
  const batchPerformance: NamedValue[] = batchPerfRows.map((r) => ({
    name: r.name,
    value: Number(r.value),
  }));
  const topBatches: NamedValue[] = topBatchRows.map((r) => ({
    name: r.name,
    value: Number(r.value),
  }));

  return {
    kpis: {
      totalStudents,
      activeStudents,
      newStudents,
      totalAttempts,
      avgScorePct: Math.round(Number(attemptAgg._avg.percentage ?? 0) * 100),
      coursesCount,
      batchesCount,
      questionsCount,
      lessonsCompleted,
      passRatePct,
      watchMinutes,
      downloads: downloadsTotal,
      expiringSoon,
      loggedInRecently,
    },
    enrolments: fillSeries(buckets, enrolRows, granularity),
    attempts: fillSeries(buckets, attemptRows, granularity),
    performance,
    avgByLevel,
    topCourses,
    watchByCourse,
    trendingCourses,
    topStudents,
    topDownloads,
    watchCompletion,
    scoreDistribution,
    batchPerformance,
    topBatches,
    range: { from: from.toISOString(), to: to.toISOString(), granularity },
    courseId,
  };
}

/**
 * Years the console actually has data for — the year slicer is built from this
 * rather than a hardcoded range, so it never offers an empty year. Unions the
 * dated facts the dashboard charts (enrolments, attempts, watch, downloads).
 */
export async function getAnalyticsYears(): Promise<number[]> {
  const rows = await db.$queryRaw<{ y: number }[]>`
    SELECT DISTINCT EXTRACT(YEAR FROM d)::int AS y FROM (
      SELECT created_at d FROM students
      UNION ALL SELECT assigned_at FROM student_batches
      UNION ALL SELECT completed_at FROM attempts
      UNION ALL SELECT updated_at FROM video_progress
      UNION ALL SELECT created_at FROM material_downloads
    ) t WHERE d IS NOT NULL ORDER BY y DESC`;
  const years = rows.map((r) => r.y).filter((y) => Number.isFinite(y));
  // Always offer the current year so a fresh install isn't left with none.
  const now = new Date().getUTCFullYear();
  return years.includes(now) ? years : [now, ...years];
}
