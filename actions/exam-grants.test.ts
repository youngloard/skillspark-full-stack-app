import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// M3-S4 integration tests: grants + hasExamAccess/getAccessibleExams,
// real DB. Object-side contract mirrors lib/course-access.test.ts.

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T>(fn: T) => fn };
});

const actions = await import("./exam-grants");
const { getAccessibleExams, hasExamAccess } = await import("@/lib/exam-access");
const { db } = await import("@/lib/db");

const STAMP = `m3s4-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const DAY = 86_400_000;

let adminId: string;
let adminEmail: string;
let studentId: string;
let batchId: string;
let examA: string;
let examB: string;
let examInactive: string;

beforeAll(async () => {
  adminEmail = `admin-${STAMP}@test.skillspark.local`;
  adminId = (await db.admin.create({ data: { name: "Grant Admin", email: adminEmail } })).id;
  studentId = (
    await db.student.create({
      data: {
        name: "Grant Student",
        email: `s-${STAMP}@test.skillspark.local`,
        accessStartDate: new Date(Date.now() - DAY),
        accessEndDate: new Date(Date.now() + DAY),
      },
    })
  ).id;
  batchId = (
    await db.batch.create({
      data: {
        batchCode: `GB-${STAMP}`,
        batchName: "Grant Batch",
        studentBatches: { create: { studentId } },
      },
    })
  ).id;
  examA = (await db.exam.create({ data: { slug: `ga-${STAMP}`, name: `Exam A ${STAMP}` } })).id;
  examB = (await db.exam.create({ data: { slug: `gb-${STAMP}`, name: `Exam B ${STAMP}` } })).id;
  examInactive = (
    await db.exam.create({
      data: { slug: `gi-${STAMP}`, name: `Exam I ${STAMP}`, status: "inactive" },
    })
  ).id;
});

beforeEach(() => {
  mockAuth.mockReset();
  mockAuth.mockResolvedValue({ user: { role: "admin", adminId, email: adminEmail } });
});

afterAll(async () => {
  await db.batch.deleteMany({ where: { batchCode: { contains: STAMP } } });
  await db.exam.deleteMany({ where: { slug: { contains: STAMP } } });
  await db.student.deleteMany({ where: { email: { contains: STAMP } } });
  await db.auditLog.deleteMany({ where: { actorEmail: adminEmail } });
  await db.admin.deleteMany({ where: { email: adminEmail } });
  await db.$disconnect();
});

describe("exam grants + access", () => {
  it("no-grants-no-access", async () => {
    expect(await hasExamAccess(studentId, examA)).toBe(false);
    expect(await hasExamAccess(studentId, "nonexistent")).toBe(false);
    expect(await getAccessibleExams(studentId)).toEqual([]);
  });

  it("batch-grant-gives-access", async () => {
    const granted = await actions.grantExamToBatch({ batchId, examId: examA });
    expect(granted).toMatchObject({ ok: true });
    expect(await hasExamAccess(studentId, examA)).toBe(true);

    // Duplicate grant → stable CONFLICT (M3-S1 assignment semantics).
    const dup = await actions.grantExamToBatch({ batchId, examId: examA });
    expect(dup).toMatchObject({ ok: false, error: { code: "CONFLICT" } });

    // Inactive exam: grant exists but access stays closed.
    await actions.grantExamToBatch({ batchId, examId: examInactive });
    expect(await hasExamAccess(studentId, examInactive)).toBe(false);
  });

  it("individual-window-respected", async () => {
    // Future window → not yet accessible.
    const future = await actions.grantExamToStudent({
      studentId,
      examId: examB,
      accessStartDate: new Date(Date.now() + DAY),
      accessEndDate: new Date(Date.now() + 10 * DAY),
    });
    expect(future).toMatchObject({ ok: true });
    expect(await hasExamAccess(studentId, examB)).toBe(false);

    // Re-grant with a live window (upsert) → accessible; audited as change.
    await actions.grantExamToStudent({
      studentId,
      examId: examB,
      accessStartDate: new Date(Date.now() - DAY),
      accessEndDate: new Date(Date.now() + DAY),
    });
    expect(await hasExamAccess(studentId, examB)).toBe(true);
    expect(await db.studentExam.count({ where: { studentId, examId: examB } })).toBe(1);

    // Expired window → closed again.
    await actions.grantExamToStudent({
      studentId,
      examId: examB,
      accessStartDate: new Date(Date.now() - 10 * DAY),
      accessEndDate: new Date(Date.now() - DAY),
    });
    expect(await hasExamAccess(studentId, examB)).toBe(false);

    // Open-ended (no dates) → accessible.
    await actions.grantExamToStudent({ studentId, examId: examB });
    expect(await hasExamAccess(studentId, examB)).toBe(true);

    // Inverted window → VALIDATION (schema + DB CHECK behind it).
    const inverted = await actions.grantExamToStudent({
      studentId,
      examId: examB,
      accessStartDate: new Date(Date.now() + DAY),
      accessEndDate: new Date(Date.now() - DAY),
    });
    expect(inverted).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  }, 30_000);

  it("union-of-both-paths and revoke-individual-keeps-batch-path", async () => {
    // examA via batch (from earlier test) + examB via individual grant.
    const exams = await getAccessibleExams(studentId);
    const ids = exams.map((e) => e.id);
    expect(ids).toContain(examA);
    expect(ids).toContain(examB);
    expect(ids).not.toContain(examInactive);

    // Grant examA individually TOO — union stays deduped.
    await actions.grantExamToStudent({ studentId, examId: examA });
    const deduped = await getAccessibleExams(studentId);
    expect(deduped.filter((e) => e.id === examA)).toHaveLength(1);

    // Revoking the individual grant leaves the batch path intact.
    const revoked = await actions.revokeExamFromStudent({ studentId, examId: examA });
    expect(revoked).toMatchObject({ ok: true });
    expect(await hasExamAccess(studentId, examA)).toBe(true);

    // Revoking the batch grant then closes it fully.
    await actions.revokeExamFromBatch({ batchId, examId: examA });
    expect(await hasExamAccess(studentId, examA)).toBe(false);
  }, 30_000);

  it("grants audited; no-op revokes not audited; admin required", async () => {
    const rows = await db.auditLog.findMany({ where: { actorEmail: adminEmail } });
    const actionNames = new Set(rows.map((r) => r.action));
    for (const expected of [
      "BATCH_EXAM_GRANTED",
      "BATCH_EXAM_REVOKED",
      "STUDENT_EXAM_GRANTED",
      "STUDENT_EXAM_WINDOW_CHANGED",
      "STUDENT_EXAM_REVOKED",
    ]) {
      expect(actionNames, `missing audit action ${expected}`).toContain(expected);
    }

    const before = await db.auditLog.count({
      where: { actorEmail: adminEmail, action: "STUDENT_EXAM_REVOKED" },
    });
    await actions.revokeExamFromStudent({ studentId, examId: "never-granted" });
    const after = await db.auditLog.count({
      where: { actorEmail: adminEmail, action: "STUDENT_EXAM_REVOKED" },
    });
    expect(after).toBe(before);

    mockAuth.mockResolvedValue(null);
    const unauthenticated = await Promise.all([
      actions.grantExamToBatch({ batchId: "x", examId: "x" }),
      actions.revokeExamFromBatch({ batchId: "x", examId: "x" }),
      actions.grantExamToStudent({ studentId: "x", examId: "x" }),
      actions.revokeExamFromStudent({ studentId: "x", examId: "x" }),
    ]);
    for (const result of unauthenticated) {
      expect(result).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    }
  });
});
