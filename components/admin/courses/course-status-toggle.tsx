"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCourseStatus } from "@/actions/courses";
import { useToast } from "@/components/admin/toast";
import { cn } from "@/lib/cn";

// Optimistic course status toggle (M6-S5). Flips the pill immediately, calls
// setCourseStatus, and rolls back (via useOptimistic reverting on transition
// end) + toasts if the server disagrees.

export function CourseStatusToggle({
  id,
  status,
  size = "sm",
}: {
  id: string;
  status: string;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(status);
  const active = optimistic === "active";
  const next = active ? "inactive" : "active";

  const onToggle = () => {
    start(async () => {
      setOptimistic(next);
      const r = await setCourseStatus({ id, status: next });
      if (r.ok) {
        router.refresh();
      } else {
        toast.error(r.error.message || "Could not change the status.");
      }
    });
  };

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      aria-pressed={active}
      title={active ? "Set inactive" : "Set active"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium transition-colors disabled:opacity-70",
        size === "md" ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs",
      )}
      style={{
        color: active ? "var(--color-success)" : "var(--color-fg-subtle)",
        background: active
          ? "color-mix(in oklab, var(--color-success) 12%, transparent)"
          : "var(--surface-2)",
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: active ? "var(--color-success)" : "var(--color-fg-subtle)" }}
      />
      {active ? "Active" : "Inactive"}
    </button>
  );
}
