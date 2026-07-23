import { NextResponse } from "next/server";
import { ERROR_STATUS, err, ok } from "@/lib/api-response";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Readiness probe: the process can reach the database. Used by the reverse
// proxy / container healthcheck to gate traffic (M11-S4).
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json(ok({ status: "ready" }));
  } catch (cause) {
    logger.error("health.ready.db_unreachable", {
      message: cause instanceof Error ? cause.message : String(cause),
    });
    return NextResponse.json(err("PROVIDER_DOWN", "Database unreachable"), {
      status: ERROR_STATUS.PROVIDER_DOWN,
    });
  }
}
