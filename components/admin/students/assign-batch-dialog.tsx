"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignCourseToBatch, assignStudentsToBatch } from "@/actions/batches";
import { createCourse } from "@/actions/courses";
import { searchBatchesAction, searchCoursesAction } from "@/actions/admin-search";
import { ensureBatchByName } from "@/actions/admin-provisioning";
import { useToast } from "@/components/admin/toast";
import { Modal } from "@/components/admin/modal";
import { Combobox, type ComboItem } from "@/components/admin/combobox";
import { MultiCombobox, type MultiItem } from "@/components/admin/multi-combobox";

// Multi-select "assign to batch" (M6): pick or create a batch, optionally add
// courses to it (a batch may hold several), then enroll the selected students.
// Courses the batch already has are shown as context — the chooser only ADDS.

export function AssignBatchDialog({
  studentIds,
  onClose,
  onDone,
}: {
  studentIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [batch, setBatch] = useState<ComboItem | null>(null);
  const [courses, setCourses] = useState<MultiItem[]>([]);
  // Courses the chosen batch already has — context, so the admin sees what
  // students will inherit before adding more.
  const [batchCourses_, setBatchCourses] = useState<MultiItem[]>([]);
  const batchCourses = useRef(new Map<string, MultiItem[]>());

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
      // ensureBatchByName finds an existing batch by name or creates a new one,
      // so the returned batch may already carry courses.
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
    setBatchCourses(batchCourses.current.get(item.id) ?? []);
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

  const submit = () => {
    if (!batch) {
      toast.error("Pick a batch first.");
      return;
    }
    start(async () => {
      let added = 0;
      // Chunked: the action caps each call, but a select-all can be larger.
      for (let i = 0; i < studentIds.length; i += 200) {
        const r = await assignStudentsToBatch({
          studentIds: studentIds.slice(i, i + 200),
          batchId: batch.id,
        });
        if (!r.ok) {
          toast.error(r.error.message || "Could not assign the students.");
          router.refresh();
          return;
        }
        added += r.data.added;
      }
      for (const c of courses) {
        const link = await assignCourseToBatch({ batchId: batch.id, courseId: c.id });
        if (!link.ok) toast.error(link.error.message || `Assigned, but “${c.label}” link failed.`);
      }
      const skipped = studentIds.length - added;
      toast.success(
        `Assigned ${added} student${added === 1 ? "" : "s"} to ${batch.label}${
          skipped > 0 ? ` (${skipped} already in the batch)` : ""
        }.`,
      );
      onDone();
      router.refresh();
    });
  };

  return (
    <Modal onClose={onClose} size="lg">
      <h2 className="font-display text-lg font-semibold tracking-tight text-fg">
        Assign {studentIds.length} student{studentIds.length === 1 ? "" : "s"} to a batch
      </h2>
      <div className="mt-5 flex flex-col gap-4 sm:min-h-[15rem]">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Batch</span>
          <Combobox
            value={batch}
            placeholder="Search a batch, or create one…"
            search={searchBatches}
            onSelect={pickBatch}
            onClear={() => {
              setBatch(null);
              setBatchCourses([]);
              setCourses([]);
            }}
            onCreate={createBatchInline}
            createLabel={(name) => `Create batch “${name}”`}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Courses</span>
          <MultiCombobox
            label="Courses"
            selected={courses}
            assigned={batchCourses_}
            assignedLabel="assigned"
            placeholder={batch ? "Search courses…" : "Pick a batch first"}
            search={searchCourses}
            onChange={setCourses}
            onCreate={createCourseInline}
            createLabel={(name) => `Create course “${name}”`}
            disabled={!batch}
          />
          <span className="text-xs text-fg-subtle">
            Courses the batch already teaches are ticked — pick more to add.
          </span>
        </label>
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
          disabled={pending || !batch}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Assigning…" : "Assign students"}
        </button>
      </div>
    </Modal>
  );
}
