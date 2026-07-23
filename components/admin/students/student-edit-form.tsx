"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateStudent } from "@/actions/students";
import { useToast } from "@/components/admin/toast";
import { EditActions, Modal, editInputCls } from "@/components/admin/modal";

// Edit a student (M6-S6 CRUD pass): name, email, code, access window, status.
// Reuses the M3-S2 updateStudent action.

function toDateInput(iso: string): string {
  return iso.slice(0, 10);
}

export function StudentEditForm({
  id,
  name,
  email,
  studentCode,
  status,
  accessStartDate,
  accessEndDate,
  compact = false,
}: {
  id: string;
  name: string;
  email: string;
  studentCode: string | null;
  status: string;
  accessStartDate: string;
  accessEndDate: string;
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
            initial={{
              name,
              email,
              studentCode: studentCode ?? "",
              status,
              accessStartDate: toDateInput(accessStartDate),
              accessEndDate: toDateInput(accessEndDate),
            }}
            onDone={() => setOpen(false)}
          />
        </Modal>
      ) : null}
    </>
  );
}

type FormState = {
  name: string;
  email: string;
  studentCode: string;
  status: string;
  accessStartDate: string;
  accessEndDate: string;
};

function Fields({ id, initial, onDone }: { id: string; initial: FormState; onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [form, setForm] = useState(initial);
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    setErr({});
    start(async () => {
      const r = await updateStudent({
        id,
        name: form.name,
        email: form.email,
        studentCode: form.studentCode || null,
        status: form.status,
        accessStartDate: form.accessStartDate,
        accessEndDate: form.accessEndDate,
      });
      if (r.ok) {
        toast.success("Student updated.");
        onDone();
        router.refresh();
      } else {
        if (r.error.fields) setErr(r.error.fields);
        toast.error(r.error.message || "Could not update the student.");
      }
    });
  };

  const field = (label: string, k: keyof FormState, type = "text") => (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-fg-muted">{label}</span>
      <input name={k} value={form[k]} onChange={set(k)} type={type} className={editInputCls} />
      {err[k] ? <span className="text-xs text-[color:var(--color-danger)]">{err[k]}</span> : null}
    </label>
  );

  return (
    <>
      <h2 className="font-display text-lg font-semibold tracking-tight text-fg">Edit student</h2>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {field("Name", "name")}
        {field("Student code", "studentCode")}
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-xs font-medium text-fg-muted">Email</span>
          <input
            name="email"
            value={form.email}
            onChange={set("email")}
            type="email"
            className={editInputCls}
          />
          {err.email ? (
            <span className="text-xs text-[color:var(--color-danger)]">{err.email}</span>
          ) : null}
        </label>
        {field("Access start", "accessStartDate", "date")}
        {field("Access end", "accessEndDate", "date")}
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-xs font-medium text-fg-muted">Status</span>
          <div className="inline-flex w-fit items-center gap-0.5 rounded-md bg-surface-2 p-0.5">
            {(["active", "blocked"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={form.status === s}
                onClick={() => setForm((f) => ({ ...f, status: s }))}
                className={`rounded-[7px] px-3 py-1.5 text-[13px] font-medium capitalize transition-colors ${
                  form.status === s
                    ? "bg-bg text-fg shadow-[0_1px_2px_rgba(2,20,20,0.12)]"
                    : "text-fg-muted hover:text-fg"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
      <EditActions onCancel={onDone} onSave={submit} pending={pending} />
    </>
  );
}
