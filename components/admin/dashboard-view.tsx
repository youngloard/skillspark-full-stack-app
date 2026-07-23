import type { AdminAnalytics, NamedValue } from "@/lib/admin-analytics-shared";
import { ChartFrame } from "@/components/admin/charts/chart-frame";
import { DonutChart } from "@/components/admin/charts/donut-chart";
import { SeriesChart } from "@/components/admin/charts/series-chart";
import { StatTile } from "@/components/admin/charts/stat-tile";

// The analytics body (M6), split into a Course lens and an Exam lens (owner: a
// switch so course vs exam analytics can be viewed — and printed — separately).
// Forms: vertical column charts + donuts for composition — no horizontal bars,
// no line charts (owner). Pure server render.

export type DashboardLens = "course" | "exam" | "both";

const num = (n: number) => n.toLocaleString();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const col = (d: NamedValue[]) => d.map((x) => ({ key: x.name, label: x.name, value: x.value }));

const PERFORMANCE_COLORS = [
  "var(--accent)",
  "var(--color-teal-400)",
  "var(--color-warning)",
  "var(--color-danger)",
];
const COMPLETION_COLORS = ["var(--accent)", "var(--color-warning)", "var(--color-fg-subtle)"];

function fmtMinutes(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function DashboardView({
  data,
  cohortLabel,
  view,
}: {
  data: AdminAnalytics;
  cohortLabel: string;
  view: DashboardLens;
}) {
  return (
    <div className="flex flex-col gap-12">
      {(view === "course" || view === "both") && (
        <CourseLens data={data} cohortLabel={cohortLabel} />
      )}
      {view === "both" && <div className="border-t border-hairline" />}
      {(view === "exam" || view === "both") && <ExamLens data={data} />}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
      {children}
    </p>
  );
}

function CourseLens({ data, cohortLabel }: { data: AdminAnalytics; cohortLabel: string }) {
  const k = data.kpis;
  return (
    <section className="flex flex-col gap-8">
      <SectionLabel>Course analytics</SectionLabel>

      <div className="grid grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-4">
        <StatTile
          label="Students"
          value={num(k.totalStudents)}
          hint={`${num(k.activeStudents)} active`}
        />
        <StatTile label="New (range)" value={num(k.newStudents)} hint={cohortLabel} />
        <StatTile label="Expiring ≤30d" value={num(k.expiringSoon)} hint="access ending" />
        <StatTile label="Active ≤30d" value={num(k.loggedInRecently)} hint="logged in" />
        <StatTile
          label="Courses"
          value={num(k.coursesCount)}
          hint={`${num(k.batchesCount)} batches`}
        />
        <StatTile label="Lessons done" value={num(k.lessonsCompleted)} hint="completed" />
        <StatTile label="Watch time" value={fmtMinutes(k.watchMinutes)} hint="total, video" />
        <StatTile label="Material downloads" value={num(k.downloads)} hint="notes & docs" />
      </div>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <ChartFrame
          title="Enrolments"
          subtitle="New students per period"
          meta={`${num(k.newStudents)} total`}
        >
          <SeriesChart
            data={data.enrolments}
            variant="bar"
            emptyLabel="No enrolments in this range yet."
          />
        </ChartFrame>
        <ChartFrame title="Video watch completion" subtitle="Fully watched vs skipped ahead">
          <DonutChart
            data={data.watchCompletion}
            colors={COMPLETION_COLORS}
            emptyLabel="No lessons started yet."
          />
        </ChartFrame>
        <ChartFrame title="Top courses by watch time" subtitle="Minutes of video actually played">
          <SeriesChart
            data={col(data.watchByCourse)}
            variant="bar"
            valueSuffix="m"
            emptyLabel="No watch time recorded yet."
          />
        </ChartFrame>
        <ChartFrame title="Trending courses" subtitle="New enrolments in this range">
          <SeriesChart
            data={col(data.trendingCourses)}
            variant="bar"
            emptyLabel="No new enrolments in this range."
          />
        </ChartFrame>
        <ChartFrame
          title="Most-downloaded materials"
          subtitle="Notes & documents (videos aren't downloadable)"
        >
          <SeriesChart
            data={col(data.topDownloads)}
            variant="bar"
            emptyLabel="No material downloads in this range yet."
          />
        </ChartFrame>
        <ChartFrame title="Students per batch" subtitle="Roster size by batch">
          <SeriesChart
            data={col(data.topBatches)}
            variant="bar"
            emptyLabel="No batches with students yet."
          />
        </ChartFrame>
      </div>
    </section>
  );
}

function ExamLens({ data }: { data: AdminAnalytics }) {
  const k = data.kpis;
  return (
    <section className="flex flex-col gap-8">
      <SectionLabel>Exam analytics (JET)</SectionLabel>

      <div className="grid grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-4">
        <StatTile label="Attempts" value={num(k.totalAttempts)} hint="in range" />
        <StatTile label="Avg score" value={`${k.avgScorePct}%`} hint="in range" />
        <StatTile label="Pass rate" value={`${k.passRatePct}%`} hint="above Poor" />
        <StatTile label="Questions" value={num(k.questionsCount)} hint="JET bank" />
      </div>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <ChartFrame
          title="Exam activity"
          subtitle="Attempts completed per period"
          meta={`${num(k.totalAttempts)} total`}
        >
          <SeriesChart
            data={data.attempts}
            variant="bar"
            emptyLabel="No attempts in this range yet."
          />
        </ChartFrame>
        <ChartFrame title="Performance mix" subtitle="Attempts by result band">
          <DonutChart
            data={data.performance}
            colors={PERFORMANCE_COLORS}
            emptyLabel="No graded attempts in this range yet."
          />
        </ChartFrame>
        <ChartFrame title="Score distribution" subtitle="Attempts by score band">
          <SeriesChart
            data={col(data.scoreDistribution)}
            variant="bar"
            emptyLabel="No attempts in this range yet."
          />
        </ChartFrame>
        <ChartFrame title="Average score by level" subtitle="Mean result per difficulty">
          <SeriesChart
            data={data.avgByLevel.map((l) => ({ key: l.name, label: cap(l.name), value: l.value }))}
            variant="bar"
            valueSuffix="%"
            emptyLabel="No attempts to average yet."
          />
        </ChartFrame>
        <ChartFrame title="Top performing students" subtitle="Average score in range">
          <SeriesChart
            data={col(data.topStudents)}
            variant="bar"
            valueSuffix="%"
            emptyLabel="No graded attempts in this range yet."
          />
        </ChartFrame>
        <ChartFrame title="Batch performance" subtitle="Average score by batch">
          <SeriesChart
            data={col(data.batchPerformance)}
            variant="bar"
            valueSuffix="%"
            emptyLabel="No graded attempts by batch yet."
          />
        </ChartFrame>
      </div>
    </section>
  );
}
