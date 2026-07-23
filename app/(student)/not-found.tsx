import Link from "next/link";

// Student-area 404 (M4-S5). Renders for notFound() — an unowned/missing course
// or item — inside the student layout (topbar stays). Non-committal wording so
// it never reveals whether the resource exists.

export default function StudentNotFound() {
  return (
    <div className="w-full px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
      <div className="max-w-md">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-fg-subtle">Not found</p>
        <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight text-fg">
          This isn&apos;t available
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">
          The page you&apos;re looking for doesn&apos;t exist, or it isn&apos;t part of your access.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex items-center rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
