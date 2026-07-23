"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateVideoItem } from "@/actions/items";
import { updateMaterialItem } from "@/actions/materials";
import { useToast } from "@/components/admin/toast";
import { EditActions, Modal, editInputCls } from "@/components/admin/modal";
import { Checkbox } from "@/components/admin/checkbox";
import type { ModuleItem } from "@/lib/admin-courses";

// Edit a content item (M6 CRUD): title/description/status for both; a Drive
// replacement for videos; download toggle for materials. Reuses the M2-S3/S4
// update actions. `compact` renders a small row-action button.

export function ItemEditForm({ item, compact = false }: { item: ModuleItem; compact?: boolean }) {
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
          <Fields item={item} onDone={() => setOpen(false)} />
        </Modal>
      ) : null}
    </>
  );
}

function Fields({ item, onDone }: { item: ModuleItem; onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? "");
  const [status, setStatus] = useState(item.status);
  const [driveUrl, setDriveUrl] = useState(""); // blank = keep current
  const [downloadEnabled, setDownloadEnabled] = useState(item.downloadEnabled);
  const [err, setErr] = useState<Record<string, string>>({});

  const submit = () => {
    setErr({});
    start(async () => {
      const r =
        item.type === "video"
          ? await updateVideoItem({
              id: item.id,
              title,
              description: description || null,
              status,
              ...(driveUrl.trim() ? { driveUrl } : {}),
            })
          : await updateMaterialItem({
              id: item.id,
              title,
              description: description || null,
              status,
              downloadEnabled,
            });
      if (r.ok) {
        toast.success("Item updated.");
        onDone();
        router.refresh();
      } else {
        if (r.error.fields) setErr(r.error.fields);
        toast.error(r.error.message || "Could not update the item.");
      }
    });
  };

  return (
    <>
      <h2 className="font-display text-lg font-semibold tracking-tight text-fg">
        Edit {item.type === "video" ? "video" : "material"}
      </h2>
      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Title</span>
          <input
            name="itemTitle"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={editInputCls}
          />
          {err.title ? (
            <span className="text-xs text-[color:var(--color-danger)]">{err.title}</span>
          ) : null}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Description</span>
          <input
            name="itemDescription"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={editInputCls}
            placeholder="optional"
          />
        </label>

        {item.type === "video" ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-fg-muted">Replace Drive link (optional)</span>
            <input
              name="itemDriveUrl"
              value={driveUrl}
              onChange={(e) => setDriveUrl(e.target.value)}
              className={editInputCls}
              placeholder="leave blank to keep the current video"
            />
            {err.driveUrl ? (
              <span className="text-xs text-[color:var(--color-danger)]">{err.driveUrl}</span>
            ) : null}
          </label>
        ) : (
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={downloadEnabled}
              onChange={() => setDownloadEnabled((v) => !v)}
              ariaLabel="Allow students to download this material"
            />
            <span className="text-sm text-fg-muted">Allow students to download this material</span>
          </label>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Status</span>
          <div className="inline-flex w-fit items-center gap-0.5 rounded-md bg-surface-2 p-0.5">
            {(["active", "inactive"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={status === s}
                onClick={() => setStatus(s)}
                className={`rounded-[7px] px-3 py-1.5 text-[13px] font-medium capitalize transition-colors ${
                  status === s
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
