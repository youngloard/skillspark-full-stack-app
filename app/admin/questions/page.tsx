import { requireAdmin } from "@/lib/authorization";
import { db } from "@/lib/db";
import { listQuestions } from "@/lib/questions";
import { QuestionsManager } from "@/components/admin/questions/questions-manager";

// Questions admin (M6-S7): pick an exam, filter by level, search prompts, and
// add / edit / delete questions (the accounting answer-row matrix). Bulk delete
// of selected rows is admin-level; whole-level / everything is superadmin-gated
// (enforced in the action). Keyset-paginated via the questions lib.

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ exam?: string }>;
}) {
  const { isSuperAdmin } = await requireAdmin();
  const sp = await searchParams;

  const exams = await db.exam.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, levels: true },
  });

  if (exams.length === 0) {
    return (
      <div className="w-full px-5 py-8 sm:px-6 lg:px-8">
        <header className="mb-6">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">
            Admin console
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-fg">
            Questions
          </h1>
        </header>
        <p className="mt-10 text-sm text-fg-muted">
          No exams exist yet. Exams are created by importing a JET workbook; once an exam exists its
          questions appear here.
        </p>
      </div>
    );
  }

  const selected = exams.find((e) => e.id === sp.exam) ?? exams[0];
  const levels = Array.isArray(selected.levels) ? (selected.levels as string[]) : [];
  const first = await listQuestions({ examId: selected.id, limit: 20 });

  return (
    <div className="w-full px-5 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">Admin console</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-fg">
          Questions
        </h1>
      </header>

      <QuestionsManager
        exams={exams.map((e) => ({
          id: e.id,
          name: e.name,
          levels: Array.isArray(e.levels) ? (e.levels as string[]) : [],
        }))}
        initialExamId={selected.id}
        initialLevels={levels}
        initialItems={first.items}
        initialCursor={first.nextCursor}
        initialTotal={first.total}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
}
