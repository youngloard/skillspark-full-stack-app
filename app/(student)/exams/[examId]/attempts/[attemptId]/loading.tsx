// Past-attempt review skeleton (M5-S7) — back link, score header, navigator.
export default function AttemptLoading() {
  return (
    <div className="w-full animate-pulse px-5 py-8 sm:px-8 sm:py-10 lg:px-10">
      <div className="h-4 w-28 rounded bg-surface-2" />
      <div className="mt-6 flex items-end justify-between border-b border-line pb-5">
        <div>
          <div className="h-3.5 w-24 rounded bg-surface-2" />
          <div className="mt-2 h-9 w-40 rounded-md bg-surface-2" />
        </div>
        <div className="h-6 w-20 rounded-full bg-surface-2" />
      </div>
      <div className="mt-5 flex flex-wrap gap-1.5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-8 w-8 rounded-md bg-surface-2" />
        ))}
      </div>
      <div className="mt-8 h-40 rounded-lg border border-line" />
    </div>
  );
}
