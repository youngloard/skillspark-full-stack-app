"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateBatch } from "@/actions/batches";
import { useToast } from "@/components/admin/toast";
import { EditActions, Modal, editInputCls } from "@/components/admin/modal";

// Edit a batch (M6-S6 CRUD pass): code, name, description. Reuses the M3-S1
// updateBatch action.

export function BatchEditForm({
  id,
  batchCode,
  batchName,
  description,
  compact = false,
}: {
  id: string;
  batchCode: string;
  batchName: string;
  description: string | null;
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
            initial={{ batchCode, batchName, description: description ?? "" }}
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
  initial: { batchCode: string; batchName: string; description: string };
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
      const r = await updateBatch({
        id,
        batchCode: form.batchCode,
        batchName: form.batchName,
        description: form.description || null,
      });
      if (r.ok) {
        toast.success("Batch updated.");
        onDone();
        router.refresh();
      } else {
        if (r.error.fields) setErr(r.error.fields);
        toast.error(r.error.message || "Could not update the batch.");
      }
    });
  };

  return (
    <>
      <h2 className="font-display text-lg font-semibold tracking-tight text-fg">Edit batch</h2>
      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Batch code</span>
          <input
            name="batchCode"
            value={form.batchCode}
            onChange={(e) => setForm((f) => ({ ...f, batchCode: e.target.value }))}
            className={editInputCls}
          />
          {err.batchCode ? (
            <span className="text-xs text-[color:var(--color-danger)]">{err.batchCode}</span>
          ) : null}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Batch name</span>
          <input
            name="batchName"
            value={form.batchName}
            onChange={(e) => setForm((f) => ({ ...f, batchName: e.target.value }))}
            className={editInputCls}
          />
          {err.batchName ? (
            <span className="text-xs text-[color:var(--color-danger)]">{err.batchName}</span>
          ) : null}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Description</span>
          <input
            name="description"
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
