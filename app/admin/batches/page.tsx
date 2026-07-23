import { requireAdmin } from "@/lib/authorization";
import { listBatches } from "@/lib/admin-batches";
import { db } from "@/lib/db";
import { BatchesToolbar } from "@/components/admin/batches/batches-toolbar";
import { BatchesTable } from "@/components/admin/batches/batches-table";
import { Pagination } from "@/components/admin/pagination";

// Batches section (M6-S4): searchable, page-paginated batch roster with inline
// quick-add. Each row opens the batch detail (courses / exams / students).

export default async function BatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const q = sp.q ?? "";
  const requestedPage = Number.parseInt(sp.page ?? "1", 10) || 1;
  // Active exams feed the bulk "grant exam" picker — a short list, so it ships
  // with the page instead of costing a round trip when the dialog opens.
  const [{ items, total, page, pageCount }, exams] = await Promise.all([
    listBatches({ q, page: requestedPage }),
    db.exam.findMany({
      where: { status: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const pageHref = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (n > 1) p.set("page", String(n));
    return `/admin/batches${p.toString() ? `?${p}` : ""}`;
  };

  return (
    <div className="w-full px-5 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">Admin console</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-fg">Batches</h1>
      </header>

      <BatchesToolbar initialQuery={q} />

      {items.length === 0 ? (
        <p className="mt-10 text-sm text-fg-muted">
          {q ? `No batches match “${q}”.` : "No batches yet — add your first above."}
        </p>
      ) : (
        <BatchesTable items={items} exams={exams} />
      )}

      {items.length > 0 ? (
        <Pagination
          page={page}
          pageCount={pageCount}
          total={total}
          unit="batches"
          makeHref={pageHref}
        />
      ) : null}
    </div>
  );
}
