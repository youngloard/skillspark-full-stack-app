import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

// Network-boundary pre-filters (Next 16 proxy convention, nodejs runtime):
// 1. Rate-limit the auth endpoints (cheapest rejection first — trust boundary
//    order in ARCHITECTURE §3).
// 2. Bounce unauthenticated requests to app surfaces before rendering.
// Real authorization is always re-checked server-side in pages/actions
// (SECURITY_BASELINE: never trust this layer alone).

const PROTECTED_PREFIXES = ["/admin", "/print", "/dashboard", "/courses", "/watch", "/exams"];

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? "unknown";
}

function hasSessionCookie(request: NextRequest): boolean {
  return (
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token")
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Login attempts: POST signin/callback flows only — session reads stay free.
  if (
    request.method === "POST" &&
    (pathname.startsWith("/api/auth/signin") || pathname.startsWith("/api/auth/callback"))
  ) {
    const result = checkRateLimit("login", clientIp(request));
    if (!result.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "RATE_LIMITED", message: "Too many sign-in attempts. Try again later." },
        },
        { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
      );
    }
  }

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (isProtected && !hasSessionCookie(request)) {
    const login = new URL("/login", request.url);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/auth/:path*",
    "/admin/:path*",
    "/print/:path*",
    "/dashboard/:path*",
    "/courses/:path*",
    "/watch/:path*",
    "/exams/:path*",
  ],
};
