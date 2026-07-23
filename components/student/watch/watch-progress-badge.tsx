"use client";

import { useWatchProgress } from "./progress-context";

// Live "where am I on this video" readout under the title (M4-S3): a Completed
// pill once watched, else the running percentage as you watch.

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}

export function WatchProgressBadge({
  itemId,
  duration,
}: {
  itemId: string;
  duration: number | null;
}) {
  const { map } = useWatchProgress();
  const p = map[itemId];
  if (!p) return null;

  if (p.completed) {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-accent">
        <CheckIcon className="h-3.5 w-3.5" />
        Completed
      </span>
    );
  }

  const pct =
    duration && duration > 0 ? Math.min(100, Math.round((p.positionSeconds / duration) * 100)) : 0;
  if (pct <= 0) return null;
  return <span className="tabular text-accent">{pct}% watched</span>;
}
