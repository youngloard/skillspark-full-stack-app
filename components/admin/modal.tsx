"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useIsClient } from "@/lib/use-is-client";
import { lockBodyScroll } from "@/lib/scroll-lock";

// Shared centered modal for admin edit dialogs (M6-S6 CRUD pass). Escape /
// backdrop close, scroll lock, SSR-safe portal.

export function Modal({
  onClose,
  children,
  size = "md",
}: {
  onClose: () => void;
  children: React.ReactNode;
  /** "lg" for dialogs holding a chooser — room for the panel, less cramped. */
  size?: "md" | "lg";
}) {
  const mounted = useIsClient();
  useEffect(() => {
    const unlock = lockBodyScroll();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      unlock();
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  if (!mounted) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/45 backdrop-blur-[2px] sm:p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`max-h-dvh min-h-dvh w-full overflow-y-auto bg-surface p-4 sm:min-h-0 sm:rounded-xl sm:border sm:border-line sm:p-6 sm:shadow-[0_24px_64px_-24px_rgba(2,20,20,0.6)] ${
          size === "lg" ? "max-w-lg" : "max-w-md"
        }`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

// Shared field styles for the edit dialogs.
export const editInputCls =
  "w-full rounded-md border border-line bg-surface px-3 py-2.5 text-base text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:py-2 sm:text-sm";

export function EditActions({
  onCancel,
  onSave,
  pending,
}: {
  onCancel: () => void;
  onSave: () => void;
  pending: boolean;
}) {
  return (
    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onCancel}
        className="min-h-11 w-full rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg sm:w-auto"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={pending}
        className="min-h-11 w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}
