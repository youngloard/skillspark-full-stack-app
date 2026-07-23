import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { importStudentRows } from "@/lib/student-import-run";
import type { ParsedRow } from "@/lib/student-import";

const STAMP = `student-import-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

function row(suffix: string, batchName: string | null, courseName: string | null): ParsedRow {
  return {
    email: `${suffix}-${STAMP}@test.skillspark.local`,
    code: `${suffix}-${STAMP}`,
    name: `Import ${suffix}`,
    batchName,
    courseNames: courseName ? [courseName] : [],
    error: null,
  };
}

afterAll(async () => {
  await db.student.deleteMany({ where: { email: { contains: STAMP } } });
  await db.batch.deleteMany({
    where: {
      OR: [{ batchCode: { contains: STAMP } }, { batchName: { contains: STAMP } }],
    },
  });
  await db.course.deleteMany({ where: { name: { contains: STAMP } } });
  await db.$disconnect();
});

describe("student import fallbacks", () => {
  it("fills blank cells without replacing batch or course values from the file", async () => {
    const fallbackBatch = await db.batch.create({
      data: { batchCode: `fallback-${STAMP}`, batchName: `Fallback Batch ${STAMP}` },
    });
    const fallbackCourse = await db.course.create({
      data: { name: `Fallback Course ${STAMP}` },
    });
    const fileBatchName = `File Batch ${STAMP}`;
    const fileCourseName = `File Course ${STAMP}`;
    const fileBatchMissingCourseName = `File Batch Missing Course ${STAMP}`;

    const outcomes = await importStudentRows(
      [
        row("blank", null, null),
        row("file-values", fileBatchName, fileCourseName),
        row("file-batch", fileBatchMissingCourseName, null),
      ],
      { batchId: fallbackBatch.id, courseIds: [fallbackCourse.id] },
    );

    expect(outcomes).toEqual([
      expect.objectContaining({ status: "created" }),
      expect.objectContaining({ status: "created" }),
      expect.objectContaining({ status: "created" }),
    ]);

    const students = await db.student.findMany({
      where: { email: { contains: STAMP } },
      include: { studentBatches: { include: { batch: true } } },
    });
    const batchByEmail = new Map(
      students.map((student) => [student.email, student.studentBatches[0]?.batch.batchName]),
    );
    expect(batchByEmail.get(`blank-${STAMP}@test.skillspark.local`)).toBe(fallbackBatch.batchName);
    expect(batchByEmail.get(`file-values-${STAMP}@test.skillspark.local`)).toBe(fileBatchName);
    expect(batchByEmail.get(`file-batch-${STAMP}@test.skillspark.local`)).toBe(
      fileBatchMissingCourseName,
    );

    const batches = await db.batch.findMany({
      where: {
        OR: [
          { id: fallbackBatch.id },
          { batchName: { in: [fileBatchName, fileBatchMissingCourseName] } },
        ],
      },
      include: { batchCourses: { include: { course: true } } },
    });
    const courseByBatch = new Map(
      batches.map((batch) => [batch.batchName, batch.batchCourses[0]?.course.name]),
    );
    expect(courseByBatch.get(fallbackBatch.batchName)).toBe(fallbackCourse.name);
    expect(courseByBatch.get(fileBatchName)).toBe(fileCourseName);
    expect(courseByBatch.get(fileBatchMissingCourseName)).toBe(fallbackCourse.name);
  }, 30_000);

  it("rejects a fallback selection that was deleted before the import starts", async () => {
    await expect(
      importStudentRows([row("stale", null, null)], { batchId: `missing-${STAMP}` }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "The selected fallback batch no longer exists.",
    });
  });
});
