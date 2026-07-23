// Playback order for a course (M4-S3) — pure and client-safe, so the sidebar
// and the prev/next control derive the same sequence the layout does.

export type OrderedItem = { id: string; type: string };

/** Flattened video ids in playback order: modules (in order) then flat items. */
export function orderedVideoIds(
  modules: { items: OrderedItem[] }[],
  flatItems: OrderedItem[],
): string[] {
  return [...modules.flatMap((m) => m.items), ...flatItems]
    .filter((i) => i.type === "video")
    .map((i) => i.id);
}
