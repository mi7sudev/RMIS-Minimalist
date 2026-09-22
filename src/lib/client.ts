// ============================================================================
// RMIS — client data layer: fetch wrapper (spec §13 client contracts) +
// formatters. Client-side only.
// ============================================================================

export class ApiClientError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; formData?: FormData } = {}
): Promise<T> {
  let res: Response;
  try {
    const headers: Record<string, string> = {};
    let body: BodyInit | undefined;
    if (opts.formData) {
      body = opts.formData;
    } else if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    res = await fetch(path, {
      method: opts.method || (body ? "POST" : "GET"),
      headers,
      body,
      credentials: "include",
    });
  } catch {
    throw new ApiClientError("Unable to connect to the server. Please check your connection.", 0);
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const payload = (data ?? {}) as { error?: string; details?: unknown };
    const message =
      payload.error ||
      (res.status === 401 && "Please sign in to continue") ||
      (res.status === 403 && "You do not have permission to perform this action") ||
      (res.status === 404 && "Not found") ||
      (res.status >= 500 && "An unexpected error occurred. Please try again.") ||
      "Request failed";
    throw new ApiClientError(message, res.status, payload.details);
  }
  return data as T;
}

// ── Formatters (en-PH) ──────────────────────────────────────────────────────

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return typeof d === "string" ? d : "—";
  return date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return typeof d === "string" ? d : "—";
  return date.toLocaleString("en-PH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(n);
}

export function fullName(p: { firstName?: string | null; middleName?: string | null; lastName?: string | null; extensionName?: string | null } | null | undefined): string {
  if (!p) return "—";
  const parts = [p.firstName, p.middleName, p.lastName].filter(Boolean);
  let name = parts.join(" ");
  if (p.extensionName) name = `${name}, ${p.extensionName}`;
  return name || "—";
}

export function humanize(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\s+/g, " ").trim();
}

export function timeAgo(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}

export function daysUntil(d: string | Date | null | undefined): number | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const target = new Date(date); target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - start.getTime()) / 86400000);
}

export function deadlineState(d: string | Date | null | undefined): { label: string; overdue: boolean; closingSoon: boolean } {
  const days = daysUntil(d);
  if (days === null) return { label: "Open until filled", overdue: false, closingSoon: false };
  if (days < 0) return { label: "Closed", overdue: true, closingSoon: false };
  if (days === 0) return { label: "Closing today", overdue: false, closingSoon: true };
  if (days <= 7) return { label: `Closing in ${days} day${days === 1 ? "" : "s"}`, overdue: false, closingSoon: true };
  if (days <= 30) return { label: `${days} days left`, overdue: false, closingSoon: false };
  return { label: "Open", overdue: false, closingSoon: false };
}
