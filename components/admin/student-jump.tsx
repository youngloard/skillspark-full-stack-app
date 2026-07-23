"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchStudentsAction } from "@/actions/admin-students";
import type { StudentSearchHit } from "@/lib/admin-students";
import { cn } from "@/lib/cn";

// Dashboard "jump to student" (M6-S3): type-ahead search (email / code / name)
// that deep-links to a student's profile — the single home for per-student
// analytics (no separate student-scoped dashboard). Debounced; keyboard-close.

export function StudentJump() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<StudentSearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      const query = q.trim();
      if (query.length < 2) {
        setHits([]);
        return;
      }
      startTransition(async () => {
        const results = await searchStudentsAction(query);
        setHits(results);
        setOpen(true);
      });
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const go = (id: string) => {
    setOpen(false);
    setQ("");
    router.push(`/admin/students/${id}`);
  };

  return (
    <div ref={ref} className="relative w-full max-w-xs">
      <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
          <path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
      <input
        type="search"
        name="student-jump-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        placeholder="Jump to student (id, email, name)…"
        aria-label="Search students by email, code, or name"
        className="w-full rounded-md bg-surface-2 py-2.5 pl-9 pr-3 text-base text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:py-2 sm:text-[13px]"
      />
      {open && hits.length > 0 ? (
        <div
          role="listbox"
          className="absolute left-0 right-0 z-40 mt-1.5 max-h-80 overflow-auto rounded-lg border border-line bg-surface p-1 shadow-[0_16px_40px_-16px_rgba(2,20,20,0.4)] sm:left-auto sm:w-80"
        >
          {hits.map((h) => (
            <button
              key={h.id}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => go(h.id)}
              className={cn(
                "flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-surface-2",
              )}
            >
              <span className="truncate text-[13px] font-medium text-fg">{h.name}</span>
              <span className="truncate text-xs text-fg-muted">
                {h.email}
                {h.studentCode ? ` · ${h.studentCode}` : ""}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
