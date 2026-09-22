"use client";

// ============================================================================
// RMIS — Admin command center (spec §7.12, `#/operations`). Needs-attention
// KPI tiles (total headline), active recruitment list, recent activity, and the
// overview aside. Data: /api/admin/stats + /api/jobs + /api/evaluator/queue;
// 30 s silent poll + focus refresh.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, BarChart3, Briefcase, CalendarClock, ClipboardCheck, Clock,
  Inbox, RefreshCw, ShieldAlert, UserRound, UserX,
} from "lucide-react";
import {
  EmptyState, KpiCard, PageHeader, SkeletonKpis, SkeletonRows, StatusPill,
} from "@/components/ui/shell";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, deadlineState, formatDate, fullName } from "@/lib/client";
import { navigate } from "@/lib/router";
import { getStatusMeta } from "@/lib/status";
import { variantForStatus } from "@/lib/status-ui";
import { ghostBtn } from "@/components/views/recruitment";

type Stats = {
  totalUsers: number;
  admins: number;
  applicants: number;
  evaluators: number;
  activeJobs: number;
  totalApplications: number;
  pendingReview: number;
  shortlisted: number;
  rejected: number;
  byStatus: { status: string; count: number }[];
  recent: {
    id: number;
    status: string;
    dateApplied: string;
    applicant: { id: number; firstName: string | null; lastName: string | null };
    jobId: number;
    jobTitle: string;
    positionTitle: string | null;
  }[];
  needsAttention: {
    failedLogins24h: number;
    deadlinesThisWeek: number;
    blockedUsers: number;
    incompleteProfiles: number;
  };
};

type JobRow = {
  id: number;
  title: string;
  positionType: string | null;
  numberOfVacancy: number;
  deadlineDate: string | null;
  publishedAt: string;
  isActive: boolean;
  applicationCount: number;
  position: { placeOfAssignment: string | null; division: string | null } | null;
};

function Initials({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span className="num grid h-7 w-7 shrink-0 place-items-center rounded-full bg-fog text-[10px] font-medium text-ink" aria-hidden>
      {initials || "?"}
    </span>
  );
}

const SUMMARY_TONE_TEXT: Record<"ok" | "warn" | "bad", string> = {
  ok: "text-[var(--ok)]",
  warn: "text-[var(--warn)]",
  bad: "text-[var(--bad)]",
};

/** Icon tint for the aside summary lines: green when clear, tone when flagged. */
function summaryTone(count: number, alertTone: "warn" | "bad"): "ok" | "warn" | "bad" {
  return count === 0 ? "ok" : alertTone;
}

