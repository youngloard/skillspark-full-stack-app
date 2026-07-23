"use client";

import { PrevNextNav } from "./prev-next";
import { WatchProgressProvider, type ItemProgress } from "./progress-context";
import { WatchSidebar, type SidebarTree } from "./watch-sidebar";

// The persistent watch shell (M4-S3): the progress store + the two-column
// layout (swappable main content on the left, persistent sidebar on the
// right). It lives in the route LAYOUT, so navigating between lessons swaps
// only {children} — the sidebar and its live progress stay mounted.

export function WatchShell({
  tree,
  initialProgress,
  durations,
  children,
}: {
  tree: SidebarTree;
  initialProgress: Record<string, ItemProgress>;
  durations: Record<string, number | null>;
  children: React.ReactNode;
}) {
  return (
    <WatchProgressProvider initial={initialProgress} durations={durations}>
      <div className="mt-5 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
        <div className="min-w-0">
          {children}
          <PrevNextNav courseId={tree.courseId} modules={tree.modules} flatItems={tree.flatItems} />
        </div>
        {/* Sticky on desktop with a capped height, so a long lesson list
            scrolls inside the sidebar instead of stretching the whole page.
            The topbar is 64px; stick just below it. */}
        <aside className="min-w-0 lg:sticky lg:top-20 lg:h-[calc(100svh-6rem)] lg:self-start">
          <WatchSidebar tree={tree} />
        </aside>
      </div>
    </WatchProgressProvider>
  );
}
