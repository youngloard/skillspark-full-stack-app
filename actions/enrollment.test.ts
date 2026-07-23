import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// M3-S1 integration tests: batch CRUD + assignment mappings, real DB.

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T>(fn: T) => fn };
});

const batches = await import("./batches");
const { db } = await import("@/lib/db");

const STAMP = `m3s1-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let adminId: string;
let adminEmail: string;
let studentId: string;
let courseId: string;

function expectOk<T>(result: { ok: boolean }): asserts result is { ok: true; data: T } {
  expect(result).toMatchObject({ ok: true });
}

beforeAll(async () => {
  adminEmail = `admin-${STAMP}@test.skillspark.local`;
  const admin = await db.admin.create({ data: { name: "Enroll Admin", email: adminEmail } });
  adminId = admin.id;
  const student = await db.student.create({
    data: {
      name: "Enroll Student",
      email: `student-${STAMP}@test.skillspark.local`,
      accessStartDate: new Date(Date.now() - 86_400_000),
      accessEndDate: new Date(Date.now() + 86_400_000),
    },
  });
  studentId = student.id;
  const course = await db.course.create({ data: { name: `Course ${STAMP}` } });
  courseId = course.id;
});

beforeEach(() => {
  mockAuth.mockReset();
  mockAuth.mockResolvedValue({ user: { role: "admin", adminId, email: adminEmail } });
});

afterAll(async () => {
  await db.batch.deleteMany({ where: { batchCode: { contains: STAMP } } });
  await db.course.deleteMany({ where: { name: { contains: STAMP } } });
  await db.student.deleteMany({ where: { email: { contains: STAMP } } });
  await db.auditLog.deleteMany({ where: { actorEmail: adminEmail } });
  await db.admin.deleteMany({ where: { email: adminEmail } });
  await db.$disconnect();
});

describe("enrollment actions", () => {
  it("batchcode-unique", async () => {
    const first = await batches.createBatch({
      batchCode: `CODE-${STAMP}`,
      batchName: "Batch One",
    });
    expectOk(first);

    const dup = await batches.createBatch({
      batchCode: `CODE-${STAMP}`,
      batchName: "Batch Two",
    });
    expect(dup).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", fields: { batchCode: "Already in use" } },
    });

    // Invalid charset rejected with the field named.
    const bad = await batches.createBatch({ batchCode: "no/slashes", batchName: "X" });
    expect(bad).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  });

  it("create with initial courses is transactional", async () => {
    // A bad course id must roll back the batch row too.
    const failed = await batches.createBatch({
      batchCode: `TX-${STAMP}`,
      batchName: "Tx Batch",
      courseIds: ["nonexistent-course"],
    });
    expect(failed).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await db.batch.findUnique({ where: { batchCode: `TX-${STAMP}` } })).toBeNull();

    // A good course list lands both rows.
    const created = await batches.createBatch({
      batchCode: `TX2-${STAMP}`,
      batchName: "Tx Batch 2",
      courseIds: [courseId],
    });
    expectOk<{ id: string }>(created);
    const links = await db.batchCourse.count({ where: { batchId: created.data.id } });
    expect(links).toBe(1);
  });

  it("dup-assignment-idempotent-error-shape", async () => {
    const batch = await batches.createBatch({
      batchCode: `DUP-${STAMP}`,
      batchName: "Dup Batch",
    });
    expectOk<{ id: string }>(batch);
    const batchId = batch.data.id;

    const first = await batches.assignStudentToBatch({ studentId, batchId });
    expect(first).toMatchObject({ ok: true });
    // Second identical assign: stable CONFLICT the caller can treat as done.
    const second = await batches.assignStudentToBatch({ studentId, batchId });
    expect(second).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", message: "This student is already in the batch" },
    });
    // Exactly one row survived the pair.
    expect(await db.studentBatch.count({ where: { studentId, batchId } })).toBe(1);

    // Same contract for course assignment.
    await batches.assignCourseToBatch({ batchId, courseId });
    const dupCourse = await batches.assignCourseToBatch({ batchId, courseId });
    expect(dupCourse).toMatchObject({ ok: false, error: { code: "CONFLICT" } });

    // Unknown targets -> NOT_FOUND, not INTERNAL.
    const ghost = await batches.assignStudentToBatch({ studentId: "ghost", batchId });
    expect(ghost).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("assign-remove-audited", async () => {
    const batch = await batches.createBatch({
      batchCode: `AUD-${STAMP}`,
      batchName: "Audit Batch",
    });
    expectOk<{ id: string }>(batch);
    const batchId = batch.data.id;

    await batches.assignStudentToBatch({ studentId, batchId });
    await batches.removeStudentFromBatch({ studentId, batchId });
    await batches.assignCourseToBatch({ batchId, courseId });
    await batches.removeCourseFromBatch({ batchId, courseId });
    await batches.updateBatch({ id: batchId, batchName: "Audit Batch v2" });
    await batches.deleteBatch({ id: batchId });

    const rows = await db.auditLog.findMany({ where: { actorEmail: adminEmail } });
    const actions = new Set(rows.map((r) => r.action));
    for (const expected of [
      "BATCH_CREATED",
      "BATCH_UPDATED",
      "BATCH_DELETED",
      "STUDENT_BATCH_ASSIGNED",
      "STUDENT_BATCH_REMOVED",
      "BATCH_COURSE_ASSIGNED",
      "BATCH_COURSE_REMOVED",
    ]) {
      expect(actions, `missing audit action ${expected}`).toContain(expected);
    }

    // Removing what isn't there: ok (idempotent) but NOT audited again.
    const before = await db.auditLog.count({
      where: { actorEmail: adminEmail, action: "STUDENT_BATCH_REMOVED" },
    });
    const noop = await batches.removeStudentFromBatch({ studentId, batchId: "gone" });
    expect(noop).toMatchObject({ ok: true });
    const after = await db.auditLog.count({
      where: { actorEmail: adminEmail, action: "STUDENT_BATCH_REMOVED" },
    });
    expect(after).toBe(before);
  }, 30_000);

  it("delete-batch-cascades-assignments-only", async () => {
    const batch = await batches.createBatch({
      batchCode: `DEL-${STAMP}`,
      batchName: "Del Batch",
      courseIds: [courseId],
    });
    expectOk<{ id: string }>(batch);
    await batches.assignStudentToBatch({ studentId, batchId: batch.data.id });

    const deleted = await batches.deleteBatch({ id: batch.data.id });
    expect(deleted).toMatchObject({ ok: true });

    // Assignment rows gone; the student and course themselves untouched.
    expect(await db.studentBatch.count({ where: { batchId: batch.data.id } })).toBe(0);
    expect(await db.batchCourse.count({ where: { batchId: batch.data.id } })).toBe(0);
    expect(await db.student.findUnique({ where: { id: studentId } })).not.toBeNull();
    expect(await db.course.findUnique({ where: { id: courseId } })).not.toBeNull();

    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: "BATCH_DELETED", entityId: batch.data.id },
    });
    expect(audit.oldValue).toMatchObject({ studentCount: 1, courseCount: 1 });
  });

  it("all enrollment actions require admin", async () => {
    mockAuth.mockResolvedValue(null);
    const calls = [
      batches.createBatch({ batchCode: "X", batchName: "X" }),
      batches.updateBatch({ id: "x", batchName: "X" }),
      batches.deleteBatch({ id: "x" }),
      batches.assignStudentToBatch({ studentId: "x", batchId: "x" }),
      batches.removeStudentFromBatch({ studentId: "x", batchId: "x" }),
      batches.assignCourseToBatch({ batchId: "x", courseId: "x" }),
      batches.removeCourseFromBatch({ batchId: "x", courseId: "x" }),
    ];
    for (const result of await Promise.all(calls)) {
      expect(result).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    }
  });
});
