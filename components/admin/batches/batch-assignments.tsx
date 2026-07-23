"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  assignCourseToBatch,
  assignStudentsToBatch,
  removeCourseFromBatch,
  removeStudentFromBatch,
} from "@/actions/batches";
import { createCourse } from "@/actions/courses";
import { searchCoursesAction } from "@/actions/admin-search";
import { grantExamToBatch, revokeExamFromBatch } from "@/actions/exam-grants";
import { searchStudentsAction } from "@/actions/admin-students";
import type { ApiResult } from "@/lib/api-response";
import type { StudentSearchHit } from "@/lib/admin-students";
import { useToast } from "@/components/admin/toast";
import { Checkbox } from "@/components/admin/checkbox";
import { Combobox, type ComboItem } from "@/components/admin/combobox";
import Link from "next/link";

// Batch assignment UI (M6-S4): add/remove courses, exams, and students on a
// batch — optimistic-refresh via the M3 actions + shell toast. All pickers are
// custom (no native <select>).

type Named = { id: string; name: string };

export function BatchAssignments({
  batchId,
  courses,
  exams,
  students,
  studentCount,
  studentPage,
  studentPageCount,
  studentQuery,
  allExams,
}: {
  batchId: string;
  courses: Named[];
  exams: Named[];
  students: { id: string; name: string; email: string; studentCode: string | null }[];
  studentCount: number;
  studentPage: number;
  studentPageCount: number;
  studentQuery: string;
  allExams: Named[];
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  const run = (action: () => Promise<ApiResult<unknown>>, success?: string) => {
    start(async () => {
      try {
        const r = await action();
        if (r.ok) {
          if (success) toast.success(success);
          router.refresh();
        } else {
          toast.error(r.error.message || "Something went wrong.");
        }
      } catch {
        toast.error("Something went wrong. Please try again.");
      }
    });
  };

  const assignedExamIds = new Set(exams.map((e) => e.id));
  const unassignedExams = allExams.filter((e) => !assignedExamIds.has(e.id));

  return (
    <div className="flex flex-col gap-10">
      <Section
        title={courses.length > 1 ? `Courses · ${courses.length}` : "Courses"}
        subtitle="Students in this batch get access to every course listed here"
        adder={
          <CourseChooser
            disabled={pending}
            onPick={(id) =>
              run(() => assignCourseToBatch({ batchId, courseId: id }), "Course added.")
            }
          />
        }
      >
        {courses.length === 0 ? (
          <Empty>No courses assigned yet — search or create one.</Empty>
        ) : (
          <ChipRow>
            {courses.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-2 rounded-md bg-surface-2 py-1.5 pl-3 pr-1.5 text-[13px] text-fg"
              >
                <Link
                  href={`/admin/courses/${c.id}`}
                  className="truncate font-medium text-fg transition-colors hover:text-accent"
                >
                  {c.name}
                </Link>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(() => removeCourseFromBatch({ batchId, courseId: c.id }), "Course removed.")
                  }
                  aria-label={`Remove ${c.name}`}
                  className="grid h-8 w-8 place-items-center rounded text-fg-subtle transition-colors hover:bg-surface hover:text-[color:var(--color-danger)] disabled:opacity-60 sm:h-6 sm:w-6"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M18 6 6 18M6 6l12 12"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </span>
            ))}
          </ChipRow>
        )}
      </Section>

      <Section
        title="Exams"
        subtitle="Grant this batch access to exams"
        adder={
          <AddPicker
            label="Add exam"
            options={unassignedExams}
            disabled={pending}
            onPick={(id) => run(() => grantExamToBatch({ batchId, examId: id }), "Exam granted.")}
          />
        }
      >
        {exams.length === 0 ? (
          <Empty>No exams granted.</Empty>
        ) : (
          <ChipRow>
            {exams.map((e) => (
              <Chip
                key={e.id}
                label={e.name}
                disabled={pending}
                onRemove={() =>
                  run(() => revokeExamFromBatch({ batchId, examId: e.id }), "Exam revoked.")
                }
              />
            ))}
          </ChipRow>
        )}
      </Section>

      <Section
        title={`Students · ${studentCount}`}
        subtitle="Members of this batch"
        adder={
          <MultiStudentAdder
            disabled={pending}
            onAdd={(ids) =>
              run(async () => {
                const r = await assignStudentsToBatch({ studentIds: ids, batchId });
                if (r.ok) {
                  const skipped = ids.length - r.data.added;
                  toast.success(
                    r.data.added === 0
                      ? "Those students were already in the batch."
                      : `Added ${r.data.added} student${r.data.added === 1 ? "" : "s"}${
                          skipped > 0 ? ` (${skipped} already in the batch)` : ""
                        }.`,
                  );
                }
                return r;
              })
            }
          />
        }
      >
        <MemberSearch initial={studentQuery} />
        {students.length === 0 ? (
          <Empty>
            {studentQuery ? `No members match “${studentQuery}”.` : "No students in this batch."}
          </Empty>
        ) : (
          <div>
            <div className="sm:hidden">
              {students.map((s) => (
                <details key={s.id} className="group border-b border-hairline">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 py-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">{s.name}</span>
                      <span className="block truncate text-xs text-fg-muted">{s.email}</span>
                    </span>
                    <svg
                      className="shrink-0 text-fg-subtle transition-transform group-open:rotate-180 motion-reduce:transition-none"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="m7 10 5 5 5-5"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </summary>
                  <div className="pb-3 pl-1">
                    <p className="text-xs text-fg-muted">
                      Student code: <span className="tabular text-fg">{s.studentCode ?? "—"}</span>
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Link
                        href={`/admin/students/${s.id}`}
                        className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-line px-3 text-sm font-medium text-fg-muted"
                      >
                        View
                      </Link>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () => removeStudentFromBatch({ studentId: s.id, batchId }),
                            "Student removed.",
                          )
                        }
                        className="min-h-11 flex-1 rounded-md border border-line px-3 text-sm font-medium text-[color:var(--color-danger)] disabled:opacity-60"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </details>
              ))}
            </div>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[480px] border-collapse text-sm">
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id} className="border-b border-hairline">
                      <td className="py-2.5 pr-4 font-medium text-fg">
                        <Link
                          href={`/admin/students/${s.id}`}
                          className="transition-colors hover:text-accent"
                        >
                          {s.name}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4 text-fg-muted">{s.email}</td>
                      <td className="tabular py-2.5 pr-4 text-fg-muted">{s.studentCode ?? "—"}</td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            run(
                              () => removeStudentFromBatch({ studentId: s.id, batchId }),
                              "Student removed.",
                            )
                          }
                          className="rounded-md px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-[color:var(--color-danger)] disabled:opacity-60"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <StudentPager page={studentPage} pageCount={studentPageCount} total={studentCount} />
          </div>
        )}
      </Section>
    </div>
  );
}

