"use client";

// ============================================================================
// RMIS — Jobs board + in-flow detail (spec §7.1 items 2–4, §8.7 deadline
// rules, §13 polling cadence). LIST: sticky search rail, division facets,
// sort, 8-per-page pagination, expandable quick view with 6 QuickFacts.
// DETAIL (#/jobs?job=<id>): hero, MQR ledger, sections, vitals, sticky
// summary rail with Apply / applied-state / Cancel. 20s silent poll + focus
// refetch (silent = swap state only when the JSON changed).
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useApplyFlow } from "@/components/apply/apply-dialogs";
import { useSession } from "@/components/session-provider";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, deadlineState, formatCurrency, formatDate, humanize } from "@/lib/client";
import { divisionName } from "@/lib/constants";
import { navigate, useHashRoute } from "@/lib/router";
import type { JobWire } from "@/lib/router";

const PAGE_SIZE = 8;
type SortKey = "newest" | "deadline" | "salary";

// ── Helpers ─────────────────────────────────────────────────────────────────

function divisionShort(code: string | null | undefined): string {
  if (!code) return "—";
  return divisionName(code).split(" — ")[0] || code;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function sgLabel(grade: string | null | undefined, step: string | null | undefined): string {
  if (!grade) return "—";
  return step ? `SG${grade}/${step}` : `SG${grade}`;
}

function pageWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const lo = Math.max(2, current - 1);
  const hi = Math.min(total - 1, current + 1);
  if (lo > 2) out.push("…");
  for (let i = lo; i <= hi; i++) out.push(i);
  if (hi < total - 1) out.push("…");
  out.push(total);
  return out;
}

/** % of the application window elapsed between publish and deadline (0–100). */
function deadlineProgress(job: JobWire): number {
  const start = new Date(job.publishDate ?? job.publishedAt).getTime();
  const end = job.deadlineDate ? new Date(job.deadlineDate).getTime() : Number.NaN;
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return job.deadlineDate ? 100 : 0;
  const pct = ((Date.now() - start) / (end - start)) * 100;
  return Math.min(100, Math.max(0, pct));
}

function DeadlinePill({ job, className }: { job: JobWire; className?: string }) {
  const dl = deadlineState(job.deadlineDate);
  return (
    <span
      className={`status-pill num ${
        dl.overdue
          ? "status-bad"
          : dl.closingSoon
            ? "status-warn"
            : "status-neutral"
      } ${className ?? ""}`}
    >
      {dl.label}
    </span>
  );
}

