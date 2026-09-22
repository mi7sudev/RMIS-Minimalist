// ============================================================================
// RMIS — API helpers (spec §6 conventions): response envelope, error handling,
// client IP. Every route handler is wrapped in handleApi().
//   - ok(data, status)    → payload JSON directly (200/201)
//   - err(message, status, details?) → { error, details? }
//   - ApiError            → carries its message + status through handleApi
//   - unexpected throws   → generic 500 (never leak internals)
// ============================================================================

import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status = 400, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data as Record<string, unknown>, { status });
}

export function err(message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    details === undefined ? { error: message } : { error: message, details },
    { status }
  );
}

export type ApiCtx = { params: Promise<Record<string, string>> };

export function handleApi<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) {
        return err(e.message, e.status, e.details);
      }
      if (e instanceof ZodError) {
        return err("Validation failed", 400, e.flatten());
      }
      console.error("[API ERROR]", e);
      return err("An unexpected error occurred. Please try again.", 500);
    }
  };
}

/**
 * Client IP for audit/rate-limiting. Uses the FIRST X-Forwarded-For entry.
 * (The staff intranet tier uses the LAST entry — spoof-resistant — in auth.ts.)
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}
