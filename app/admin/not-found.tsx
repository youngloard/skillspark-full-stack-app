import Link from "next/link";

// Admin-area 404 (M6-S1). Renders inside the admin shell (sidebar stays), so a
// not-yet-built section link during the M6 build lands here calmly rather than
// on a bare framework page.

export default function AdminNotFound() {
  return (
    <div className="w-full px-5 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="max-w-md">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-fg-subtle">Not found</p>
        <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight text-fg">
          This page isn&apos;t here
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">
          The page you&apos;re looking for doesn&apos;t exist or hasn&apos;t been built yet.
        </p>
        <Link
          href="/admin"
          className="mt-6 inline-flex items-center rounded-md bg-accent px-5 py-3 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
        >
          Back to admin home
        </Link>
      </div>
    </div>
  );
}
