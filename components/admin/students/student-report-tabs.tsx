"use client";

import { useState } from "react";
import type { StudentReport } from "@/lib/admin-students";
import {
  CourseAnalytics,
  ExamAnalytics,
  ProfileFacts,
} from "@/components/admin/students/student-report-view";

// Profile-page analytics with a Course ⇄ Exam lens switch (M6), mirroring the
// dashboard's lens toggle. The PDF renders both lenses stacked instead.

type Lens = "course" | "exam";

export function StudentReportTabs({ report }: { report: StudentReport }) {
  const [lens, setLens] = useState<Lens>("course");

  return (
    <div className="flex flex-col gap-10">
      <ProfileFacts report={report} />
      <div className="border-t border-hairline" />

      <div className="grid w-full grid-cols-2 items-center gap-0.5 rounded-md bg-surface-2 p-0.5 sm:flex sm:w-auto sm:self-start">
        {(
          [
            { value: "course", label: "Course analytics" },
            { value: "exam", label: "Exam analytics" },
          ] as const
        ).map((t) => {
          const active = t.value === lens;
          return (
            <button
              key={t.value}
              type="button"
              aria-pressed={active}
              onClick={() => setLens(t.value)}
              className={`min-h-11 rounded-[7px] px-3.5 py-1.5 text-[13px] font-medium transition-colors sm:min-h-0 ${
                active
                  ? "bg-bg text-fg shadow-[0_1px_2px_rgba(2,20,20,0.12)]"
                  : "text-fg-muted hover:text-fg"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {lens === "course" ? <CourseAnalytics report={report} /> : <ExamAnalytics report={report} />}
    </div>
  );
}
