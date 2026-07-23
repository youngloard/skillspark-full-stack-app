"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Checkbox } from "@/components/admin/checkbox";
import { useIsClient } from "@/lib/use-is-client";

// Searchable MULTI-select chooser (M6). Same visual language as the dashboard
// slicers — a surface-2 trigger with a chevron over a bordered panel — but it
// keeps a set of selections and reports them as a whole.
//
// Width: option labels (course / batch names) are long and unpredictable, so
// the panel is NOT a fixed width. It starts at the trigger's width and grows to
// fit content (`w-max`), bounded by the viewport, and each row truncates with a
// title so nothing is ever cut off silently.
//
// Placement: the panel is PORTALLED to <body> and fixed-positioned. Inside a
// dialog the modal scrolls (overflow-y-auto), which clips an absolutely
// positioned child — the panel appeared cut off and cramped. Portalling escapes
// that, and lets it flip above the trigger when the space below is tight.

export type MultiItem = { id: string; label: string; sublabel?: string };

export function MultiCombobox({
  label,
  selected,
  placeholder,
  search,
  onChange,
  assigned = [],
  assignedLabel = "assigned",
  onCreate,
  createLabel = (name) => `Create “${name}”`,
  disabled = false,
  emptyHint = "Type to search…",
}: {
  label: string;
  selected: MultiItem[];
  placeholder: string;
  search: (q: string) => Promise<MultiItem[]>;
  onChange: (next: MultiItem[]) => void;
  /**
   * Items the target ALREADY has. They appear in the list checked and locked
   * with a tag, so the current state is visible in the same place as the
   * choices — the picker only adds, so they can't be unticked here.
   */
  assigned?: MultiItem[];
  assignedLabel?: string;
  /** When set, an unmatched query offers to create the item and selects it. */
  onCreate?: (name: string) => Promise<MultiItem | null>;
  createLabel?: (name: string) => string;
  disabled?: boolean;
  emptyHint?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const mounted = useIsClient();
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxH: number } | null>(
    null,
  );
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MultiItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const reqRef = useRef(0);

  // Debounced search. Every response carries the request id it was issued for,
  // so a slow earlier reply can never overwrite a newer one (stale-response
  // races are what make type-ahead feel laggy and wrong).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const reqId = ++reqRef.current;
      if (cancelled) return;
      setLoading(true);
      try {
        const results = await search(query);
        if (!cancelled && reqId === reqRef.current) setItems(results);
      } finally {
        if (!cancelled && reqId === reqRef.current) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open, search]);

  // Measure before paint so the panel never flashes in the wrong place, and
  // re-measure while it's open (scroll/resize move the trigger under it).
  useLayoutEffect(() => {
    if (!open) return;
    // Always opens DOWNWARD — a panel that sometimes flips up covers the
    // dialog it belongs to and is hard to predict. It simply shrinks to the
    // room below and scrolls internally when that room is tight.
    const place = () => {
      const t = triggerRef.current?.getBoundingClientRect();
      if (!t) return;
      const GAP = 6;
      const MARGIN = 12;
      const below = window.innerHeight - t.bottom - GAP - MARGIN;
      setPos({
        top: t.bottom + GAP,
        left: t.left,
        width: t.width,
        maxH: Math.max(160, Math.min(340, below)),
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

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (boxRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const assignedIds = new Set(assigned.map((a) => a.id));
  const selectedIds = new Set(selected.map((s) => s.id));
  const toggle = (item: MultiItem) => {
    if (assignedIds.has(item.id)) return; // already on the target — locked
    onChange(
      selectedIds.has(item.id) ? selected.filter((s) => s.id !== item.id) : [...selected, item],
    );
  };

  // Already-assigned first, then newly selected, then the rest — so nothing a
  // user has chosen (or already has) hides behind a non-matching search.
  const unselected = items.filter((i) => !selectedIds.has(i.id) && !assignedIds.has(i.id));
  const rows = [...assigned, ...selected, ...unselected];

  const trimmed = query.trim();
  const exactMatch = rows.some((i) => i.label.toLowerCase() === trimmed.toLowerCase());
  const showCreate = Boolean(onCreate) && trimmed.length > 0 && !exactMatch && !loading;

  const create = async () => {
    if (!onCreate || !trimmed || creating) return;
    setCreating(true);
    try {
      const item = await onCreate(trimmed);
      if (item) {
        onChange([...selected, item]);
        setQuery("");
      }
    } finally {
      setCreating(false);
    }
  };

  // The trigger reflects everything the target will end up with.
  const shown = [...assigned, ...selected];
  const triggerText =
    shown.length === 0
      ? placeholder
      : shown.length === 1
        ? shown[0].label
        : `${shown.length} selected`;

  return (
    <div ref={boxRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-60 sm:min-h-0 ${
          shown.length > 0
            ? "bg-accent/12 text-accent"
            : "bg-surface-2 text-fg hover:bg-surface-2/70"
        }`}
      >
        <span className="max-w-[190px] truncate" title={shown.map((s) => s.label).join(", ")}>
          {triggerText}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {selected.length > 0 ? (
            <span
              role="button"
              tabIndex={0}
              aria-label={`Clear ${label}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange([]);
                }
              }}
              className="grid size-4 place-items-center rounded-full text-accent/70 transition-colors hover:text-accent"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          ) : null}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="m6 9 6 6 6-6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {open && mounted && pos
        ? createPortal(
            <div
              ref={panelRef}
              id={listId}
              role="listbox"
              aria-multiselectable="true"
              style={{
                top: pos.top,
                left: pos.left,
                minWidth: pos.width,
                maxHeight: pos.maxH,
              }}
              className="fixed z-[80] flex w-max max-w-[min(28rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-[0_16px_40px_-16px_rgba(2,20,20,0.4)]"
            >
              <div className="border-b border-line p-2">
                <input
                  type="search"
                  value={query}
                  autoFocus
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={placeholder}
                  aria-label={`Search ${label}`}
                  className="w-full rounded-md bg-surface-2 px-3 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                />
              </div>

              <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1.5">
                {loading && rows.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-fg-subtle">Searching…</p>
                ) : rows.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-fg-subtle">
                    {query.trim() ? "No matches" : emptyHint}
                  </p>
                ) : (
                  rows.map((item) => {
                    const isAssigned = assignedIds.has(item.id);
                    const isSelected = isAssigned || selectedIds.has(item.id);
                    return (
                      <label
                        key={item.id}
                        role="option"
                        aria-selected={isSelected}
                        aria-disabled={isAssigned || undefined}
                        className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors ${
                          isAssigned
                            ? "cursor-default bg-surface-2/60"
                            : isSelected
                              ? "cursor-pointer bg-surface-2"
                              : "cursor-pointer hover:bg-surface-2"
                        }`}
                      >
                        <Checkbox
                          checked={isSelected}
                          onChange={() => toggle(item)}
                          ariaLabel={
                            isAssigned ? `${item.label} (${assignedLabel})` : `Select ${item.label}`
                          }
                        />
                        <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                          <span
                            className={`truncate text-[13px] ${isAssigned ? "text-fg-muted" : "text-fg"}`}
                            title={item.label}
                          >
                            {item.label}
                          </span>
                          {isAssigned ? (
                            <span className="shrink-0 rounded-full bg-accent/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-accent">
                              {assignedLabel}
                            </span>
                          ) : item.sublabel ? (
                            <span className="shrink-0 text-xs text-fg-subtle">{item.sublabel}</span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>

              {showCreate ? (
                <button
                  type="button"
                  onClick={create}
                  disabled={creating}
                  className="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-[13px] font-medium text-accent transition-colors hover:bg-accent/10 disabled:opacity-60"
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

              {selected.length > 0 ? (
                <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
                  <span className="text-xs text-fg-muted">{selected.length} to add</span>
                  <button
                    type="button"
                    onClick={() => onChange([])}
                    className="text-xs font-medium text-accent transition-opacity hover:opacity-80"
                  >
                    Clear all
                  </button>
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
