"use client";

// Sticky bulk-action bar shown when rows are selected in an admin list
// (M6 CRUD). Currently: delete selected. Appears above the viewport bottom.

export function BulkBar({
  count,
  noun,
  nounPlural,
  pending,
  onDelete,
  onClear,
  actions,
}: {
  count: number;
  noun: string; // singular, e.g. "student"
  nounPlural?: string; // defaults to noun + "s"
  pending: boolean;
  onDelete: () => void;
  onClear: () => void;
  actions?: React.ReactNode; // extra action buttons shown before Delete
}) {
  if (count === 0) return null;
  const label = count === 1 ? noun : (nounPlural ?? `${noun}s`);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-3 sm:bottom-6 sm:px-4">
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 shadow-[0_16px_40px_-16px_rgba(2,20,20,0.5)] sm:gap-3 sm:rounded-full sm:pl-4">
        <span className="text-sm text-fg">
          {count} {label} selected
        </span>
        <button
          type="button"
          onClick={onClear}
          className="min-h-10 rounded-full px-3 py-1.5 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          Clear
        </button>
        {actions}
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold text-white transition-colors disabled:opacity-60"
          style={{ background: "var(--color-danger)" }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {pending ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}