export default function CommandCenter() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spin, setSpin] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      const [s, j] = await Promise.all([
        apiFetch<Stats>("/api/admin/stats"),
        apiFetch<JobRow[]>("/api/jobs?limit=50"),
      ]);
      setStats(s);
      setJobs(j);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Failed to load the command center");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) void load(true);
    }, 30_000);
    return () => clearInterval(id);
  }, [load]);
  useEffect(() => {
    const onFocus = () => void load(true);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  const manualRefresh = useCallback(() => {
    setSpin(true);
    void load(true).finally(() => setTimeout(() => setSpin(false), 500));
  }, [load]);

  const activeJobs = useMemo(() => (jobs ?? []).filter((j) => j.isActive).slice(0, 6), [jobs]);
  const attentionTotal = stats
    ? stats.pendingReview +
      stats.needsAttention.deadlinesThisWeek +
      stats.needsAttention.incompleteProfiles +
      stats.needsAttention.failedLogins24h
    : 0;

  const refreshButton = (
    <button type="button" className={ghostBtn} onClick={manualRefresh}>
      <RefreshCw className={`h-4 w-4 ${spin ? "animate-spin" : ""}`} aria-hidden />
      Refresh
    </button>
  );

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Command Center" description="Live operational snapshot of recruitment, pipeline health, and system activity." actions={refreshButton} />
        <div className="dlg-card p-8 text-center space-y-4">
          <AlertTriangle className="h-8 w-8 text-dusty-rose mx-auto" aria-hidden />
          <p className="text-sm text-stone">{error}</p>
          <button type="button" className={ghostBtn} onClick={() => void load()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!stats || jobs === null) {
    return (
      <div className="space-y-6">
        <PageHeader title="Command Center" description="Live operational snapshot of recruitment, pipeline health, and system activity." actions={refreshButton} />
        <SkeletonKpis count={4} />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <SkeletonRows rows={2} rowClassName="h-6 w-40" />
            <SkeletonRows rows={5} rowClassName="h-[72px] rounded-[12px]" />
            <SkeletonRows rows={5} rowClassName="h-[64px] rounded-[12px]" />
          </div>
          <div>
            <Skeleton className="h-72 w-full rounded-[24px]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Command Center"
        description="Live operational snapshot of recruitment, pipeline health, and system activity."
        actions={refreshButton}
      />

      <div className="grid gap-6 lg:grid-cols-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="space-y-6 lg:col-span-2">
          {/* Needs attention */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-[15px] font-medium leading-6 text-ink">Needs attention</h2>
              <span className="text-sm text-stone">
                <span className="num">{attentionTotal}</span> item{attentionTotal === 1 ? "" : "s"} across the board
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="Awaiting review"
                value={stats.pendingReview}
                icon={ClipboardCheck}
                tone="warn"
                hint="Open →"
                onClick={() => navigate("review-queue")}
              />
              <KpiCard
                label="Deadlines this week"
                value={stats.needsAttention.deadlinesThisWeek}
                icon={CalendarClock}
                tone="bad"
                hint="Open →"
                onClick={() => navigate("recruitment")}
              />
              <KpiCard
                label="Incomplete profiles"
                value={stats.needsAttention.incompleteProfiles}
                icon={UserRound}
                tone="info"
                hint="Open →"
                onClick={() => navigate("candidates", { status: "incomplete" })}
              />
              <KpiCard
                label="Failed logins"
                value={stats.needsAttention.failedLogins24h}
                icon={ShieldAlert}
                tone="bad"
                hint="Last 24 h · Open →"
                onClick={() => navigate("settings", { tab: "audit" })}
              />
            </div>
          </section>

          {/* Active recruitment */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[15px] font-medium leading-6 text-ink">Active recruitment</h2>
              <button type="button" className={ghostBtn} onClick={() => navigate("recruitment")}>
                View all
              </button>
            </div>
            {activeJobs.length === 0 ? (
              <div className="dlg-card p-6">
                <EmptyState
                  icon={Briefcase}
                  title="No active job postings right now."
                  description="Publish a posting in recruitment to start receiving applications."
                  action={
                    <button
                      type="button"
                      className="dlg-cta inline-flex min-h-[44px] items-center gap-2 rounded-full px-5 text-sm"
                      onClick={() => navigate("recruitment")}
                    >
                      Open recruitment
                    </button>
                  }
                />
              </div>
            ) : (
              <div className="space-y-2">
                {activeJobs.map((j) => {
                  const dl = deadlineState(j.deadlineDate);
                  const urgent = !dl.overdue && dl.closingSoon;
                  return (
                    <button
                      key={j.id}
                      type="button"
                      className="flex min-h-[44px] w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] border border-border bg-white p-3.5 text-left transition-shadow duration-200 hover:shadow-dialog-subtle focus-ring"
                      onClick={() => navigate("job", { id: String(j.id) })}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{j.title}</p>
                        <p className="mt-0.5 truncate text-xs text-stone">
                          {[j.positionType, j.position?.placeOfAssignment, j.position?.division].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                      <span
                        className={`num inline-flex shrink-0 items-center gap-1.5 text-xs ${
                          dl.overdue ? "text-pebble" : urgent ? "text-[var(--bad)]" : "text-stone"
                        }`}
                      >
                        {urgent ? <Clock className="h-3.5 w-3.5" aria-hidden /> : null}
                        {dl.overdue ? "Closed" : `Deadline ${formatDate(j.deadlineDate)}`}
                      </span>
                      <StatusPill
                        variant="neutral"
                        status={`${j.applicationCount} application${j.applicationCount === 1 ? "" : "s"}`}
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Recent activity */}
          <section className="space-y-3">
            <h2 className="text-[15px] font-medium leading-6 text-ink">Recent activity</h2>
            {stats.recent.length === 0 ? (
              <div className="dlg-card p-6">
                <EmptyState
                  icon={Inbox}
                  title="No applications yet."
                  description="Recent applications will appear here as candidates apply."
                  compact
                />
              </div>
            ) : (
              <div className="space-y-2">
                {stats.recent.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="flex min-h-[44px] w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] border border-border bg-white p-3.5 text-left transition-shadow duration-200 hover:shadow-dialog-subtle focus-ring"
                    onClick={() => navigate("candidate", { id: String(r.applicant.id) })}
                  >
                    <Initials name={fullName(r.applicant)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{fullName(r.applicant)}</p>
                      <p className="mt-0.5 truncate text-xs text-stone">
                        {[r.positionTitle || r.jobTitle, formatDate(r.dateApplied)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <StatusPill status={getStatusMeta(r.status).label} variant={variantForStatus(r.status)} />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Overview aside */}
        <aside className="space-y-4 self-start lg:sticky lg:top-6">
          <div className="dlg-card p-5">
            <h2 className="text-[15px] font-medium leading-6 text-ink">Overview</h2>
            <dl className="mt-2">
              {(
                [
                  ["Applicants", stats.applicants],
                  ["Active jobs", stats.activeJobs],
                  ["Applications", stats.totalApplications],
                  ["Shortlisted", stats.shortlisted],
                ] as [string, number][]
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3 border-b border-[#ececec] py-2.5 last:border-0"
                >
                  <dt className="text-xs text-stone">{label}</dt>
                  <dd className="num text-sm font-medium text-ink">{value}</dd>
                </div>
              ))}
            </dl>
            <button
              type="button"
              className="dlg-ghost mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full px-4 text-sm"
              onClick={() => navigate("analytics")}
            >
              <BarChart3 className="h-4 w-4" aria-hidden />
              Open Analytics
            </button>
          </div>
          <div className="space-y-2.5 rounded-[12px] bg-fog p-4">
            {(
              [
                [CalendarClock, stats.needsAttention.deadlinesThisWeek, "posting deadline(s) within 7 days", "warn"],
                [UserX, stats.needsAttention.blockedUsers, "blocked account(s)", "bad"],
                [AlertTriangle, stats.needsAttention.failedLogins24h, "failed login(s) in the last 24 h", "bad"],
              ] as [typeof CalendarClock, number, string, "warn" | "bad"][]
            ).map(([Icon, count, label, alertTone]) => (
              <p key={label} className="flex items-center gap-2 text-xs text-stone">
                <Icon
                  className={`h-3.5 w-3.5 shrink-0 ${SUMMARY_TONE_TEXT[summaryTone(count, alertTone)]}`}
                  aria-hidden
                />
                <span>
                  <span className="num">{count}</span> {label}
                </span>
              </p>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
