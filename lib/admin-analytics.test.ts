import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAdminAnalytics, parseAnalyticsFilters } from "./admin-analytics";
import { db } from "./db";

// Scope the cohort-sensitive assertions with the courseId filter so rows from
// other tests/seeds don't perturb the counts (global counts like coursesCount
// are only checked as lower bounds).

const STAMP = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const mail = (n: string) => `analytics-${n}-${STAMP}@test.skillspark.local`;

const now = new Date();
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

let courseId = "";
let examId = "";

beforeAll(async () => {
  const exam = await db.exam.create({
    data: { slug: `exam-${STAMP}`, name: `Exam ${STAMP}` },
  });
  examId = exam.id;
  const course = await db.course.create({ data: { name: `Course ${STAMP}` } });
  courseId = course.id;
  const batch = await db.batch.create({
    data: { batchCode: `B-${STAMP}`, batchName: `Batch ${STAMP}` },
  });
  await db.batchCourse.create({ data: { batchId: batch.id, courseId } });

  const win = {
    accessStartDate: daysAgo(60),
    accessEndDate: new Date(now.getTime() + 86_400_000),
  };
  const s1 = await db.student.create({
    data: { name: "S1", email: mail("s1"), createdAt: daysAgo(40), ...win },
  });
  const s2 = await db.student.create({
    data: { name: "S2", email: mail("s2"), createdAt: daysAgo(10), ...win },
  });
  const s3 = await db.student.create({
    data: { name: "S3", email: mail("s3"), createdAt: daysAgo(10), ...win },
  });
  for (const s of [s1, s2, s3]) {
    await db.studentBatch.create({ data: { studentId: s.id, batchId: batch.id } });
  }

  const mk = (student: string, level: string, pct: number, label: string, completedAt: Date) =>
    db.attempt.create({
      data: {
        quizId: `quiz-${STAMP}-${student}-${level}-${pct}`,
        studentId: student,
        examId,
        level,
        score: Math.round(pct * 10),
        totalQuestions: 10,
        percentage: pct,
        performanceLabel: label,
        completedAt,
        resultsJson: {},
      },
    });
  await mk(s1.id, "basic", 0.95, "Excellent", daysAgo(20));
  await mk(s1.id, "medium", 0.6, "Good", daysAgo(15));
  await mk(s2.id, "basic", 0.3, "Poor", daysAgo(5));
});

afterAll(async () => {
  await db.student.deleteMany({ where: { email: { contains: STAMP } } });
  await db.batch.deleteMany({ where: { batchCode: { contains: STAMP } } });
  await db.course.deleteMany({ where: { name: { contains: STAMP } } });
  await db.exam.deleteMany({ where: { slug: { contains: STAMP } } });
  await db.$disconnect();
});

describe("admin analytics", () => {
  it("counts-match-seeded-fixtures", async () => {
    const a = await getAdminAnalytics({
      from: daysAgo(365),
      to: new Date(now.getTime() + 86_400_000),
      granularity: "month",
      courseId,
    });

    // Cohort-scoped KPIs are exact.
    expect(a.kpis.totalStudents).toBe(3);
    expect(a.kpis.activeStudents).toBe(3);
    expect(a.kpis.newStudents).toBe(3);
    expect(a.kpis.totalAttempts).toBe(3);
    // avg of 0.95, 0.60, 0.30 = 0.6166… → 62%
    expect(a.kpis.avgScorePct).toBe(62);

    // Global catalog counts include at least our fixtures.
    expect(a.kpis.coursesCount).toBeGreaterThanOrEqual(1);
    expect(a.kpis.questionsCount).toBeGreaterThanOrEqual(0);

    // Performance rollup, fixed ordinal order.
    expect(a.performance.map((p) => p.name)).toEqual(["Excellent", "Very Good", "Good", "Poor"]);
    const perf = Object.fromEntries(a.performance.map((p) => [p.name, p.value]));
    expect(perf).toMatchObject({ Excellent: 1, "Very Good": 0, Good: 1, Poor: 1 });

    // Average score by level (basic = avg 0.95,0.30 = 62.5 → 63; medium = 60).
    const byLevel = Object.fromEntries(a.avgByLevel.map((l) => [l.name, l.value]));
    expect(byLevel.basic).toBe(63);
    expect(byLevel.medium).toBe(60);

    // Continuous, zero-filled series that sums to the fixture totals.
    expect(a.enrolments.length).toBeGreaterThan(0);
    expect(a.enrolments.every((p) => typeof p.value === "number")).toBe(true);
    expect(a.enrolments.reduce((s, p) => s + p.value, 0)).toBe(3);
    expect(a.attempts.reduce((s, p) => s + p.value, 0)).toBe(3);

    // Course activity includes our course with its 3-student cohort.
    const mine = a.topCourses.find((c) => c.name === `Course ${STAMP}`);
    expect(mine?.value).toBe(3);

    // New analytics surfaces (Phase 3).
    expect(a.watchCompletion.map((w) => w.name)).toEqual([
      "Fully watched",
      "Skipped ahead",
      "In progress",
    ]);
    // Top students by avg score: S1 (avg 0.95,0.60 = 78%) ranks above S2 (30%).
    expect(a.topStudents.length).toBeGreaterThanOrEqual(2);
    expect(a.topStudents[0].value).toBeGreaterThanOrEqual(a.topStudents[1].value);
    expect(a.topStudents[0].value).toBe(78);
    expect(Array.isArray(a.watchByCourse)).toBe(true);
    expect(Array.isArray(a.topDownloads)).toBe(true);
    expect(typeof a.kpis.watchMinutes).toBe("number");
    expect(typeof a.kpis.downloads).toBe("number");
  });

  it("drill-down date filter derives window + granularity", () => {
    const thisYear = new Date().getUTCFullYear();
    // Default = current year, monthly.
    const d = parseAnalyticsFilters({});
    expect(d.year).toBe(thisYear);
    expect(d.granularity).toBe("month");

    expect(parseAnalyticsFilters({ year: "all" }).granularity).toBe("year");
    expect(parseAnalyticsFilters({ year: "2024" }).granularity).toBe("month");

    // Year + month → that month by day.
    const m = parseAnalyticsFilters({ year: "2024", month: "7" });
    expect(m.granularity).toBe("day");
    expect(m.from.toISOString().slice(0, 10)).toBe("2024-07-01");
    expect(m.to.toISOString().slice(0, 10)).toBe("2024-08-01");

    // Year + month + day → a single day.
    const day = parseAnalyticsFilters({ year: "2024", month: "7", day: "15" });
    expect(day.from.toISOString().slice(0, 10)).toBe("2024-07-15");
    expect(day.to.toISOString().slice(0, 10)).toBe("2024-07-16");

    // Invalid pieces fall back safely (bad month ignored → whole year).
    expect(parseAnalyticsFilters({ year: "2024", month: "99" }).month).toBeNull();

    // Course + batch filters.
    expect(parseAnalyticsFilters({ course: "all" }).courseId).toBeNull();
    expect(parseAnalyticsFilters({ course: "c123" }).courseId).toBe("c123");
    expect(parseAnalyticsFilters({ batch: "b1" }).batchId).toBe("b1");
  });
});
