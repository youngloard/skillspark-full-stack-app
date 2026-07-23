// Exam dashboard skeleton (M5-S6) — mirrors the real header (title, intro, two
// stat blocks) and the hairline level rows, so there's no shift when it loads.
export default function ExamLoading() {
  return (
    <div className="w-full animate-pulse px-5 py-10 sm:px-8 sm:py-12 lg:px-10 lg:py-14">
      <div className="h-3.5 w-16 rounded bg-surface-2" />
      <div className="mt-3 h-9 w-64 max-w-full rounded-md bg-surface-2 sm:h-10" />
      <div className="mt-4 h-4 w-full max-w-xl rounded bg-surface-2" />
      <div className="mt-2 h-4 w-3/5 max-w-md rounded bg-surface-2" />

      <div className="mt-6 flex gap-8">
        <div>
          <div className="h-8 w-12 rounded bg-surface-2" />
          <div className="mt-1.5 h-3 w-24 rounded bg-surface-2" />
        </div>
        <div className="border-l border-line pl-8">
          <div className="h-8 w-14 rounded bg-surface-2" />
          <div className="mt-1.5 h-3 w-20 rounded bg-surface-2" />
        </div>
      </div>

      <div className="mt-10 h-3.5 w-28 rounded bg-surface-2" />
      <div className="mt-1 divide-y divide-line border-t border-line lg:grid lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`flex items-center justify-between gap-4 py-4 lg:flex-col lg:items-start lg:gap-5 lg:px-6 lg:py-6 ${
              i === 0 ? "lg:pl-0" : ""
            } ${i === 2 ? "lg:pr-0" : ""}`}
          >
            <div>
              <div className="h-5 w-24 rounded bg-surface-2" />
              <div className="mt-2 h-3.5 w-36 rounded bg-surface-2" />
            </div>
            <div className="h-9 w-20 rounded-lg bg-surface-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
