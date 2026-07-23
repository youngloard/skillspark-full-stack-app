// Called once per Next.js server instance (verified: bundled docs,
// app/api-reference/file-conventions/instrumentation). Starts the in-process
// job scheduler in the Node.js runtime only — never during build phases.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startJobScheduler } = await import("@/lib/job-scheduler");
  startJobScheduler();
}
