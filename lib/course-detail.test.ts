import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getCourseDetail } from "./course-detail";
import { db } from "./db";

// M4-S2 integration tests: the course-detail tree against the real DB —
// ordering, mixed item types, material-only / document-only support, inactive
// hiding, and the fail-closed access gate for an unowned course.

const STAMP = `m4s2-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let studentId: string;
let modCourseId: string; // module-layout, granted
let flatCourseId: string; // flat-layout, granted (document-only)
let ungrantedCourseId: string; // exists but never granted
let inactiveCourseId: string; // granted but course inactive

beforeAll(async () => {
  const window = {
    accessStartDate: new Date(Date.now() - 86_400_000),
    accessEndDate: new Date(Date.now() + 86_400_000),
  };
  studentId = (
    await db.student.create({
      data: { name: "Detail Student", email: `s-${STAMP}@test.skillspark.local`, ...window },
    })
  ).id;

  modCourseId = (await db.course.create({ data: { name: `Mod ${STAMP}`, layout: "module" } })).id;
  flatCourseId = (await db.course.create({ data: { name: `Flat ${STAMP}`, layout: "flat" } })).id;
  ungrantedCourseId = (
    await db.course.create({ data: { name: `Ungranted ${STAMP}`, layout: "flat" } })
  ).id;
  inactiveCourseId = (
    await db.course.create({
      data: { name: `Inactive ${STAMP}`, layout: "flat", status: "inactive" },
    })
  ).id;

  const batch = await db.batch.create({
    data: {
      batchCode: `CD-${STAMP}`,
      batchName: "Detail Batch",
      studentBatches: { create: { studentId } },
    },
  });
  // Grant all but the "ungranted" course (inactive one is granted but inactive).
  await db.batchCourse.createMany({
    data: [modCourseId, flatCourseId, inactiveCourseId].map((courseId) => ({
      batchId: batch.id,
      courseId,
    })),
  });

  // Module-layout: a mixed-order module (material at 0, video at 1, material at
  // 2 — plus an inactive item that must be hidden), a material-only module, and
  // an all-inactive module that must not render.
  const mixed = await db.module.create({
    data: { courseId: modCourseId, title: "Mixed", moduleOrder: 0 },
  });
  await db.contentItem.createMany({
    data: [
      {
        type: "material",
        title: "Handout",
        moduleId: mixed.id,
        itemOrder: 0,
        sourceType: "url",
        externalUrl: "https://example.com/h",
      },
      {
        type: "video",
        title: "Lecture",
        moduleId: mixed.id,
        itemOrder: 1,
        driveFileId: "vid1",
        duration: 724,
      },
      {
        type: "material",
        title: "Worksheet",
        moduleId: mixed.id,
        itemOrder: 2,
        sourceType: "url",
        externalUrl: "https://example.com/w",
      },
      {
        type: "video",
        title: "Hidden",
        moduleId: mixed.id,
        itemOrder: 3,
        driveFileId: "vidX",
        status: "inactive",
      },
    ],
  });
  const matOnly = await db.module.create({
    data: { courseId: modCourseId, title: "Reading", moduleOrder: 1 },
  });
  await db.contentItem.create({
    data: {
      type: "material",
      title: "Notes",
      moduleId: matOnly.id,
      itemOrder: 0,
      sourceType: "url",
      externalUrl: "https://example.com/n",
    },
  });
  const emptyMod = await db.module.create({
    data: { courseId: modCourseId, title: "Empty", moduleOrder: 2 },
  });
  await db.contentItem.create({
    data: {
      type: "video",
      title: "Gone",
      moduleId: emptyMod.id,
      itemOrder: 0,
      driveFileId: "vidG",
      status: "inactive",
    },
  });

  // Flat-layout, document-only: two materials, ordered.
  await db.contentItem.createMany({
    data: [
      {
        type: "material",
        title: "Doc A",
        courseId: flatCourseId,
        itemOrder: 0,
        sourceType: "url",
        externalUrl: "https://example.com/a",
      },
      {
        type: "material",
        title: "Doc B",
        courseId: flatCourseId,
        itemOrder: 1,
        sourceType: "url",
        externalUrl: "https://example.com/b",
      },
    ],
  });
});

afterAll(async () => {
  await db.contentItem.deleteMany({ where: { title: { contains: STAMP } } });
  await db.batch.deleteMany({ where: { batchCode: { contains: STAMP } } });
  await db.course.deleteMany({ where: { name: { contains: STAMP } } });
  await db.student.deleteMany({ where: { email: { contains: STAMP } } });
  await db.$disconnect();
});

describe("course detail", () => {
  it("mixed-order-preserved", async () => {
    const detail = await getCourseDetail(studentId, modCourseId);
    const mixed = detail?.modules.find((m) => m.title === "Mixed");
    expect(mixed?.items.map((i) => [i.title, i.type])).toEqual([
      ["Handout", "material"],
      ["Lecture", "video"],
      ["Worksheet", "material"],
    ]);
    // Video duration is carried through for the ledger affordance.
    expect(mixed?.items.find((i) => i.type === "video")?.duration).toBe(724);
  });

  it("material-only-module-renders", async () => {
    const detail = await getCourseDetail(studentId, modCourseId);
    const reading = detail?.modules.find((m) => m.title === "Reading");
    expect(reading).toBeDefined();
    expect(reading?.items.map((i) => i.title)).toEqual(["Notes"]);
    expect(reading?.items.every((i) => i.type === "material")).toBe(true);
  });

  it("inactive-items-hidden (items and all-inactive modules)", async () => {
    const detail = await getCourseDetail(studentId, modCourseId);
    const titles = detail?.modules.flatMap((m) => m.items.map((i) => i.title)) ?? [];
    expect(titles).not.toContain("Hidden");
    // The all-inactive "Empty" module is dropped entirely.
    expect(detail?.modules.map((m) => m.title)).toEqual(["Mixed", "Reading"]);
  });

  it("document-only flat course renders (zero videos)", async () => {
    const detail = await getCourseDetail(studentId, flatCourseId);
    expect(detail?.layout).toBe("flat");
    expect(detail?.modules).toEqual([]);
    expect(detail?.items.map((i) => i.title)).toEqual(["Doc A", "Doc B"]);
    expect(detail?.videoCount).toBe(0);
    expect(detail?.materialCount).toBe(2);
  });

  it("counts reflect the visible tree", async () => {
    const detail = await getCourseDetail(studentId, modCourseId);
    expect(detail?.moduleCount).toBe(2);
    expect(detail?.videoCount).toBe(1); // one active video (Hidden excluded)
    expect(detail?.materialCount).toBe(3); // Handout + Worksheet + Notes
  });

  it("direct-url-to-unowned-course → null (fail closed)", async () => {
    expect(await getCourseDetail(studentId, ungrantedCourseId)).toBeNull();
  });

  it("granted-but-inactive course → null", async () => {
    expect(await getCourseDetail(studentId, inactiveCourseId)).toBeNull();
  });
});
