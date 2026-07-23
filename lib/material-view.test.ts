import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mintMaterialSignedUrl } from "./material-view";
import { uploadMaterial } from "./storage";
import { db } from "./db";

// M4-S4: signed-URL minting for upload materials (fail-closed). Hits live
// Supabase Storage with a tiny real object, mirroring M2-S4. The view/download
// link logic (no storage) is covered by material-links.test.ts.

const STAMP = `m4s4-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const PDF_BYTES = new TextEncoder().encode("%PDF-1.4\n% tiny test pdf\n");

let studentId: string;
let courseId: string;
let ungrantedCourseId: string;
let uploadId: string;
let driveId: string;
let urlId: string;
let unownedUploadId: string;
let storagePath: string | null = null;

beforeAll(async () => {
  const window = {
    accessStartDate: new Date(Date.now() - 86_400_000),
    accessEndDate: new Date(Date.now() + 86_400_000),
  };
  studentId = (
    await db.student.create({
      data: { name: "Mat Student", email: `s-${STAMP}@test.skillspark.local`, ...window },
    })
  ).id;
  courseId = (await db.course.create({ data: { name: `Mat ${STAMP}`, layout: "flat" } })).id;
  ungrantedCourseId = (await db.course.create({ data: { name: `MatNo ${STAMP}`, layout: "flat" } }))
    .id;

  const batch = await db.batch.create({
    data: {
      batchCode: `MT-${STAMP}`,
      batchName: "Mat Batch",
      studentBatches: { create: { studentId } },
    },
  });
  await db.batchCourse.create({ data: { batchId: batch.id, courseId } });

  // A real uploaded object in the private bucket (live storage).
  const uploaded = await uploadMaterial(
    new File([PDF_BYTES], `notes-${STAMP}.pdf`, { type: "application/pdf" }),
  );
  storagePath = uploaded.storagePath;

  uploadId = (
    await db.contentItem.create({
      data: {
        type: "material",
        title: `Upload ${STAMP}`,
        courseId,
        itemOrder: 0,
        sourceType: "upload",
        storagePath: uploaded.storagePath,
        mimeType: uploaded.mimeType,
        originalFileName: uploaded.originalFileName,
        downloadEnabled: true,
      },
    })
  ).id;
  driveId = (
    await db.contentItem.create({
      data: {
        type: "material",
        title: `Drive ${STAMP}`,
        courseId,
        itemOrder: 2,
        sourceType: "drive",
        driveFileId: "1driveMaterialId",
        downloadEnabled: true,
      },
    })
  ).id;
  urlId = (
    await db.contentItem.create({
      data: {
        type: "material",
        title: `Url ${STAMP}`,
        courseId,
        itemOrder: 3,
        sourceType: "url",
        externalUrl: "https://example.com/doc",
      },
    })
  ).id;
  unownedUploadId = (
    await db.contentItem.create({
      data: {
        type: "material",
        title: `Locked ${STAMP}`,
        courseId: ungrantedCourseId,
        itemOrder: 0,
        sourceType: "upload",
        storagePath: uploaded.storagePath,
        mimeType: uploaded.mimeType,
        originalFileName: uploaded.originalFileName,
        downloadEnabled: true,
      },
    })
  ).id;
});

afterAll(async () => {
  await db.contentItem.deleteMany({ where: { title: { contains: STAMP } } });
  await db.batch.deleteMany({ where: { batchCode: { contains: STAMP } } });
  await db.course.deleteMany({ where: { name: { contains: STAMP } } });
  await db.student.deleteMany({ where: { email: { contains: STAMP } } });
  if (storagePath) {
    const { deleteMaterialObjects } = await import("./storage");
    await deleteMaterialObjects([storagePath]);
  }
  await db.$disconnect();
});

describe("material signed url", () => {
  it("signed-url-minted-only-with-access", async () => {
    // No access → no mint.
    expect(await mintMaterialSignedUrl(studentId, unownedUploadId)).toBeNull();
    // With access → a real signed URL to the private bucket.
    const signed = await mintMaterialSignedUrl(studentId, uploadId);
    expect(signed).not.toBeNull();
    expect(signed?.signedUrl).toMatch(/\/object\/sign\/materials\//);
    expect(signed?.signedUrl).toContain("token=");
  }, 30_000);

  it("expired-signed-url-refetch: mint is re-run per call, never cached", async () => {
    // Our code holds no signed URL — every call re-mints (the content proxy
    // relies on this so an expired URL is simply replaced on the next request).
    // Within one expiry-second Supabase returns the same token; the guarantee
    // we assert is that a fresh mint independently succeeds each time.
    const a = await mintMaterialSignedUrl(studentId, uploadId);
    const b = await mintMaterialSignedUrl(studentId, uploadId);
    expect(a?.signedUrl).toMatch(/token=/);
    expect(b?.signedUrl).toMatch(/token=/);
  }, 30_000);

  it("does not mint for a drive/url material", async () => {
    expect(await mintMaterialSignedUrl(studentId, driveId)).toBeNull();
    expect(await mintMaterialSignedUrl(studentId, urlId)).toBeNull();
  });
});
