"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { useIsClient } from "@/lib/use-is-client";

// Non-blocking confirmations for admin CRUD (M6-S1). Ported behaviour from the
// reference admin app; restyled to SkillSpark tokens. Mounted once in the shell
// so every admin page + client child can fire a toast. Success reads fast;
// errors linger (they carry a reason the admin must read). Semantic colour is
// icon+label, outside the brand teal (DESIGN.md §5).

type Tone = "success" | "error";
type ToastItem = { id: number; message: string; tone: Tone; leaving?: boolean };

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/** @public — consumed by admin pages/client components from M6-S3 onward. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a <ToastProvider>");
  return ctx;
}

const DISMISS_MS: Record<Tone, number> = { success: 2800, error: 6000 };
const EXIT_MS = 160; // must match the leaving transition duration below
const MAX_VISIBLE = 4;

function ToastIcon({ tone }: { tone: Tone }) {
  return tone === "success" ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="m8.5 12 2.5 2.5 4.5-5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.5v5.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <circle cx="12" cy="16.3" r="1.05" fill="currentColor" />
    </svg>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const mounted = useIsClient();
  const idRef = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // Clear any pending timers on unmount (no setState in the body — the mount
  // gate is handled by useIsClient).
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  const clearTimer = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  // Two-phase removal: mark leaving so the exit transition plays, then drop.
  const remove = useCallback(
    (id: number) => {
      clearTimer(id);
      setItems((xs) => xs.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      timers.current.set(
        id,
        setTimeout(() => {
          timers.current.delete(id);
          setItems((xs) => xs.filter((t) => t.id !== id));
        }, EXIT_MS),
      );
    },
    [clearTimer],
  );

  const push = useCallback(
    (message: string, tone: Tone) => {
      setItems((xs) => {
        // Dedupe an identical visible toast — repeat actions just refresh its timer.
        const dup = xs.find((t) => !t.leaving && t.message === message && t.tone === tone);
        if (dup) {
          clearTimer(dup.id);
          timers.current.set(
            dup.id,
            setTimeout(() => remove(dup.id), DISMISS_MS[tone]),
          );
          return xs;
        }
        const id = (idRef.current += 1);
        timers.current.set(
          id,
          setTimeout(() => remove(id), DISMISS_MS[tone]),
        );

        const next = [...xs, { id, message, tone }];
        const alive = next.filter((t) => !t.leaving);
        if (alive.length > MAX_VISIBLE) {
          const oldest = alive[0];
          clearTimer(oldest.id);
          timers.current.set(
            oldest.id,
            setTimeout(() => {
              timers.current.delete(oldest.id);
              setItems((ys) => ys.filter((t) => t.id !== oldest.id));
            }, EXIT_MS),
          );
          return next.map((t) => (t.id === oldest.id ? { ...t, leaving: true } : t));
        }
        return next;
      });
    },
    [remove, clearTimer],
  );

  const api = useMemo<ToastApi>(
    () => ({ success: (m) => push(m, "success"), error: (m) => push(m, "error") }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted &&
        createPortal(
          <div
            className="pointer-events-none fixed bottom-0 right-0 z-[60] flex w-full max-w-sm flex-col gap-2 p-4 sm:p-5"
            role="region"
            aria-live="polite"
            aria-label="Notifications"
          >
            {items.map((t) => (
              <div
                key={t.id}
                role="status"
                data-leaving={t.leaving ? "true" : undefined}
                className={cn(
                  "pointer-events-auto flex items-start gap-3 rounded-lg border bg-surface px-4 py-3",
                  "shadow-[0_16px_40px_-16px_rgba(2,20,20,0.45)]",
                  "transition-[opacity,transform] duration-150 ease-[var(--ease-out-standard)]",
                  "data-[leaving=true]:translate-y-1 data-[leaving=true]:opacity-0",
                  "motion-safe:animate-[toast-in_180ms_var(--ease-out-standard)]",
                )}
                style={{ borderColor: "var(--line)" }}
              >
                <span
                  className="mt-px shrink-0"
                  style={{
                    color: t.tone === "success" ? "var(--color-success)" : "var(--color-danger)",
                  }}
                >
                  <ToastIcon tone={t.tone} />
                </span>
                <span className="min-w-0 flex-1 text-sm leading-snug text-fg">{t.message}</span>
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  aria-label="Dismiss notification"
                  className="-mr-1 -mt-0.5 shrink-0 rounded-md p-1 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M18 6 6 18M6 6l12 12"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}
