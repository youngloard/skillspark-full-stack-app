import "server-only";
import { db } from "@/lib/db";

// All of a student's saved progress for one course's video items (M4-S3) —
// seeds the watch sidebar's live progress map. One indexed query.

export type ItemProgress = { positionSeconds: number; completed: boolean };

export async function getCourseProgress(
  studentId: string,
  courseId: string,
): Promise<Record<string, ItemProgress>> {
  const rows = await db.videoProgress.findMany({
    where: {
      studentId,
      item: {
        type: "video",
        status: "active",
        // Items sit under a module (module layout) or the course (flat layout).
        OR: [{ courseId }, { module: { courseId } }],
      },
    },
    select: { itemId: true, positionSeconds: true, completed: true },
  });

  const map: Record<string, ItemProgress> = {};
  for (const r of rows) {
    map[r.itemId] = { positionSeconds: r.positionSeconds, completed: r.completed };
  }
  return map;
}

export type CourseProgressSummary = { total: number; completed: number; percent: number };

/**
 * Per-course completion summaries for a set of courses (the dashboard / My
 * Courses cards). Two bounded queries regardless of how many courses — total
 * active videos per course, and completed ones per course — so no N+1.
 */
export async function getCoursesProgress(
  studentId: string,
  courseIds: string[],
): Promise<Record<string, CourseProgressSummary>> {
  const out: Record<string, CourseProgressSummary> = {};
  for (const id of courseIds) out[id] = { total: 0, completed: 0, percent: 0 };
  if (courseIds.length === 0) return out;

  const inCourse = [{ courseId: { in: courseIds } }, { module: { courseId: { in: courseIds } } }];

  const [videos, completed] = await Promise.all([
    db.contentItem.findMany({
      where: { type: "video", status: "active", OR: inCourse },
      select: { courseId: true, module: { select: { courseId: true } } },
    }),
    db.videoProgress.findMany({
      where: {
        studentId,
        completed: true,
        item: { type: "video", status: "active", OR: inCourse },
      },
      select: { item: { select: { courseId: true, module: { select: { courseId: true } } } } },
    }),
  ]);

  for (const v of videos) {
    const cid = v.courseId ?? v.module?.courseId;
    if (cid && out[cid]) out[cid].total += 1;
  }
  for (const c of completed) {
    const cid = c.item.courseId ?? c.item.module?.courseId;
    if (cid && out[cid]) out[cid].completed += 1;
  }
  for (const id of courseIds) {
    const s = out[id]!;
    s.percent = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
  }
  return out;
}
