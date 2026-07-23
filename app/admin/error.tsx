"use client";

// Admin-area error boundary (M6-S1). Catches render/data errors in any admin
// route and shows a calm retry; the shell (in the layout above) stays mounted.

export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="w-full px-5 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="max-w-md">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-fg-subtle">
          Something went wrong
        </p>
        <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight text-fg">
          We hit a snag loading this page
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">
          Please try again in a moment. If it keeps happening, check the server logs.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex items-center rounded-md bg-accent px-5 py-3 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
