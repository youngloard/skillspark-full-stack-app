"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCourse } from "@/actions/courses";
import { useToast } from "@/components/admin/toast";
import { EditActions, Modal, editInputCls } from "@/components/admin/modal";
import { cn } from "@/lib/cn";

// Edit a course (M6-S6 CRUD pass): name, description, and layout (layout can
// only change while the course has no modules — the lib enforces it too). Opens
// a small modal from the header Edit button.

export function CourseEditForm({
  id,
  name,
  description,
  layout,
  canChangeLayout,
  compact = false,
}: {
  id: string;
  name: string;
  description: string | null;
  layout: string;
  canChangeLayout: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-11 rounded-md px-3 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg sm:min-h-0 sm:px-2.5"
        >
          Edit
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Edit
        </button>
      )}
      {open ? (
        <Modal onClose={() => setOpen(false)}>
          <Fields
            id={id}
            initial={{ name, description: description ?? "", layout }}
            canChangeLayout={canChangeLayout}
            onDone={() => setOpen(false)}
          />
        </Modal>
      ) : null}
    </>
  );
}

function Fields({
  id,
  initial,
  canChangeLayout,
  onDone,
}: {
  id: string;
  initial: { name: string; description: string; layout: string };
  canChangeLayout: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [form, setForm] = useState(initial);
  const [err, setErr] = useState<Record<string, string>>({});

  const submit = () => {
    setErr({});
    start(async () => {
      const r = await updateCourse({
        id,
        name: form.name,
        description: form.description || null,
        ...(canChangeLayout ? { layout: form.layout } : {}),
      });
      if (r.ok) {
        toast.success("Course updated.");
        onDone();
        router.refresh();
      } else {
        if (r.error.fields) setErr(r.error.fields);
        toast.error(r.error.message || "Could not update the course.");
      }
    });
  };

  const inputCls = editInputCls;

  return (
    <>
      <h2 className="font-display text-lg font-semibold tracking-tight text-fg">Edit course</h2>
      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Name</span>
          <input
            name="courseName"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className={inputCls}
          />
          {err.name ? (
            <span className="text-xs text-[color:var(--color-danger)]">{err.name}</span>
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
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Layout</span>
          <div className="inline-flex w-fit items-center gap-0.5 rounded-md bg-surface-2 p-0.5">
            {(["module", "flat"] as const).map((l) => (
              <button
                key={l}
                type="button"
                disabled={!canChangeLayout}
                aria-pressed={form.layout === l}
                onClick={() => setForm((f) => ({ ...f, layout: l }))}
                className={cn(
                  "rounded-[7px] px-3 py-1.5 text-[13px] font-medium capitalize transition-colors disabled:cursor-not-allowed",
                  form.layout === l
                    ? "bg-bg text-fg shadow-[0_1px_2px_rgba(2,20,20,0.12)]"
                    : "text-fg-muted hover:text-fg",
                )}
              >
                {l}
              </button>
            ))}
          </div>
          {!canChangeLayout ? (
            <span className="text-xs text-fg-subtle">
              Remove all modules/content to change the layout.
            </span>
          ) : null}
        </div>
      </div>
      <EditActions onCancel={onDone} onSave={submit} pending={pending} />
    </>
  );
}
