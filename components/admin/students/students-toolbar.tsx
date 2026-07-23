"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createStudent } from "@/actions/students";
import { assignCourseToBatch } from "@/actions/batches";
import { createCourse } from "@/actions/courses";
import { searchBatchesAction, searchCoursesAction } from "@/actions/admin-search";
import { ensureBatchByName } from "@/actions/admin-provisioning";
import { useToast } from "@/components/admin/toast";
import { ImportDialog } from "@/components/admin/students/import-dialog";
import { Combobox, type ComboItem } from "@/components/admin/combobox";
import { MultiCombobox, type MultiItem } from "@/components/admin/multi-combobox";
import { cn } from "@/lib/cn";

// Students toolbar (M6-S3): live search (email / code / name → ?q) + a
// quick-add form revealed inline (never leave the list — workflow-first,
// DESIGN §10). Reuses the M3-S2 createStudent action + the shell toast.

function todayISO(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export function StudentsToolbar({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(initialQuery);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  // Debounced search → URL. Only navigates when the query text actually
  // changed — so paginating (which changes ?page, not ?q) doesn't get reset
  // back to page 1 by this effect (that was the flicker on "Next").
  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = q.trim();
      const current = searchParams.get("q") ?? "";
      if (trimmed === current) return;
      const params = new URLSearchParams(searchParams.toString());
      if (trimmed) params.set("q", trimmed);
      else params.delete("q");
      params.delete("page"); // new query → back to page 1
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    }, 250);
    return () => clearTimeout(t);
  }, [q, pathname, router, searchParams]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative col-span-2 min-w-0 sm:flex-1 sm:max-w-sm">
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
            name="student-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search id, email, code, or name…"
            aria-label="Search students"
            className="w-full rounded-md bg-surface-2 py-2.5 pl-9 pr-3 text-base text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:py-2 sm:text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => setImporting(true)}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg sm:w-auto sm:px-4"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 15V3m0 0L8 7m4-4 4 4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          Import CSV
        </button>
        <button
          type="button"
          onClick={() => setAdding((a) => !a)}
          aria-expanded={adding}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover sm:w-auto sm:px-4"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
            />
          </svg>
          Add student
        </button>
      </div>

      {adding ? <QuickAddForm onDone={() => setAdding(false)} /> : null}
      {importing ? <ImportDialog onClose={() => setImporting(false)} /> : null}
    </div>
  );
}

function QuickAddForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    name: "",
    email: "",
    studentCode: "",
    accessStartDate: todayISO(),
    accessEndDate: todayISO(365),
  });
  const [batch, setBatch] = useState<ComboItem | null>(null);
  const [courses, setCourses] = useState<MultiItem[]>([]);
  // Courses the chosen batch already has — shown so the admin knows what the
  // student inherits before adding more.
  const [batchCourseItems, setBatchCourseItems] = useState<MultiItem[]>([]);
  const batchCourses = useRef(new Map<string, MultiItem[]>());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const searchBatches = async (q: string): Promise<ComboItem[]> => {
    const hits = await searchBatchesAction(q);
    for (const b of hits) {
      batchCourses.current.set(
        b.id,
        b.courses.map((c) => ({ id: c.id, label: c.name })),
      );
    }
    return hits.map((b) => ({
      id: b.id,
      label: b.batchName,
      sublabel: b.courses.length ? b.courses.map((c) => c.name).join(", ") : b.batchCode,
    }));
  };
  const createBatchInline = async (name: string): Promise<ComboItem | null> => {
    const r = await ensureBatchByName({ name });
    if (r.ok) {
      toast.success(`Batch “${r.data.batchName}” ready.`);
      batchCourses.current.set(
        r.data.id,
        r.data.courses.map((c) => ({ id: c.id, label: c.name })),
      );
      return { id: r.data.id, label: r.data.batchName, sublabel: r.data.batchCode };
    }
    toast.error(r.error.message || "Could not create the batch.");
    return null;
  };
  const pickBatch = (item: ComboItem) => {
    setBatch(item);
    setBatchCourseItems(batchCourses.current.get(item.id) ?? []);
    setCourses([]);
  };
  const searchCourses = async (q: string): Promise<MultiItem[]> => {
    const hits = await searchCoursesAction(q);
    return hits.map((c) => ({ id: c.id, label: c.name }));
  };
  const createCourseInline = async (name: string): Promise<MultiItem | null> => {
    const r = await createCourse({ name, layout: "module" });
    if (r.ok) {
      toast.success(`Course “${name}” created.`);
      return { id: r.data.id, label: name };
    }
    toast.error(r.error.message || "Could not create the course.");
    return null;
  };

  const clearForm = () => {
    setForm({
      name: "",
      email: "",
      studentCode: "",
      accessStartDate: todayISO(),
      accessEndDate: todayISO(365),
    });
    setBatch(null);
    setBatchCourseItems([]);
    setCourses([]);
  };

  const submit = () => {
    setFieldErrors({});
    start(async () => {
      const r = await createStudent({
        name: form.name,
        email: form.email,
        studentCode: form.studentCode || undefined,
        batchIds: batch ? [batch.id] : [],
        accessStartDate: form.accessStartDate,
        accessEndDate: form.accessEndDate,
      });
      if (!r.ok) {
        if (r.error.fields) setFieldErrors(r.error.fields);
        toast.error(r.error.message || "Could not add the student.");
        return;
      }
      // Attach the chosen courses to the batch (a batch may hold several).
      if (batch) {
        for (const c of courses) {
          const link = await assignCourseToBatch({ batchId: batch.id, courseId: c.id });
          if (!link.ok)
            toast.error(link.error.message || `Student added, but “${c.label}” failed.`);
        }
      }
      toast.success("Student added.");
      clearForm();
      onDone();
      router.refresh();
    });
  };

  return (
    <div className="rounded-lg bg-surface-2/50 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Name" error={fieldErrors.name}>
          <input
            name="studentName"
            value={form.name}
            onChange={set("name")}
            className={inputCls}
            placeholder="Full name"
          />
        </Field>
        <Field label="Email" error={fieldErrors.email}>
          <input
            name="studentEmail"
            value={form.email}
            onChange={set("email")}
            type="email"
            className={inputCls}
            placeholder="name@example.com"
          />
        </Field>
        <Field label="Student code" error={fieldErrors.studentCode}>
          <input
            name="studentCode"
            value={form.studentCode}
            onChange={set("studentCode")}
            className={inputCls}
            placeholder="optional"
          />
        </Field>
        <Field label="Access start" error={fieldErrors.accessStartDate}>
          <input
            name="accessStartDate"
            value={form.accessStartDate}
            onChange={set("accessStartDate")}
            type="date"
            className={inputCls}
          />
        </Field>
        <Field label="Access end" error={fieldErrors.accessEndDate}>
          <input
            name="accessEndDate"
            value={form.accessEndDate}
            onChange={set("accessEndDate")}
            type="date"
            className={inputCls}
          />
        </Field>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Field label="Batch (optional)">
            <Combobox
              value={batch}
              placeholder="Search a batch, or create one…"
              search={searchBatches}
              onSelect={pickBatch}
              onClear={() => {
                setBatch(null);
                setBatchCourseItems([]);
                setCourses([]);
              }}
              onCreate={createBatchInline}
              createLabel={(name) => `Create batch “${name}”`}
            />
          </Field>
        </div>
        <div>
          <Field label="Courses for that batch">
            <MultiCombobox
              label="Courses"
              selected={courses}
              assigned={batchCourseItems}
              assignedLabel="assigned"
              placeholder={batch ? "Search courses…" : "Pick a batch first"}
              search={searchCourses}
              onChange={setCourses}
              onCreate={createCourseInline}
              createLabel={(name) => `Create course “${name}”`}
              disabled={!batch}
            />
          </Field>
          <p className="mt-1.5 text-xs text-fg-subtle">
            Courses the batch already teaches are ticked — pick more to add.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="min-h-11 w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60 sm:w-auto"
        >
          {pending ? "Adding…" : "Save student"}
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
