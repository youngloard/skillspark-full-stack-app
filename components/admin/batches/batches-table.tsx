"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteBatch, deleteBatches } from "@/actions/batches";
import type { BatchListItem } from "@/lib/admin-batches";
import { useConfirm } from "@/components/admin/confirm-dialog";
import { useToast } from "@/components/admin/toast";
import { BulkBar } from "@/components/admin/bulk-bar";
import { Checkbox } from "@/components/admin/checkbox";
import { BatchEditForm } from "@/components/admin/batches/batch-edit-form";
import { AssignCourseDialog } from "@/components/admin/batches/assign-course-dialog";
import { AssignExamDialog, type ExamOption } from "@/components/admin/batches/assign-exam-dialog";
import {
  MobileDetail,
  MobileDetailGrid,
  MobileExpandableRow,
} from "@/components/admin/mobile-list-row";

// Batches table with row View/Delete + multi-select delete (M6 CRUD). Edit
// lives on the batch detail page.

export function BatchesTable({ items, exams }: { items: BatchListItem[]; exams: ExamOption[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assigningCourse, setAssigningCourse] = useState(false);
  const [assigningExam, setAssigningExam] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const allSelected = items.length > 0 && items.every((b) => selected.has(b.id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected((prev) =>
      prev.size === items.length ? new Set() : new Set(items.map((b) => b.id)),
    );

  const rowDelete = async (b: BatchListItem) => {
    const ok = await confirm({
      title: "Delete batch?",
      message: `Delete ${b.batchName}? Students keep their accounts but lose access granted through it.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    start(async () => {
      const r = await deleteBatch({ id: b.id });
      if (r.ok) {
        toast.success("Batch deleted.");
        router.refresh();
      } else toast.error(r.error.message || "Could not delete the batch.");
    });
  };

  const bulkDelete = async () => {
    const ids = [...selected];
    const ok = await confirm({
      title: `Delete ${ids.length} batch${ids.length === 1 ? "" : "es"}?`,
      message: "Students keep their accounts but lose access granted through these batches.",
      confirmLabel: "Delete all",
    });
    if (!ok) return;
    start(async () => {
      const r = await deleteBatches({ ids });
      if (r.ok) {
        toast.success(`${r.data.deleted} deleted.`);
        setSelected(new Set());
        router.refresh();
      } else toast.error(r.error.message || "Could not delete the selected batches.");
    });
  };

  return (
    <>
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
        {items.map((batch) => (
          <MobileExpandableRow
            key={batch.id}
            id={`batch-${batch.id}`}
            title={batch.batchName}
            subtitle={batch.batchCode}
            status={
              <span className="text-xs text-fg-muted">
                {batch.studentCount} student{batch.studentCount === 1 ? "" : "s"}
              </span>
            }
            leading={
              <Checkbox
                checked={selected.has(batch.id)}
                onChange={() => toggle(batch.id)}
                ariaLabel={`Select ${batch.batchName}`}
              />
            }
            expanded={expanded === batch.id}
            onToggle={() => setExpanded((current) => (current === batch.id ? null : batch.id))}
          >
            <MobileDetailGrid>
              <MobileDetail label="Students">{batch.studentCount}</MobileDetail>
              <MobileDetail label="Courses">{batch.courseCount}</MobileDetail>
              <MobileDetail label="Description">{batch.description || "—"}</MobileDetail>
            </MobileDetailGrid>
            <div className="mt-4 flex flex-wrap gap-2 [&>button]:min-h-11">
              <Link
                href={`/admin/batches/${batch.id}`}
                className="inline-flex min-h-11 items-center rounded-md border border-line px-3 text-sm font-medium text-fg-muted"
              >
                Open batch
              </Link>
              <BatchEditForm
                compact
                id={batch.id}
                batchCode={batch.batchCode}
                batchName={batch.batchName}
                description={batch.description}
              />
              <button
                type="button"
                disabled={pending}
                onClick={() => rowDelete(batch)}
                className="rounded-md px-3 text-sm font-medium text-[color:var(--color-danger)] disabled:opacity-60"
              >
                Delete
              </button>
            </div>
          </MobileExpandableRow>
        ))}
      </div>
      <div className="mt-6 hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-fg-subtle">
              <th className="w-8 py-2 pr-2">
                <Checkbox checked={allSelected} onChange={toggleAll} ariaLabel="Select all" />
              </th>
              <th className="py-2 pr-4 font-medium">Code</th>
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Students</th>
              <th className="py-2 pr-4 font-medium">Courses</th>
              <th className="py-2 pr-4 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((b) => (
              <tr key={b.id} className="border-b border-hairline">
                <td className="py-3 pr-2">
                  <Checkbox
                    checked={selected.has(b.id)}
                    onChange={() => toggle(b.id)}
                    ariaLabel={`Select ${b.batchName}`}
                  />
                </td>
                <td className="tabular py-3 pr-4 text-fg-muted">{b.batchCode}</td>
                <td className="py-3 pr-4 font-medium text-fg">
                  <Link
                    href={`/admin/batches/${b.id}`}
                    className="transition-colors hover:text-accent"
                  >
                    {b.batchName}
                  </Link>
                </td>
                <td className="tabular py-3 pr-4 text-fg-muted">{b.studentCount}</td>
                <td className="tabular py-3 pr-4 text-fg-muted">{b.courseCount}</td>
                <td className="py-3 pr-4">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/admin/batches/${b.id}`}
                      className="rounded-md px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                    >
                      Open
                    </Link>
                    <BatchEditForm
                      compact
                      id={b.id}
                      batchCode={b.batchCode}
                      batchName={b.batchName}
                      description={b.description}
                    />
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => rowDelete(b)}
                      className="rounded-md px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-[color:var(--color-danger)] disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <BulkBar
        count={selected.size}
        noun="batch"
        nounPlural="batches"
        pending={pending}
        onDelete={bulkDelete}
        onClear={() => setSelected(new Set())}
        actions={
          <>
            <button
              type="button"
              onClick={() => setAssigningExam(true)}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-60"
            >
              Grant exam
            </button>
            <button
              type="button"
              onClick={() => setAssigningCourse(true)}
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
              Assign course
            </button>
          </>
        }
      />

      {assigningExam ? (
        <AssignExamDialog
          batchIds={[...selected]}
          exams={exams}
          onClose={() => setAssigningExam(false)}
          onDone={() => {
            setAssigningExam(false);
            setSelected(new Set());
          }}
        />
      ) : null}

      {assigningCourse ? (
        <AssignCourseDialog
          batchIds={[...selected]}
          onClose={() => setAssigningCourse(false)}
          onDone={() => {
            setAssigningCourse(false);
            setSelected(new Set());
          }}
        />
      ) : null}
    </>
  );
}
