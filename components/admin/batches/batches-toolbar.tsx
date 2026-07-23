"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createBatch } from "@/actions/batches";
import { createCourse } from "@/actions/courses";
import { searchCoursesAction } from "@/actions/admin-search";
import { useToast } from "@/components/admin/toast";
import { Combobox, type ComboItem } from "@/components/admin/combobox";
import { cn } from "@/lib/cn";

// Batches toolbar (M6-S4): live search (code / name → ?q) + inline quick-add.
// Same shape as the students toolbar. Reuses the M3-S1 createBatch action.

export function BatchesToolbar({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(initialQuery);
  const [adding, setAdding] = useState(false);

  // Only navigate when the query actually changed, so paginating (?page) isn't
  // reset to page 1 by this effect.
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
            name="batch-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search batch code or name…"
            aria-label="Search batches"
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
          Add batch
        </button>
      </div>

      {adding ? <QuickAddBatch onDone={() => setAdding(false)} /> : null}
    </div>
  );
}

function QuickAddBatch({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ batchCode: "", batchName: "", description: "" });
  const [course, setCourse] = useState<ComboItem | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const searchCourses = async (q: string): Promise<ComboItem[]> => {
    const hits = await searchCoursesAction(q);
    return hits.map((c) => ({ id: c.id, label: c.name }));
  };

  const createCourseInline = async (name: string): Promise<ComboItem | null> => {
    const r = await createCourse({ name, layout: "module" });
    if (r.ok) {
      toast.success(`Course “${name}” created.`);
      return { id: r.data.id, label: name };
    }
    toast.error(r.error.message || "Could not create the course.");
    return null;
  };

  const submit = () => {
    setFieldErrors({});
    start(async () => {
      const r = await createBatch({
        batchCode: form.batchCode,
        batchName: form.batchName,
        description: form.description || undefined,
        courseIds: course ? [course.id] : [],
      });
      if (r.ok) {
        toast.success("Batch created.");
        setForm({ batchCode: "", batchName: "", description: "" });
        setCourse(null);
        onDone();
        router.refresh();
      } else {
        if (r.error.fields) setFieldErrors(r.error.fields);
        toast.error(r.error.message || "Could not create the batch.");
      }
    });
  };

  return (
    <div className="rounded-lg bg-surface-2/50 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Batch code" error={fieldErrors.batchCode}>
          <input
            name="batchCode"
            value={form.batchCode}
            onChange={set("batchCode")}
            className={inputCls}
            placeholder="e.g. KLM-2606"
          />
        </Field>
        <Field label="Batch name" error={fieldErrors.batchName}>
          <input
            name="batchName"
            value={form.batchName}
            onChange={set("batchName")}
            className={inputCls}
            placeholder="Batch name"
          />
        </Field>
        <Field label="Description" error={fieldErrors.description}>
          <input
            name="description"
            value={form.description}
            onChange={set("description")}
            className={inputCls}
            placeholder="optional"
          />
        </Field>
      </div>
      <div className="mt-3 max-w-md">
        <Field label="Course (one per batch)">
          <Combobox
            value={course}
            placeholder="Search a course, or create one…"
            search={searchCourses}
            onSelect={setCourse}
            onClear={() => setCourse(null)}
            onCreate={createCourseInline}
            createLabel={(name) => `Create course “${name}”`}
          />
        </Field>
        <p className="mt-1.5 text-xs text-fg-subtle">
          A batch holds a single course. You can change it later from the batch page.
        </p>
      </div>
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="min-h-11 w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60 sm:w-auto"
        >
          {pending ? "Creating…" : "Save batch"}
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

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-fg-muted">{label}</span>
      {children}
      {error ? (
        <span className={cn("text-xs", "text-[color:var(--color-danger)]")}>{error}</span>
      ) : null}
    </label>
  );
}
