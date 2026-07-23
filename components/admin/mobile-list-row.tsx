"use client";

export function MobileExpandableRow({
  id,
  title,
  subtitle,
  status,
  leading,
  expanded,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string | null;
  status?: React.ReactNode;
  leading?: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const detailsId = `mobile-row-${id}`;
  return (
    <div className="border-b border-hairline sm:hidden">
      <div className="flex items-center gap-1">
        {leading ? <div className="grid size-11 shrink-0 place-items-center">{leading}</div> : null}
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={onToggle}
          className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-fg">{title}</span>
            {subtitle ? (
              <span className="mt-0.5 block truncate text-xs text-fg-subtle">{subtitle}</span>
            ) : null}
          </span>
          {status ? <span className="shrink-0">{status}</span> : null}
          <Chevron expanded={expanded} />
        </button>
      </div>
      {expanded ? (
        <div id={detailsId} className={leading ? "pb-4 pl-12" : "pb-4"}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function MobileDetailGrid({ children }: { children: React.ReactNode }) {
  return (
    <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">{children}</dl>
  );
}

export function MobileDetail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="min-w-0 break-words text-fg-muted">{children}</dd>
    </>
  );
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`mr-1 shrink-0 text-fg-muted transition-transform duration-200 motion-reduce:transition-none ${
        expanded ? "rotate-180" : ""
      }`}
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
