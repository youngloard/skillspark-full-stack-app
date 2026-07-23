import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// M3-S2 integration tests: student CRUD against the real DB, including the
// owner-raised Gmail-canonical duplicate guard and the M1 gate interplay.

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T>(fn: T) => fn };
});

const students = await import("./students");
const { requireStudent } = await import("@/lib/authorization");
const { db } = await import("@/lib/db");

const STAMP = `m3s2-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let adminId: string;
let adminEmail: string;

const window = () => ({
  accessStartDate: new Date(Date.now() - 86_400_000),
  accessEndDate: new Date(Date.now() + 30 * 86_400_000),
});

function expectOk<T>(result: { ok: boolean }): asserts result is { ok: true; data: T } {
  expect(result).toMatchObject({ ok: true });
}

beforeEach(async () => {
  if (!adminId) {
    adminEmail = `admin-${STAMP}@test.skillspark.local`;
    const admin = await db.admin.create({ data: { name: "Student Admin", email: adminEmail } });
    adminId = admin.id;
  }
  mockAuth.mockReset();
  mockAuth.mockResolvedValue({ user: { role: "admin", adminId, email: adminEmail } });
});

afterAll(async () => {
  await db.student.deleteMany({ where: { email: { contains: STAMP } } });
  await db.batch.deleteMany({ where: { batchCode: { contains: STAMP } } });
  await db.auditLog.deleteMany({ where: { actorEmail: adminEmail } });
  await db.admin.deleteMany({ where: { email: adminEmail } });
  await db.$disconnect();
});

describe("student actions", () => {
  it("create-normalizes-email-lowercase", async () => {
    const created = await students.createStudent({
      name: "Case Test",
      email: `  MiXeD.CaSe-${STAMP}@Test.Skillspark.LOCAL  `,
      ...window(),
    });
    expectOk<{ id: string }>(created);
    const row = await db.student.findUniqueOrThrow({ where: { id: created.data.id } });
    expect(row.email).toBe(`mixed.case-${STAMP}@test.skillspark.local`);

    // The stored lowercase form also blocks a differently-cased duplicate.
    const dup = await students.createStudent({
      name: "Case Dup",
      email: `MIXED.CASE-${STAMP}@test.skillspark.local`,
      ...window(),
    });
    expect(dup).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });

  it("gmail-dot-variant-duplicate-rejected", async () => {
    const base = await students.createStudent({
      name: "Lekshmi",
      email: `lekshmi.fr.${STAMP}@gmail.com`,
      ...window(),
    });
    expectOk<{ id: string }>(base);

    // Dot-variant (same letters, different dots) → same Gmail account →
    // rejected with the reason named on the email field.
    const dotVariant = await students.createStudent({
      name: "Lekshmi Variant",
      email: `lek.shmi.fr.${STAMP}@gmail.com`,
      ...window(),
    });
    expect(dotVariant).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", fields: { email: expect.stringContaining("Gmail") } },
    });

    // +tag variant of the same account → also rejected.
    const plusVariant = await students.createStudent({
      name: "Lekshmi Plus",
      email: `lekshmi.fr.${STAMP}+jet@gmail.com`,
      ...window(),
    });
    expect(plusVariant).toMatchObject({ ok: false, error: { code: "CONFLICT" } });

    // Same local pattern on a NON-Gmail domain is fine (dots significant).
    const nonGmail = await students.createStudent({
      name: "Non Gmail",
      email: `lekshmifr.${STAMP}@test.skillspark.local`,
      ...window(),
    });
    expect(nonGmail).toMatchObject({ ok: true });

    // Guard also applies when UPDATING an email onto a variant.
    if (!nonGmail.ok) return;
    const updated = await students.updateStudent({
      id: nonGmail.data.id,
      email: `le.kshmi.fr.${STAMP}@gmail.com`,
    });
    expect(updated).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  }, 30_000);

  it("window-end-before-start-rejected", async () => {
    const start = new Date("2026-08-01");
    const end = new Date("2026-07-01");
    const bad = await students.createStudent({
      name: "Bad Window",
      email: `window-${STAMP}@test.skillspark.local`,
      accessStartDate: start,
      accessEndDate: end,
    });
    expect(bad).toMatchObject({ ok: false, error: { code: "VALIDATION" } });

    // Merged-window rule on update: lone end date before existing start.
    const goodStudent = await students.createStudent({
      name: "Good Window",
      email: `window2-${STAMP}@test.skillspark.local`,
      accessStartDate: new Date("2026-07-01"),
      accessEndDate: new Date("2026-12-31"),
    });
    expectOk<{ id: string }>(goodStudent);
    const loneEnd = await students.updateStudent({
      id: goodStudent.data.id,
      accessEndDate: new Date("2026-06-01"),
    });
    expect(loneEnd).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fields: { accessEndDate: expect.any(String) } },
    });
  });

  it("block-takes-effect-next-request", async () => {
    const created = await students.createStudent({
      name: "Blockee",
      email: `blockee-${STAMP}@test.skillspark.local`,
      ...window(),
    });
    expectOk<{ id: string }>(created);

    // The student has a live session…
    mockAuth.mockResolvedValue({
      user: { role: "student", studentId: created.data.id, email: `blockee-${STAMP}@x` },
    });
    const ctx = await requireStudent();
    expect(ctx.student.id).toBe(created.data.id);

    // …the admin blocks them; the very next gate check must fail.
    mockAuth.mockResolvedValue({ user: { role: "admin", adminId, email: adminEmail } });
    const blocked = await students.updateStudent({ id: created.data.id, status: "blocked" });
    expect(blocked).toMatchObject({ ok: true });
    const audit = await db.auditLog.findFirst({
      where: { action: "STUDENT_BLOCKED", entityId: created.data.id },
    });
    expect(audit).not.toBeNull();

    mockAuth.mockResolvedValue({
      user: { role: "student", studentId: created.data.id, email: `blockee-${STAMP}@x` },
    });
    await expect(requireStudent()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("create with batches is transactional and audited; delete snapshots", async () => {
    const batch = await db.batch.create({
      data: { batchCode: `SB-${STAMP}`, batchName: "Student Batch" },
    });

    // Bad batch id rolls the student back too.
    const failed = await students.createStudent({
      name: "Tx Student",
      email: `tx-${STAMP}@test.skillspark.local`,
      batchIds: ["nonexistent"],
      ...window(),
    });
    expect(failed).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(
      await db.student.findUnique({ where: { email: `tx-${STAMP}@test.skillspark.local` } }),
    ).toBeNull();

    const created = await students.createStudent({
      name: "Tx Student",
      email: `tx-${STAMP}@test.skillspark.local`,
      batchIds: [batch.id],
      ...window(),
    });
    expectOk<{ id: string }>(created);
    expect(await db.studentBatch.count({ where: { studentId: created.data.id } })).toBe(1);

    const deleted = await students.deleteStudent({ id: created.data.id });
    expect(deleted).toMatchObject({ ok: true });
    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: "STUDENT_DELETED", entityId: created.data.id },
    });
    expect(audit.oldValue).toMatchObject({ batchCount: 1 });

    const actions = new Set(
      (await db.auditLog.findMany({ where: { actorEmail: adminEmail } })).map((r) => r.action),
    );
    for (const expected of [
      "STUDENT_CREATED",
      "STUDENT_BATCH_ASSIGNED",
      "STUDENT_BLOCKED",
      "STUDENT_DELETED",
    ]) {
      expect(actions, `missing audit action ${expected}`).toContain(expected);
    }
  }, 30_000);

  it("student actions require admin", async () => {
    mockAuth.mockResolvedValue(null);
    const results = await Promise.all([
      students.createStudent({ name: "X", email: "x@x.local", ...window() }),
      students.updateStudent({ id: "x", name: "X" }),
      students.deleteStudent({ id: "x" }),
    ]);
    for (const result of results) {
      expect(result).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    }
  });
});
