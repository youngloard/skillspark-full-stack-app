import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the session source; the DB re-check stays real (integration).
const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

// react's cache() memoizes per request in RSC; in tests there is no request
// scope, so identity passthrough keeps each call fresh.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T>(fn: T) => fn };
});

const { AuthorizationError, requireAdmin, requireStudent, requireSuperAdmin } =
  await import("./authorization");
const { db } = await import("./db");

const STAMP = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const mail = (name: string) => `${name}-${STAMP}@test.skillspark.local`;
const activeWindow = {
  accessStartDate: new Date(Date.now() - 86_400_000),
  accessEndDate: new Date(Date.now() + 86_400_000),
};

beforeEach(() => mockAuth.mockReset());

afterAll(async () => {
  await db.student.deleteMany({ where: { email: { contains: STAMP } } });
  await db.admin.deleteMany({ where: { email: { contains: STAMP } } });
  await db.$disconnect();
});

describe("authorization core", () => {
  it("rejects when no session", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toThrowError(AuthorizationError);
    await expect(requireStudent()).rejects.toThrowError(AuthorizationError);
  });

  it("require-student-rejects-blocked-mid-session", async () => {
    const student = await db.student.create({
      data: { name: "Mid Block", email: mail("midblock"), ...activeWindow },
    });
    mockAuth.mockResolvedValue({
      user: { role: "student", studentId: student.id, email: student.email },
    });

    // Session is valid and student active → allowed.
    const ctx = await requireStudent();
    expect(ctx.student.id).toBe(student.id);

    // Admin blocks the student; the JWT is still valid — next check must fail.
    await db.student.update({ where: { id: student.id }, data: { status: "blocked" } });
    await expect(requireStudent()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("expired student rejected unless allowExpiredAccess", async () => {
    const student = await db.student.create({
      data: {
        name: "Expired Window",
        email: mail("expwin"),
        accessStartDate: new Date(Date.now() - 30 * 86_400_000),
        accessEndDate: new Date(Date.now() - 86_400_000),
      },
    });
    mockAuth.mockResolvedValue({
      user: { role: "student", studentId: student.id, email: student.email },
    });

    await expect(requireStudent()).rejects.toMatchObject({ code: "FORBIDDEN" });
    const ctx = await requireStudent({ allowExpiredAccess: true });
    expect(ctx.student.id).toBe(student.id);
  });

  it("superadmin-gate", async () => {
    const admin = await db.admin.create({ data: { name: "Plain Admin", email: mail("plain") } });
    mockAuth.mockResolvedValue({
      user: { role: "admin", adminId: admin.id, email: admin.email },
    });

    const ctx = await requireAdmin();
    expect(ctx.isSuperAdmin).toBe(false);
    await expect(requireSuperAdmin()).rejects.toMatchObject({ code: "FORBIDDEN" });

    await db.admin.update({ where: { id: admin.id }, data: { isSuperAdmin: true } });
    const superCtx = await requireSuperAdmin();
    expect(superCtx.isSuperAdmin).toBe(true);
  });

  it("student session cannot pass admin gates and vice versa", async () => {
    const student = await db.student.create({
      data: { name: "Role Cross", email: mail("cross"), ...activeWindow },
    });
    mockAuth.mockResolvedValue({
      user: { role: "student", studentId: student.id, email: student.email },
    });
    await expect(requireAdmin()).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    const admin = await db.admin.create({ data: { name: "Cross Admin", email: mail("xadmin") } });
    mockAuth.mockResolvedValue({ user: { role: "admin", adminId: admin.id, email: admin.email } });
    await expect(requireStudent()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
