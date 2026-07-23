import Link from "next/link";
import { requireAdmin } from "@/lib/authorization";
import { db } from "@/lib/db";
import {
  getAdminAnalytics,
  getAnalyticsYears,
  parseAnalyticsFilters,
  drillLabel,
} from "@/lib/admin-analytics";
import { AnalyticsFilters } from "@/components/admin/analytics-filters";
import { DashboardView, type DashboardLens } from "@/components/admin/dashboard-view";
import { StudentJump } from "@/components/admin/student-jump";
import { cn } from "@/lib/cn";

// Admin dashboard (M6) — flexible analytics with a Course ⇄ Exam switch, a
// year→month→day drill-down + course/batch cascade filters, a jump-to-student
// search, and per-lens print-to-PDF. Charts are server SVG. This is /admin.

const LENSES: { value: DashboardLens; label: string }[] = [
  { value: "course", label: "Course" },
  { value: "exam", label: "Exam" },
  { value: "both", label: "Both" },
];

function parseView(v: string | undefined): DashboardLens {
  return v === "exam" || v === "both" ? v : "course";
}

type SP = {
  year?: string;
  month?: string;
  day?: string;
  course?: string;
  batch?: string;
  view?: string;
};

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const filters = parseAnalyticsFilters(sp);
  const view = parseView(sp.view);

  const [data, courses, batches, availableYears] = await Promise.all([
    getAdminAnalytics(filters),
    db.course.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    // Course→batch cascade: when a course is picked, only its batches.
    db.batch.findMany({
      where: filters.courseId ? { batchCourses: { some: { courseId: filters.courseId } } } : {},
      select: { id: true, batchName: true },
      orderBy: { batchName: "asc" },
    }),
    getAnalyticsYears(),
  ]);

  const batchOptions = batches.map((b) => ({ id: b.id, name: b.batchName }));
  const cohortLabel = filters.batchId
    ? (batchOptions.find((b) => b.id === filters.batchId)?.name ?? "Batch")
    : filters.courseId
      ? (courses.find((c) => c.id === filters.courseId)?.name ?? "Course")
      : "All students";
  const dateLabel = drillLabel(filters);

  // Preserve every slicer across the lens links + print href.
  const base = new URLSearchParams();
  for (const k of ["year", "month", "day", "course", "batch"] as const) {
    if (sp[k]) base.set(k, sp[k]!);
  }
  const lensHref = (v: DashboardLens) => {
    const p = new URLSearchParams(base);
    p.set("view", v);
    return `/admin?${p.toString()}`;
  };
  const printParams = new URLSearchParams(base);
  printParams.set("view", view);
  const printHref = `/print?${printParams.toString()}`;

  return (
    <div className="w-full px-5 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">
            Admin console
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-fg">
            Analytics
          </h1>
          <p className="mt-1.5 text-sm text-fg-muted">
            {dateLabel} · {cohortLabel}
          </p>
        </div>
        <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:items-end">
          <StudentJump />
          <a
            href={printHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Download PDF
          </a>
        </div>
      </header>

      <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
        <div
          role="tablist"
          aria-label="Analytics lens"
          className="grid grid-cols-3 items-center gap-0.5 rounded-md bg-surface-2 p-0.5 sm:inline-flex"
        >
          {LENSES.map((l) => {
            const active = l.value === view;
            return (
              <Link
                key={l.value}
                href={lensHref(l.value)}
                scroll={false}
                role="tab"
                aria-selected={active}
                className={cn(
                  "flex min-h-10 items-center justify-center rounded-[7px] px-3 py-1.5 text-[13px] font-medium transition-colors",
                  active
                    ? "bg-bg text-fg shadow-[0_1px_2px_rgba(2,20,20,0.12)]"
                    : "text-fg-muted hover:text-fg",
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
        <AnalyticsFilters
          courses={courses}
          batches={batchOptions}
          year={filters.year}
          month={filters.month}
          day={filters.day}
          courseId={filters.courseId ?? null}
          batchId={filters.batchId ?? null}
          availableYears={availableYears}
        />
      </div>

      <div className="mt-10">
        <DashboardView data={data} cohortLabel={cohortLabel} view={view} />
      </div>
    </div>
  );
}
