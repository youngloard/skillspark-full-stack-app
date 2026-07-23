"use client";

import { cn } from "@/lib/cn";

// On-brand checkbox (M6): a rounded box that fills teal with a white check when
// selected, replacing the native browser control on admin lists. Themes with
// the role tokens; visible on-brand focus ring.

export function Checkbox({
  checked,
  onChange,
  ariaLabel,
  className,
}: {
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-grid h-[18px] w-[18px] shrink-0 place-items-center",
        className,
      )}
    >
      <input
        type="checkbox"
        name="selection"
        checked={checked}
        onChange={onChange}
        aria-label={ariaLabel}
        className={cn(
          "peer h-[18px] w-[18px] cursor-pointer appearance-none rounded-[6px] border border-line bg-surface transition-colors",
          "hover:border-fg-subtle checked:border-transparent checked:bg-accent",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-1 focus-visible:ring-offset-bg",
        )}
      />
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="pointer-events-none absolute h-3 w-3 text-accent-fg opacity-0 transition-opacity peer-checked:opacity-100"
      >
        <path
          d="m5 12 5 5 9-9"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
