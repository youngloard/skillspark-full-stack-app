import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getBatchDetail, listBatches } from "./admin-batches";
import * as batches from "./batches";
import { grantExamToBatch, revokeExamFromBatch } from "./exam-grants";
import { db } from "./db";

const STAMP = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let batchId = "";
let courseId = "";
let examId = "";
let studentId = "";

beforeAll(async () => {
  const exam = await db.exam.create({ data: { slug: `exam-${STAMP}`, name: `Exam ${STAMP}` } });
  examId = exam.id;
  const course = await db.course.create({ data: { name: `Course ${STAMP}` } });
  courseId = course.id;
  const batch = await db.batch.create({
    data: { batchCode: `B-${STAMP}`, batchName: `Batch ${STAMP}` },
  });
  batchId = batch.id;
  const student = await db.student.create({
    data: {
      name: `Stud ${STAMP}`,
      email: `stud-${STAMP}@test.skillspark.local`,
      accessStartDate: new Date(Date.now() - 86_400_000),
      accessEndDate: new Date(Date.now() + 86_400_000),
    },
  });
  studentId = student.id;
});

afterAll(async () => {
  await db.student.deleteMany({ where: { email: { contains: STAMP } } });
  await db.batch.deleteMany({ where: { batchCode: { contains: STAMP } } });
  await db.course.deleteMany({ where: { name: { contains: STAMP } } });
  await db.exam.deleteMany({ where: { slug: { contains: STAMP } } });
  await db.$disconnect();
});

describe("admin batches", () => {
  it("course-and-exam-assignment-roundtrip", async () => {
    const before = await getBatchDetail(batchId);
    expect(before?.courses).toHaveLength(0);
    expect(before?.exams).toHaveLength(0);
    expect(before?.students).toHaveLength(0);

    await batches.assignCourseToBatch(batchId, courseId);
    await grantExamToBatch(batchId, examId);
    await batches.assignStudentToBatch(studentId, batchId);

    const after = await getBatchDetail(batchId);
    expect(after?.courses.map((c) => c.id)).toEqual([courseId]);
    expect(after?.exams.map((e) => e.id)).toEqual([examId]);
    expect(after?.students.map((s) => s.id)).toEqual([studentId]);
    expect(after?.studentCount).toBe(1);

    // Removal round-trips back to empty.
    await batches.removeCourseFromBatch(batchId, courseId);
    await revokeExamFromBatch(batchId, examId);
    await batches.removeStudentFromBatch(studentId, batchId);

    const cleared = await getBatchDetail(batchId);
    expect(cleared?.courses).toHaveLength(0);
    expect(cleared?.exams).toHaveLength(0);
    expect(cleared?.students).toHaveLength(0);
  });

  it("listBatches searches by code and name", async () => {
    const byStamp = await listBatches({ q: STAMP });
    expect(byStamp.items.some((b) => b.id === batchId)).toBe(true);

    const byCode = await listBatches({ q: `B-${STAMP}` });
    expect(byCode.items.map((b) => b.id)).toContain(batchId);

    const byName = await listBatches({ q: `Batch ${STAMP}` });
    expect(byName.items.map((b) => b.id)).toContain(batchId);

    await expect(getBatchDetail("nope-not-real")).resolves.toBeNull();
  });
});
