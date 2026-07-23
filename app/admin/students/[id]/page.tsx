import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteStudent, updateStudent } from "@/actions/students";
import { requireAdmin } from "@/lib/authorization";
import { getStudentReport } from "@/lib/admin-students";
import { AsyncButton } from "@/components/admin/async-button";
import { StudentEditForm } from "@/components/admin/students/student-edit-form";
import { StudentReportTabs } from "@/components/admin/students/student-report-tabs";

// Student profile (M6-S3) — the home for per-student analytics. Profile facts +
// KPIs + charts + exam ledger (shared with the PDF), plus block/unblock and a
// Download-PDF of the student's report.

export default async function StudentProfile({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const report = await getStudentReport(id);
  if (!report) notFound();

  const { student } = report;
  const isActive = student.status === "active";
  const nextStatus = isActive ? "blocked" : "active";

  return (
    <div className="w-full px-5 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/admin/students"
            className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="m15 6-6 6 6 6"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Students
          </Link>
          <h1 className="mt-2 break-words font-display text-3xl font-semibold tracking-tight text-fg sm:truncate">
            {student.name}
          </h1>
          <p className="mt-1 break-all text-sm text-fg-muted">{student.email}</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center [&>*]:w-full sm:[&>*]:w-auto">
          <a
            href={`/print/student/${student.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Download PDF
          </a>
          <AsyncButton
            action={updateStudent.bind(null, { id: student.id, status: nextStatus })}
            successMessage={isActive ? "Student blocked." : "Student reactivated."}
            confirm={
              isActive
                ? `Block ${student.name}? They won't be able to sign in until reactivated.`
                : undefined
            }
            variant={isActive ? "danger" : "secondary"}
          >
            {isActive ? "Block" : "Reactivate"}
          </AsyncButton>
          <StudentEditForm
            id={student.id}
            name={student.name}
            email={student.email}
            studentCode={student.studentCode}
            status={student.status}
            accessStartDate={student.accessStartDate}
            accessEndDate={student.accessEndDate}
          />
          <AsyncButton
            action={deleteStudent.bind(null, { id: student.id })}
            successMessage="Student deleted."
            confirm={`Permanently delete ${student.name}? Their account, progress, and attempts are removed. This can't be undone.`}
            redirectTo="/admin/students"
            variant="danger"
          >
            Delete
          </AsyncButton>
        </div>
      </header>

      <StudentReportTabs report={report} />
    </div>
  );
}
