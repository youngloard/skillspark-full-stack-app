"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useIsClient } from "@/lib/use-is-client";

// Reusable searchable chooser (M6). Type-ahead against a server search, pick a
// result, or — when nothing matches — create the item inline. Shared by the
// add-batch course chooser and the add-student batch/course choosers.
//
// The parent owns the selected value; this component only searches, selects,
// and (optionally) creates. `onCreate` returns the new item (already persisted)
// so we can select it immediately.

export type ComboItem = { id: string; label: string; sublabel?: string };

export function Combobox({
  value,
  placeholder,
  search,
  onSelect,
  onClear,
  onCreate,
  name = "combobox-search",
  createLabel = (name) => `Create “${name}”`,
  disabled = false,
}: {
  value: ComboItem | null;
  placeholder: string;
  search: (q: string) => Promise<ComboItem[]>;
  onSelect: (item: ComboItem) => void;
  onClear?: () => void;
  onCreate?: (name: string) => Promise<ComboItem | null>;
  name?: string;
  createLabel?: (name: string) => string;
  disabled?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const mounted = useIsClient();
  // Portalled + fixed: a dialog scrolls (overflow-y-auto), which would clip an
  // absolutely positioned panel. Always opens downward, shrinking to the room
  // below rather than flipping up over the dialog.
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxH: number } | null>(
    null,
  );
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ComboItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [active, setActive] = useState(0);

  // Debounced search whenever the dropdown is open and the query changes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      if (cancelled) return;
      setLoading(true);
      try {
        const results = await search(query);
        if (!cancelled) {
          setItems(results);
          setActive(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open, search]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const t = inputRef.current?.getBoundingClientRect();
      if (!t) return;
      const GAP = 4;
      const below = window.innerHeight - t.bottom - GAP - 12;
      setPos({
        top: t.bottom + GAP,
        left: t.left,
        width: t.width,
        maxH: Math.max(160, Math.min(320, below)),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (boxRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const trimmed = query.trim();
  const exactMatch = items.some((i) => i.label.toLowerCase() === trimmed.toLowerCase());
  const showCreate = Boolean(onCreate) && trimmed.length > 0 && !exactMatch && !loading;
  // Rows = results, plus the create row (index === items.length) when shown.
  const rowCount = items.length + (showCreate ? 1 : 0);

  const choose = (item: ComboItem) => {
    onSelect(item);
    setOpen(false);
    setQuery("");
    setItems([]);
  };

  const create = async () => {
    if (!onCreate || !trimmed || creating) return;
    setCreating(true);
    try {
      const item = await onCreate(trimmed);
      if (item) choose(item);
    } finally {
      setCreating(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, rowCount - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (showCreate && active === items.length) void create();
      else if (items[active]) choose(items[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  if (value) {
    return (
      <div className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2">
        <span className="min-w-0 truncate text-sm text-fg">
          {value.label}
          {value.sublabel ? (
            <span className="ml-1.5 text-xs text-fg-subtle">{value.sublabel}</span>
          ) : null}
        </span>
        {onClear && !disabled ? (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear selection"
            className="grid size-10 shrink-0 place-items-center rounded text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg sm:size-8"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        name={name}
        value={query}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-controls="combobox-list"
        autoComplete="off"
        className="min-h-11 w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60 sm:text-sm"
      />
      {open && mounted && pos
        ? createPortal(
            <div
              ref={panelRef}
              id="combobox-list"
              role="listbox"
              style={{ top: pos.top, left: pos.left, minWidth: pos.width, maxHeight: pos.maxH }}
              className="fixed z-[80] w-max max-w-[min(28rem,calc(100vw-2.5rem))] overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-[0_16px_40px_-16px_rgba(2,20,20,0.5)]"
            >
              {loading ? (
                <div className="px-3 py-2 text-sm text-fg-subtle">Searching…</div>
              ) : items.length === 0 && !showCreate ? (
                <div className="px-3 py-2 text-sm text-fg-subtle">
                  {trimmed ? "No matches" : "Type to search…"}
                </div>
              ) : null}

              {items.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={active === i}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(item)}
                  className={`flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm transition-colors ${
                    active === i ? "bg-surface-2 text-fg" : "text-fg-muted hover:bg-surface-2"
                  }`}
                >
                  <span className="min-w-0 truncate text-fg">{item.label}</span>
                  {item.sublabel ? (
                    <span className="shrink-0 text-xs text-fg-subtle">{item.sublabel}</span>
                  ) : null}
                </button>
              ))}

              {showCreate ? (
                <button
                  type="button"
                  role="option"
                  aria-selected={active === items.length}
                  onMouseEnter={() => setActive(items.length)}
                  onClick={create}
                  disabled={creating}
                  className={`flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-sm transition-colors disabled:opacity-60 ${
                    active === items.length
                      ? "bg-accent/10 text-accent"
                      : "text-accent hover:bg-accent/10"
                  }`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M12 5v14M5 12h14"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                    />
                  </svg>
                  {creating ? "Creating…" : createLabel(trimmed)}
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
