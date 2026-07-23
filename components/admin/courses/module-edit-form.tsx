"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateModule } from "@/actions/modules";
import { useToast } from "@/components/admin/toast";
import { EditActions, Modal, editInputCls } from "@/components/admin/modal";

// Edit (rename) a module (M6 CRUD): title + description. Reuses the M2-S2
// updateModule action. `compact` renders a small row-action button.

export function ModuleEditForm({
  id,
  title,
  description,
  compact = false,
}: {
  id: string;
  title: string;
  description: string | null;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          compact
            ? "rounded-md px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            : "inline-flex items-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
        }
      >
        Edit
      </button>
      {open ? (
        <Modal onClose={() => setOpen(false)}>
          <Fields
            id={id}
            initial={{ title, description: description ?? "" }}
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
  onDone,
}: {
  id: string;
  initial: { title: string; description: string };
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
      const r = await updateModule({
        id,
        title: form.title,
        description: form.description || null,
      });
      if (r.ok) {
        toast.success("Module updated.");
        onDone();
        router.refresh();
      } else {
        if (r.error.fields) setErr(r.error.fields);
        toast.error(r.error.message || "Could not update the module.");
      }
    });
  };

  return (
    <>
      <h2 className="font-display text-lg font-semibold tracking-tight text-fg">Edit module</h2>
      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Title</span>
          <input
            name="moduleTitle"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className={editInputCls}
          />
          {err.title ? (
            <span className="text-xs text-[color:var(--color-danger)]">{err.title}</span>
          ) : null}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Description</span>
          <input
            name="moduleDescription"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className={editInputCls}
            placeholder="optional"
          />
        </label>
      </div>
      <EditActions onCancel={onDone} onSave={submit} pending={pending} />
    </>
  );
}
