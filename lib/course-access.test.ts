import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// M3-S3 integration tests against the real DB. Object-side helpers are the
// unit under test; expired-student-no-access drives the composed path
// (requireStudent gate → helper) with a mocked session.

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T>(fn: T) => fn };
});

const { canAccessCourse, canAccessItem, canAccessModule, getAccessibleCourses } =
  await import("./course-access");
const { requireStudent } = await import("./authorization");
const { db } = await import("./db");

const STAMP = `m3s3-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let studentId: string;
let outsiderId: string;
let courseA: string; // granted via batch 1 AND batch 2 (dedup case)
let courseB: string; // granted via batch 2
let courseHidden: string; // granted but inactive
let courseUngranted: string; // active, no grant (url-guess case)
let moduleA: string;
let videoA: string;
let materialInactive: string;
let attachmentA: string;

beforeAll(async () => {
  const window = {
    accessStartDate: new Date(Date.now() - 86_400_000),
    accessEndDate: new Date(Date.now() + 86_400_000),
  };
  const student = await db.student.create({
    data: { name: "Access Student", email: `s-${STAMP}@test.skillspark.local`, ...window },
  });
  studentId = student.id;
  const outsider = await db.student.create({
    data: { name: "Outsider", email: `o-${STAMP}@test.skillspark.local`, ...window },
  });
  outsiderId = outsider.id;

  const a = await db.course.create({
    data: {
      name: `A ${STAMP}`,
      modules: {
        create: { title: "M1" },
      },
    },
    include: { modules: true },
  });
  courseA = a.id;
  moduleA = a.modules[0]!.id;
  courseB = (await db.course.create({ data: { name: `B ${STAMP}` } })).id;
  courseHidden = (await db.course.create({ data: { name: `H ${STAMP}`, status: "inactive" } })).id;
  courseUngranted = (await db.course.create({ data: { name: `U ${STAMP}` } })).id;

  const video = await db.contentItem.create({
    data: { type: "video", title: "V", moduleId: moduleA, driveFileId: "d1" },
  });
  videoA = video.id;
  materialInactive = (
    await db.contentItem.create({
      data: {
        type: "material",
        title: "Inactive Mat",
        moduleId: moduleA,
        status: "inactive",
        sourceType: "url",
        externalUrl: "https://x.example/m.pdf",
      },
    })
  ).id;
  attachmentA = (
    await db.contentItem.create({
      data: {
        type: "material",
        title: "Attach",
        parentItemId: video.id,
        sourceType: "url",
        externalUrl: "https://x.example/a.pdf",
      },
    })
  ).id;

  // Batch 1: courseA + courseHidden. Batch 2: courseA (again) + courseB.
  await db.batch.create({
    data: {
      batchCode: `B1-${STAMP}`,
      batchName: "Batch 1",
      studentBatches: { create: { studentId } },
      batchCourses: { create: [{ courseId: courseA }, { courseId: courseHidden }] },
    },
  });
  await db.batch.create({
    data: {
      batchCode: `B2-${STAMP}`,
      batchName: "Batch 2",
      studentBatches: { create: { studentId } },
      batchCourses: { create: [{ courseId: courseA }, { courseId: courseB }] },
    },
  });
});

afterAll(async () => {
  await db.batch.deleteMany({ where: { batchCode: { contains: STAMP } } });
  await db.course.deleteMany({ where: { name: { contains: STAMP } } });
  await db.student.deleteMany({ where: { email: { contains: STAMP } } });
  await db.$disconnect();
});

describe("course access resolution", () => {
  it("union-across-batches-dedup", async () => {
    const courses = await getAccessibleCourses(studentId);
    const ids = courses.map((c) => c.id);
    // courseA granted twice → appears once; hidden course filtered out.
    expect(ids.filter((id) => id === courseA)).toHaveLength(1);
    expect(ids).toContain(courseB);
    expect(ids).not.toContain(courseHidden);
    expect(ids).not.toContain(courseUngranted);
    // Student with no batches sees nothing.
    expect(await getAccessibleCourses(outsiderId)).toEqual([]);
  });

  it("url-guess-403", async () => {
    // The gates every page calls: guessing an ungranted course/module/item id
    // resolves to false (the M4 pages turn that into 403/404, never data).
    expect(await canAccessCourse(studentId, courseUngranted)).toBe(false);
    expect(await canAccessCourse(outsiderId, courseA)).toBe(false);
    expect(await canAccessModule(outsiderId, moduleA)).toBe(false);
    expect(await canAccessItem(outsiderId, videoA)).toBe(false);
    expect(await canAccessCourse(studentId, "nonexistent-id")).toBe(false);
    // And the granted path answers true.
    expect(await canAccessCourse(studentId, courseA)).toBe(true);
    expect(await canAccessModule(studentId, moduleA)).toBe(true);
  });

  it("inactive-course-hidden", async () => {
    // Granted but inactive → invisible everywhere.
    expect(await canAccessCourse(studentId, courseHidden)).toBe(false);
    // Deactivating a granted course kills access without touching grants.
    await db.course.update({ where: { id: courseB }, data: { status: "inactive" } });
    expect(await canAccessCourse(studentId, courseB)).toBe(false);
    await db.course.update({ where: { id: courseB }, data: { status: "active" } });
    expect(await canAccessCourse(studentId, courseB)).toBe(true);
  });

  it("item-inherits-course-access", async () => {
    // Video in a granted course's module → accessible.
    expect(await canAccessItem(studentId, videoA)).toBe(true);
    // Attachment inherits from its parent video's course.
    expect(await canAccessItem(studentId, attachmentA)).toBe(true);
    // Inactive item is inaccessible even inside a granted course.
    expect(await canAccessItem(studentId, materialInactive)).toBe(false);
    // Inactive PARENT video blocks its (active) attachment.
    await db.contentItem.update({ where: { id: videoA }, data: { status: "inactive" } });
    expect(await canAccessItem(studentId, attachmentA)).toBe(false);
    expect(await canAccessItem(studentId, videoA)).toBe(false);
    await db.contentItem.update({ where: { id: videoA }, data: { status: "active" } });
    // Course deactivated → module and items go dark too.
    await db.course.update({ where: { id: courseA }, data: { status: "inactive" } });
    expect(await canAccessModule(studentId, moduleA)).toBe(false);
    expect(await canAccessItem(studentId, videoA)).toBe(false);
    await db.course.update({ where: { id: courseA }, data: { status: "active" } });
  }, 30_000);

  it("expired-student-no-access", async () => {
    // The composed path every student page runs: requireStudent gate first,
    // THEN the object helper. Expire the student mid-session and prove the
    // gate refuses before any object check could grant.
    mockAuth.mockResolvedValue({
      user: { role: "student", studentId, email: `s-${STAMP}@test.skillspark.local` },
    });
    const ctx = await requireStudent();
    expect(ctx.student.id).toBe(studentId);
    expect(await canAccessCourse(studentId, courseA)).toBe(true);

    await db.student.update({
      where: { id: studentId },
      data: { accessEndDate: new Date(Date.now() - 3_600_000) },
    });
    // Grants still exist (object half unchanged) — the gate is what denies.
    await expect(requireStudent()).rejects.toMatchObject({ code: "FORBIDDEN" });

    await db.student.update({
      where: { id: studentId },
      data: { accessEndDate: new Date(Date.now() + 86_400_000) },
    });
  });
});
