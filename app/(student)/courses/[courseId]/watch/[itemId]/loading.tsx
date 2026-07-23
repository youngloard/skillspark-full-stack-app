// Watch main-column skeleton (M4-S3). Mirrors the page's own top structure
// exactly (player → title → meta → description, no wrapper margin) so swapping
// a lesson doesn't shift the player. The layout's sidebar stays mounted.
export default function WatchLoading() {
  return (
    <div className="animate-pulse">
      <div className="aspect-video w-full rounded-lg bg-surface-2" />
      <div className="mt-6 h-8 w-2/3 max-w-lg rounded-md bg-surface-2" />
      <div className="mt-2.5 h-4 w-28 rounded bg-surface-2" />
      <div className="mt-4 h-4 w-full max-w-xl rounded bg-surface-2" />
      <div className="mt-2 h-4 w-4/5 max-w-md rounded bg-surface-2" />
    </div>
  );
}
