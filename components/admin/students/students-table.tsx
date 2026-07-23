"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteStudent, deleteStudents } from "@/actions/students";
import { selectAllStudentIdsAction } from "@/actions/admin-students";
import type { StudentListItem, StudentStatusFilter } from "@/lib/admin-students";
import { useConfirm } from "@/components/admin/confirm-dialog";
import { useToast } from "@/components/admin/toast";
import { BulkBar } from "@/components/admin/bulk-bar";
import { Checkbox } from "@/components/admin/checkbox";
import { StudentEditForm } from "@/components/admin/students/student-edit-form";
import { AssignBatchDialog } from "@/components/admin/students/assign-batch-dialog";
import { EmailDialog } from "@/components/admin/students/email-dialog";
import {
  MobileDetail,
  MobileDetailGrid,
  MobileExpandableRow,
} from "@/components/admin/mobile-list-row";

// Students table with row actions (View / Edit / Delete) + multi-select delete,
// assign-to-batch, and select-all-across-pages (M6 CRUD). Selection is client
// state; edit reuses the shared modal.

export type RosterFilters = {
  q?: string;
  status?: StudentStatusFilter;
  courseIds?: string[];
  batchIds?: string[];
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function StudentsTable({
  items,
  total,
  filters,
  platformUrl,
}: {
  items: StudentListItem[];
  total: number;
  filters: RosterFilters;
  platformUrl: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // True once "select all N matching" has pulled the whole filtered result set.
  const [allFiltered, setAllFiltered] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const allSelected = items.length > 0 && items.every((s) => selected.has(s.id));
  const clearSelection = () => {
    setSelected(new Set());
    setAllFiltered(false);
  };
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => {
    setAllFiltered(false);
    setSelected((prev) =>
      prev.size === items.length && items.every((s) => prev.has(s.id))
        ? new Set()
        : new Set(items.map((s) => s.id)),
    );
  };

  const selectAllFiltered = () => {
    start(async () => {
      const { ids, capped } = await selectAllStudentIdsAction(filters);
      setSelected(new Set(ids));
      setAllFiltered(true);
      if (capped) toast.success(`Selected the first ${ids.length} students (the maximum).`);
    });
  };

  const rowDelete = async (s: StudentListItem) => {
    const ok = await confirm({
      title: "Delete student?",
      message: `Permanently delete ${s.name}? Their account, progress, and attempts are removed. This can't be undone.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    start(async () => {
      const r = await deleteStudent({ id: s.id });
      if (r.ok) {
        toast.success("Student deleted.");
        router.refresh();
      } else toast.error(r.error.message || "Could not delete the student.");
    });
  };

  const bulkDelete = async () => {
    const ids = [...selected];
    const ok = await confirm({
      title: `Delete ${ids.length} student${ids.length === 1 ? "" : "s"}?`,
      message: "Their accounts, progress, and attempts are removed. This can't be undone.",
      confirmLabel: "Delete all",
    });
    if (!ok) return;
    start(async () => {
      let deleted = 0;
      // Chunked: the action caps each call at 200, but a select-all can be larger.
      for (let i = 0; i < ids.length; i += 200) {
        const r = await deleteStudents({ ids: ids.slice(i, i + 200) });
        if (!r.ok) {
          toast.error(r.error.message || "Could not delete the selected students.");
          clearSelection();
          router.refresh();
          return;
        }
        deleted += r.data.deleted;
      }
      toast.success(`${deleted} deleted.`);
      clearSelection();
      router.refresh();
    });
  };

  return (
    <>
      {allSelected && total > items.length ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 rounded-lg bg-surface-2/60 px-4 py-2.5 text-sm">
          {allFiltered ? (
            <>
              <span className="text-fg">All {selected.size} matching students are selected.</span>
              <button
                type="button"
                onClick={clearSelection}
                className="font-medium text-accent transition-opacity hover:opacity-80"
              >
                Clear selection
              </button>
            </>
          ) : (
            <>
              <span className="text-fg-muted">All {items.length} on this page are selected.</span>
              <button
                type="button"
                onClick={selectAllFiltered}
                disabled={pending}
                className="font-medium text-accent transition-opacity hover:opacity-80 disabled:opacity-50"
              >
                Select all {total} matching
              </button>
            </>
          )}
        </div>
      ) : null}
      <div className="mt-5 flex min-h-11 items-center justify-between border-b border-line sm:hidden">
        <label className="flex items-center gap-3 text-sm text-fg-muted">
          <span className="grid size-11 place-items-center">
            <Checkbox checked={allSelected} onChange={toggleAll} ariaLabel="Select all" />
          </span>
          Select this page
        </label>
        <span className="text-xs text-fg-subtle">{items.length} shown</span>
      </div>
      <div className="sm:hidden">
        {items.map((student) => {
          const active = student.status === "active";
          return (
            <MobileExpandableRow
              key={student.id}
              id={`student-${student.id}`}
              title={student.name}
              subtitle={student.email}
              status={
                <span
                  className="text-xs font-medium"
                  style={{ color: active ? "var(--color-success)" : "var(--color-danger)" }}
                >
                  {active ? "Active" : "Blocked"}
                </span>
              }
              leading={
                <Checkbox
                  checked={selected.has(student.id)}
                  onChange={() => toggle(student.id)}
                  ariaLabel={`Select ${student.name}`}
                />
              }
              expanded={expanded === student.id}
              onToggle={() =>
                setExpanded((current) => (current === student.id ? null : student.id))
              }
            >
              <MobileDetailGrid>
                <MobileDetail label="Code">{student.studentCode ?? "—"}</MobileDetail>
                <MobileDetail label="Access ends">{fmtDate(student.accessEndDate)}</MobileDetail>
                <MobileDetail label="Batches">{student.batchCount}</MobileDetail>
              </MobileDetailGrid>
              <div className="mt-4 flex flex-wrap gap-2 [&>button]:min-h-11">
                <Link
                  href={`/admin/students/${student.id}`}
                  className="inline-flex min-h-11 items-center rounded-md border border-line px-3 text-sm font-medium text-fg-muted"
                >
                  View profile
                </Link>
                <StudentEditForm
                  compact
                  id={student.id}
                  name={student.name}
                  email={student.email}
                  studentCode={student.studentCode}
                  status={student.status}
                  accessStartDate={student.accessStartDate}
                  accessEndDate={student.accessEndDate}
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => rowDelete(student)}
                  className="rounded-md px-3 text-sm font-medium text-[color:var(--color-danger)] disabled:opacity-60"
                >
                  Delete
                </button>
              </div>
            </MobileExpandableRow>
          );
        })}
      </div>
      <div className="mt-6 hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-fg-subtle">
              <th className="w-8 py-2 pr-2">
                <Checkbox checked={allSelected} onChange={toggleAll} ariaLabel="Select all" />
              </th>
              <th className="py-2 pr-4 font-medium">Code</th>
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Email</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Access ends</th>
              <th className="py-2 pr-4 font-medium">Batches</th>
              <th className="py-2 pr-4 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => {
              const active = s.status === "active";
              return (
                <tr key={s.id} className="border-b border-hairline">
                  <td className="py-3 pr-2">
                    <Checkbox
                      checked={selected.has(s.id)}
                      onChange={() => toggle(s.id)}
                      ariaLabel={`Select ${s.name}`}
                    />
                  </td>
                  <td className="tabular py-3 pr-4 text-fg-muted">{s.studentCode ?? "—"}</td>
                  <td className="py-3 pr-4 font-medium text-fg">
                    <Link
                      href={`/admin/students/${s.id}`}
                      className="transition-colors hover:text-accent"
                    >
                      {s.name}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-fg-muted">{s.email}</td>
                  <td className="py-3 pr-4">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                      style={{
                        color: active ? "var(--color-success)" : "var(--color-danger)",
                        background: active
                          ? "color-mix(in oklab, var(--color-success) 12%, transparent)"
                          : "color-mix(in oklab, var(--color-danger) 12%, transparent)",
                      }}
                    >
                      {active ? "Active" : "Blocked"}
                    </span>
                  </td>
                  <td className="tabular py-3 pr-4 text-fg-muted">{fmtDate(s.accessEndDate)}</td>
                  <td className="tabular py-3 pr-4 text-fg-muted">{s.batchCount}</td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/students/${s.id}`}
                        className="rounded-md px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                      >
                        View
                      </Link>
                      <StudentEditForm
                        compact
                        id={s.id}
                        name={s.name}
                        email={s.email}
                        studentCode={s.studentCode}
                        status={s.status}
                        accessStartDate={s.accessStartDate}
                        accessEndDate={s.accessEndDate}
                      />
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => rowDelete(s)}
                        className="rounded-md px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-[color:var(--color-danger)] disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <BulkBar
        count={selected.size}
        noun="student"
        pending={pending}
        onDelete={bulkDelete}
        onClear={clearSelection}
        actions={
          <>
            <button
              type="button"
              onClick={() => setEmailing(true)}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-60"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect
                  x="3"
                  y="5"
                  width="18"
                  height="14"
                  rx="2"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />
                <path
                  d="m3.5 7 8.5 6 8.5-6"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Email
            </button>
            <button
              type="button"
              onClick={() => setAssigning(true)}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 5v14M5 12h14"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                />
              </svg>
              Assign to batch
            </button>
          </>
        }
      />

      {emailing ? (
        <EmailDialog
          studentIds={[...selected]}
          sampleName={items.find((s) => selected.has(s.id))?.name ?? "Student"}
          platformUrl={platformUrl}
          onClose={() => setEmailing(false)}
          onSent={() => {
            setEmailing(false);
            clearSelection();
          }}
        />
      ) : null}

      {assigning ? (
        <AssignBatchDialog
          studentIds={[...selected]}
          onClose={() => setAssigning(false)}
          onDone={() => {
            setAssigning(false);
            clearSelection();
          }}
        />
      ) : null}
    </>
  );
}