/** Search-based course chooser — adds a course to the batch (it may hold many). */
function CourseChooser({ onPick, disabled }: { onPick: (id: string) => void; disabled?: boolean }) {
  const toast = useToast();
  const search = async (q: string): Promise<ComboItem[]> => {
    const hits = await searchCoursesAction(q);
    return hits.map((c) => ({ id: c.id, label: c.name }));
  };
  const createInline = async (name: string): Promise<ComboItem | null> => {
    const r = await createCourse({ name, layout: "module" });
    if (r.ok) {
      toast.success(`Course “${name}” created.`);
      return { id: r.data.id, label: name };
    }
    toast.error(r.error.message || "Could not create the course.");
    return null;
  };
  return (
    <div className="w-full sm:w-64">
      <Combobox
        value={null}
        placeholder="Add a course…"
        search={search}
        onSelect={(item) => onPick(item.id)}
        onCreate={createInline}
        createLabel={(name) => `Create course “${name}”`}
        disabled={disabled}
      />
    </div>
  );
}

/** Debounced search over this batch's own members (writes ?sq, resets ?spage). */
function MemberSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(initial);

  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = q.trim();
      const current = searchParams.get("sq") ?? "";
      if (trimmed === current) return;
      const params = new URLSearchParams(searchParams.toString());
      if (trimmed) params.set("sq", trimmed);
      else params.delete("sq");
      params.delete("spage");
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    }, 250);
    return () => clearTimeout(t);
  }, [q, pathname, router, searchParams]);

  return (
    <div className="relative mb-3 w-full sm:max-w-xs">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
          <path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
      <input
        type="search"
        name="batch-member-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search members…"
        aria-label="Search members of this batch"
        className="min-h-11 w-full rounded-md bg-surface-2 py-2.5 pl-9 pr-3 text-base text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-0 sm:py-1.5 sm:text-[13px]"
      />
    </div>
  );
}

