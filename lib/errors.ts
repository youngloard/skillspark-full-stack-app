import type { ErrorCode } from "@/lib/api-response";
import { Prisma } from "@/lib/generated/prisma/client";

/**
 * Typed domain failure carrying a response-envelope code. Domain functions in
 * lib/ throw these instead of returning envelopes; the action runner
 * (lib/action-runner.ts) maps them at the boundary (docs/CONVENTIONS.md).
 */
export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly fields?: Record<string, string>;

  constructor(code: ErrorCode, message: string, fields?: Record<string, string>) {
    super(message);
    this.code = code;
    this.fields = fields;
  }
}

/** P2002 — a unique constraint rejected the write. */
export function isUniqueViolation(cause: unknown): boolean {
  return cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002";
}

/** P2003 — a foreign key pointed at a row that doesn't exist. */
export function isFkViolation(cause: unknown): boolean {
  return cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2003";
}
