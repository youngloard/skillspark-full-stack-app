import { NextResponse } from "next/server";
import { ok } from "@/lib/api-response";

// Liveness probe: process is up. Readiness (DB reachability) arrives in M0-S2.
export function GET() {
  return NextResponse.json(ok({ status: "live" }));
}
