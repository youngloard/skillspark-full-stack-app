# SkillSpark production image — Next.js 16 standalone output on Node 22.
#
# Prisma 7 here uses the pg DRIVER ADAPTER (lib/db.ts), so there is NO native
# query-engine binary to ship — the runtime is pure JS/Wasm. That keeps the
# runner tiny and lets us stay on alpine without engine/openssl gymnastics.
#
# The generated client (lib/generated/prisma) is gitignored, so it MUST be
# generated inside the build (`prisma generate`) before `next build`.
#
# Stages:
#   deps    — install all deps (build needs prisma/tailwind/tsc/tsx too)
#   builder — generate client + build; also the image used to run migrations
#   runner  — minimal standalone server, non-root
#
# Migrations are NOT run at container start (a single release step owns them —
# see docs/DEPLOY.md). Build the `builder` target and run
# `npx prisma migrate deploy` from it, or use your platform's release command.

# ---------- base ----------
FROM node:22-alpine AS base
# libc6-compat: Next's SWC binaries expect glibc symbols on alpine.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ---------- deps ----------
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# ---------- builder ----------
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Placeholder env so any accidental env() evaluation during `next build`
# validates. These are build-time only — never present in the runner image,
# and overridden by real values at runtime.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    DIRECT_URL="postgresql://build:build@localhost:5432/build" \
    AUTH_SECRET="build-time-placeholder-secret-value-0000000000" \
    AUTH_GOOGLE_ID="build.apps.googleusercontent.com" \
    AUTH_GOOGLE_SECRET="build" \
    NODE_ENV="production"
RUN npx prisma generate
RUN npm run build

# ---------- runner ----------
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME="0.0.0.0"

# Run as a non-root user.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Standalone bundle carries its own minimal, traced node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
