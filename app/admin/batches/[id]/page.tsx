import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteBatch } from "@/actions/batches";
import { requireAdmin } from "@/lib/authorization";
import { db } from "@/lib/db";
import { getBatchDetail } from "@/lib/admin-batches";
import { AsyncButton } from "@/components/admin/async-button";
import { BatchAssignments } from "@/components/admin/batches/batch-assignments";
import { BatchEditForm } from "@/components/admin/batches/batch-edit-form";

// Batch detail (M6-S4) — assign/remove courses, exams, and students, plus
// delete the batch. Backed by the M3-S1 assignment actions.

export default async function BatchDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ spage?: string; sq?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { spage, sq } = await searchParams;
  const studentPage = Number.parseInt(spage ?? "1", 10);
  const studentQuery = sq?.trim() || undefined;
  const [detail, allExams] = await Promise.all([
    getBatchDetail(id, {
      studentPage: Number.isNaN(studentPage) ? 1 : studentPage,
      studentQuery,
    }),
    db.exam.findMany({
      where: { status: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!detail) notFound();

  return (
    <div className="w-full px-5 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/admin/batches"
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
            Batches
          </Link>
          <h1 className="mt-2 break-words font-display text-3xl font-semibold tracking-tight text-fg sm:truncate">
            {detail.batch.batchName}
          </h1>
          <p className="tabular mt-1 text-sm text-fg-muted">{detail.batch.batchCode}</p>
          {detail.batch.description ? (
            <p className="mt-2 max-w-2xl text-sm text-fg-muted">{detail.batch.description}</p>
          ) : null}
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center [&>*]:w-full sm:[&>*]:w-auto">
          <BatchEditForm
            id={id}
            batchCode={detail.batch.batchCode}
            batchName={detail.batch.batchName}
            description={detail.batch.description}
          />
          <AsyncButton
            action={deleteBatch.bind(null, { id })}
            successMessage="Batch deleted."
            confirm={`Delete ${detail.batch.batchName}? Students keep their accounts, but lose access granted through this batch.`}
            redirectTo="/admin/batches"
            variant="danger"
          >
            Delete batch
          </AsyncButton>
        </div>
      </header>

      <BatchAssignments
        batchId={id}
        courses={detail.courses}
        exams={detail.exams}
        students={detail.students}
        studentCount={detail.studentCount}
        studentPage={detail.studentPage}
        studentPageCount={detail.studentPageCount}
        studentQuery={studentQuery ?? ""}
        allExams={allExams}
      />
    </div>
  );
}
