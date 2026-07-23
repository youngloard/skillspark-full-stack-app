import { db } from "@/lib/db";
import { guardAdminAccess } from "@/lib/admin-guard";
import { getAdminAnalytics, parseAnalyticsFilters, drillLabel } from "@/lib/admin-analytics";
import { DashboardView, type DashboardLens } from "@/components/admin/dashboard-view";
import { PrintFrame } from "@/components/admin/print-frame";

// The analytics PDF report (M6). Top-level route (outside the admin shell so it
// prints clean), admin-guarded, reads the same drill-down + lens params.

type SP = {
  year?: string;
  month?: string;
  day?: string;
  course?: string;
  batch?: string;
  view?: string;
};

export default async function AnalyticsReport({ searchParams }: { searchParams: Promise<SP> }) {
  await guardAdminAccess();
  const sp = await searchParams;
  const filters = parseAnalyticsFilters(sp);
  const view: DashboardLens = sp.view === "exam" || sp.view === "both" ? sp.view : "course";
  const viewLabel =
    view === "course" ? "Course analytics" : view === "exam" ? "Exam analytics" : "Full analytics";

  const [data, course, batch] = await Promise.all([
    getAdminAnalytics(filters),
    filters.courseId
      ? db.course.findUnique({ where: { id: filters.courseId }, select: { name: true } })
      : Promise.resolve(null),
    filters.batchId
      ? db.batch.findUnique({ where: { id: filters.batchId }, select: { batchName: true } })
      : Promise.resolve(null),
  ]);

  const cohortLabel = batch?.batchName ?? course?.name ?? "All students";
  const generatedAt = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <PrintFrame
      title={viewLabel}
      subtitle={`${drillLabel(filters)} · ${cohortLabel} · Generated ${generatedAt}`}
    >
      <DashboardView data={data} cohortLabel={cohortLabel} view={view} />
    </PrintFrame>
  );
}
