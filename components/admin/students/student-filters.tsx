"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { searchBatchesAction, searchCoursesAction } from "@/actions/admin-search";
import { MultiCombobox, type MultiItem } from "@/components/admin/multi-combobox";

// Roster course → batch filter (M6). Both are multi-select searchable choosers
// writing comma-separated ids to the URL (?course, ?batch), so the view stays
// shareable and the server does the filtering. The batch search is scoped to
// the chosen courses, so the pair cascades.

export function StudentFilters({
  courses,
  batches,
}: {
  courses: MultiItem[];
  batches: MultiItem[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParams = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    params.delete("page"); // any filter change → back to page 1
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // A stable primitive key for the selected courses — the batch search closes
  // over it so the cascade re-runs when the course selection actually changes.
  const courseKey = courses.map((c) => c.id).join(",");

  const searchCourses = useCallback(async (query: string): Promise<MultiItem[]> => {
    const hits = await searchCoursesAction(query);
    return hits.map((c) => ({ id: c.id, label: c.name }));
  }, []);

  const searchBatches = useCallback(
    async (query: string): Promise<MultiItem[]> => {
      const ids = courseKey ? courseKey.split(",") : undefined;
      const hits = await searchBatchesAction(query, ids);
      return hits.map((b) => ({ id: b.id, label: b.batchName, sublabel: b.batchCode }));
    },
    [courseKey],
  );

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="w-full sm:w-48">
        <MultiCombobox
          label="Course filter"
          selected={courses}
          placeholder="Filter by course…"
          search={searchCourses}
          emptyHint="Search or browse courses"
          onChange={(next) =>
            // Clearing courses also clears batches — they'd no longer cascade.
            setParams({
              course: next.length ? next.map((c) => c.id).join(",") : null,
              ...(next.length === 0 ? { batch: null } : {}),
            })
          }
        />
      </div>
      <div className="w-full sm:w-48">
        <MultiCombobox
          label="Batch filter"
          selected={batches}
          placeholder="Filter by batch…"
          search={searchBatches}
          emptyHint="Search or browse batches"
          onChange={(next) =>
            setParams({ batch: next.length ? next.map((b) => b.id).join(",") : null })
          }
        />
      </div>
    </div>
  );
}
