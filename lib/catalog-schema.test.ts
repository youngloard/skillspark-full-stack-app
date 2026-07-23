import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";

// Schema-invariant tests (M2-S1): the DB itself must reject malformed rows,
// regardless of what application code does.

const STAMP = `cat-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let courseId: string;
let moduleId: string;

beforeAll(async () => {
  const course = await db.course.create({
    data: { name: `Course ${STAMP}`, modules: { create: { title: `Module ${STAMP}` } } },
    include: { modules: true },
  });
  courseId = course.id;
  moduleId = course.modules[0]!.id;
});

afterAll(async () => {
  await db.course.deleteMany({ where: { name: { contains: STAMP } } });
  await db.$disconnect();
});

const video = (over: Record<string, unknown> = {}) => ({
  type: "video",
  title: `Video ${STAMP}`,
  moduleId,
  driveFileId: "drive-abc",
  ...over,
});

describe("catalog schema constraints", () => {
  it("accepts a valid video item and a valid material-only module", async () => {
    const v = await db.contentItem.create({ data: video() });
    expect(v.id).toBeTruthy();

    // Document-only flow (FR-2.5): a material directly in a module, no video.
    const m = await db.contentItem.create({
      data: {
        type: "material",
        title: `PDF ${STAMP}`,
        moduleId,
        sourceType: "upload",
        storagePath: `materials/${STAMP}.pdf`,
        mimeType: "application/pdf",
      },
    });
    expect(m.id).toBeTruthy();
  });

  it("check-rejects-item-with-two-parents", async () => {
    await expect(db.contentItem.create({ data: video({ courseId }) })).rejects.toThrowError();
    // and zero parents:
    await expect(db.contentItem.create({ data: video({ moduleId: null }) })).rejects.toThrowError();
  });

  it("check-rejects-video-with-material-fields", async () => {
    await expect(
      db.contentItem.create({ data: video({ sourceType: "url", externalUrl: "https://x" }) }),
    ).rejects.toThrowError();
    // video without driveFileId:
    await expect(
      db.contentItem.create({ data: video({ driveFileId: null }) }),
    ).rejects.toThrowError();
  });

  it("rejects material with inconsistent source fields", async () => {
    const material = (over: Record<string, unknown>) => ({
      type: "material",
      title: `Mat ${STAMP}`,
      moduleId,
      ...over,
    });
    // upload without storagePath
    await expect(
      db.contentItem.create({ data: material({ sourceType: "upload" }) }),
    ).rejects.toThrowError();
    // url without externalUrl
    await expect(
      db.contentItem.create({ data: material({ sourceType: "url" }) }),
    ).rejects.toThrowError();
    // unknown source type
    await expect(
      db.contentItem.create({ data: material({ sourceType: "ftp" }) }),
    ).rejects.toThrowError();
    // drive source REQUIRES its file pointer (corrected in the M2-S4
    // migration — ARCHITECTURE §4 lists driveFileId as a material field)…
    await expect(
      db.contentItem.create({ data: material({ sourceType: "drive" }) }),
    ).rejects.toThrowError();
    // …while non-drive sources must not carry one.
    await expect(
      db.contentItem.create({
        data: material({
          sourceType: "url",
          externalUrl: "https://x.example/a",
          driveFileId: "leak",
        }),
      }),
    ).rejects.toThrowError();
    // material with a video-only field (duration)
    await expect(
      db.contentItem.create({
        data: material({ sourceType: "drive", driveFileId: "ok-file", duration: 10 }),
      }),
    ).rejects.toThrowError();
  });

  it("attachments only hang off video items, one level deep", async () => {
    const parentVideo = await db.contentItem.create({ data: video() });
    const attachment = await db.contentItem.create({
      data: {
        type: "material",
        title: `Attachment ${STAMP}`,
        parentItemId: parentVideo.id,
        sourceType: "url",
        externalUrl: "https://example.com/notes.pdf",
      },
    });
    expect(attachment.id).toBeTruthy();

    // Attachment under a material → trigger rejects.
    const materialParent = await db.contentItem.create({
      data: {
        type: "material",
        title: `MatParent ${STAMP}`,
        moduleId,
        sourceType: "drive",
        driveFileId: "matparent-file",
      },
    });
    await expect(
      db.contentItem.create({
        data: {
          type: "material",
          title: `Bad ${STAMP}`,
          parentItemId: materialParent.id,
          sourceType: "drive",
        },
      }),
    ).rejects.toThrowError(/video item/);
  });

  it("unknown type rejected", async () => {
    await expect(db.contentItem.create({ data: video({ type: "quiz" }) })).rejects.toThrowError();
  });

  it("order-indexes-exist", async () => {
    // Drift guard: the ordered-items access paths (ARCHITECTURE §5 ContentItem)
    // must stay index-backed. Names match the generated migration.
    const rows = await db.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE tablename IN ('content_items', 'modules')
    `;
    const names = rows.map((r) => r.indexname);
    for (const expected of [
      "modules_course_id_module_order_idx",
      "content_items_module_id_item_order_idx",
      "content_items_course_id_item_order_idx",
      "content_items_parent_item_id_item_order_idx",
    ]) {
      expect(names).toContain(expected);
    }
  });
});