function RichOrPlain({ html, text }: { html?: string | null; text?: string | null }) {
  if (html && html.trim()) {
    return (
      <div
        className="rich-text text-sm leading-relaxed text-stone"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  if (text && text.trim()) {
    return <p className="whitespace-pre-line text-sm leading-relaxed text-stone">{text}</p>;
  }
  return <p className="text-sm text-pebble">Not provided.</p>;
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-none bg-fog ${className ?? ""}`} />;
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="dlg-card p-8 text-center">
      <p className="font-display text-xl text-carbon">Something went wrong</p>
      <p className="mt-2 text-sm text-stone">{message}</p>
      <button onClick={onRetry} className="dlg-cta mt-5 min-h-[44px] px-7 text-sm">
        Try again
      </button>
    </div>
  );
}

// ── Quick view (6 QuickFacts + actions) ─────────────────────────────────────

function QuickView({
  job,
  onApply,
  onDetail,
}: {
  job: JobWire;
  onApply: (job: JobWire) => void;
  onDetail: (job: JobWire) => void;
}) {
  const pos = job.position;
  const dl = deadlineState(job.deadlineDate);
  const brief = job.briefDescription?.trim()
    ? job.briefDescription
    : job.briefDescriptionHtml
      ? stripHtml(job.briefDescriptionHtml)
      : "";
  const facts: [string, string][] = [
    ["Item No.", pos?.itemNumber || "—"],
    ["Vacancies", String(job.numberOfVacancy)],
    ["Salary Grade", sgLabel(pos?.salaryGrade, pos?.salaryStep)],
    ["Monthly Salary", pos?.salaryAmount != null ? formatCurrency(pos.salaryAmount) : "—"],
    ["Published", formatDate(job.publishDate ?? job.publishedAt)],
    ["Deadline", formatDate(job.deadlineDate)],
  ];
  return (
    <div className="mt-4 space-y-4 border-t border-border pt-4">
      {brief ? (
        <p className="line-clamp-4 text-sm leading-relaxed text-stone">{brief}</p>
      ) : (
        <p className="text-sm text-pebble">No brief description provided.</p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label} className="rounded-none bg-fog p-3">
            <p className="text-xs text-pebble">{label}</p>
            <p className="mt-0.5 truncate text-sm text-ink" title={value}>
              {value}
            </p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => onApply(job)}
          disabled={dl.overdue}
          className="dlg-cta min-h-[44px] px-6 text-sm disabled:pointer-events-none disabled:opacity-50"
        >
          Apply now
        </button>
        <button onClick={() => onDetail(job)} className="dlg-ghost min-h-[44px] px-6 text-sm">
          Read full description
        </button>
      </div>
    </div>
  );
}

// ── Board row card ──────────────────────────────────────────────────────────

function JobCard({
  job,
  expanded,
  onToggle,
  onApply,
  onDetail,
}: {
  job: JobWire;
  expanded: boolean;
  onToggle: (id: number) => void;
  onApply: (job: JobWire) => void;
  onDetail: (job: JobWire) => void;
}) {
  const pos = job.position;
  const salary = pos?.salaryAmount ?? null;
  const applied = (job.applications?.length ?? 0) > 0;
  const dl = deadlineState(job.deadlineDate);
  return (
    <article className="dlg-card p-4 transition-shadow duration-200 hover:shadow-dialog-subtle sm:p-6">
      <div className="flex items-start gap-4">
        {/* MIRDC monogram tile — anchors the card the way a company logo does
            on every top-ranked job-board design */}
        <span
          aria-hidden="true"
          className="hidden h-12 w-12 shrink-0 place-items-center rounded-none bg-fog font-display text-lg leading-none text-ink sm:grid"
        >
          M
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <DeadlinePill job={job} />
            {applied && (
              <span className="dlg-pill bg-ink px-3 py-1 text-xs font-medium text-white">
                Applied
              </span>
            )}
          </div>
          <h3 className="mt-2 font-display text-xl text-carbon">{humanize(job.title)}</h3>
          <p className="mt-1 text-sm text-stone">
            {pos?.placeOfAssignment || "—"} ·{" "}
            {job.positionType ? humanize(job.positionType) : "—"}
            {pos?.salaryGrade ? <span className="num"> · SG {pos.salaryGrade}</span> : null}
            <span className={dl.overdue ? "text-[var(--bad)]" : undefined}>
              {" "}
              ·{" "}
              {job.deadlineDate ? `Closes ${formatDate(job.deadlineDate)}` : "Open until filled"}
            </span>
          </p>
          <p className="num mt-1.5 text-[15px] font-medium text-ink">
            {salary != null ? formatCurrency(salary) : "Competitive"}
            {salary != null && <span className="font-normal text-stone">/mo</span>}
          </p>
        </div>
        <button
          onClick={() => onToggle(job.id)}
          aria-label={expanded ? "Collapse quick view" : "Expand quick view"}
          aria-expanded={expanded}
          className="dlg-ghost grid h-10 w-10 shrink-0 place-items-center text-ink"
        >
          {expanded ? (
            <Minus className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Plus className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
      {expanded && <QuickView job={job} onApply={onApply} onDetail={onDetail} />}
    </article>
  );
}

// ── Detail: summary rail ────────────────────────────────────────────────────

function SummaryCard({
  job,
  onApply,
  onCancel,
  cancelling,
}: {
  job: JobWire;
  onApply: (job: JobWire) => void;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const pos = job.position;
  const dl = deadlineState(job.deadlineDate);
  const applied = (job.applications?.length ?? 0) > 0;
  const rows: [string, string][] = [
    ["Vacancies", String(job.numberOfVacancy)],
    ["Monthly salary", pos?.salaryAmount != null ? formatCurrency(pos.salaryAmount) : "—"],
    ["Salary grade", sgLabel(pos?.salaryGrade, pos?.salaryStep)],
    ["Applications", String(job.applicationCount ?? 0)],
    ["Published", formatDate(job.publishDate ?? job.publishedAt)],
    ["Deadline", formatDate(job.deadlineDate)],
    ["Processing", formatDate(job.processingDate)],
  ];
  return (
    <div className="dlg-card p-6">
      <p className="text-sm font-medium text-ink">Position Summary</p>
      <dl className="mt-4 space-y-3 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-3">
            <dt className="shrink-0 text-stone">{label}</dt>
            <dd
              className={`text-right text-ink ${
                label === "Deadline" && dl.overdue ? "text-dusty-rose" : ""
              }`}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Application-window progress — visualizes the publish→deadline span */}
      {job.deadlineDate && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-stone">
              Posted <span className="num">{formatDate(job.publishDate ?? job.publishedAt)}</span>
            </span>
            <span className={dl.overdue ? "text-[var(--bad)]" : "text-stone"}>
              Closes <span className="num">{formatDate(job.deadlineDate)}</span>
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden bg-fog" role="presentation">
            <div
              className={`h-full transition-[width] duration-500 ${
                dl.overdue ? "bg-[var(--bad)]" : dl.closingSoon ? "bg-[var(--warn)]" : "bg-ink"
              }`}
              style={{ width: `${deadlineProgress(job)}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-5">
        {applied ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-none bg-fog p-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-sm text-white">
                ✓
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">Successfully Applied</p>
                <p className="text-xs text-pebble">Your application is in the pipeline.</p>
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="dlg-ghost min-h-[44px] w-full text-sm" disabled={cancelling}>
                  Cancel Application
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent className="dlg-card-plain rounded-none">
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-display text-2xl text-carbon">
                    Cancel this application?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-sm text-stone">
                    Your application for {humanize(job.title)} will be withdrawn. You can apply
                    again while the position is open.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="dlg-ghost min-h-[44px] px-6 text-sm">
                    Keep application
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onCancel}
                    className="min-h-[44px] border border-dusty-rose/30 bg-dusty-rose/10 px-6 text-sm font-medium text-dusty-rose hover:bg-dusty-rose/20"
                  >
                    Cancel application
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : (
          <>
            <button
              onClick={() => onApply(job)}
              disabled={dl.overdue}
              className="dlg-cta min-h-[44px] w-full text-sm disabled:pointer-events-none disabled:opacity-50"
            >
              Submit Application
            </button>
            {dl.overdue && (
              <p className="mt-2 text-center text-xs text-pebble">
                The deadline for this position has passed.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Detail: body ────────────────────────────────────────────────────────────

function DetailBody({ job }: { job: JobWire }) {
  const pos = job.position;
  const dl = deadlineState(job.deadlineDate);

  const mqrRows: [string, string | null | undefined][] = [
    ["Education", pos?.cscEducation],
    ["Work Experience", pos?.cscWorkExperience],
    ["Training", pos?.cscTraining],
    ["Eligibility", pos?.cscEligibilityGroup],
    ["License / Certification", pos?.license],
  ];
  const visibleMqr = mqrRows.filter(([, v]) => v && !/^(n\/?a|none|na)\.?$/i.test(v.trim()));

  const vitals: [string, string][] = [
    ["Division", divisionShort(pos?.division)],
    ["Item No.", pos?.itemNumber || "—"],
    ["Vacancies", String(job.numberOfVacancy)],
    ["Position Type", job.positionType ? humanize(job.positionType) : "—"],
    ["Salary Grade", sgLabel(pos?.salaryGrade, pos?.salaryStep)],
    ["Monthly Salary", pos?.salaryAmount != null ? formatCurrency(pos.salaryAmount) : "—"],
  ];

  return (
    <div className="min-w-0 space-y-6">
      {/* Hero */}
      <section className="dlg-card p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <DeadlinePill job={job} />
          {(job.applications?.length ?? 0) > 0 && (
            <span className="dlg-pill bg-ink px-3 py-1 text-xs font-medium text-white">Applied</span>
          )}
        </div>
        <h1 className="text-heading-md mt-3">{humanize(job.title)}</h1>
        <p className="mt-2 text-sm text-stone">
          {pos?.placeOfAssignment || "—"} · {divisionName(pos?.division)} ·{" "}
          {job.positionType ? humanize(job.positionType) : "—"}
        </p>
      </section>

      {/* Sections */}
      <section className="dlg-card space-y-8 p-6 sm:p-8">
        <div>
          <h2 className="text-lg font-medium text-ink">Brief Description</h2>
          <div className="mt-3">
            <RichOrPlain html={job.briefDescriptionHtml} text={job.briefDescription} />
          </div>
        </div>

        <div>
          <h2 className="text-lg font-medium text-ink">Minimum Qualification Requirements</h2>
          <div className="mt-3 overflow-hidden rounded-none border border-border">
            {visibleMqr.length > 0 ? (
              visibleMqr.map(([label, value], i) => (
                <div
                  key={label}
                  className={`grid gap-1 p-4 sm:grid-cols-[200px_1fr] sm:gap-4 ${
                    i > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <p className="text-sm font-medium text-ink">{label}</p>
                  <p className="text-sm leading-relaxed text-stone">{value}</p>
                </div>
              ))
            ) : (
              <p className="p-4 text-sm text-pebble">
                No minimum requirements published for this position.
              </p>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-medium text-ink">Duties &amp; Responsibilities</h2>
          <div className="mt-3">
            <RichOrPlain
              html={job.dutiesHtml}
              text={job.dutiesResponsibilities}
            />
          </div>
        </div>

        <div>
          <h2 className="text-lg font-medium text-ink">Compensation Package</h2>
          <div className="mt-3">
            <RichOrPlain html={job.compensationHtml} text={job.compensationPackage} />
          </div>
        </div>

        <div>
          <h2 className="text-lg font-medium text-ink">Other Qualifications</h2>
          <div className="mt-3">
            <RichOrPlain
              html={job.otherQualificationsHtml}
              text={job.otherQualifications}
            />
          </div>
        </div>

        {/* Vitals + dates */}
        <div>
          <h2 className="text-lg font-medium text-ink">Position Details</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {vitals.map(([label, value]) => (
              <div key={label} className="rounded-none bg-fog p-3">
                <p className="text-xs text-pebble">{label}</p>
                <p className="mt-0.5 truncate text-sm text-ink" title={value}>
                  {value}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-none bg-fog p-3">
              <p className="text-xs text-pebble">Published</p>
              <p className="mt-0.5 text-sm text-ink">{formatDate(job.publishDate ?? job.publishedAt)}</p>
            </div>
            <div className="rounded-none bg-fog p-3">
              <p className="text-xs text-pebble">Deadline</p>
              <p className={`mt-0.5 text-sm ${dl.overdue ? "text-dusty-rose" : "text-ink"}`}>
                {formatDate(job.deadlineDate)}
                {job.deadlineDate ? ` — ${dl.label}` : ""}
              </p>
            </div>
            <div className="rounded-none bg-fog p-3">
              <p className="text-xs text-pebble">Processing</p>
              <p className="mt-0.5 text-sm text-ink">{formatDate(job.processingDate)}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── View ────────────────────────────────────────────────────────────────────

export default function JobsView() {
  const route = useHashRoute();
  const detailParam = route.params.job ?? null;
  const { user } = useSession();

  // Shell contract (responsive fix 3-a): PublicShell's <main> is a bare flex
  // column (no padding), so the anonymous board paints its own 1600px container
  // + gutters + vertical rhythm. AppShell's <main> already carries the exact
  // same container (px-4 py-6 sm:px-6 sm:py-8 lg:px-8), so signed-in views must
  // not repeat it (double gutters ~128px at lg) — a plain w-full wrapper keeps
  // identical spacing since AppShell main provides the same py.
  const shellPad = user
    ? "w-full"
    : "mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8";

  const [jobs, setJobs] = useState<JobWire[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [divisionFilter, setDivisionFilter] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>("newest");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const lastJson = useRef("");

  const { requestApply, dialogs } = useApplyFlow();

  const load = useCallback(async (silent: boolean) => {
    try {
      const data = await apiFetch<JobWire[]>("/api/jobs?limit=200");
      const json = JSON.stringify(data);
      if (!silent || json !== lastJson.current) {
        lastJson.current = json;
        setJobs(data);
      }
      setError(null);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Failed to load positions");
    }
  }, []);

  // Mount + 20s silent poll + refetch on focus (spec §13 cadence).
  useEffect(() => {
    void load(false);
    const timer = setInterval(() => {
      if (!document.hidden) void load(true);
    }, 20_000);
    const onFocus = () => void load(true);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  // Facet counts over the full corpus.
  const facets = useMemo(() => {
    const map = new Map<string, number>();
    for (const j of jobs ?? []) {
      const code = j.position?.division;
      if (!code) continue;
      map.set(code, (map.get(code) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [jobs]);

  // Filtering + sorting.
  const filtered = useMemo(() => {
    let list = jobs ?? [];
    const needle = query.trim().toLowerCase();
    if (needle) {
      list = list.filter((j) =>
        `${j.title} ${j.position?.positionTitle ?? ""} ${j.position?.itemNumber ?? ""}`
          .toLowerCase()
          .includes(needle)
      );
    }
    if (divisionFilter.length > 0) {
      list = list.filter((j) => divisionFilter.includes(j.position?.division ?? ""));
    }
    const deadlineTime = (j: JobWire) =>
      j.deadlineDate ? new Date(j.deadlineDate).getTime() : Number.POSITIVE_INFINITY;
    const sorted = [...list];
    if (sort === "newest") {
      sorted.sort(
        (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );
    } else if (sort === "deadline") {
      sorted.sort((a, b) => deadlineTime(a) - deadlineTime(b));
    } else {
      sorted.sort((a, b) => (b.position?.salaryAmount ?? -1) - (a.position?.salaryAmount ?? -1));
    }
    return sorted;
  }, [jobs, query, divisionFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pageItems = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const changeQuery = (v: string) => {
    setQuery(v);
    setPage(1);
  };
  const toggleDivision = (code: string) => {
    setDivisionFilter((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
    setPage(1);
  };
  const clearFilters = () => {
    setQuery("");
    setDivisionFilter([]);
    setPage(1);
  };
  const toggleExpanded = (id: number) => setExpandedId((prev) => (prev === id ? null : id));
  const openDetail = (job: JobWire) => navigate("jobs", { job: String(job.id) });

  const applyTo = useCallback(
    (job: JobWire) => {
      requestApply(job);
    },
    [requestApply]
  );

  // Cancel application (only while status "Applied" — spec §7.7).
  const appliedId = useMemo(() => {
    const detail = detailParam ? (jobs ?? []).find((j) => j.id === Number(detailParam)) : null;
    return detail?.applications?.[0]?.id ?? null;
  }, [detailParam, jobs]);

  const cancelApplication = useCallback(async () => {
    if (appliedId == null) return;
    setCancelling(true);
    try {
      await apiFetch(`/api/applications/${appliedId}`, { method: "DELETE" });
      toast.success("Application cancelled", {
        description: "Your application was withdrawn. You can apply again while the position is open.",
      });
      await load(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel the application");
    } finally {
      setCancelling(false);
    }
  }, [appliedId, load]);

  // ── Detail mode ───────────────────────────────────────────────────────────
  if (detailParam && /^\d+$/.test(detailParam)) {
    const detailId = Number(detailParam);
    const detail = jobs?.find((j) => j.id === detailId) ?? null;

    return (
      <div className={shellPad}>
        <button
          onClick={() => navigate("jobs")}
          className="mb-5 flex min-h-[44px] items-center gap-2 text-sm text-stone hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Positions
        </button>

        {jobs === null && error === null ? (
          <div className="space-y-6">
            <div className="dlg-card space-y-4 p-8">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <div className="dlg-card space-y-3 p-8">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        ) : error !== null ? (
          <ErrorCard message={error} onRetry={() => void load(false)} />
        ) : detail === null ? (
          <div className="dlg-card p-10 text-center">
            <p className="font-display text-xl text-carbon">Position not found</p>
            <p className="mt-2 text-sm text-stone">
              This position may have closed or is no longer published.
            </p>
            <button onClick={() => navigate("jobs")} className="dlg-cta mt-5 min-h-[44px] px-7 text-sm">
              Back to Positions
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1fr_340px]">
            <DetailBody job={detail} />
            {/* Session-aware sticky offset: the public SiteHeader is sticky
                h-16, the signed-in shell has no sticky chrome at xl. */}
            <aside className={`xl:sticky ${user ? "xl:top-6" : "xl:top-20"}`}>
              <SummaryCard
                job={detail}
                onApply={applyTo}
                onCancel={() => void cancelApplication()}
                cancelling={cancelling}
              />
            </aside>
          </div>
        )}

        {dialogs}
      </div>
    );
  }

  // ── List mode ─────────────────────────────────────────────────────────────
  const activeFilterCount = (query.trim() ? 1 : 0) + divisionFilter.length;

  const filterRail = (
    <div className="dlg-card p-4">
      <label htmlFor="job-search" className="sr-only">
        Search positions
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pebble"
          aria-hidden="true"
        />
        <Input
          id="job-search"
          value={query}
          onChange={(e) => changeQuery(e.target.value)}
          placeholder="Search positions…"
          className="dlg-input min-h-[44px] pl-9"
        />
      </div>

      <p className="mt-5 px-1 text-xs font-medium uppercase tracking-wider text-pebble">Division</p>
      <div className="mt-2 space-y-0.5">
        {facets.map(([code, count]) => (
          <label
            key={code}
            className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-none px-2 hover:bg-fog"
          >
            <Checkbox
              checked={divisionFilter.includes(code)}
              onCheckedChange={() => toggleDivision(code)}
            />
            <span className="min-w-0 flex-1 truncate text-sm text-stone" title={divisionName(code)}>
              {divisionShort(code)}
            </span>
            <span className="text-xs text-pebble">{count}</span>
          </label>
        ))}
        {facets.length === 0 && <p className="px-2 py-2 text-sm text-pebble">No divisions on file</p>}
      </div>

      {(query.trim() || divisionFilter.length > 0) && (
        <button
          onClick={clearFilters}
          className="min-h-[44px] px-2 text-sm text-stone underline underline-offset-4 hover:text-ink"
        >
          Clear filters
        </button>
      )}
    </div>
  );

  let content: React.ReactNode;
  if (jobs === null && error === null) {
    content = (
      <div className="space-y-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="dlg-card p-6">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="mt-3 h-6 w-2/3" />
            <Skeleton className="mt-2 h-4 w-full" />
          </div>
        ))}
      </div>
    );
  } else if (error !== null && jobs === null) {
    content = <ErrorCard message={error} onRetry={() => void load(false)} />;
  } else if ((jobs ?? []).length === 0) {
    content = (
      <div className="dlg-card p-10 text-center">
        <p className="font-display text-xl text-carbon">No open positions</p>
        <p className="mt-2 text-sm text-stone">
          There are no published postings at the moment — check back soon.
        </p>
      </div>
    );
  } else if (filtered.length === 0) {
    content = (
      <div className="dlg-card p-10 text-center">
        <p className="font-display text-xl text-carbon">No positions match your filters</p>
        <p className="mt-2 text-sm text-stone">Try a different search term or clear the filters.</p>
        <button onClick={clearFilters} className="dlg-ghost mt-5 min-h-[44px] px-6 text-sm">
          Clear filters
        </button>
      </div>
    );
  } else {
    content = (
      <>
        <div className="space-y-4">
          {pageItems.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              expanded={expandedId === job.id}
              onToggle={toggleExpanded}
              onApply={applyTo}
              onDetail={openDetail}
            />
          ))}
        </div>

        {totalPages > 1 && (
          <nav
            className="mt-6 flex flex-wrap items-center justify-center gap-1 sm:gap-1.5"
            aria-label="Pagination"
          >
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={current === 1}
              aria-label="Previous page"
              className="dlg-ghost grid h-11 w-11 place-items-center disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            {pageWindow(current, totalPages).map((p, i) =>
              p === "…" ? (
                <span key={`ellipsis-${i}`} className="grid h-11 w-8 place-items-center text-sm text-pebble">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  aria-current={p === current ? "page" : undefined}
                  className={
                    p === current
                      ? "grid h-11 min-w-11 place-items-center bg-ink px-3 text-sm font-medium text-white"
                      : "grid h-11 min-w-11 place-items-center px-3 text-sm text-stone hover:bg-fog hover:text-ink"
                  }
                >
                  {p}
                </button>
              )
            )}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={current === totalPages}
              aria-label="Next page"
              className="dlg-ghost grid h-11 w-11 place-items-center disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </nav>
        )}
      </>
    );
  }

  return (
    <div className={shellPad}>
      <div className="mb-5 max-w-2xl">
        <h1 className="text-heading-lg">Positions</h1>
        <p className="mt-2 text-sm leading-relaxed text-stone">
          Browse published vacancies at DOST-MIRDC and submit your application online.
        </p>
      </div>

      <div className="items-start lg:flex lg:gap-6">
        {/* Search rail — sticky on desktop, collapsible on mobile */}
        <aside
          className={`mb-4 w-full lg:sticky ${user ? "lg:top-6" : "lg:top-20"} lg:mb-0 lg:w-72 lg:shrink-0`}
        >
          <div className="lg:hidden">
            <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
              <CollapsibleTrigger asChild>
                <button className="dlg-ghost flex min-h-[44px] w-full items-center justify-between px-5 text-sm">
                  <span className="flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                    Filters
                    {activeFilterCount > 0 && (
                      <span className="grid h-5 min-w-5 place-items-center bg-ink px-1.5 text-[11px] font-medium text-white">
                        {activeFilterCount}
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="pt-3">{filterRail}</div>
              </CollapsibleContent>
            </Collapsible>
          </div>
          <div className="hidden lg:block">{filterRail}</div>
        </aside>

        {/* Results */}
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-stone">
              {filtered.length} Result{filtered.length === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-2">
              <span className="hidden text-sm text-stone sm:inline">Sort</span>
              <Select
                value={sort}
                onValueChange={(v) => {
                  setSort(v as SortKey);
                  setPage(1);
                }}
              >
                <SelectTrigger
                  className="dlg-input min-h-[44px] w-[140px] sm:w-[170px]"
                  aria-label="Sort results"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="deadline">Deadline</SelectItem>
                  <SelectItem value="salary">Salary desc</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Active-filter chips — presentation of existing filter state */}
          {activeFilterCount > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {query.trim() && (
                <span className="dlg-pill inline-flex items-center gap-1.5 bg-white px-3 py-1 text-xs font-medium text-graphite">
                  &ldquo;{query.trim()}&rdquo;
                  <button
                    onClick={() => changeQuery("")}
                    aria-label="Clear search filter"
                    className="focus-ring -mr-1 grid h-5 w-5 place-items-center text-stone hover:bg-fog hover:text-ink"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
              )}
              {divisionFilter.map((code) => (
                <span
                  key={code}
                  className="dlg-pill inline-flex items-center gap-1.5 bg-white px-3 py-1 text-xs font-medium text-graphite"
                >
                  {divisionShort(code)}
                  <button
                    onClick={() => toggleDivision(code)}
                    aria-label={`Remove ${divisionShort(code)} filter`}
                    className="focus-ring -mr-1 grid h-5 w-5 place-items-center text-stone hover:bg-fog hover:text-ink"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
              <button
                onClick={clearFilters}
                className="text-xs text-stone underline underline-offset-4 hover:text-ink"
              >
                Clear all
              </button>
            </div>
          )}

          {content}
        </div>
      </div>

      {dialogs}
    </div>
  );
}
