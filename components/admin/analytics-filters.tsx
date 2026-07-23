"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { MONTH_NAMES } from "@/lib/admin-analytics-shared";

// The dashboard slicers (M6-S3): a year → month → day drill-down + course +
// batch (course→batch cascade), all URL-driven so the view is shareable and the
// print report reads the same params. Custom dropdowns — no native <select>.

type Option = { value: string; label: string };
type CourseOption = { id: string; name: string };
type BatchOption = { id: string; name: string };

export function AnalyticsFilters({
  courses,
  batches,
  year,
  month,
  day,
  courseId,
  batchId,
  availableYears,
}: {
  courses: CourseOption[];
  batches: BatchOption[];
  year: number | "all";
  month: number | null;
  day: number | null;
  courseId: string | null;
  batchId: string | null;
  /** Years with data, newest first (see getAnalyticsYears). */
  availableYears: number[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function apply(mut: (p: URLSearchParams) => void) {
    const p = new URLSearchParams(searchParams.toString());
    mut(p);
    router.push(`${pathname}?${p.toString()}`, { scroll: false });
  }

  // Only years the data actually covers — an empty year in the list is a dead
  // end for the admin.
  const yearOptions: Option[] = [
    { value: "all", label: "All time" },
    ...availableYears.map((y) => ({ value: String(y), label: String(y) })),
  ];
  const monthOptions: Option[] = [
    { value: "", label: "Whole year" },
    ...MONTH_NAMES.map((m, i) => ({ value: String(i + 1), label: m })),
  ];
  const dayCount = year !== "all" && month ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 31;
  const dayOptions: Option[] = [
    { value: "", label: "Whole month" },
    ...Array.from({ length: dayCount }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
  ];
  const courseOptions: Option[] = [
    { value: "all", label: "All courses" },
    ...courses.map((c) => ({ value: c.id, label: c.name })),
  ];
  const batchOptions: Option[] = [
    { value: "all", label: courseId ? "All batches in course" : "All batches" },
    ...batches.map((b) => ({ value: b.id, label: b.name })),
  ];

  return (
    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
      {/* Date drill-down */}
      <Dropdown
        label="Year"
        value={year === "all" ? "all" : String(year)}
        options={yearOptions}
        onChange={(v) =>
          apply((p) => {
            if (v === "all") p.set("year", "all");
            else p.set("year", v);
            p.delete("month");
            p.delete("day");
          })
        }
      />
      {year !== "all" && (
        <Dropdown
          label="Month"
          value={month ? String(month) : ""}
          options={monthOptions}
          onChange={(v) =>
            apply((p) => {
              if (v) p.set("month", v);
              else p.delete("month");
              p.delete("day");
            })
          }
        />
      )}
      {year !== "all" && month && (
        <Dropdown
          label="Day"
          value={day ? String(day) : ""}
          options={dayOptions}
          onChange={(v) =>
            apply((p) => {
              if (v) p.set("day", v);
              else p.delete("day");
            })
          }
        />
      )}

      <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden="true" />

      {/* Course → batch cascade */}
      <Dropdown
        label="Course"
        value={courseId ?? "all"}
        options={courseOptions}
        onChange={(v) =>
          apply((p) => {
            if (v === "all") p.delete("course");
            else p.set("course", v);
            p.delete("batch"); // batch list depends on the course
          })
        }
      />
      <Dropdown
        label="Batch"
        value={batchId ?? "all"}
        options={batchOptions}
        onChange={(v) =>
          apply((p) => {
            if (v === "all") p.delete("batch");
            else p.set("batch", v);
          })
        }
      />
    </div>
  );
}

function Dropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = options.find((o) => o.value === value) ?? options[0];

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-md bg-surface-2 px-3 py-1.5 text-[13px] font-medium text-fg transition-colors hover:bg-surface-2/70 sm:min-h-0 sm:w-auto sm:justify-start"
      >
        <span className="max-w-[170px] truncate">{active?.label}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="m6 9 6 6 6-6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open ? (
        <div
          role="listbox"
          className="absolute left-0 z-40 mt-1.5 max-h-72 w-max min-w-full max-w-[min(28rem,calc(100vw-2.5rem))] space-y-0.5 overflow-auto rounded-lg border border-line bg-surface p-1.5 shadow-[0_16px_40px_-16px_rgba(2,20,20,0.4)]"
        >
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <button
                key={o.value || "_"}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-[13px] transition-colors",
                  selected
                    ? "bg-surface-2 text-fg"
                    : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                <span className="truncate">{o.label}</span>
                {selected ? (
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                    className="shrink-0 text-accent"
                  >
                    <path
                      d="m5 12 5 5 9-9"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
