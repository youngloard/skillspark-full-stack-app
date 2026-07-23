// Client-safe analytics types, option lists, filter parsing, and bucket math.
// Split out of admin-analytics.ts (which is `server-only`) so client components
// like the slicer bar can import the presets/enums without pulling the DB layer.
// No imports of "server-only" or the db here.

export type Granularity = "day" | "month" | "year";

export type AnalyticsFilters = {
  from: Date;
  to: Date; // exclusive upper bound
  granularity: Granularity;
  courseId?: string | null;
  batchId?: string | null;
};

export type SeriesPoint = { key: string; label: string; value: number };
export type NamedValue = { name: string; value: number };

export type AdminAnalytics = {
  kpis: {
    totalStudents: number;
    activeStudents: number;
    newStudents: number;
    totalAttempts: number;
    avgScorePct: number;
    coursesCount: number;
    batchesCount: number;
    questionsCount: number;
    lessonsCompleted: number;
    /** Attempts scoring above the Poor band, as a 0–100 percentage. */
    passRatePct: number;
    watchMinutes: number; // total watch time (minutes), lifetime for the cohort
    downloads: number; // total material downloads in the window
    expiringSoon: number; // active students whose access ends within 30 days
    loggedInRecently: number; // students with a login in the last 30 days
  };
  enrolments: SeriesPoint[];
  attempts: SeriesPoint[];
  performance: NamedValue[];
  avgByLevel: NamedValue[];
  topCourses: NamedValue[];
  watchByCourse: NamedValue[]; // watch minutes per course (desc)
  trendingCourses: NamedValue[]; // new enrolments per course in the window (desc)
  topStudents: NamedValue[]; // students by avg score % in the window (desc)
  topDownloads: NamedValue[]; // materials by download count in the window (desc)
  watchCompletion: NamedValue[]; // Fully watched / Skipped / In progress
  scoreDistribution: NamedValue[]; // attempts by score band (histogram)
  batchPerformance: NamedValue[]; // avg score % per batch (desc)
  topBatches: NamedValue[]; // students per batch (desc)
  range: { from: string; to: string; granularity: Granularity };
  courseId: string | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Performance labels are ordinal; fix their order best → worst.
export const PERFORMANCE_ORDER = ["Excellent", "Very Good", "Good", "Poor"] as const;

export const MONTH_NAMES = MONTHS;

// The earliest year the "All time" / year picker offers.
export const ANALYTICS_MIN_YEAR = 2023;

/** Drill-down date selection: pick a year → month → day. `year: "all"` spans
 *  everything (yearly buckets). Echoed back for the filter UI. */
export type DrillDate = { year: number | "all"; month: number | null; day: number | null };

function toInt(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** Resolve dashboard search params into a concrete window + granularity.
 *  Defaults: the current year, monthly buckets, no course/batch filter. */
export function parseAnalyticsFilters(sp: {
  year?: string;
  month?: string;
  day?: string;
  course?: string;
  batch?: string;
}): AnalyticsFilters & DrillDate {
  const now = new Date();
  const currentYear = now.getUTCFullYear();

  const yearRaw = sp.year;
  let year: number | "all";
  if (yearRaw === "all") year = "all";
  else {
    const y = toInt(yearRaw);
    year = y && y >= ANALYTICS_MIN_YEAR && y <= currentYear ? y : currentYear;
  }

  let month = year === "all" ? null : toInt(sp.month);
  if (month !== null && (month < 1 || month > 12)) month = null;
  let day = month === null ? null : toInt(sp.day);
  if (year !== "all" && month !== null && day !== null) {
    const max = daysInMonth(year, month);
    if (day < 1 || day > max) day = null;
  }

  let from: Date;
  let to: Date;
  let granularity: Granularity;
  if (year === "all") {
    from = new Date(Date.UTC(ANALYTICS_MIN_YEAR, 0, 1));
    to = new Date(Date.UTC(currentYear + 1, 0, 1));
    granularity = "year";
  } else if (month === null) {
    from = new Date(Date.UTC(year, 0, 1));
    to = new Date(Date.UTC(year + 1, 0, 1));
    granularity = "month";
  } else if (day === null) {
    from = new Date(Date.UTC(year, month - 1, 1));
    to = new Date(Date.UTC(year, month, 1));
    granularity = "day";
  } else {
    from = new Date(Date.UTC(year, month - 1, day));
    to = new Date(Date.UTC(year, month - 1, day + 1));
    granularity = "day";
  }

  return {
    from,
    to,
    granularity,
    courseId: sp.course && sp.course !== "all" ? sp.course : null,
    batchId: sp.batch && sp.batch !== "all" ? sp.batch : null,
    year,
    month,
    day,
  };
}

/** Human label for the current drill selection (e.g. "July 2026", "2026", "All time"). */
export function drillLabel(d: DrillDate): string {
  if (d.year === "all") return "All time";
  if (d.month === null) return String(d.year);
  const m = MONTHS[d.month - 1];
  if (d.day === null) return `${m} ${d.year}`;
  return `${d.day} ${m} ${d.year}`;
}

// ---- Bucket math (pure) ----

function truncUTC(d: Date, g: Granularity): Date {
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      g === "year" ? 0 : d.getUTCMonth(),
      g === "day" ? d.getUTCDate() : 1,
    ),
  );
}

function advance(d: Date, g: Granularity): Date {
  const n = new Date(d);
  if (g === "day") n.setUTCDate(n.getUTCDate() + 1);
  else if (g === "month") n.setUTCMonth(n.getUTCMonth() + 1);
  else n.setUTCFullYear(n.getUTCFullYear() + 1);
  return n;
}

function bucketKey(d: Date, g: Granularity): string {
  const iso = d.toISOString();
  return g === "day" ? iso.slice(0, 10) : g === "month" ? iso.slice(0, 7) : iso.slice(0, 4);
}

function bucketLabel(d: Date, g: Granularity): string {
  if (g === "day") return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  if (g === "month") return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
  return String(d.getUTCFullYear());
}

/** Continuous bucket skeleton across the range (so zero-activity buckets show). */
export function enumerateBuckets(from: Date, to: Date, g: Granularity): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  let cur = truncUTC(from, g);
  for (let i = 0; cur < to && i < 400; i++) {
    out.push({ key: bucketKey(cur, g), label: bucketLabel(cur, g), value: 0 });
    cur = advance(cur, g);
  }
  return out;
}

export function fillSeries(
  buckets: SeriesPoint[],
  rows: { bucket: Date; value: bigint | number }[],
  g: Granularity,
): SeriesPoint[] {
  const byKey = new Map(rows.map((r) => [bucketKey(new Date(r.bucket), g), Number(r.value)]));
  return buckets.map((b) => ({ ...b, value: byKey.get(b.key) ?? 0 }));
}
