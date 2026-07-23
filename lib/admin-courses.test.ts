import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAdminCourseDetail, getCourseItems, getModuleItems, listCourses } from "./admin-courses";
import * as catalog from "./catalog";
import { db } from "./db";

const STAMP = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let courseA = "";
let courseB = "";
let modIds: string[] = [];

beforeAll(async () => {
  const a = await db.course.create({ data: { name: `Course A ${STAMP}`, status: "active" } });
  courseA = a.id;
  const b = await db.course.create({ data: { name: `Course B ${STAMP}`, status: "inactive" } });
  courseB = b.id;
  const mods = await Promise.all(
    [0, 1, 2].map((o) =>
      db.module.create({ data: { courseId: a.id, title: `M${o} ${STAMP}`, moduleOrder: o } }),
    ),
  );
  modIds = mods.map((m) => m.id);
});

afterAll(async () => {
  await db.course.deleteMany({ where: { name: { contains: STAMP } } });
  await db.$disconnect();
});

describe("admin courses", () => {
  it("lists, searches, and filters by status", async () => {
    const all = await listCourses({ q: STAMP });
    expect(all.items.map((c) => c.id).sort()).toEqual([courseA, courseB].sort());

    const inactive = await listCourses({ q: STAMP, status: "inactive" });
    expect(inactive.items.map((c) => c.id)).toEqual([courseB]);

    const active = await listCourses({ q: STAMP, status: "active" });
    expect(active.items.map((c) => c.id)).toEqual([courseA]);

    // Course A shows its module count.
    const a = active.items.find((c) => c.id === courseA);
    expect(a?.moduleCount).toBe(3);
  });

  it("status-toggle-persists", async () => {
    await catalog.updateCourse(courseB, { status: "active" });
    const nowActive = await listCourses({ q: STAMP, status: "active" });
    expect(nowActive.items.map((c) => c.id).sort()).toEqual([courseA, courseB].sort());
  });

  it("reorder-ui-persists", async () => {
    const before = await getAdminCourseDetail(courseA);
    expect(before?.modules.map((m) => m.id)).toEqual(modIds);

    // New order: last, first, middle.
    const newOrder = [modIds[2], modIds[0], modIds[1]];
    await catalog.reorderModules(courseA, newOrder);

    const after = await getAdminCourseDetail(courseA);
    expect(after?.modules.map((m) => m.id)).toEqual(newOrder);
  });

  it("returns null for a missing course", async () => {
    expect(await getAdminCourseDetail("nope")).toBeNull();
  });

  it("lists a module's content items and reorders them", async () => {
    const moduleId = modIds[0];
    const items = await Promise.all(
      [0, 1, 2].map((o) =>
        db.contentItem.create({
          data: {
            type: "video",
            moduleId,
            title: `V${o} ${STAMP}`,
            itemOrder: o,
            driveFileId: `d${o}`,
          },
        }),
      ),
    );

    const before = await getModuleItems(moduleId);
    expect(before?.module.courseId).toBe(courseA);
    expect(before?.items.map((i) => i.id)).toEqual(items.map((i) => i.id));

    const newOrder = [items[2].id, items[0].id, items[1].id];
    await catalog.reorderItems({ moduleId }, newOrder);

    const after = await getModuleItems(moduleId);
    expect(after?.items.map((i) => i.id)).toEqual(newOrder);

    expect(await getModuleItems("nope")).toBeNull();
  });

  it("lists a flat course's content items (courseId parent)", async () => {
    const flat = await db.course.create({ data: { name: `Flat ${STAMP}`, layout: "flat" } });
    const a = await db.contentItem.create({
      data: {
        type: "material",
        courseId: flat.id,
        title: `Doc ${STAMP}`,
        itemOrder: 0,
        sourceType: "url",
        externalUrl: "https://example.com/x.pdf",
      },
    });
    const b = await db.contentItem.create({
      data: {
        type: "video",
        courseId: flat.id,
        title: `Vid ${STAMP}`,
        itemOrder: 1,
        driveFileId: "df",
      },
    });
    const items = await getCourseItems(flat.id);
    expect(items.map((i) => i.id)).toEqual([a.id, b.id]);
    expect(await getCourseItems("nope")).toEqual([]);
  });
});
