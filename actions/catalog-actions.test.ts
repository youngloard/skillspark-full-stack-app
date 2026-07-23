import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Integration tests for the M2-S2 catalog actions: mocked session, real DB
// (constraints, cascades, and audit rows are the point — mocks can't prove
// them). Same mocking pattern as lib/authorization.test.ts.

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T>(fn: T) => fn };
});

const courses = await import("./courses");
const modules = await import("./modules");
const { db } = await import("@/lib/db");

const STAMP = `m2s2-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const name = (label: string) => `${label} ${STAMP}`;

let adminId: string;
let adminEmail: string;

beforeAll(async () => {
  adminEmail = `admin-${STAMP}@test.skillspark.local`;
  const admin = await db.admin.create({ data: { name: "Catalog Admin", email: adminEmail } });
  adminId = admin.id;
});

beforeEach(() => {
  mockAuth.mockReset();
  mockAuth.mockResolvedValue({ user: { role: "admin", adminId, email: adminEmail } });
});

afterAll(async () => {
  await db.course.deleteMany({ where: { name: { contains: STAMP } } });
  await db.auditLog.deleteMany({ where: { actorEmail: adminEmail } });
  await db.admin.deleteMany({ where: { email: adminEmail } });
  await db.$disconnect();
});

function expectOk<T>(result: { ok: boolean }): asserts result is { ok: true; data: T } {
  expect(result).toMatchObject({ ok: true });
}

describe("catalog actions", () => {
  it("all-actions-require-admin", async () => {
    mockAuth.mockResolvedValue(null);
    const calls = [
      courses.createCourse({ name: name("Nope") }),
      courses.updateCourse({ id: "x", name: "Nope" }),
      courses.setCourseStatus({ id: "x", status: "inactive" }),
      courses.deleteCourse({ id: "x" }),
      modules.createModule({ courseId: "x", title: "Nope" }),
      modules.updateModule({ id: "x", title: "Nope" }),
      modules.deleteModule({ id: "x" }),
      modules.reorderModules({ courseId: "x", moduleIds: ["a"] }),
    ];
    for (const result of await Promise.all(calls)) {
      expect(result).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    }
  });

  it("course-name-unique-error-shape", async () => {
    const first = await courses.createCourse({ name: name("Excel") });
    expectOk(first);

    const dup = await courses.createCourse({ name: name("Excel") });
    expect(dup).toMatchObject({
      ok: false,
      error: {
        code: "CONFLICT",
        message: "A course with this name already exists",
        fields: { name: "Already in use" },
      },
    });
  });

  it("layout-flat-vs-module", async () => {
    // Modules can't be created under a flat course.
    const flat = await courses.createCourse({ name: name("Flat"), layout: "flat" });
    expectOk<{ id: string }>(flat);
    const badModule = await modules.createModule({ courseId: flat.data.id, title: "M1" });
    expect(badModule).toMatchObject({ ok: false, error: { code: "CONFLICT" } });

    // Layout switch is blocked once the course has content…
    const moduled = await courses.createCourse({ name: name("Moduled") });
    expectOk<{ id: string }>(moduled);
    const mod = await modules.createModule({ courseId: moduled.data.id, title: "M1" });
    expectOk(mod);
    const blocked = await courses.updateCourse({ id: moduled.data.id, layout: "flat" });
    expect(blocked).toMatchObject({ ok: false, error: { code: "CONFLICT" } });

    // …but allowed while the course is empty.
    const empty = await courses.createCourse({ name: name("Empty") });
    expectOk<{ id: string }>(empty);
    const switched = await courses.updateCourse({ id: empty.data.id, layout: "flat" });
    expect(switched).toMatchObject({ ok: true });
  });

  it("reorder-persists", async () => {
    const course = await courses.createCourse({ name: name("Ordered") });
    expectOk<{ id: string }>(course);
    const ids: string[] = [];
    for (const title of ["A", "B", "C"]) {
      const created = await modules.createModule({ courseId: course.data.id, title });
      expectOk<{ id: string }>(created);
      ids.push(created.data.id);
    }

    const newOrder = [ids[2]!, ids[0]!, ids[1]!];
    const result = await modules.reorderModules({ courseId: course.data.id, moduleIds: newOrder });
    expect(result).toMatchObject({ ok: true });

    const rows = await db.module.findMany({
      where: { courseId: course.data.id },
      orderBy: [{ moduleOrder: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    expect(rows.map((r) => r.id)).toEqual(newOrder);

    // A stale list (missing/foreign ids) is rejected, order unchanged.
    const stale = await modules.reorderModules({
      courseId: course.data.id,
      moduleIds: [ids[0]!, ids[1]!],
    });
    expect(stale).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  });

  it("delete-cascades-modules-items", async () => {
    const course = await courses.createCourse({ name: name("Doomed") });
    expectOk<{ id: string }>(course);
    const mod = await modules.createModule({ courseId: course.data.id, title: "M1" });
    expectOk<{ id: string }>(mod);
    // Item CRUD is M2-S3; a direct row is enough to prove the cascade.
    const item = await db.contentItem.create({
      data: { type: "video", title: "V1", moduleId: mod.data.id, driveFileId: "d1" },
    });

    const result = await courses.deleteCourse({ id: course.data.id });
    expect(result).toMatchObject({ ok: true });

    expect(await db.module.findUnique({ where: { id: mod.data.id } })).toBeNull();
    expect(await db.contentItem.findUnique({ where: { id: item.id } })).toBeNull();

    // Snapshot survives in the audit row even though the rows are gone.
    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: "COURSE_DELETED", entityId: course.data.id },
    });
    expect(audit.oldValue).toMatchObject({ moduleCount: 1, itemCount: 1 });

    // Deleting again → NOT_FOUND, not a crash.
    const again = await courses.deleteCourse({ id: course.data.id });
    expect(again).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  // Ten sequential round trips to the remote DB — needs more than the 5s default.
  it("all-actions-audited", { timeout: 30_000 }, async () => {
    const course = await courses.createCourse({ name: name("Audited") });
    expectOk<{ id: string }>(course);
    const id = course.data.id;
    await courses.updateCourse({ id, description: "desc" });
    await courses.setCourseStatus({ id, status: "inactive" });
    await courses.setCourseStatus({ id, status: "active" });
    const mod = await modules.createModule({ courseId: id, title: "M1" });
    expectOk<{ id: string }>(mod);
    await modules.updateModule({ id: mod.data.id, title: "M1 renamed" });
    await modules.reorderModules({ courseId: id, moduleIds: [mod.data.id] });
    await modules.deleteModule({ id: mod.data.id });
    await courses.deleteCourse({ id });

    const rows = await db.auditLog.findMany({ where: { actorEmail: adminEmail } });
    const actions = new Set(rows.map((r) => r.action));
    for (const expected of [
      "COURSE_CREATED",
      "COURSE_UPDATED",
      "COURSE_INACTIVATED",
      "COURSE_ACTIVATED",
      "COURSE_DELETED",
      "MODULE_CREATED",
      "MODULE_UPDATED",
      "MODULES_REORDERED",
      "MODULE_DELETED",
    ]) {
      expect(actions, `missing audit action ${expected}`).toContain(expected);
    }
    // Every row names the acting admin.
    expect(rows.every((r) => r.actorId === adminId)).toBe(true);
  });

  it("validation-envelope-shape", async () => {
    const result = await courses.createCourse({ name: "" });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fields: { name: "Course name is required" } },
    });
  });
});
