import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// M2-S3 integration tests: video item actions against the real DB, with the
// Drive API mocked at the lib/drive seam (network stays out of the suite).

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T>(fn: T) => fn };
});

const mockFetchMeta = vi.fn();
vi.mock("@/lib/drive", () => ({
  fetchDriveVideoMetadata: (fileId: string) => mockFetchMeta(fileId),
}));

// NOTE: never call runTick() here — parallel test workers each tick the same
// shared jobs table, and a tick without the other file's handlers would fail
// that file's pending jobs. The tick loop itself is proven in lib/jobs.test.ts;
// this file invokes the drive handler directly.
const items = await import("./items");
const { db } = await import("@/lib/db");
const { registerDriveJobHandlers, handleFetchDuration, DRIVE_FETCH_DURATION } =
  await import("@/lib/drive-jobs");

const STAMP = `m2s3-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const DRIVE_ID = "1testDriveFileId1234567890";

let adminId: string;
let adminEmail: string;
let moduleId: string;
let courseId: string;
let flatCourseId: string;

beforeAll(async () => {
  adminEmail = `admin-${STAMP}@test.skillspark.local`;
  const admin = await db.admin.create({ data: { name: "Items Admin", email: adminEmail } });
  adminId = admin.id;

  const course = await db.course.create({
    data: { name: `Course ${STAMP}`, modules: { create: { title: `Module ${STAMP}` } } },
    include: { modules: true },
  });
  courseId = course.id;
  moduleId = course.modules[0]!.id;

  const flat = await db.course.create({ data: { name: `Flat ${STAMP}`, layout: "flat" } });
  flatCourseId = flat.id;
});

beforeEach(() => {
  mockAuth.mockReset();
  mockAuth.mockResolvedValue({ user: { role: "admin", adminId, email: adminEmail } });
  mockFetchMeta.mockReset();
});

afterAll(async () => {
  await db.job.deleteMany({ where: { type: DRIVE_FETCH_DURATION } });
  await db.course.deleteMany({ where: { name: { contains: STAMP } } });
  await db.auditLog.deleteMany({ where: { actorEmail: adminEmail } });
  await db.admin.deleteMany({ where: { email: adminEmail } });
  await db.$disconnect();
});

describe("video item actions", () => {
  it("bad-url-actionable-error", async () => {
    const result = await items.createVideoItem({
      moduleId,
      title: "Bad",
      driveUrl: "https://youtube.com/watch?v=abc123defg",
    });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    if (!result.ok) {
      // Actionable: tells the admin what to paste, names the field.
      expect(result.error.fields?.driveUrl).toMatch(/Drive link|file ID/);
    }
  });

  it("duration-job-enqueued-not-blocking", async () => {
    const before = Date.now();
    const result = await items.createVideoItem({
      moduleId,
      title: `Video ${STAMP}`,
      driveUrl: `https://drive.google.com/file/d/${DRIVE_ID}/view?usp=sharing`,
    });
    expect(result).toMatchObject({ ok: true });
    // No Drive call happened on the request path…
    expect(mockFetchMeta).not.toHaveBeenCalled();

    if (!result.ok) return;
    const item = await db.contentItem.findUniqueOrThrow({ where: { id: result.data.id } });
    // URL was canonicalized to the bare ID; duration awaits the job.
    expect(item.driveFileId).toBe(DRIVE_ID);
    expect(item.duration).toBeNull();

    // …the job row was committed with the item (outbox). Status is not
    // asserted — a parallel worker's tick may transiently claim it.
    const job = await db.job.findFirstOrThrow({
      where: { type: DRIVE_FETCH_DURATION, createdAt: { gte: new Date(before) } },
      orderBy: { createdAt: "desc" },
    });
    expect(job.payload).toMatchObject({ itemId: result.data.id, driveFileId: DRIVE_ID });

    // Registration hook is idempotent and wires the type the queue will run.
    registerDriveJobHandlers();
    registerDriveJobHandlers();

    // Handler behavior, invoked directly (see NOTE above).
    mockFetchMeta.mockResolvedValue({ durationSeconds: 754, name: "v", mimeType: "video/mp4" });
    await handleFetchDuration(job.payload);
    const updated = await db.contentItem.findUniqueOrThrow({ where: { id: result.data.id } });
    expect(updated.duration).toBe(754);
    expect(updated.durationFetchedAt).toBeInstanceOf(Date);
    const fetchedAudit = await db.auditLog.findFirst({
      where: { action: "ITEM_DURATION_FETCHED", entityId: result.data.id },
    });
    expect(fetchedAudit).not.toBeNull();

    // Drive unreachable → handler throws so the queue retries/dead-letters.
    mockFetchMeta.mockResolvedValue(null);
    await expect(handleFetchDuration(job.payload)).rejects.toThrowError(/unavailable/);
  });

  it("reorder-mixed-types", async () => {
    const video = await items.createVideoItem({
      courseId: flatCourseId,
      title: "Flat video",
      driveUrl: DRIVE_ID,
    });
    expect(video).toMatchObject({ ok: true });
    if (!video.ok) return;
    // Material CRUD arrives in M2-S4 — a direct row proves mixed-type order.
    const material = await db.contentItem.create({
      data: {
        type: "material",
        title: "Flat PDF",
        courseId: flatCourseId,
        sourceType: "url",
        externalUrl: "https://example.com/notes.pdf",
        itemOrder: 1,
      },
    });

    const newOrder = [material.id, video.data.id];
    const result = await items.reorderItems({ courseId: flatCourseId, itemIds: newOrder });
    expect(result).toMatchObject({ ok: true });

    const rows = await db.contentItem.findMany({
      where: { courseId: flatCourseId },
      orderBy: [{ itemOrder: "asc" }, { id: "asc" }],
      select: { id: true, type: true },
    });
    expect(rows.map((r) => r.id)).toEqual(newOrder);
    expect(new Set(rows.map((r) => r.type))).toEqual(new Set(["video", "material"]));

    // Stale/partial list rejected.
    const stale = await items.reorderItems({
      courseId: flatCourseId,
      itemIds: [video.data.id],
    });
    expect(stale).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  });

  it("layout cross-checks on create", async () => {
    // courseId pointing at a module-layout course → rejected.
    const wrongFlat = await items.createVideoItem({
      courseId,
      title: "Wrong",
      driveUrl: DRIVE_ID,
    });
    expect(wrongFlat).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    // Both parents → validation.
    const both = await items.createVideoItem({
      moduleId,
      courseId,
      title: "Both",
      driveUrl: DRIVE_ID,
    });
    expect(both).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  });

  it("update repoints file and re-enqueues; delete cascades attachments", async () => {
    const created = await items.createVideoItem({
      moduleId,
      title: "Repoint",
      driveUrl: DRIVE_ID,
    });
    expect(created).toMatchObject({ ok: true });
    if (!created.ok) return;
    await db.contentItem.update({
      where: { id: created.data.id },
      data: { duration: 100, durationFetchedAt: new Date() },
    });

    const newId = "1anotherDriveFile0987654321";
    const updated = await items.updateVideoItem({ id: created.data.id, driveUrl: newId });
    expect(updated).toMatchObject({ ok: true });
    const row = await db.contentItem.findUniqueOrThrow({ where: { id: created.data.id } });
    expect(row.driveFileId).toBe(newId);
    expect(row.duration).toBeNull(); // stale duration cleared until re-fetched
    const job = await db.job.findFirst({
      where: { type: DRIVE_FETCH_DURATION },
      orderBy: { createdAt: "desc" },
    });
    expect(job?.payload).toMatchObject({ itemId: created.data.id, driveFileId: newId });

    // Attachment cascade on delete.
    const attachment = await db.contentItem.create({
      data: {
        type: "material",
        title: "Attached notes",
        parentItemId: created.data.id,
        sourceType: "url",
        externalUrl: "https://example.com/a.pdf",
      },
    });
    const deleted = await items.deleteItem({ id: created.data.id });
    expect(deleted).toMatchObject({ ok: true });
    expect(await db.contentItem.findUnique({ where: { id: attachment.id } })).toBeNull();
    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: "ITEM_DELETED", entityId: created.data.id },
    });
    expect(audit.oldValue).toMatchObject({ attachmentCount: 1 });
  });

  it("all item actions require admin and are audited", async () => {
    mockAuth.mockResolvedValue(null);
    const unauthenticated = [
      items.createVideoItem({ moduleId, title: "x", driveUrl: DRIVE_ID }),
      items.updateVideoItem({ id: "x", title: "x" }),
      items.deleteItem({ id: "x" }),
      items.reorderItems({ moduleId, itemIds: ["x"] }),
      items.refreshItemDuration({ id: "x" }),
    ];
    for (const result of await Promise.all(unauthenticated)) {
      expect(result).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    }

    mockAuth.mockResolvedValue({ user: { role: "admin", adminId, email: adminEmail } });
    const created = await items.createVideoItem({
      moduleId,
      title: `Audit ${STAMP}`,
      driveUrl: DRIVE_ID,
    });
    expect(created).toMatchObject({ ok: true });
    if (!created.ok) return;
    await items.updateVideoItem({ id: created.data.id, status: "inactive" });
    await items.refreshItemDuration({ id: created.data.id });
    // Reorder needs the complete permutation — earlier tests left items here.
    const allInModule = await db.contentItem.findMany({
      where: { moduleId },
      select: { id: true },
    });
    await items.reorderItems({ moduleId, itemIds: allInModule.map((r) => r.id) });
    await items.deleteItem({ id: created.data.id });

    const actions = new Set(
      (await db.auditLog.findMany({ where: { actorEmail: adminEmail } })).map((r) => r.action),
    );
    for (const expected of [
      "ITEM_CREATED",
      "ITEM_INACTIVATED",
      "ITEM_DURATION_REFRESH_REQUESTED",
      "ITEMS_REORDERED",
      "ITEM_DELETED",
    ]) {
      expect(actions, `missing audit action ${expected}`).toContain(expected);
    }
  }, 30_000);
});
