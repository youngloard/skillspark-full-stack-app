"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createModule, deleteModule, reorderModules } from "@/actions/modules";
import { useConfirm } from "@/components/admin/confirm-dialog";
import { useToast } from "@/components/admin/toast";
import { ModuleEditForm } from "@/components/admin/courses/module-edit-form";
import { cn } from "@/lib/cn";

// Module management for a course (M6-S5): ordered module list with move up/down
// (optimistic reorder that persists via reorderModules), inline quick-add, and
// delete. Modules only apply to module-layout courses.

type Mod = { id: string; title: string; description: string | null; itemCount: number };

export function ModuleManager({
  courseId,
  layout,
  modules,
}: {
  courseId: string;
  layout: string;
  modules: Mod[];
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(modules, (_prev, next: Mod[]) => next);
  const [adding, setAdding] = useState(false);

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= optimistic.length) return;
    const next = [...optimistic];
    [next[index], next[target]] = [next[target], next[index]];
    start(async () => {
      setOptimistic(next);
      const r = await reorderModules({ courseId, moduleIds: next.map((m) => m.id) });
      if (r.ok) router.refresh();
      else toast.error(r.error.message || "Could not reorder modules.");
    });
  };

  const remove = async (m: Mod) => {
    // Confirm BEFORE the transition (a transition can't wait on user input).
    const ok = await confirm({
      title: "Delete module?",
      message:
        m.itemCount > 0
          ? `“${m.title}” has ${m.itemCount} item(s), which will also be deleted.`
          : `Delete “${m.title}”?`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    start(async () => {
      const r = await deleteModule({ id: m.id });
      if (r.ok) {
        toast.success("Module deleted.");
        router.refresh();
      } else {
        toast.error(r.error.message || "Could not delete the module.");
      }
    });
  };

  if (layout === "flat") {
    return (
      <p className="text-sm text-fg-muted">
        This is a <span className="font-medium text-fg">flat</span> course — content items sit
        directly on the course, without modules.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <h2 className="text-sm font-semibold text-fg">Modules · {optimistic.length}</h2>
        <button
          type="button"
          onClick={() => setAdding((a) => !a)}
          aria-expanded={adding}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
            />
          </svg>
          Add module
        </button>
      </div>

      {adding ? <QuickAddModule courseId={courseId} onDone={() => setAdding(false)} /> : null}

      {optimistic.length === 0 ? (
        <p className="text-sm text-fg-muted">No modules yet — add the first one.</p>
      ) : (
        <ul className="flex flex-col">
          {optimistic.map((m, i) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center gap-3 border-b border-hairline py-3 last:border-b-0"
            >
              <div className="flex flex-col">
                <IconBtn label="Move up" disabled={pending || i === 0} onClick={() => move(i, -1)}>
                  <path d="m6 15 6-6 6 6" />
                </IconBtn>
                <IconBtn
                  label="Move down"
                  disabled={pending || i === optimistic.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <path d="m6 9 6 6 6-6" />
                </IconBtn>
              </div>
              <span className="tabular w-6 shrink-0 text-center text-xs text-fg-subtle">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/courses/${courseId}/modules/${m.id}`}
                  className="block truncate text-sm font-medium text-fg transition-colors hover:text-accent"
                >
                  {m.title}
                </Link>
                {m.description ? (
                  <p className="truncate text-xs text-fg-muted">{m.description}</p>
                ) : null}
              </div>
              <Link
                href={`/admin/courses/${courseId}/modules/${m.id}`}
                className="tabular shrink-0 text-xs text-fg-subtle transition-colors hover:text-fg"
              >
                {m.itemCount} items
              </Link>
              <Link
                href={`/admin/courses/${courseId}/modules/${m.id}`}
                className="inline-flex min-h-11 shrink-0 items-center rounded-md px-3 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg sm:min-h-0 sm:px-2.5"
              >
                Open
              </Link>
              <ModuleEditForm compact id={m.id} title={m.title} description={m.description} />
              <button
                type="button"
                disabled={pending}
                onClick={() => remove(m)}
                className="min-h-11 shrink-0 rounded-md px-3 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-[color:var(--color-danger)] disabled:opacity-60 sm:min-h-0 sm:px-2.5"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IconBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-30 sm:h-5 sm:w-6"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}

function QuickAddModule({ courseId, onDone }: { courseId: string; onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ title: "", description: "" });
  const [err, setErr] = useState<Record<string, string>>({});

  const submit = () => {
    setErr({});
    start(async () => {
      const r = await createModule({
        courseId,
        title: form.title,
        description: form.description || undefined,
      });
      if (r.ok) {
        toast.success("Module added.");
        setForm({ title: "", description: "" });
        onDone();
        router.refresh();
      } else {
        if (r.error.fields) setErr(r.error.fields);
        toast.error(r.error.message || "Could not add the module.");
      }
    });
  };

  const inputCls =
    "min-h-11 w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-0 sm:text-sm";

  return (
    <div className="rounded-lg bg-surface-2/50 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Title</span>
          <input
            name="moduleTitle"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className={inputCls}
            placeholder="Module title"
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
            className={inputCls}
            placeholder="optional"
          />
        </label>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className={cn(
            "min-h-11 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60",
          )}
        >
          {pending ? "Adding…" : "Save module"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="min-h-11 rounded-md px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
