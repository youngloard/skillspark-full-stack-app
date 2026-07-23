import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getStudentDashboard } from "./student-dashboard";
import { db } from "./db";

// M4-S1 integration tests: the three grant-state variants + continue-learning,
// all through getStudentDashboard against the real DB. The JET exam is the
// seeded `slug: "jet"` row.

const STAMP = `m4s1-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let studentId: string;
let batchId: string;
let courseAId: string;
let courseBId: string;
let courseCId: string; // never granted (accessibility filter)
let jetExamId: string;

async function grantCourses(...courseIds: string[]) {
  await db.batchCourse.deleteMany({ where: { batchId } });
  if (courseIds.length) {
    await db.batchCourse.createMany({ data: courseIds.map((courseId) => ({ batchId, courseId })) });
  }
}
async function grantJet(on: boolean) {
  await db.batchExam.deleteMany({ where: { batchId } });
  if (on) await db.batchExam.create({ data: { batchId, examId: jetExamId } });
}

beforeAll(async () => {
  const window = {
    accessStartDate: new Date(Date.now() - 86_400_000),
    accessEndDate: new Date(Date.now() + 86_400_000),
  };
  studentId = (
    await db.student.create({
      data: { name: "Dash Student", email: `s-${STAMP}@test.skillspark.local`, ...window },
    })
  ).id;
  courseAId = (await db.course.create({ data: { name: `A ${STAMP}`, layout: "flat" } })).id;
  courseBId = (await db.course.create({ data: { name: `B ${STAMP}` } })).id;
  courseCId = (await db.course.create({ data: { name: `C ${STAMP}`, layout: "flat" } })).id;
  batchId = (
    await db.batch.create({
      data: {
        batchCode: `DB-${STAMP}`,
        batchName: "Dash Batch",
        studentBatches: { create: { studentId } },
      },
    })
  ).id;
  jetExamId = (await db.exam.findUniqueOrThrow({ where: { slug: "jet" } })).id;
});

beforeEach(async () => {
  await grantCourses();
  await grantJet(false);
  await db.videoProgress.deleteMany({ where: { studentId } });
});

afterAll(async () => {
  await db.videoProgress.deleteMany({ where: { studentId } });
  await db.batch.deleteMany({ where: { batchCode: { contains: STAMP } } });
  await db.course.deleteMany({ where: { name: { contains: STAMP } } });
  await db.student.deleteMany({ where: { email: { contains: STAMP } } });
  await db.$disconnect();
});

describe("student dashboard", () => {
  it("both-state", async () => {
    await grantCourses(courseAId, courseBId);
    await grantJet(true);
    const dash = await getStudentDashboard(studentId);
    expect(dash.courses.map((c) => c.id).sort()).toEqual([courseAId, courseBId].sort());
    expect(dash.jetExam?.id).toBe(jetExamId);
  });

  it("course-progress: reflects completed videos per course", async () => {
    await grantCourses(courseAId);
    const [v1, v2] = await Promise.all([
      db.contentItem.create({
        data: {
          type: "video",
          title: "P1",
          courseId: courseAId,
          driveFileId: "pg1",
          duration: 100,
        },
      }),
      db.contentItem.create({
        data: {
          type: "video",
          title: "P2",
          courseId: courseAId,
          driveFileId: "pg2",
          duration: 100,
        },
      }),
    ]);
    await db.videoProgress.create({
      data: { studentId, itemId: v1.id, positionSeconds: 100, completed: true },
    });
    await db.videoProgress.create({
      data: { studentId, itemId: v2.id, positionSeconds: 20, completed: false },
    });

    const dash = await getStudentDashboard(studentId);
    expect(dash.courseProgress[courseAId]).toEqual({ total: 2, completed: 1, percent: 50 });
  });

  it("courses-only-state", async () => {
    await grantCourses(courseAId);
    await grantJet(false);
    const dash = await getStudentDashboard(studentId);
    expect(dash.courses.map((c) => c.id)).toEqual([courseAId]);
    expect(dash.jetExam).toBeNull();
  });

  it("exam-only-state", async () => {
    await grantCourses();
    await grantJet(true);
    const dash = await getStudentDashboard(studentId);
    expect(dash.courses).toEqual([]);
    expect(dash.jetExam?.id).toBe(jetExamId);
  });

  it("nothing-state: no courses, no exam", async () => {
    const dash = await getStudentDashboard(studentId);
    expect(dash.courses).toEqual([]);
    expect(dash.jetExam).toBeNull();
    expect(dash.continueLearning).toBeNull();
  });

  it("resume-links-latest-incomplete", async () => {
    await grantCourses(courseAId); // courseA accessible; courseC never granted
    const [item1, item2, itemDone, itemInaccessible] = await Promise.all([
      db.contentItem.create({
        data: { type: "video", title: "Lesson 1", courseId: courseAId, driveFileId: "d1" },
      }),
      db.contentItem.create({
        data: { type: "video", title: "Lesson 2", courseId: courseAId, driveFileId: "d2" },
      }),
      db.contentItem.create({
        data: { type: "video", title: "Done", courseId: courseAId, driveFileId: "d3" },
      }),
      db.contentItem.create({
        data: { type: "video", title: "Locked", courseId: courseCId, driveFileId: "d4" },
      }),
    ]);

    // Two incomplete (item1 older, item2 newer), one completed, one in an
    // inaccessible course but most-recently touched.
    await db.videoProgress.create({
      data: { studentId, itemId: item1.id, positionSeconds: 30, completed: false },
    });
    const p2 = await db.videoProgress.create({
      data: { studentId, itemId: item2.id, positionSeconds: 90, completed: false },
    });
    await db.videoProgress.create({
      data: { studentId, itemId: itemDone.id, positionSeconds: 600, completed: true },
    });
    await db.videoProgress.create({
      data: { studentId, itemId: itemInaccessible.id, positionSeconds: 10, completed: false },
    });
    // Bump item2 to be the most-recently-updated of the accessible incompletes.
    await db.videoProgress.update({ where: { id: p2.id }, data: { positionSeconds: 95 } });

    const dash = await getStudentDashboard(studentId);
    expect(dash.continueLearning).not.toBeNull();
    expect(dash.continueLearning?.itemId).toBe(item2.id);
    expect(dash.continueLearning?.itemTitle).toBe("Lesson 2");
    expect(dash.continueLearning?.courseId).toBe(courseAId);
    expect(dash.continueLearning?.positionSeconds).toBe(95);
  }, 30_000);

  it("completed-only → no continue-learning", async () => {
    await grantCourses(courseAId);
    const item = await db.contentItem.create({
      data: { type: "video", title: "Only", courseId: courseAId, driveFileId: "d9" },
    });
    await db.videoProgress.create({
      data: { studentId, itemId: item.id, positionSeconds: 300, completed: true },
    });
    const dash = await getStudentDashboard(studentId);
    expect(dash.continueLearning).toBeNull();
  });
});
