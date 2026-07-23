"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ApiResult } from "@/lib/api-response";
import { cn } from "@/lib/cn";
import { useConfirm } from "@/components/admin/confirm-dialog";
import { useToast } from "@/components/admin/toast";

// The action-firing button for fieldless admin operations (M6-S1): deletes,
// reorders, toggles, refreshes. Runs inside a transition so the action's own
// revalidatePath refreshes the server tree in place (no full reload — DESIGN.md
// §10 "optimistic UI + background revalidate"). Surfaces the ApiResult envelope
// as a toast instead of throwing to the error boundary. Reused by every later
// M6 slice; the visual variants keep those slices from re-styling buttons.

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary: "border border-line bg-surface text-fg-muted hover:bg-surface-2 hover:text-fg",
  ghost: "text-fg-muted hover:bg-surface-2 hover:text-fg",
  danger:
    "border border-line bg-surface text-fg-muted hover:border-transparent hover:bg-[color-mix(in_oklab,var(--color-danger)_12%,transparent)] hover:text-[var(--color-danger)]",
};

type Props<T> = {
  /** A server action returning the project envelope (@/lib/api-response). */
  action: () => Promise<ApiResult<T>>;
  /** Toast shown on success. Omit for silent success (e.g. reorders). */
  successMessage?: string;
  /** Confirmation the admin must accept before the action fires (destructive only). */
  confirm?: string | Parameters<ReturnType<typeof useConfirm>>[0];
  /** Client-side navigation after success (the toast survives — provider is in the layout). */
  redirectTo?: string;
  variant?: Variant;
  className?: string;
  title?: string;
  ariaLabel?: string;
  disabled?: boolean;
  children: React.ReactNode;
};

export function AsyncButton<T>({
  action,
  successMessage,
  confirm,
  redirectTo,
  variant = "secondary",
  className,
  title,
  ariaLabel,
  disabled,
  children,
}: Props<T>) {
  const toast = useToast();
  const confirmDialog = useConfirm();
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel}
      aria-busy={pending || undefined}
      disabled={disabled || pending}
      data-pending={pending ? "true" : undefined}
      className={cn(
        "relative inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold",
        "transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60",
        VARIANT[variant],
        className,
      )}
      onClick={async () => {
        if (confirm && !(await confirmDialog(confirm))) return;
        start(async () => {
          try {
            const r = await action();
            if (r.ok) {
              if (successMessage) toast.success(successMessage);
              if (redirectTo) router.push(redirectTo);
              else router.refresh();
            } else {
              toast.error(r.error.message || "Something went wrong.");
            }
          } catch {
            toast.error("Something went wrong. Please try again.");
          }
        });
      }}
    >
      <span className={cn("inline-flex items-center gap-2", pending && "opacity-0")}>
        {children}
      </span>
      {pending ? (
        <span className="absolute inset-0 grid place-items-center" aria-hidden="true">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            className="motion-safe:animate-spin"
          >
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke="currentColor"
              strokeOpacity="0.25"
              strokeWidth="2.4"
            />
            <path
              d="M21 12a9 9 0 0 0-9-9"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
        </span>
      ) : null}
    </button>
  );
}
