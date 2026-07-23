import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/authorization";
import { getModuleItems } from "@/lib/admin-courses";
import { ContentItemManager } from "@/components/admin/courses/content-item-manager";

// Module detail (M6-S6) — manage the module's content items (videos +
// materials): add, reorder, delete.

export default async function ModuleDetailPage({
  params,
}: {
  params: Promise<{ id: string; moduleId: string }>;
}) {
  await requireAdmin();
  const { id, moduleId } = await params;
  const data = await getModuleItems(moduleId);
  // Guard against a module id that isn't part of this course's URL.
  if (!data || data.module.courseId !== id) notFound();

  const mod = data.module;

  return (
    <div className="w-full px-5 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <Link
          href={`/admin/courses/${id}`}
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
          {mod.courseName}
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-fg">
          {mod.title}
        </h1>
        {mod.description ? (
          <p className="mt-2 max-w-2xl text-sm text-fg-muted">{mod.description}</p>
        ) : null}
      </header>

      <ContentItemManager parent={{ kind: "module", id: moduleId }} items={data.items} />
    </div>
  );
}
