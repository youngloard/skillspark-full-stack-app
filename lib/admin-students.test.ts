import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getStudentReport, listStudents, searchStudents } from "./admin-students";
import { db } from "./db";

const STAMP = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const now = new Date();
const win = {
  accessStartDate: new Date(now.getTime() - 30 * 86_400_000),
  accessEndDate: new Date(now.getTime() + 30 * 86_400_000),
};

let aId = "";
let examId = "";
const courseName = `Course ${STAMP}`;

beforeAll(async () => {
  const exam = await db.exam.create({ data: { slug: `exam-${STAMP}`, name: `Exam ${STAMP}` } });
  examId = exam.id;
  const course = await db.course.create({ data: { name: courseName } });
  const batch = await db.batch.create({
    data: { batchCode: `B-${STAMP}`, batchName: `Batch ${STAMP}` },
  });
  await db.batchCourse.create({ data: { batchId: batch.id, courseId: course.id } });

  const a = await db.student.create({
    data: {
      name: `Alpha ${STAMP}`,
      email: `alpha-${STAMP}@test.skillspark.local`,
      studentCode: `CODE-${STAMP}-A`,
      createdAt: new Date(now.getTime() - 3 * 86_400_000),
      ...win,
    },
  });
  aId = a.id;
  await db.student.create({
    data: {
      name: `Beta ${STAMP}`,
      email: `beta-${STAMP}@test.skillspark.local`,
      status: "blocked",
      createdAt: new Date(now.getTime() - 2 * 86_400_000),
      ...win,
    },
  });
  await db.student.create({
    data: {
      name: `Gamma ${STAMP}`,
      email: `gamma-${STAMP}@test.skillspark.local`,
      createdAt: new Date(now.getTime() - 1 * 86_400_000),
      ...win,
    },
  });
  await db.studentBatch.create({ data: { studentId: a.id, batchId: batch.id } });

  const mk = (pct: number, label: string) =>
    db.attempt.create({
      data: {
        quizId: `q-${STAMP}-${pct}`,
        studentId: a.id,
        examId,
        level: "basic",
        score: Math.round(pct * 10),
        totalQuestions: 10,
        percentage: pct,
        performanceLabel: label,
        resultsJson: {},
      },
    });
  await mk(0.95, "Excellent");
  await mk(0.3, "Poor");
});

afterAll(async () => {
  await db.student.deleteMany({ where: { email: { contains: STAMP } } });
  await db.batch.deleteMany({ where: { batchCode: { contains: STAMP } } });
  await db.course.deleteMany({ where: { name: { contains: STAMP } } });
  await db.exam.deleteMany({ where: { slug: { contains: STAMP } } });
  await db.$disconnect();
});

describe("admin students list", () => {
  it("filters-compose (search + status + pagination)", async () => {
    // Search by the shared stamp → all three, newest first.
    const all = await listStudents({ q: STAMP });
    expect(all.items).toHaveLength(3);
    expect(all.items[0].name).toBe(`Gamma ${STAMP}`); // most recent createdAt

    // Status narrows.
    const blocked = await listStudents({ q: STAMP, status: "blocked" });
    expect(blocked.items).toHaveLength(1);
    expect(blocked.items[0].name).toBe(`Beta ${STAMP}`);

    // Search by student code hits exactly one.
    const byCode = await listStudents({ q: `CODE-${STAMP}-A` });
    expect(byCode.items).toHaveLength(1);
    expect(byCode.items[0].name).toBe(`Alpha ${STAMP}`);

    // Page-number pagination: page of 2, then the rest.
    const p1 = await listStudents({ q: STAMP, take: 2 });
    expect(p1.items).toHaveLength(2);
    expect(p1.total).toBe(3);
    expect(p1.page).toBe(1);
    expect(p1.pageCount).toBe(2);
    const p2 = await listStudents({ q: STAMP, take: 2, page: 2 });
    expect(p2.items).toHaveLength(1);
    expect(p2.page).toBe(2);
    // No overlap between pages.
    const ids = new Set(p1.items.map((s) => s.id));
    expect(ids.has(p2.items[0].id)).toBe(false);
  });

  it("searchStudents returns short hits, empty for blank", async () => {
    expect(await searchStudents("")).toEqual([]);
    const hits = await searchStudents(`alpha-${STAMP}`);
    expect(hits).toHaveLength(1);
    expect(hits[0].studentCode).toBe(`CODE-${STAMP}-A`);
  });

  it("getStudentReport aggregates the student's exam history", async () => {
    const report = await getStudentReport(aId);
    expect(report).not.toBeNull();
    expect(report!.kpis.attempts).toBe(2);
    // avg of 0.95, 0.30 = 0.625 → 63%
    expect(report!.kpis.avgScorePct).toBe(63);
    expect(report!.kpis.bestScorePct).toBe(95);
    // one of two attempts is above Poor → 50%
    expect(report!.kpis.passRatePct).toBe(50);
    expect(report!.performance.map((p) => p.name)).toEqual([
      "Excellent",
      "Very Good",
      "Good",
      "Poor",
    ]);
    expect(report!.courses.map((c) => c.name)).toContain(courseName);
    expect(report!.scoreSeries).toHaveLength(2);
  });

  it("getStudentReport returns null for a missing student", async () => {
    expect(await getStudentReport("does-not-exist")).toBeNull();
  });
});
