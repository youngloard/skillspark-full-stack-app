import Link from "next/link";
import { requireAdmin } from "@/lib/authorization";
import { listCourses, type CourseStatusFilter } from "@/lib/admin-courses";
import { CoursesToolbar } from "@/components/admin/courses/courses-toolbar";
import { CoursesTable } from "@/components/admin/courses/courses-table";
import { Pagination } from "@/components/admin/pagination";
import { cn } from "@/lib/cn";

// Courses section (M6-S5): searchable, status-filterable, page-paginated course
// list with inline quick-add and an inline status toggle. Each row opens the
// course detail (module management).

const STATUSES: { value: CourseStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const status: CourseStatusFilter =
    sp.status === "active" || sp.status === "inactive" ? sp.status : "all";
  const q = sp.q ?? "";
  const requestedPage = Number.parseInt(sp.page ?? "1", 10) || 1;
  const { items, total, page, pageCount } = await listCourses({ q, status, page: requestedPage });

  const statusHref = (value: CourseStatusFilter) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (value !== "all") p.set("status", value);
    return `/admin/courses${p.toString() ? `?${p}` : ""}`;
  };
  const pageHref = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status !== "all") p.set("status", status);
    if (n > 1) p.set("page", String(n));
    return `/admin/courses${p.toString() ? `?${p}` : ""}`;
  };

  return (
    <div className="w-full px-5 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">Admin console</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-fg">Courses</h1>
      </header>

      <CoursesToolbar initialQuery={q} />

      <div className="mt-4 flex w-fit items-center gap-0.5 self-start rounded-md bg-surface-2 p-0.5">
        {STATUSES.map((s) => {
          const active = s.value === status;
          return (
            <Link
              key={s.value}
              href={statusHref(s.value)}
              scroll={false}
              className={cn(
                "rounded-[7px] px-3 py-1.5 text-[13px] font-medium transition-colors",
                active
                  ? "bg-bg text-fg shadow-[0_1px_2px_rgba(2,20,20,0.12)]"
                  : "text-fg-muted hover:text-fg",
              )}
            >
              {s.label}
            </Link>
          );
        })}
      </div>

      {items.length === 0 ? (
        <p className="mt-10 text-sm text-fg-muted">
          {q ? `No courses match “${q}”.` : "No courses yet — add your first above."}
        </p>
      ) : (
        <CoursesTable items={items} />
      )}

      {items.length > 0 ? (
        <Pagination
          page={page}
          pageCount={pageCount}
          total={total}
          unit="courses"
          makeHref={pageHref}
        />
      ) : null}
    </div>
  );
}
