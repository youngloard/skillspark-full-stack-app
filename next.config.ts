import type { NextConfig } from "next";

// Security response headers (2026-07-23 review). These five are safe by
// construction — they restrict, never load, so they cannot break OAuth, video
// streaming, or the app's own srcdoc iframe.
//
// NOTE — Content-Security-Policy is deliberately NOT set here yet. A CSP is the
// single highest-value header, but a wrong one silently breaks things (the
// email-preview srcdoc iframe, Tailwind's inline styles, the Google sign-in
// redirect). It must be added report-only first, watched in the browser
// console against every surface, then enforced. Doing it blind is worse than
// not doing it. Tracked in NEXT_SESSION.md.
const securityHeaders = [
  // Force HTTPS for two years, subdomains included. Only takes effect over
  // HTTPS, so it's inert in local dev.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // No MIME sniffing — a text/plain response can't be run as a script.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // The app is never meant to be framed by another site (clickjacking guard).
  // Its own email preview uses a srcdoc iframe, which this does not affect.
  { key: "X-Frame-Options", value: "DENY" },
  // Don't leak full URLs (which can carry ids) to other origins.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Turn off powerful features the app doesn't use.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  // Minimal, self-contained production bundle for containerised deploys.
  output: "standalone",

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
