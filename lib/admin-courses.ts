import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import { db } from "@/lib/db";
import { MAX_SEARCH_CHARS } from "@/lib/search-limits";

// Admin course roster + detail (M6-S5). List is searchable (name) + status-
// filterable, page-paginated. Detail carries the course's modules (ordered,
// with item counts) for the module-management table. Admin-side: sees all
// courses/modules regardless of status (no access gating — that's the student
// lib/course-detail.ts).

export type CourseStatusFilter = "all" | "active" | "inactive";

export type CourseListItem = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  layout: string;
  moduleCount: number;
};

export type CourseListResult = {
  items: CourseListItem[];
  total: number;
  page: number;
  pageCount: number;
};

const COURSES_PAGE_SIZE = 25;

export async function listCourses(filters: {
  q?: string;
  status?: CourseStatusFilter;
  page?: number;
  take?: number;
}): Promise<CourseListResult> {
  const take = filters.take ?? COURSES_PAGE_SIZE;
  const trimmed = filters.q?.trim().slice(0, MAX_SEARCH_CHARS);
  const where: Prisma.CourseWhereInput = {
    ...(trimmed ? { name: { contains: trimmed, mode: Prisma.QueryMode.insensitive } } : {}),
    ...(filters.status && filters.status !== "all" ? { status: filters.status } : {}),
  };

  const total = await db.course.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / take));
  const page = Math.min(Math.max(1, Math.floor(filters.page ?? 1)), pageCount);

  const rows = await db.course.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * take,
    take,
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      layout: true,
      _count: { select: { modules: true } },
    },
  });

  return {
    items: rows.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      status: c.status,
      layout: c.layout,
      moduleCount: c._count.modules,
    })),
    total,
    page,
    pageCount,
  };
}

export type CourseSearchHit = { id: string; name: string };

/** Type-ahead for the course chooser (add-batch / add-student). */
export async function searchCourses(q: string, take = 8): Promise<CourseSearchHit[]> {
  const trimmed = q.trim().slice(0, MAX_SEARCH_CHARS);
  const rows = await db.course.findMany({
    where: trimmed ? { name: { contains: trimmed, mode: Prisma.QueryMode.insensitive } } : {},
    orderBy: { name: "asc" },
    take,
    select: { id: true, name: true },
  });
  return rows;
}

export type AdminCourseDetail = {
  course: { id: string; name: string; description: string | null; status: string; layout: string };
  modules: { id: string; title: string; description: string | null; itemCount: number }[];
};

export async function getAdminCourseDetail(id: string): Promise<AdminCourseDetail | null> {
  const course = await db.course.findUnique({
    where: { id },
    select: { id: true, name: true, description: true, status: true, layout: true },
  });
  if (!course) return null;

  const modules = await db.module.findMany({
    where: { courseId: id },
    orderBy: { moduleOrder: "asc" },
    select: {
      id: true,
      title: true,
      description: true,
      _count: { select: { items: true } },
    },
  });

  return {
    course,
    modules: modules.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      itemCount: m._count.items,
    })),
  };
}

export type ModuleItem = {
  id: string;
  type: string; // "video" | "material"
  title: string;
  description: string | null;
  status: string;
  duration: number | null;
  sourceType: string | null;
  downloadEnabled: boolean;
};

export type ModuleWithItems = {
  module: {
    id: string;
    title: string;
    description: string | null;
    courseId: string;
    courseName: string;
  };
  items: ModuleItem[];
};

const ITEM_SELECT = {
  id: true,
  type: true,
  title: true,
  description: true,
  status: true,
  duration: true,
  sourceType: true,
  downloadEnabled: true,
} as const;

/** A flat course's content items (courseId parent — no modules). */
export async function getCourseItems(courseId: string): Promise<ModuleItem[]> {
  return db.contentItem.findMany({
    where: { courseId },
    orderBy: { itemOrder: "asc" },
    select: ITEM_SELECT,
  });
}

/** A module's top-level content items (module-level; attachments excluded). */
export async function getModuleItems(moduleId: string): Promise<ModuleWithItems | null> {
  const mod = await db.module.findUnique({
    where: { id: moduleId },
    select: {
      id: true,
      title: true,
      description: true,
      courseId: true,
      course: { select: { name: true } },
    },
  });
  if (!mod) return null;

  const items = await db.contentItem.findMany({
    where: { moduleId },
    orderBy: { itemOrder: "asc" },
    select: ITEM_SELECT,
  });

  return {
    module: {
      id: mod.id,
      title: mod.title,
      description: mod.description,
      courseId: mod.courseId,
      courseName: mod.course.name,
    },
    items,
  };
}
