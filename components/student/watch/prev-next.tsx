"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { orderedVideoIds, type OrderedItem } from "@/lib/watch-order";

// Prev/next lesson nav (M4-S3). Lives in the persistent shell and derives the
// current lesson from the URL, so it updates without re-fetching.

function Chevron({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function PrevNextNav({
  courseId,
  modules,
  flatItems,
}: {
  courseId: string;
  modules: { items: OrderedItem[] }[];
  flatItems: OrderedItem[];
}) {
  const pathname = usePathname();
  const currentId = pathname.split("/").pop() ?? "";
  const ids = orderedVideoIds(modules, flatItems);
  const i = ids.indexOf(currentId);
  if (i < 0) return null;

  const prev = i > 0 ? ids[i - 1] : null;
  const next = i < ids.length - 1 ? ids[i + 1] : null;
  if (!prev && !next) return null;

  return (
    <nav className="mt-8 flex items-center justify-between gap-4 border-t border-line pt-5">
      {prev ? (
        <Link
          href={`/courses/${courseId}/watch/${prev}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-fg-muted transition-colors hover:text-fg"
        >
          <Chevron className="h-4 w-4 rotate-90" />
          Previous
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          href={`/courses/${courseId}/watch/${next}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent"
        >
          Next lesson
          <Chevron className="h-4 w-4 -rotate-90" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
