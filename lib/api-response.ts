// Response envelope per docs/CONVENTIONS.md — every action and route handler
// returns one of these two shapes, never ad-hoc JSON.

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PROVIDER_DOWN"
  | "INTERNAL";

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiError = {
  ok: false;
  error: { code: ErrorCode; message: string; fields?: Record<string, string> };
};
export type ApiResult<T> = ApiSuccess<T> | ApiError;

export function ok<T>(data: T): ApiSuccess<T> {
  return { ok: true, data };
}

export function err(code: ErrorCode, message: string, fields?: Record<string, string>): ApiError {
  return { ok: false, error: { code, message, ...(fields ? { fields } : {}) } };
}

/** HTTP status that mirrors each error code (CONVENTIONS.md). */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PROVIDER_DOWN: 503,
  INTERNAL: 500,
};
