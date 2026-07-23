import type { StudentReport } from "@/lib/admin-students";
import { ChartFrame } from "@/components/admin/charts/chart-frame";
import { DonutChart } from "@/components/admin/charts/donut-chart";
import { SeriesChart } from "@/components/admin/charts/series-chart";
import { StatTile } from "@/components/admin/charts/stat-tile";

const PERFORMANCE_COLORS = [
  "var(--accent)",
  "var(--color-teal-400)",
  "var(--color-warning)",
  "var(--color-danger)",
];

// Per-student analytics (M6-S3, extended M6). Split into two lenses — Exam and
// Course (video/material) — that the profile page switches between and the PDF
// stacks. Pure render (no client hooks) so both contexts share it. "Invisible
// cards": spacing + hairlines only.

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const num = (n: number) => n.toLocaleString();

/** Full report for the PDF: facts + both lenses stacked. */
export function StudentReportView({ report }: { report: StudentReport }) {
  return (
    <div className="flex flex-col gap-10">
      <ProfileFacts report={report} />
      <div className="border-t border-hairline" />
      <ExamAnalytics report={report} />
      <div className="border-t border-hairline" />
      <CourseAnalytics report={report} />
    </div>
  );
}

export function ProfileFacts({ report }: { report: StudentReport }) {
  const { student } = report;
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-5 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
      <Fact label="Student code" value={student.studentCode ?? "—"} mono />
      <Fact label="Status" value={student.status === "active" ? "Active" : "Blocked"} />
      <Fact
        label="Access window"
        value={`${fmtDate(student.accessStartDate)} – ${fmtDate(student.accessEndDate)}`}
      />
      <Fact label="Joined" value={fmtDate(student.createdAt)} />
      <Fact
        label="Last login"
        value={student.lastLoginAt ? fmtDate(student.lastLoginAt) : "Never"}
      />
    </dl>
  );
}

export function ExamAnalytics({ report }: { report: StudentReport }) {
  const { kpis } = report;
  return (
    <div className="flex flex-col gap-10">
      <section className="grid grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-4">
        <StatTile label="Attempts" value={num(kpis.attempts)} />
        <StatTile label="Avg score" value={`${kpis.avgScorePct}%`} />
        <StatTile label="Best score" value={`${kpis.bestScorePct}%`} />
        <StatTile label="Pass rate" value={`${kpis.passRatePct}%`} hint="above Poor" />
      </section>

      <section className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <ChartFrame title="Scores over time" subtitle="Result per attempt (%)">
          <SeriesChart data={report.scoreSeries} variant="bar" emptyLabel="No attempts yet." />
        </ChartFrame>
        <ChartFrame title="Performance mix" subtitle="Attempts by result band">
          <DonutChart
            data={report.performance}
            colors={PERFORMANCE_COLORS}
            emptyLabel="No graded attempts yet."
          />
        </ChartFrame>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-fg">Exam history</h3>
        {report.attempts.length === 0 ? (
          <p className="mt-3 text-sm text-fg-muted">No exam attempts recorded.</p>
        ) : (
          <div className="mt-3">
            <div className="sm:hidden">
              {[...report.attempts].reverse().map((a) => (
                <details key={a.id} className="group border-b border-hairline">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 py-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">
                        {a.examName}
                      </span>
                      <span className="tabular block text-xs text-fg-muted">
                        {fmtDate(a.completedAt)}
                      </span>
                    </span>
                    <span className="tabular text-sm font-semibold text-fg">
                      {Math.round(a.percentage * 100)}%
                    </span>
                    <svg
                      className="shrink-0 text-fg-subtle transition-transform group-open:rotate-180 motion-reduce:transition-none"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="m7 10 5 5 5-5"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </summary>
                  <dl className="grid grid-cols-2 gap-3 pb-3 text-xs">
                    <Fact label="Level" value={a.level} />
                    <Fact label="Score" value={`${a.score}/${a.totalQuestions}`} mono />
                    <Fact label="Result" value={a.performanceLabel} />
                  </dl>
                </details>
              ))}
            </div>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-fg-subtle">
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Exam</th>
                    <th className="py-2 pr-4 font-medium">Level</th>
                    <th className="py-2 pr-4 font-medium">Score</th>
                    <th className="py-2 pr-4 font-medium">%</th>
                    <th className="py-2 pr-4 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {[...report.attempts].reverse().map((a) => (
                    <tr key={a.id} className="border-b border-hairline">
                      <td className="tabular py-3 pr-4 text-fg-muted">{fmtDate(a.completedAt)}</td>
                      <td className="py-3 pr-4 text-fg">{a.examName}</td>
                      <td className="py-3 pr-4 capitalize text-fg-muted">{a.level}</td>
                      <td className="tabular py-3 pr-4 text-fg-muted">
                        {a.score}/{a.totalQuestions}
                      </td>
                      <td className="tabular py-3 pr-4 font-medium text-fg">
                        {Math.round(a.percentage * 100)}%
                      </td>
                      <td className="py-3 pr-4 text-fg-muted">{a.performanceLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export function CourseAnalytics({ report }: { report: StudentReport }) {
  const { video, kpis } = report;
  const hours = Math.floor(video.watchMinutes / 60);
  const mins = video.watchMinutes % 60;
  const watchLabel = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  return (
    <div className="flex flex-col gap-10">
      <section className="grid grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Watch time" value={watchLabel} hint="content played" />
        <StatTile label="Lessons done" value={num(kpis.lessonsCompleted)} hint="completed" />
        <StatTile label="Fully watched" value={num(video.videosFullyWatched)} hint="videos" />
        <StatTile label="Skimmed" value={num(video.videosSkipped)} hint="completed <80% played" />
        <StatTile label="Downloads" value={num(video.downloads)} hint="materials" />
      </section>

      <section className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <ChartFrame title="Watch time by course" subtitle="Minutes of content played">
          <SeriesChart data={video.byCourse} variant="bar" emptyLabel="No watch activity yet." />
        </ChartFrame>
        <div>
          <h3 className="text-sm font-semibold text-fg">Enrolled courses</h3>
          {report.courses.length === 0 ? (
            <p className="mt-3 text-sm text-fg-muted">Not enrolled in any course.</p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {report.courses.map((c) => (
                <li
                  key={c.id}
                  className="rounded-md bg-surface-2 px-3 py-1.5 text-[13px] text-fg-muted"
                >
                  {c.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-fg-subtle">{label}</dt>
      <dd className={`mt-1 truncate text-sm text-fg${mono ? " tabular" : ""}`}>{value}</dd>
    </div>
  );
}
