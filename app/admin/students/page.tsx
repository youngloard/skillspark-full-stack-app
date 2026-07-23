import Link from "next/link";
import { requireAdmin } from "@/lib/authorization";
import { listStudents, type StudentStatusFilter } from "@/lib/admin-students";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { StudentsToolbar } from "@/components/admin/students/students-toolbar";
import { StudentFilters } from "@/components/admin/students/student-filters";
import { StudentsTable } from "@/components/admin/students/students-table";
import { Pagination } from "@/components/admin/pagination";
import { cn } from "@/lib/cn";

// Students section (M6-S3): searchable, course/batch-filterable, page-paginated
// roster with inline quick-add, per-row View/Edit/Delete, multi-select delete,
// multi-select assign-to-batch, and select-all-across-pages.

const STATUSES: { value: StudentStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "blocked", label: "Blocked" },
];

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    course?: string;
    batch?: string;
    page?: string;
  }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const status: StudentStatusFilter =
    sp.status === "active" || sp.status === "blocked" ? sp.status : "all";
  const q = sp.q ?? "";
  // Multi-select filters travel as comma-separated ids.
  const idList = (raw?: string) =>
    (raw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 50);
  const courseIds = idList(sp.course);
  const batchIds = idList(sp.batch);
  const requestedPage = Number.parseInt(sp.page ?? "1", 10) || 1;

  const [{ items, total, page, pageCount }, selectedCourses, selectedBatches] = await Promise.all([
    listStudents({ q, status, courseIds, batchIds, page: requestedPage }),
    courseIds.length
      ? db.course.findMany({
          where: { id: { in: courseIds } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : [],
    batchIds.length
      ? db.batch.findMany({
          where: { id: { in: batchIds } },
          select: { id: true, batchCode: true, batchName: true },
          orderBy: { batchName: "asc" },
        })
      : [],
  ]);

  // Preserve every active filter across status pills and pagination links.
  const buildHref = (over: Partial<Record<string, string>>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | undefined> = {
      q,
      status: status !== "all" ? status : undefined,
      course: courseIds.length ? courseIds.join(",") : undefined,
      batch: batchIds.length ? batchIds.join(",") : undefined,
      page: page > 1 ? String(page) : undefined,
      ...over,
    };
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
    return `/admin/students${p.toString() ? `?${p}` : ""}`;
  };
  const statusHref = (value: StudentStatusFilter) =>
    buildHref({ status: value !== "all" ? value : undefined, page: undefined });
  const pageHref = (n: number) => buildHref({ page: n > 1 ? String(n) : undefined });

  const filters = { q, status, courseIds, batchIds };

  return (
    <div className="w-full px-5 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">Admin console</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-fg">
          Students
        </h1>
      </header>

      <StudentsToolbar initialQuery={q} />

      <div className="mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="grid grid-cols-3 items-center gap-0.5 rounded-md bg-surface-2 p-0.5 sm:flex">
          {STATUSES.map((s) => {
            const active = s.value === status;
            return (
              <Link
                key={s.value}
                href={statusHref(s.value)}
                scroll={false}
                className={cn(
                  "flex min-h-10 items-center justify-center rounded-[7px] px-3 py-1.5 text-[13px] font-medium transition-colors",
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
        <StudentFilters
          courses={selectedCourses.map((c) => ({ id: c.id, label: c.name }))}
          batches={selectedBatches.map((b) => ({
            id: b.id,
            label: b.batchName,
            sublabel: b.batchCode,
          }))}
        />
      </div>

      {items.length === 0 ? (
        <p className="mt-10 text-sm text-fg-muted">
          {q || courseIds.length || batchIds.length
            ? "No students match these filters."
            : "No students yet — add your first above."}
        </p>
      ) : (
        <StudentsTable
          items={items}
          total={total}
          filters={filters}
          platformUrl={env().EMAIL_PLATFORM_URL}
        />
      )}

      {items.length > 0 ? (
        <Pagination
          page={page}
          pageCount={pageCount}
          total={total}
          unit="students"
          makeHref={pageHref}
        />
      ) : null}
    </div>
  );
}
