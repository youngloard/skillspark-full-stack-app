"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { useIsClient } from "@/lib/use-is-client";
import { lockBodyScroll } from "@/lib/scroll-lock";

// Promise-based confirmation (M6-S1): `const ok = await confirm("Delete X?")`.
// Replaces window.confirm with a styled, keyboard-accessible modal — Escape
// cancels, initial focus lands on Cancel so Enter can't destroy anything.
// DESIGN.md §10: reserve this for genuinely destructive, irreversible actions;
// prefer undo elsewhere. Mounted once in the shell.

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" paints the confirm button red — the default, since this is for deletes. */
  tone?: "danger" | "default";
};

type ConfirmFn = (opts: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** @public — consumed by admin pages/client components from M6-S3 onward. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within a <ConfirmProvider>");
  return ctx;
}

type PendingConfirm = { opts: ConfirmOptions; resolve: (ok: boolean) => void };

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const mounted = useIsClient();
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFn>((input) => {
    const opts = typeof input === "string" ? { message: input } : input;
    return new Promise<boolean>((resolve) => {
      setPending((prev) => {
        prev?.resolve(false); // an already-open dialog counts as cancelled
        return { opts, resolve };
      });
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    setPending((prev) => {
      prev?.resolve(ok);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!pending) return;
    cancelRef.current?.focus();
    const unlock = lockBodyScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        settle(false);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      unlock();
      document.removeEventListener("keydown", onKey, true);
    };
  }, [pending, settle]);

  const tone = pending?.opts.tone ?? "danger";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {mounted &&
        pending &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] grid place-items-end bg-black/45 backdrop-blur-[2px] sm:place-items-center sm:p-4"
            role="alertdialog"
            aria-modal="true"
            aria-label={pending.opts.title ?? "Confirm action"}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) settle(false);
            }}
          >
            <div
              className={cn(
                "w-full max-w-md rounded-t-xl border border-line bg-surface p-5 sm:rounded-xl sm:p-6",
                "shadow-[0_24px_64px_-24px_rgba(2,20,20,0.6)]",
                "motion-safe:animate-[confirm-in_180ms_var(--ease-out-standard)]",
              )}
            >
              <div className="flex items-start gap-4">
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg"
                  style={{
                    color: tone === "danger" ? "var(--color-danger)" : "var(--color-warning)",
                    background:
                      tone === "danger"
                        ? "color-mix(in oklab, var(--color-danger) 12%, transparent)"
                        : "color-mix(in oklab, var(--color-warning) 12%, transparent)",
                  }}
                  aria-hidden="true"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3l-7.9-13.6a2 2 0 0 0-3.4 0Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M12 9v4"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                    />
                    <circle cx="12" cy="16.4" r="1.05" fill="currentColor" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-lg font-semibold tracking-tight text-fg">
                    {pending.opts.title ?? "Are you sure?"}
                  </h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
                    {pending.opts.message}
                  </p>
                </div>
              </div>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  ref={cancelRef}
                  type="button"
                  onClick={() => settle(false)}
                  className="min-h-11 w-full rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg sm:w-auto"
                >
                  {pending.opts.cancelLabel ?? "Cancel"}
                </button>
                <button
                  type="button"
                  onClick={() => settle(true)}
                  className="min-h-11 w-full rounded-md px-4 py-2 text-sm font-semibold text-white transition-colors sm:w-auto"
                  style={{
                    background: tone === "danger" ? "var(--color-danger)" : "var(--accent)",
                  }}
                >
                  {pending.opts.confirmLabel ?? (tone === "danger" ? "Delete" : "Confirm")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </ConfirmContext.Provider>
  );
}
