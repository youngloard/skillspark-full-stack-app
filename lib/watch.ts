import "server-only";
import { db } from "@/lib/db";
import { canAccessItem } from "@/lib/course-access";
import { getVideoProgress, type VideoProgressState } from "@/lib/video-progress";

// The swappable half of the watch page (M4-S3): just the item the student is
// watching (the sidebar/tree is fetched once by the layout). SECURITY: no
// driveFileId field — the id is resolved only inside the authorized stream
// route (docs/DECISIONS.md 2026-07-17). Fail-closed via canAccessItem, and the
// item must actually belong to the course in the URL (no cross-course smuggling).

export type WatchAttachment = {
  id: string;
  title: string;
  sourceType: string | null;
  mimeType: string | null;
  driveFileId: string | null;
  externalUrl: string | null;
  downloadEnabled: boolean;
};

export type WatchItem = {
  id: string;
  title: string;
  description: string | null;
  duration: number | null;
};

export type WatchItemData = {
  item: WatchItem;
  attachments: WatchAttachment[];
  progress: VideoProgressState | null;
};

export async function getWatchItem(
  studentId: string,
  courseId: string,
  itemId: string,
): Promise<WatchItemData | null> {
  if (!(await canAccessItem(studentId, itemId))) return null;

  const [item, progress] = await Promise.all([
    db.contentItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        type: true,
        title: true,
        description: true,
        duration: true,
        courseId: true,
        module: { select: { courseId: true } },
        attachments: {
          where: { status: "active" },
          orderBy: { itemOrder: "asc" },
          select: {
            id: true,
            title: true,
            sourceType: true,
            mimeType: true,
            driveFileId: true,
            externalUrl: true,
            downloadEnabled: true,
          },
        },
      },
    }),
    getVideoProgress(studentId, itemId),
  ]);

  if (!item || item.type !== "video") return null;
  const owningCourseId = item.courseId ?? item.module?.courseId ?? null;
  if (owningCourseId !== courseId) return null;

  return {
    item: {
      id: item.id,
      title: item.title,
      description: item.description,
      duration: item.duration,
    },
    attachments: item.attachments,
    progress,
  };
}
