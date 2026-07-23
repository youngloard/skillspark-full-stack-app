import "server-only";
import { db } from "@/lib/db";
import { canAccessCourse } from "@/lib/course-access";

// Course detail tree for the student surface (M4-S2). Fail-closed: the object
// gate (granted + course active) is the audited `canAccessCourse` probe; the
// subject gate (student active + in window) is requireStudent() at the page.
// Bounded queries (no N+1): the access probe, then one nested read of the tree.

export type CourseDetailItem = {
  id: string;
  type: string; // "video" | "material"
  title: string;
  description: string | null;
  duration: number | null; // video, seconds (may be null until fetched)
  // Material fields (null for videos — a video's driveFileId is NEVER exposed).
  sourceType: string | null; // "upload" | "drive" | "url"
  mimeType: string | null;
  driveFileId: string | null;
  externalUrl: string | null;
  downloadEnabled: boolean;
};

export type CourseDetailModule = {
  id: string;
  title: string;
  description: string | null;
  items: CourseDetailItem[];
};

export type CourseDetail = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  layout: string; // "module" | "flat"
  modules: CourseDetailModule[]; // module layout
  items: CourseDetailItem[]; // flat layout
  moduleCount: number;
  videoCount: number;
  materialCount: number;
};

const ITEM_SELECT = {
  id: true,
  type: true,
  title: true,
  description: true,
  duration: true,
  sourceType: true,
  mimeType: true,
  driveFileId: true,
  externalUrl: true,
  downloadEnabled: true,
} as const;

type RawItem = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  duration: number | null;
  sourceType: string | null;
  mimeType: string | null;
  driveFileId: string | null;
  externalUrl: string | null;
  downloadEnabled: boolean;
};

const toItem = (i: RawItem): CourseDetailItem => ({
  id: i.id,
  type: i.type,
  title: i.title,
  description: i.description,
  duration: i.duration,
  sourceType: i.sourceType,
  downloadEnabled: i.downloadEnabled,
  // Material-only; a video's driveFileId must never reach the client.
  mimeType: i.type === "material" ? i.mimeType : null,
  driveFileId: i.type === "material" ? i.driveFileId : null,
  externalUrl: i.type === "material" ? i.externalUrl : null,
});

export async function getCourseDetail(
  studentId: string,
  courseId: string,
): Promise<CourseDetail | null> {
  // Object-level gate first (fail closed). Not-granted / inactive → null, so
  // the page 404s without leaking whether the course exists.
  if (!(await canAccessCourse(studentId, courseId))) return null;

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      name: true,
      description: true,
      imageUrl: true,
      layout: true,
      modules: {
        orderBy: { moduleOrder: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          // Top-level active items only; attachments hang off parentItemId and
          // are excluded by the moduleId relation scope (they live on the watch
          // page's materials panel, M4-S3).
          items: {
            where: { status: "active" },
            orderBy: { itemOrder: "asc" },
            select: ITEM_SELECT,
          },
        },
      },
      // Flat-layout items sit directly under the course.
      items: { where: { status: "active" }, orderBy: { itemOrder: "asc" }, select: ITEM_SELECT },
    },
  });
  if (!course) return null; // race: toggled inactive/removed after the probe

  // Hide modules with no active items (an all-inactive module renders nothing).
  const modules: CourseDetailModule[] = course.modules
    .map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      items: m.items.map(toItem),
    }))
    .filter((m) => m.items.length > 0);

  const flatItems = course.items.map(toItem);

  const allItems = [...modules.flatMap((m) => m.items), ...flatItems];
  const videoCount = allItems.filter((i) => i.type === "video").length;
  const materialCount = allItems.filter((i) => i.type === "material").length;

  return {
    id: course.id,
    name: course.name,
    description: course.description,
    imageUrl: course.imageUrl,
    layout: course.layout,
    modules,
    items: flatItems,
    moduleCount: modules.length,
    videoCount,
    materialCount,
  };
}
