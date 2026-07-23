// Generic admin loading skeleton (M6). Shown while the server renders any admin
// page (dashboard, lists, detail) on navigation, so switching sections reacts
// instantly instead of appearing frozen while Supabase responds.

function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-surface-2 ${className}`} />;
}

export default function AdminLoading() {
  return (
    <div className="w-full px-5 py-8 sm:px-6 lg:px-8">
      <Block className="h-3 w-24" />
      <Block className="mt-3 h-8 w-48" />

      <div className="mt-6 flex flex-wrap gap-2">
        <Block className="h-9 w-64" />
        <Block className="h-9 w-32" />
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Block key={i} className="h-11 w-full" />
        ))}
      </div>
    </div>
  );
}
