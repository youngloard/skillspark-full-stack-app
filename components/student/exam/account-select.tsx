"use client";

import { useEffect, useRef, useState } from "react";

// A designed account dropdown (M5-S6) — the native <select> can't be styled,
// so this is a custom listbox: a full-width trigger with the chevron laid out
// in flow (not overlapping the text), and a popover list on our tokens.
// Keyboard: Enter/Space/↓ open; ↑/↓ move; Enter select; Esc close; blur/outside
// click close. Touch-friendly (large rows, full width).

function Chevron({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="m6 9 6 6 6-6"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AccountSelect({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
        setActive(Math.max(0, options.indexOf(value)));
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && active < options.length) choose(options[active]!);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2.5 text-left text-sm transition-colors hover:border-accent/40 focus-visible:border-accent sm:py-2"
      >
        <span className={`truncate ${value ? "text-fg" : "text-fg-subtle"}`}>
          {value || "Select account…"}
        </span>
        <Chevron
          className={`h-4 w-4 shrink-0 text-fg-subtle transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <ul
          role="listbox"
          className="scrollbar-none absolute z-40 mt-1.5 max-h-60 w-full overflow-auto rounded-lg border border-line bg-surface p-1 shadow-[0_16px_40px_-16px_rgba(2,20,20,0.4)]"
        >
          {options.map((opt, i) => {
            const selected = value === opt;
            return (
              <li key={i} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(opt)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm transition-colors sm:py-2 ${
                    i === active ? "bg-surface-2" : ""
                  } ${selected ? "font-medium text-accent" : "text-fg"}`}
                >
                  {opt}
                  {selected ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="m5 12 5 5L20 7"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
