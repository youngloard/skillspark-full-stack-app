import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteCourse } from "@/actions/courses";
import { requireAdmin } from "@/lib/authorization";
import { getAdminCourseDetail, getCourseItems } from "@/lib/admin-courses";
import { AsyncButton } from "@/components/admin/async-button";
import { CourseStatusToggle } from "@/components/admin/courses/course-status-toggle";
import { CourseEditForm } from "@/components/admin/courses/course-edit-form";
import { ModuleManager } from "@/components/admin/courses/module-manager";
import { ContentItemManager } from "@/components/admin/courses/content-item-manager";

// Course detail (M6-S5/S6) — edit, status toggle, layout, delete, and content
// management: modules (module layout) or content items directly (flat layout).

export default async function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const detail = await getAdminCourseDetail(id);
  if (!detail) notFound();

  const { course } = detail;
  const canChangeLayout = detail.modules.length === 0;
  const flatItems = course.layout === "flat" ? await getCourseItems(id) : [];

  return (
    <div className="w-full px-5 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/admin/courses"
            className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="m15 6-6 6 6 6"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Courses
          </Link>
          <h1 className="mt-2 break-words font-display text-3xl font-semibold tracking-tight text-fg sm:truncate">
            {course.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <CourseStatusToggle id={course.id} status={course.status} size="md" />
            <span className="rounded-md bg-surface-2 px-2.5 py-1 text-xs font-medium capitalize text-fg-muted">
              {course.layout} layout
            </span>
          </div>
          {course.description ? (
            <p className="mt-3 max-w-2xl text-sm text-fg-muted">{course.description}</p>
          ) : null}
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center [&>*]:w-full sm:[&>*]:w-auto">
          <CourseEditForm
            id={course.id}
            name={course.name}
            description={course.description}
            layout={course.layout}
            canChangeLayout={canChangeLayout}
          />
          <AsyncButton
            action={deleteCourse.bind(null, { id })}
            successMessage="Course deleted."
            confirm={`Delete ${course.name}? Its modules and content are removed. This can't be undone.`}
            redirectTo="/admin/courses"
            variant="danger"
          >
            Delete course
          </AsyncButton>
        </div>
      </header>

      {course.layout === "flat" ? (
        <ContentItemManager parent={{ kind: "course", id }} items={flatItems} />
      ) : (
        <ModuleManager courseId={id} layout={course.layout} modules={detail.modules} />
      )}
    </div>
  );
}
