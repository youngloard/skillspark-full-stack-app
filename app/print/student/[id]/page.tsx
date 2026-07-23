import { notFound } from "next/navigation";
import { guardAdminAccess } from "@/lib/admin-guard";
import { getStudentReport } from "@/lib/admin-students";
import { PrintFrame } from "@/components/admin/print-frame";
import { StudentReportView } from "@/components/admin/students/student-report-view";

// Per-student PDF report (M6-S3). Top-level admin-guarded route, forced white,
// reuses the same StudentReportView as the profile page.

export default async function StudentReport({ params }: { params: Promise<{ id: string }> }) {
  await guardAdminAccess();
  const { id } = await params;
  const report = await getStudentReport(id);
  if (!report) notFound();

  const { student } = report;
  const generatedAt = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const subtitle = [student.studentCode, student.email, `Generated ${generatedAt}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <PrintFrame title={student.name} subtitle={subtitle}>
      <StudentReportView report={report} />
    </PrintFrame>
  );
}
