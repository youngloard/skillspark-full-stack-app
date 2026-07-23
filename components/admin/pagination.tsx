import Link from "next/link";
import { cn } from "@/lib/cn";

// Page-number pagination for admin lists (M6-S4). Prev / "Page N of M" / Next,
// with a total count. Page changes are plain links (server nav) — the list
// toolbar leaves the page param alone unless the query itself changes, so
// paging doesn't get reset.

export function Pagination({
  page,
  pageCount,
  total,
  unit,
  makeHref,
}: {
  page: number;
  pageCount: number;
  total: number;
  unit: string;
  /** Build the href for a given page number (preserving other filters). */
  makeHref: (page: number) => string;
}) {
  const countLine = `${total.toLocaleString()} ${unit}`;
  if (pageCount <= 1) {
    return <p className="mt-6 text-xs text-fg-subtle">{countLine}</p>;
  }

  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-fg-subtle">
        Page {page} of {pageCount} · {countLine}
      </p>
      <div className="flex items-center gap-2">
        <PageLink href={makeHref(page - 1)} disabled={page <= 1} label="Previous">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="m15 6-6 6 6 6"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Prev
        </PageLink>
        <PageLink href={makeHref(page + 1)} disabled={page >= pageCount} label="Next">
          Next
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="m9 6 6 6-6 6"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </PageLink>
      </div>
    </div>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const cls = cn(
    "inline-flex min-h-11 items-center gap-1.5 rounded-md border border-line px-3 py-2 text-sm font-medium transition-colors",
    disabled
      ? "cursor-not-allowed text-fg-subtle opacity-50"
      : "bg-surface text-fg-muted hover:bg-surface-2 hover:text-fg",
  );
  if (disabled) {
    return (
      <span className={cls} aria-disabled="true">
        {children}
      </span>
    );
  }
  return (
    <Link href={href} scroll={false} aria-label={label} className={cls}>
      {children}
    </Link>
  );
}
