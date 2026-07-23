"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignCourseToBatches } from "@/actions/batches";
import { createCourse } from "@/actions/courses";
import { searchCoursesAction } from "@/actions/admin-search";
import { useToast } from "@/components/admin/toast";
import { Modal } from "@/components/admin/modal";
import { MultiCombobox, type MultiItem } from "@/components/admin/multi-combobox";

// Bulk "assign course to batches" (M6) — the batches-page counterpart of the
// roster's assign-to-batch. A batch may hold several courses, so several can be
// picked at once and this only ever ADDS: batches already on a course are
// skipped, making a re-run a no-op.

export function AssignCourseDialog({
  batchIds,
  onClose,
  onDone,
}: {
  batchIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [courses, setCourses] = useState<MultiItem[]>([]);

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

  const submit = () => {
    if (courses.length === 0) {
      toast.error("Pick at least one course.");
      return;
    }
    start(async () => {
      let assigned = 0;
      // One pass per course; each is chunked because the action caps at 200.
      for (const course of courses) {
        for (let i = 0; i < batchIds.length; i += 200) {
          const r = await assignCourseToBatches({
            batchIds: batchIds.slice(i, i + 200),
            courseId: course.id,
          });
          if (!r.ok) {
            toast.error(r.error.message || `Could not assign “${course.label}”.`);
            router.refresh();
            return;
          }
          assigned += r.data.assigned;
        }
      }
      const noun = courses.length === 1 ? "Course" : `${courses.length} courses`;
      toast.success(
        assigned === 0
          ? "Every selected batch already had these courses."
          : `${noun} added — ${assigned} batch link${assigned === 1 ? "" : "s"} created.`,
      );
      onDone();
      router.refresh();
    });
  };

  return (
    <Modal onClose={onClose} size="lg">
      <h2 className="font-display text-lg font-semibold tracking-tight text-fg">
        Assign courses to {batchIds.length} batch{batchIds.length === 1 ? "" : "es"}
      </h2>

      <div className="mt-5 flex flex-col gap-4 sm:min-h-[13rem]">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Courses</span>
          <MultiCombobox
            label="Courses"
            selected={courses}
            placeholder="Search courses, or create one…"
            search={searchCourses}
            onChange={setCourses}
            onCreate={createCourseInline}
            createLabel={(name) => `Create course “${name}”`}
          />
        </label>

        <p className="text-xs text-fg-subtle">
          Batches can hold several courses — these are added, and any batch that already has one is
          left untouched.
        </p>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending || courses.length === 0}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Assigning…" : "Assign courses"}
        </button>
      </div>
    </Modal>
  );
}
