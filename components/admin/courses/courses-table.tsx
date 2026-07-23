"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteCourse, deleteCourses } from "@/actions/courses";
import type { CourseListItem } from "@/lib/admin-courses";
import { useConfirm } from "@/components/admin/confirm-dialog";
import { useToast } from "@/components/admin/toast";
import { BulkBar } from "@/components/admin/bulk-bar";
import { Checkbox } from "@/components/admin/checkbox";
import { CourseStatusToggle } from "@/components/admin/courses/course-status-toggle";
import { CourseEditForm } from "@/components/admin/courses/course-edit-form";
import {
  MobileDetail,
  MobileDetailGrid,
  MobileExpandableRow,
} from "@/components/admin/mobile-list-row";

// Courses table with inline status toggle, row View/Delete, and multi-select
// delete (M6 CRUD). Edit lives on the course detail page.

export function CoursesTable({ items }: { items: CourseListItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);

  const allSelected = items.length > 0 && items.every((c) => selected.has(c.id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected((prev) =>
      prev.size === items.length ? new Set() : new Set(items.map((c) => c.id)),
    );

  const rowDelete = async (c: CourseListItem) => {
    const ok = await confirm({
      title: "Delete course?",
      message: `Delete ${c.name}? Its modules and content are removed. This can't be undone.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    start(async () => {
      const r = await deleteCourse({ id: c.id });
      if (r.ok) {
        toast.success("Course deleted.");
        router.refresh();
      } else toast.error(r.error.message || "Could not delete the course.");
    });
  };

  const bulkDelete = async () => {
    const ids = [...selected];
    const ok = await confirm({
      title: `Delete ${ids.length} course${ids.length === 1 ? "" : "s"}?`,
      message: "Their modules and content are removed. This can't be undone.",
      confirmLabel: "Delete all",
    });
    if (!ok) return;
    start(async () => {
      const r = await deleteCourses({ ids });
      if (r.ok) {
        toast.success(`${r.data.deleted} deleted.`);
        setSelected(new Set());
        router.refresh();
      } else toast.error(r.error.message || "Could not delete the selected courses.");
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
        {items.map((course) => {
          const active = course.status === "active";
          return (
            <MobileExpandableRow
              key={course.id}
              id={`course-${course.id}`}
              title={course.name}
              subtitle={`${course.layout} layout`}
              status={
                <span
                  className="text-xs font-medium"
                  style={{ color: active ? "var(--color-success)" : "var(--color-fg-subtle)" }}
                >
                  {active ? "Active" : "Inactive"}
                </span>
              }
              leading={
                <Checkbox
                  checked={selected.has(course.id)}
                  onChange={() => toggle(course.id)}
                  ariaLabel={`Select ${course.name}`}
                />
              }
              expanded={expanded === course.id}
              onToggle={() => setExpanded((current) => (current === course.id ? null : course.id))}
            >
              <MobileDetailGrid>
                <MobileDetail label="Modules">{course.moduleCount}</MobileDetail>
                <MobileDetail label="Description">{course.description || "—"}</MobileDetail>
              </MobileDetailGrid>
              <div className="mt-4 flex flex-wrap items-center gap-2 [&>button]:min-h-11">
                <CourseStatusToggle id={course.id} status={course.status} size="md" />
                <Link
                  href={`/admin/courses/${course.id}`}
                  className="inline-flex min-h-11 items-center rounded-md border border-line px-3 text-sm font-medium text-fg-muted"
                >
                  Open course
                </Link>
                <CourseEditForm
                  compact
                  id={course.id}
                  name={course.name}
                  description={course.description}
                  layout={course.layout}
                  canChangeLayout={course.moduleCount === 0}
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => rowDelete(course)}
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
        <table className="w-full min-w-[620px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-fg-subtle">
              <th className="w-8 py-2 pr-2">
                <Checkbox checked={allSelected} onChange={toggleAll} ariaLabel="Select all" />
              </th>
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Layout</th>
              <th className="py-2 pr-4 font-medium">Modules</th>
              <th className="py-2 pr-4 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-b border-hairline">
                <td className="py-3 pr-2">
                  <Checkbox
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    ariaLabel={`Select ${c.name}`}
                  />
                </td>
                <td className="py-3 pr-4 font-medium text-fg">
                  <Link
                    href={`/admin/courses/${c.id}`}
                    className="transition-colors hover:text-accent"
                  >
                    {c.name}
                  </Link>
                </td>
                <td className="py-3 pr-4">
                  <CourseStatusToggle id={c.id} status={c.status} />
                </td>
                <td className="py-3 pr-4 capitalize text-fg-muted">{c.layout}</td>
                <td className="tabular py-3 pr-4 text-fg-muted">{c.moduleCount}</td>
                <td className="py-3 pr-4">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/admin/courses/${c.id}`}
                      className="rounded-md px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                    >
                      Open
                    </Link>
                    <CourseEditForm
                      compact
                      id={c.id}
                      name={c.name}
                      description={c.description}
                      layout={c.layout}
                      canChangeLayout={c.moduleCount === 0}
                    />
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => rowDelete(c)}
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
        noun="course"
        pending={pending}
        onDelete={bulkDelete}
        onClear={() => setSelected(new Set())}
      />
    </>
  );
}
