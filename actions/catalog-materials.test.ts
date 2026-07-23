import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// M2-S4 integration tests. Storage-touching tests run only when the Supabase
// Storage credentials exist in .env (they hit the real private bucket).

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T>(fn: T) => fn };
});

const materials = await import("./materials");
const items = await import("./items");
const { db } = await import("@/lib/db");

const HAS_STORAGE = !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SECRET_KEY;

const STAMP = `m2s4-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const DRIVE_ID = "1materialDriveFile1234567890";

let adminId: string;
let adminEmail: string;
let moduleId: string;
let videoItemId: string;

function materialForm(fields: Record<string, string | File>): FormData {
  const form = new FormData();
  form.set("title", `Material ${STAMP}`);
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

beforeAll(async () => {
  adminEmail = `admin-${STAMP}@test.skillspark.local`;
  const admin = await db.admin.create({ data: { name: "Materials Admin", email: adminEmail } });
  adminId = admin.id;
  const course = await db.course.create({
    data: { name: `Course ${STAMP}`, modules: { create: { title: `Module ${STAMP}` } } },
    include: { modules: true },
  });
  moduleId = course.modules[0]!.id;
  const video = await db.contentItem.create({
    data: { type: "video", title: `Video ${STAMP}`, moduleId, driveFileId: DRIVE_ID },
  });
  videoItemId = video.id;
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

describe("material item actions", () => {
  it("exactly-one-source-enforced", async () => {
    // drive source without a drive URL.
    const noDrive = await materials.createMaterialItem(
      materialForm({ moduleId, sourceType: "drive" }),
    );
    expect(noDrive).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    // url source without a URL.
    const noUrl = await materials.createMaterialItem(materialForm({ moduleId, sourceType: "url" }));
    expect(noUrl).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    // upload source without a file.
    const noFile = await materials.createMaterialItem(
      materialForm({ moduleId, sourceType: "upload" }),
    );
    expect(noFile).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    // two parents.
    const twoParents = await materials.createMaterialItem(
      materialForm({
        moduleId,
        parentItemId: videoItemId,
        sourceType: "url",
        externalUrl: "https://x.example/a.pdf",
      }),
    );
    expect(twoParents).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  });

  it("mime-rejected-outside-allowlist", async () => {
    const exe = new File([new Uint8Array(16)], "malware.exe", {
      type: "application/x-msdownload",
    });
    const result = await materials.createMaterialItem(
      materialForm({ moduleId, sourceType: "upload", file: exe }),
    );
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    if (!result.ok) expect(result.error.message).toMatch(/Unsupported file type/);
  });

  it("oversize-rejected", async () => {
    const big = new File([new Uint8Array(50 * 1024 * 1024 + 1)], "big.pdf", {
      type: "application/pdf",
    });
    const result = await materials.createMaterialItem(
      materialForm({ moduleId, sourceType: "upload", file: big }),
    );
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    if (!result.ok) expect(result.error.message).toMatch(/50 MB/);
  });

  it("attachment-hangs-off-video", async () => {
    const attached = await materials.createMaterialItem(
      materialForm({
        parentItemId: videoItemId,
        sourceType: "url",
        externalUrl: "https://example.com/notes.pdf",
      }),
    );
    expect(attached).toMatchObject({ ok: true });

    // Attaching to a material (the one just created) → friendly CONFLICT.
    if (!attached.ok) return;
    const nested = await materials.createMaterialItem(
      materialForm({
        parentItemId: attached.data.id,
        sourceType: "url",
        externalUrl: "https://example.com/nested.pdf",
      }),
    );
    expect(nested).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    if (!nested.ok) expect(nested.error.message).toMatch(/video items/);
  });

  it("drive-source material stores the canonical id; updates audited", async () => {
    const created = await materials.createMaterialItem(
      materialForm({
        moduleId,
        sourceType: "drive",
        driveUrl: `https://drive.google.com/file/d/${DRIVE_ID}/view`,
      }),
    );
    expect(created).toMatchObject({ ok: true });
    if (!created.ok) return;
    const row = await db.contentItem.findUniqueOrThrow({ where: { id: created.data.id } });
    expect(row).toMatchObject({ type: "material", sourceType: "drive", driveFileId: DRIVE_ID });

    const updated = await materials.updateMaterialItem({
      id: created.data.id,
      downloadEnabled: true,
      status: "inactive",
    });
    expect(updated).toMatchObject({ ok: true });
    const after = await db.contentItem.findUniqueOrThrow({ where: { id: created.data.id } });
    expect(after).toMatchObject({ downloadEnabled: true, status: "inactive" });
    const audit = await db.auditLog.findFirst({
      where: { action: "ITEM_INACTIVATED", entityId: created.data.id },
    });
    expect(audit).not.toBeNull();

    // getMaterialUrl derives the Drive view URL without any network call.
    const url = await materials.getMaterialUrl({ id: created.data.id });
    expect(url).toMatchObject({
      ok: true,
      data: { url: `https://drive.google.com/file/d/${DRIVE_ID}/view`, expiresInSeconds: null },
    });
  });

  it("material actions require admin", async () => {
    mockAuth.mockResolvedValue(null);
    const results = await Promise.all([
      materials.createMaterialItem(
        materialForm({ moduleId, sourceType: "url", externalUrl: "https://x.example/a.pdf" }),
      ),
      materials.updateMaterialItem({ id: "x", title: "x" }),
      materials.getMaterialUrl({ id: "x" }),
    ]);
    for (const result of results) {
      expect(result).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    }
  });
});

