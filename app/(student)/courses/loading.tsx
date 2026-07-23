// My Courses index skeleton — matches the layout so there's no shift.
export default function CoursesLoading() {
  return (
    <div className="w-full animate-pulse px-5 py-10 sm:px-8 sm:py-12 lg:px-10 lg:py-14">
      <div className="h-3.5 w-20 rounded bg-surface-2" />
      <div className="mt-4 h-9 w-56 max-w-full rounded-md bg-surface-2" />
      <div className="mt-9 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="overflow-hidden rounded-lg border border-line bg-surface">
            <div className="aspect-[16/10] bg-surface-2" />
            <div className="space-y-2.5 p-5">
              <div className="h-3 w-16 rounded bg-surface-2" />
              <div className="h-4 w-3/4 rounded bg-surface-2" />
              <div className="h-3 w-full rounded bg-surface-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
