import "server-only";
import type { ZodError } from "zod";
import type { ApiError, ApiResult } from "@/lib/api-response";
import { err } from "@/lib/api-response";
import { AuthorizationError } from "@/lib/authorization";
import { DomainError } from "@/lib/errors";
import { Prisma } from "@/lib/generated/prisma/client";
import { logger } from "@/lib/logger";

/**
 * Uniform error → envelope mapping for server actions (docs/CONVENTIONS.md).
 * Actions stay thin — validate → gate → mutate → audit inside `fn` — and
 * anything thrown becomes the right envelope; internals never reach the
 * client, only the server log (keyed by `event`).
 */
export async function runAction<T>(
  event: string,
  fn: () => Promise<ApiResult<T>>,
): Promise<ApiResult<T>> {
  try {
    return await fn();
  } catch (cause) {
    if (cause instanceof AuthorizationError) return err(cause.code, cause.message);
    if (cause instanceof DomainError) return err(cause.code, cause.message, cause.fields);
    if (cause instanceof Prisma.PrismaClientKnownRequestError) {
      // Backstop for constraint violations a domain function didn't translate.
      if (cause.code === "P2002") return err("CONFLICT", "A record with this value already exists");
      if (cause.code === "P2003" || cause.code === "P2025") {
        return err("NOT_FOUND", "The record this refers to no longer exists");
      }
    }
    logger.error("action.failed", {
      event,
      message: cause instanceof Error ? cause.message : String(cause),
    });
    return err("INTERNAL", "Something went wrong — please try again");
  }
}

/** Zod issues → the VALIDATION envelope with per-field messages. */
export function invalidInput(error: ZodError): ApiError {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!(key in fields)) fields[key] = issue.message;
  }
  return err("VALIDATION", "Please fix the highlighted fields", fields);
}
