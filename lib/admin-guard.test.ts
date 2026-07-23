import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the session source; the DB re-check stays real (integration). redirect()
// is mocked to throw a sentinel — mirroring Next's real control-flow (it throws
// NEXT_REDIRECT to abort rendering) so we can assert both the call and the halt.
const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

class RedirectSignal extends Error {
  constructor(public to: string) {
    super(`REDIRECT:${to}`);
  }
}
const mockRedirect = vi.fn((to: string) => {
  throw new RedirectSignal(to);
});
vi.mock("next/navigation", () => ({ redirect: (to: string) => mockRedirect(to) }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T>(fn: T) => fn };
});

const { guardAdminAccess } = await import("./admin-guard");
const { db } = await import("./db");

const STAMP = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const mail = (name: string) => `${name}-${STAMP}@test.skillspark.local`;
const activeWindow = {
  accessStartDate: new Date(Date.now() - 86_400_000),
  accessEndDate: new Date(Date.now() + 86_400_000),
};

beforeEach(() => {
  mockAuth.mockReset();
  mockRedirect.mockClear();
});

afterAll(async () => {
  await db.student.deleteMany({ where: { email: { contains: STAMP } } });
  await db.admin.deleteMany({ where: { email: { contains: STAMP } } });
  await db.$disconnect();
});

describe("admin route guard", () => {
  it("student-cannot-load-admin-routes", async () => {
    const student = await db.student.create({
      data: { name: "Nosy Student", email: mail("nosy"), ...activeWindow },
    });
    mockAuth.mockResolvedValue({
      user: { role: "student", studentId: student.id, email: student.email },
    });

    // A valid student session must be bounced to /login, never rendered.
    await expect(guardAdminAccess()).rejects.toBeInstanceOf(RedirectSignal);
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("unauthenticated request is redirected, not errored", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(guardAdminAccess()).rejects.toBeInstanceOf(RedirectSignal);
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("deactivated admin is redirected", async () => {
    const admin = await db.admin.create({
      data: { name: "Ex Admin", email: mail("exadmin"), status: "blocked" },
    });
    mockAuth.mockResolvedValue({
      user: { role: "admin", adminId: admin.id, email: admin.email },
    });
    await expect(guardAdminAccess()).rejects.toBeInstanceOf(RedirectSignal);
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("active admin passes and carries the superadmin flag", async () => {
    const admin = await db.admin.create({
      data: { name: "Good Admin", email: mail("good"), isSuperAdmin: true },
    });
    mockAuth.mockResolvedValue({
      user: { role: "superadmin", adminId: admin.id, email: admin.email },
    });

    const ctx = await guardAdminAccess();
    expect(ctx.admin.id).toBe(admin.id);
    expect(ctx.isSuperAdmin).toBe(true);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
