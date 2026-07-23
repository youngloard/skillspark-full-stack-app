import { materialActions, materialTypeLabel, type MaterialLike } from "@/lib/material-links";

// A material presented as an inline row with View / Download actions (M4-S4).
// No separate viewer page — the file is opened or downloaded in place.

function DocIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M9 13h6M9 17h6" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
    </svg>
  );
}

function ExternalIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

export function MaterialRow({ material }: { material: MaterialLike & { title: string } }) {
  const { viewHref, viewLabel, downloadHref } = materialActions(material);

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3.5 rounded-md px-3 py-3 transition-colors hover:bg-surface-2/50 sm:flex">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
        <DocIcon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fg">{material.title}</p>
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">
          {materialTypeLabel(material)}
        </p>
      </div>
      <div className="col-span-2 flex w-full shrink-0 items-center gap-2 sm:w-auto">
        {downloadHref ? (
          <a
            href={downloadHref}
            aria-label={`Download ${material.title}`}
            className="grid h-11 w-11 place-items-center rounded-lg border border-line text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <DownloadIcon className="h-4 w-4" />
          </a>
        ) : null}
        <a
          href={viewHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover sm:flex-none"
        >
          {viewLabel}
          <ExternalIcon className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}
