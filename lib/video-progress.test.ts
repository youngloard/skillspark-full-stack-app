import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { COMPLETE_AT_RATIO, getVideoProgress, saveVideoProgress } from "./video-progress";
import { getCourseProgress } from "./course-progress";
import { getWatchItem } from "./watch";
import { orderedVideoIds } from "./watch-order";
import { db } from "./db";

// M4-S3: progress writes (fail-closed, server-computed sticky completion) and
// the watch payload's no-driveFileId guarantee.

const STAMP = `m4s3-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const DURATION = 600;

let studentId: string;
let courseId: string;
let ungrantedCourseId: string;
let videoId: string;
let video2Id: string;
let noDurationId: string;
let materialId: string;
let unownedVideoId: string;

beforeAll(async () => {
  const window = {
    accessStartDate: new Date(Date.now() - 86_400_000),
    accessEndDate: new Date(Date.now() + 86_400_000),
  };
  studentId = (
    await db.student.create({
      data: { name: "Watch Student", email: `s-${STAMP}@test.skillspark.local`, ...window },
    })
  ).id;
  courseId = (await db.course.create({ data: { name: `Watch ${STAMP}`, layout: "module" } })).id;
  ungrantedCourseId = (
    await db.course.create({ data: { name: `NoGrant ${STAMP}`, layout: "flat" } })
  ).id;

  const batch = await db.batch.create({
    data: {
      batchCode: `W-${STAMP}`,
      batchName: "Watch Batch",
      studentBatches: { create: { studentId } },
    },
  });
  await db.batchCourse.create({ data: { batchId: batch.id, courseId } });

  const mod = await db.module.create({
    data: { courseId, title: `M ${STAMP}`, moduleOrder: 0 },
  });
  videoId = (
    await db.contentItem.create({
      data: {
        type: "video",
        title: `V1 ${STAMP}`,
        moduleId: mod.id,
        itemOrder: 0,
        driveFileId: "drive1",
        duration: DURATION,
      },
    })
  ).id;
  video2Id = (
    await db.contentItem.create({
      data: {
        type: "video",
        title: `V2 ${STAMP}`,
        moduleId: mod.id,
        itemOrder: 1,
        driveFileId: "drive2",
        duration: DURATION,
      },
    })
  ).id;
  noDurationId = (
    await db.contentItem.create({
      data: {
        type: "video",
        title: `V3 ${STAMP}`,
        moduleId: mod.id,
        itemOrder: 2,
        driveFileId: "drive3",
      },
    })
  ).id;
  materialId = (
    await db.contentItem.create({
      data: {
        type: "material",
        title: `Mat ${STAMP}`,
        moduleId: mod.id,
        itemOrder: 3,
        sourceType: "url",
        externalUrl: "https://example.com/m",
      },
    })
  ).id;
  unownedVideoId = (
    await db.contentItem.create({
      data: {
        type: "video",
        title: `Locked ${STAMP}`,
        courseId: ungrantedCourseId,
        itemOrder: 0,
        driveFileId: "secret-drive-id",
        duration: DURATION,
      },
    })
  ).id;
});

beforeEach(async () => {
  await db.videoProgress.deleteMany({ where: { studentId } });
});

afterAll(async () => {
  await db.videoProgress.deleteMany({ where: { studentId } });
  await db.contentItem.deleteMany({ where: { title: { contains: STAMP } } });
  await db.batch.deleteMany({ where: { batchCode: { contains: STAMP } } });
  await db.course.deleteMany({ where: { name: { contains: STAMP } } });
  await db.student.deleteMany({ where: { email: { contains: STAMP } } });
  await db.$disconnect();
});

describe("video progress", () => {
  it("progress-upsert-unique: repeated saves update one row, never duplicate", async () => {
    await saveVideoProgress({ studentId, itemId: videoId, positionSeconds: 30 });
    await saveVideoProgress({ studentId, itemId: videoId, positionSeconds: 90 });
    await saveVideoProgress({ studentId, itemId: videoId, positionSeconds: 150 });

    const rows = await db.videoProgress.findMany({ where: { studentId, itemId: videoId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.positionSeconds).toBe(150);
  });

  it("resume-restores-timestamp", async () => {
    await saveVideoProgress({ studentId, itemId: videoId, positionSeconds: 247 });
    expect(await getVideoProgress(studentId, videoId)).toEqual({
      positionSeconds: 247,
      completed: false,
    });

    const watch = await getWatchItem(studentId, courseId, videoId);
    expect(watch?.progress?.positionSeconds).toBe(247);
  });

  it("completion-flag-at-threshold", async () => {
    // Just under the threshold → not complete.
    const below = Math.floor(DURATION * COMPLETE_AT_RATIO) - 10;
    await saveVideoProgress({ studentId, itemId: videoId, positionSeconds: below });
    expect((await getVideoProgress(studentId, videoId))?.completed).toBe(false);

    // At/over the threshold → complete, computed from the stored duration.
    await saveVideoProgress({
      studentId,
      itemId: videoId,
      positionSeconds: Math.ceil(DURATION * COMPLETE_AT_RATIO),
    });
    expect((await getVideoProgress(studentId, videoId))?.completed).toBe(true);
  });

  it("completion is sticky: a later rewind does not un-complete", async () => {
    await saveVideoProgress({ studentId, itemId: videoId, positionSeconds: DURATION });
    expect((await getVideoProgress(studentId, videoId))?.completed).toBe(true);

    await saveVideoProgress({ studentId, itemId: videoId, positionSeconds: 12 });
    const after = await getVideoProgress(studentId, videoId);
    expect(after?.positionSeconds).toBe(12);
    expect(after?.completed).toBe(true);
  });

  it("client `ended` completes even without a duration on the row", async () => {
    await saveVideoProgress({ studentId, itemId: noDurationId, positionSeconds: 5, ended: true });
    expect((await getVideoProgress(studentId, noDurationId))?.completed).toBe(true);
  });

  it("unowned-video: write refused, nothing persisted", async () => {
    expect(
      await saveVideoProgress({ studentId, itemId: unownedVideoId, positionSeconds: 60 }),
    ).toBe(false);
    expect(await getVideoProgress(studentId, unownedVideoId)).toBeNull();
  });

  it("refuses to record progress against a material", async () => {
    expect(await saveVideoProgress({ studentId, itemId: materialId, positionSeconds: 10 })).toBe(
      false,
    );
    expect(await getVideoProgress(studentId, materialId)).toBeNull();
  });
});

describe("watch item payload", () => {
  it("unowned-video-403-no-driveid-leak", async () => {
    // Denied outright...
    expect(await getWatchItem(studentId, ungrantedCourseId, unownedVideoId)).toBeNull();
    // ...and the granted payload never carries a drive id anywhere in it.
    const watch = await getWatchItem(studentId, courseId, videoId);
    expect(watch).not.toBeNull();
    expect(JSON.stringify(watch)).not.toContain("drive1");
    expect(JSON.stringify(watch)).not.toContain("driveFileId");
  });

  it("cross-course id smuggling is refused", async () => {
    // A real, accessible video id but under a course it doesn't belong to.
    expect(await getWatchItem(studentId, ungrantedCourseId, videoId)).toBeNull();
  });
});

describe("course progress map", () => {
  it("returns saved positions for the course's videos only", async () => {
    await saveVideoProgress({ studentId, itemId: videoId, positionSeconds: 120 });
    await saveVideoProgress({ studentId, itemId: video2Id, positionSeconds: DURATION }); // completes

    const map = await getCourseProgress(studentId, courseId);
    expect(map[videoId]).toEqual({ positionSeconds: 120, completed: false });
    expect(map[video2Id]?.completed).toBe(true);
    // A video in a different (ungranted) course is not in this course's map.
    expect(map[unownedVideoId]).toBeUndefined();
  });
});

describe("playback order (pure)", () => {
  it("flattens modules then flat items, videos only", () => {
    const ids = orderedVideoIds(
      [
        {
          items: [
            { id: "a", type: "video" },
            { id: "m", type: "material" },
            { id: "b", type: "video" },
          ],
        },
      ],
      [{ id: "c", type: "video" }],
    );
    expect(ids).toEqual(["a", "b", "c"]);
  });
});

describe("watch-time accumulation (M6-S3)", () => {
  it("accumulates watchSeconds across saves, even when position doesn't move", async () => {
    const s = await db.student.create({
      data: {
        name: "WT Student",
        email: `wt-${STAMP}@test.skillspark.local`,
        accessStartDate: new Date(Date.now() - 86_400_000),
        accessEndDate: new Date(Date.now() + 86_400_000),
      },
    });
    // Reuse the granted course's video by putting this student in the batch.
    const batch = await db.batch.findFirstOrThrow({ where: { batchCode: `W-${STAMP}` } });
    await db.studentBatch.create({ data: { studentId: s.id, batchId: batch.id } });

    await saveVideoProgress({
      studentId: s.id,
      itemId: videoId,
      positionSeconds: 30,
      watchedDelta: 30,
    });
    let row = await db.videoProgress.findUnique({
      where: { studentId_itemId: { studentId: s.id, itemId: videoId } },
      select: { watchSeconds: true },
    });
    expect(row?.watchSeconds).toBe(30);

    // Same position (throttled for position) but real watch time → still increments.
    await saveVideoProgress({
      studentId: s.id,
      itemId: videoId,
      positionSeconds: 30,
      watchedDelta: 12,
    });
    row = await db.videoProgress.findUnique({
      where: { studentId_itemId: { studentId: s.id, itemId: videoId } },
      select: { watchSeconds: true },
    });
    expect(row?.watchSeconds).toBe(42);

    await db.student.delete({ where: { id: s.id } });
  });
});
