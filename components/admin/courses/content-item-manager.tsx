"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createVideoItem, deleteItem, reorderItems } from "@/actions/items";
import { createMaterialItem } from "@/actions/materials";
import { useConfirm } from "@/components/admin/confirm-dialog";
import { useToast } from "@/components/admin/toast";
import { Checkbox } from "@/components/admin/checkbox";
import { ItemEditForm } from "@/components/admin/courses/item-edit-form";
import { cn } from "@/lib/cn";
import type { ModuleItem } from "@/lib/admin-courses";

// Content-item management for a module OR a flat course (M6-S6). Ordered list of
// videos + materials with move up/down (optimistic reorder → reorderItems),
// add-video (Drive) and add-material (upload / drive / url) forms, and delete.
// The parent is either a module or a flat course — the actions accept both.

export type ContentParent = { kind: "module" | "course"; id: string };

function parentField(parent: ContentParent) {
  return parent.kind === "module" ? { moduleId: parent.id } : { courseId: parent.id };
}

const inputCls =
  "min-h-11 w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-0 sm:text-sm";

function fmtDuration(sec: number | null): string {
  if (!sec || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ContentItemManager({
  parent,
  items,
}: {
  parent: ContentParent;
  items: ModuleItem[];
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(items, (_p, next: ModuleItem[]) => next);
  const [form, setForm] = useState<"none" | "video" | "material">("none");

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= optimistic.length) return;
    const next = [...optimistic];
    [next[index], next[target]] = [next[target], next[index]];
    start(async () => {
      setOptimistic(next);
      const r = await reorderItems({ ...parentField(parent), itemIds: next.map((i) => i.id) });
      if (r.ok) router.refresh();
      else toast.error(r.error.message || "Could not reorder items.");
    });
  };

  const remove = async (item: ModuleItem) => {
    const ok = await confirm({
      title: "Delete item?",
      message: `Delete “${item.title}”? This can't be undone.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    start(async () => {
      const r = await deleteItem({ id: item.id });
      if (r.ok) {
        toast.success("Item deleted.");
        router.refresh();
      } else {
        toast.error(r.error.message || "Could not delete the item.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <h2 className="text-sm font-semibold text-fg">Content · {optimistic.length}</h2>
        <div className="grid grid-cols-2 items-center gap-2 sm:flex">
          <AddButton
            active={form === "video"}
            onClick={() => setForm(form === "video" ? "none" : "video")}
          >
            Add video
          </AddButton>
          <AddButton
            active={form === "material"}
            onClick={() => setForm(form === "material" ? "none" : "material")}
          >
            Add material
          </AddButton>
        </div>
      </div>

      {form === "video" ? <AddVideoForm parent={parent} onDone={() => setForm("none")} /> : null}
      {form === "material" ? (
        <AddMaterialForm parent={parent} onDone={() => setForm("none")} />
      ) : null}

      {optimistic.length === 0 ? (
        <p className="text-sm text-fg-muted">No content yet — add a video or material.</p>
      ) : (
        <ul className="flex flex-col">
          {optimistic.map((item, i) => (
            <li
              key={item.id}
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
              <TypeBadge type={item.type} />
              <div className="min-w-0 flex-1">
                {item.type === "video" ? (
                  <Link
                    href={`/admin/items/${item.id}`}
                    className="block truncate text-sm font-medium text-fg transition-colors hover:text-accent"
                  >
                    {item.title}
                  </Link>
                ) : (
                  <p className="truncate text-sm font-medium text-fg">{item.title}</p>
                )}
                <p className="text-xs text-fg-muted">
                  {item.type === "video"
                    ? `Video · ${fmtDuration(item.duration)}`
                    : `Material · ${item.sourceType ?? "?"}${item.downloadEnabled ? " · downloadable" : ""}`}
                  {item.status !== "active" ? " · inactive" : ""}
                </p>
              </div>
              {item.type === "video" ? (
                <Link
                  href={`/admin/items/${item.id}`}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-md px-3 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg sm:min-h-0 sm:px-2.5"
                >
                  Open
                </Link>
              ) : null}
              <ItemEditForm compact item={item} />
              <button
                type="button"
                disabled={pending}
                onClick={() => remove(item)}
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

function TypeBadge({ type }: { type: string }) {
  const isVideo = type === "video";
  return (
    <span
      className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-surface-2 text-fg-muted"
      title={isVideo ? "Video" : "Material"}
    >
      {isVideo ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="m10 8 6 4-6 4V8Z" fill="currentColor" />
          <rect
            x="3"
            y="5"
            width="18"
            height="14"
            rx="2.5"
            stroke="currentColor"
            strokeWidth="1.7"
          />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path
            d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}

function AddButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? "bg-surface-2 text-fg"
          : "bg-surface text-fg-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
      {children}
    </button>
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

function AddVideoForm({ parent, onDone }: { parent: ContentParent; onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ title: "", driveUrl: "" });
  const [err, setErr] = useState<Record<string, string>>({});

  const submit = () => {
    setErr({});
    start(async () => {
      const r = await createVideoItem({
        ...parentField(parent),
        title: form.title,
        driveUrl: form.driveUrl,
      });
      if (r.ok) {
        toast.success("Video added.");
        onDone();
        router.refresh();
      } else {
        if (r.error.fields) setErr(r.error.fields);
        toast.error(r.error.message || "Could not add the video.");
      }
    });
  };

  return (
    <FormShell onDone={onDone} onSubmit={submit} pending={pending} label="Save video">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-fg-muted">Title</span>
        <input
          name="videoTitle"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          className={inputCls}
          placeholder="Lesson title"
        />
        {err.title ? <FieldError>{err.title}</FieldError> : null}
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-fg-muted">Google Drive link or file ID</span>
        <input
          name="videoDriveUrl"
          value={form.driveUrl}
          onChange={(e) => setForm((f) => ({ ...f, driveUrl: e.target.value }))}
          className={inputCls}
          placeholder="drive.google.com/file/d/…"
        />
        {err.driveUrl ? <FieldError>{err.driveUrl}</FieldError> : null}
      </label>
    </FormShell>
  );
}

function AddMaterialForm({ parent, onDone }: { parent: ContentParent; onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [source, setSource] = useState<"upload" | "drive" | "url">("upload");
  const [driveUrl, setDriveUrl] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [downloadEnabled, setDownloadEnabled] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});

  const submit = () => {
    setErr({});
    start(async () => {
      const fd = new FormData();
      const pf = parentField(parent);
      fd.set(
        parent.kind === "module" ? "moduleId" : "courseId",
        pf[parent.kind === "module" ? "moduleId" : "courseId"]!,
      );
      fd.set("title", title);
      fd.set("sourceType", source);
      if (downloadEnabled) fd.set("downloadEnabled", "on");
      if (source === "drive") fd.set("driveUrl", driveUrl);
      if (source === "url") fd.set("externalUrl", externalUrl);
      if (source === "upload" && file) fd.set("file", file);
      const r = await createMaterialItem(fd);
      if (r.ok) {
        toast.success("Material added.");
        onDone();
        router.refresh();
      } else {
        if (r.error.fields) setErr(r.error.fields);
        toast.error(r.error.message || "Could not add the material.");
      }
    });
  };

  return (
    <FormShell onDone={onDone} onSubmit={submit} pending={pending} label="Save material">
      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-xs font-medium text-fg-muted">Title</span>
        <input
          name="materialTitle"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputCls}
          placeholder="Notes / document title"
        />
        {err.title ? <FieldError>{err.title}</FieldError> : null}
      </label>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-xs font-medium text-fg-muted">Source</span>
        <div className="inline-flex w-fit items-center gap-0.5 rounded-md bg-surface-2 p-0.5">
          {(["upload", "drive", "url"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={source === s}
              onClick={() => setSource(s)}
              className={cn(
                "rounded-[7px] px-3 py-1.5 text-[13px] font-medium capitalize transition-colors",
                source === s
                  ? "bg-bg text-fg shadow-[0_1px_2px_rgba(2,20,20,0.12)]"
                  : "text-fg-muted hover:text-fg",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {source === "upload" ? (
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-xs font-medium text-fg-muted">File</span>
          <input
            type="file"
            name="materialFile"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm text-fg-muted file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:text-fg"
          />
          {err.file ? <FieldError>{err.file}</FieldError> : null}
        </label>
      ) : source === "drive" ? (
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-xs font-medium text-fg-muted">Google Drive link or file ID</span>
          <input
            name="materialDriveUrl"
            value={driveUrl}
            onChange={(e) => setDriveUrl(e.target.value)}
            className={inputCls}
            placeholder="drive.google.com/file/d/…"
          />
          {err.driveUrl ? <FieldError>{err.driveUrl}</FieldError> : null}
        </label>
      ) : (
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-xs font-medium text-fg-muted">External URL</span>
          <input
            name="materialExternalUrl"
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
            className={inputCls}
            placeholder="https://…"
          />
          {err.externalUrl ? <FieldError>{err.externalUrl}</FieldError> : null}
        </label>
      )}

      <label className="flex cursor-pointer items-center gap-2 sm:col-span-2">
        <Checkbox
          checked={downloadEnabled}
          onChange={() => setDownloadEnabled((v) => !v)}
          ariaLabel="Allow students to download this material"
        />
        <span className="text-sm text-fg-muted">Allow students to download this material</span>
      </label>
    </FormShell>
  );
}

function FormShell({
  children,
  onDone,
  onSubmit,
  pending,
  label,
}: {
  children: React.ReactNode;
  onDone: () => void;
  onSubmit: () => void;
  pending: boolean;
  label: string;
}) {
  return (
    <div className="border-y border-hairline py-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={onSubmit}
          disabled={pending}
          className="min-h-11 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Saving…" : label}
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

function FieldError({ children }: { children: React.ReactNode }) {
  return <span className="text-xs text-[color:var(--color-danger)]">{children}</span>;
}
