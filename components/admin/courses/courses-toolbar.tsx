"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createCourse } from "@/actions/courses";
import { useToast } from "@/components/admin/toast";
import { cn } from "@/lib/cn";

// Courses toolbar (M6-S5): live search (name → ?q) + inline quick-add with a
// layout choice (module vs flat). Same shape as the students/batches toolbars.

export function CoursesToolbar({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(initialQuery);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = q.trim();
      const current = searchParams.get("q") ?? "";
      if (trimmed === current) return;
      const params = new URLSearchParams(searchParams.toString());
      if (trimmed) params.set("q", trimmed);
      else params.delete("q");
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    }, 250);
    return () => clearTimeout(t);
  }, [q, pathname, router, searchParams]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative min-w-0 sm:flex-1 sm:max-w-sm">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="m20 20-3.2-3.2"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <input
            type="search"
            name="course-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search course name…"
            aria-label="Search courses"
            className="w-full rounded-md bg-surface-2 py-2.5 pl-9 pr-3 text-base text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:py-2 sm:text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => setAdding((a) => !a)}
          aria-expanded={adding}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover sm:w-auto"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
            />
          </svg>
          Add course
        </button>
      </div>

      {adding ? <QuickAddCourse onDone={() => setAdding(false)} /> : null}
    </div>
  );
}

function QuickAddCourse({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    name: "",
    description: "",
    layout: "module" as "module" | "flat",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submit = () => {
    setFieldErrors({});
    start(async () => {
      const r = await createCourse({
        name: form.name,
        description: form.description || undefined,
        layout: form.layout,
      });
      if (r.ok) {
        toast.success("Course created.");
        setForm({ name: "", description: "", layout: "module" });
        onDone();
        router.refresh();
      } else {
        if (r.error.fields) setFieldErrors(r.error.fields);
        toast.error(r.error.message || "Could not create the course.");
      }
    });
  };

  return (
    <div className="rounded-lg bg-surface-2/50 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Name</span>
          <input
            name="courseName"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className={inputCls}
            placeholder="Course name"
          />
          {fieldErrors.name ? (
            <span className="text-xs text-[color:var(--color-danger)]">{fieldErrors.name}</span>
          ) : null}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Description</span>
          <input
            name="courseDescription"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className={inputCls}
            placeholder="optional"
          />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="text-xs font-medium text-fg-muted">Layout</span>
        <div className="inline-flex items-center gap-0.5 rounded-md bg-surface-2 p-0.5">
          {(["module", "flat"] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={form.layout === l}
              onClick={() => setForm((f) => ({ ...f, layout: l }))}
              className={cn(
                "rounded-[7px] px-3 py-1.5 text-[13px] font-medium capitalize transition-colors",
                form.layout === l
                  ? "bg-bg text-fg shadow-[0_1px_2px_rgba(2,20,20,0.12)]"
                  : "text-fg-muted hover:text-fg",
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="min-h-11 w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60 sm:w-auto"
        >
          {pending ? "Creating…" : "Save course"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="min-h-11 w-full rounded-md px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg sm:w-auto"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-line bg-surface px-3 py-2.5 text-base text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:py-2 sm:text-sm";
