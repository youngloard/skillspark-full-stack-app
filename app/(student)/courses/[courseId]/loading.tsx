// Course-detail skeleton — matches the real layout so there's no shift.
export default function CourseDetailLoading() {
  return (
    <div className="w-full animate-pulse px-5 py-10 sm:px-8 sm:py-12 lg:px-10 lg:py-14">
      <div className="h-4 w-24 rounded bg-surface-2" />
      <div className="mt-6 h-3.5 w-20 rounded bg-surface-2" />
      <div className="mt-3 h-9 w-2/3 max-w-lg rounded-md bg-surface-2" />
      <div className="mt-4 h-4 w-full max-w-md rounded bg-surface-2" />
      <div className="mt-8 space-y-4 border-t border-line pt-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-9 w-9 shrink-0 rounded-lg bg-surface-2" />
            <div className="h-4 w-1/2 max-w-sm rounded bg-surface-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
