import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/authorization";
import { db } from "@/lib/db";

// Admin video preview (M6). Plays a content item through the authorized stream
// proxy (admins may preview any item; the Drive id is never exposed). Materials
// aren't previewed here — they're managed from the module/course page.

function fmtDuration(sec: number | null): string {
  if (!sec || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default async function AdminItemPreview({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  await requireAdmin();
  const { itemId } = await params;

  const item = await db.contentItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      type: true,
      title: true,
      description: true,
      status: true,
      duration: true,
      moduleId: true,
      courseId: true,
      module: { select: { courseId: true, title: true } },
    },
  });
  if (!item || item.type !== "video") notFound();

  const courseId = item.courseId ?? item.module?.courseId ?? null;
  const backHref = item.moduleId
    ? `/admin/courses/${courseId}/modules/${item.moduleId}`
    : courseId
      ? `/admin/courses/${courseId}`
      : "/admin/courses";

  return (
    <div className="w-full px-5 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <Link
          href={backHref}
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
          {item.module?.title ?? "Back"}
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-fg">
          {item.title}
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          Video · {fmtDuration(item.duration)}
          {item.status !== "active" ? " · inactive" : ""}
        </p>
      </header>

      <video
        controls
        preload="metadata"
        src={`/api/videos/${item.id}/stream`}
        className="aspect-video w-full max-w-3xl rounded-xl border border-line bg-black"
      />

      {item.description ? (
        <p className="mt-4 max-w-3xl text-sm text-fg-muted">{item.description}</p>
      ) : null}
    </div>
  );
}
