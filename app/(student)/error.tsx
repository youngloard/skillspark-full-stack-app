"use client";

// Student-area error boundary (M4-S5). Catches render/data errors in any
// student route and shows a calm, on-brand retry instead of the raw error
// page. The topbar (in the layout above) stays mounted.

export default function StudentError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="w-full px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
      <div className="max-w-md">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-fg-subtle">
          Something went wrong
        </p>
        <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight text-fg">
          We hit a snag loading this page
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">
          Please try again in a moment. If it keeps happening, your admin can help.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex items-center rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