function Section({
  title,
  subtitle,
  adder,
  children,
}: {
  title: string;
  subtitle: string;
  adder: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div>
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          <p className="mt-0.5 text-xs text-fg-muted">{subtitle}</p>
        </div>
        <div className="w-full sm:w-auto [&>div]:w-full [&_button]:min-h-11">{adder}</div>
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-fg-muted">{children}</p>;
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

function Chip({
  label,
  onRemove,
  disabled,
}: {
  label: string;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-md bg-surface-2 py-1.5 pl-3 pr-1.5 text-[13px] text-fg">
      <span className="truncate">{label}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="grid h-8 w-8 place-items-center rounded text-fg-subtle transition-colors hover:bg-surface hover:text-[color:var(--color-danger)] disabled:opacity-60 sm:h-6 sm:w-6"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M18 6 6 18M6 6l12 12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </span>
  );
}

function AddPicker({
  label,
  options,
  onPick,
  disabled,
}: {
  label: string;
  options: Named[];
  onPick: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) =>
      ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled || options.length === 0}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-50 sm:w-auto"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
        </svg>
        {label}
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-1.5 max-h-72 w-max min-w-[14rem] max-w-[min(28rem,calc(100vw-2.5rem))] overflow-auto rounded-lg border border-line bg-surface p-1 shadow-[0_16px_40px_-16px_rgba(2,20,20,0.4)]">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                onPick(o.id);
                setOpen(false);
              }}
              className="block w-full truncate rounded-md px-3 py-2 text-left text-[13px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              {o.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Prev / next pager for the batch's student list (keyset by ?spage). */
function StudentPager({
  page,
  pageCount,
  total,
}: {
  page: number;
  pageCount: number;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (pageCount <= 1) return null;

  const go = (next: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next <= 1) params.delete("spage");
    else params.set("spage", String(next));
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      <p className="text-xs text-fg-subtle">
        Page {page} of {pageCount} · {total} students
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => go(page - 1)}
          className="min-h-11 rounded-md border border-line bg-surface px-3 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => go(page + 1)}
          className="min-h-11 rounded-md border border-line bg-surface px-3 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

/** Search students and add several at once to the batch. */
function MultiStudentAdder({
  onAdd,
  disabled,
}: {
  onAdd: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<StudentSearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [, startSearch] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const query = q.trim();
      startSearch(async () => setHits(await searchStudentsAction(query)));
    }, 220);
    return () => clearTimeout(t);
  }, [q, open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) =>
      ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const add = () => {
    if (selected.size === 0) return;
    onAdd([...selected]);
    setSelected(new Set());
    setQ("");
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-50 sm:w-auto"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
        </svg>
        Add students
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-1.5 w-[min(20rem,calc(100vw-2.5rem))] rounded-lg border border-line bg-surface shadow-[0_16px_40px_-16px_rgba(2,20,20,0.4)]">
          <div className="border-b border-line p-2">
            <input
              type="search"
              name="batch-student-search"
              value={q}
              autoFocus
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search email, code, or name…"
              aria-label="Search students to add"
              className="min-h-11 w-full rounded-md bg-surface-2 px-3 py-2 text-base text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-0 sm:py-1.5 sm:text-[13px]"
            />
          </div>
          <div className="max-h-64 overflow-auto p-1">
            {hits.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-fg-subtle">
                {q.trim() ? "No matches" : "Type to search students…"}
              </p>
            ) : (
              hits.map((h) => (
                <label
                  key={h.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors hover:bg-surface-2"
                >
                  <Checkbox
                    checked={selected.has(h.id)}
                    onChange={() => toggle(h.id)}
                    ariaLabel={`Select ${h.name}`}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[13px] font-medium text-fg">{h.name}</span>
                    <span className="truncate text-xs text-fg-muted">
                      {h.email}
                      {h.studentCode ? ` · ${h.studentCode}` : ""}
                    </span>
                  </span>
                </label>
              ))
            )}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-line p-2">
            <span className="text-xs text-fg-muted">{selected.size} selected</span>
            <button
              type="button"
              onClick={add}
              disabled={selected.size === 0}
              className="min-h-11 rounded-md bg-accent px-3 py-1.5 text-[13px] font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              Add {selected.size > 0 ? selected.size : ""}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