describe.runIf(HAS_STORAGE)("material uploads (live storage)", () => {
  it("upload-stores-and-records", { timeout: 30_000 }, async () => {
    const content = `SkillSpark test upload ${STAMP}`;
    const pdf = new File([content], "My Notes (final).pdf", { type: "application/pdf" });
    const created = await materials.createMaterialItem(
      materialForm({ moduleId, sourceType: "upload", file: pdf, downloadEnabled: "on" }),
    );
    expect(created).toMatchObject({ ok: true });
    if (!created.ok) return;

    const row = await db.contentItem.findUniqueOrThrow({ where: { id: created.data.id } });
    expect(row.sourceType).toBe("upload");
    expect(row.originalFileName).toBe("My Notes (final).pdf");
    expect(row.mimeType).toBe("application/pdf");
    // Server-generated key: uuid + extension, no trace of the user filename.
    expect(row.storagePath).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect(row.downloadEnabled).toBe(true);

    // The signed URL serves the exact bytes; deleting the item removes them.
    const link = await materials.getMaterialUrl({ id: created.data.id });
    expect(link).toMatchObject({ ok: true });
    if (!link.ok) return;
    const fetched = await fetch(link.data.url);
    expect(fetched.status).toBe(200);
    expect(await fetched.text()).toBe(content);

    const deleted = await items.deleteItem({ id: created.data.id });
    expect(deleted).toMatchObject({ ok: true });
    const afterDelete = await fetch(link.data.url);
    expect(afterDelete.status).toBeGreaterThanOrEqual(400); // object gone
  });

  it("signed-url-expires", { timeout: 30_000 }, async () => {
    const pdf = new File([`expiry check ${STAMP}`], "expiry.pdf", { type: "application/pdf" });
    const created = await materials.createMaterialItem(
      materialForm({ moduleId, sourceType: "upload", file: pdf }),
    );
    expect(created).toMatchObject({ ok: true });
    if (!created.ok) return;
    const row = await db.contentItem.findUniqueOrThrow({ where: { id: created.data.id } });

    const { createSignedMaterialUrl } = await import("@/lib/storage");
    // 5s TTL: enough headroom that the first fetch (network round trip to
    // ap-south-1 under parallel-suite load) lands inside the window — a 1s
    // TTL flaked exactly there — while expiry is still proven seconds later.
    const url = await createSignedMaterialUrl(row.storagePath!, 5);
    expect((await fetch(url)).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 6_500));
    const expired = await fetch(url);
    expect(expired.status).toBeGreaterThanOrEqual(400); // token expired

    await items.deleteItem({ id: created.data.id });
  });
});
