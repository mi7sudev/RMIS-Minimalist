"use client";

// ============================================================================
// RMIS — Admin command center (spec §7.12, `#/operations`). Needs-attention
// tiles (total headline), active recruitment list, recent activity, and the
// overview aside. Data: /api/admin/stats + /api/jobs + /api/evaluator/queue;
// 30 s silent poll + focus refresh.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, BarChart3, CalendarClock, RefreshCw, UserX } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, deadlineState, formatDate, fullName } from "@/lib/client";
import { navigate } from "@/lib/router";
import { StatusPill } from "@/components/views/review-workspace";
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

function AttentionTile({
  label,
  value,
  onClick,
}: {
  label: string;
  value: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="dlg-card p-4 text-left cursor-pointer hover:shadow-md transition-shadow min-h-[44px] group"
      onClick={onClick}
    >
      <p className="text-xs text-pebble">{label}</p>
      <p className="font-display text-3xl text-ink mt-1 tabular-nums">{value}</p>
      <p className="text-xs text-stone mt-2 inline-flex items-center gap-1 opacity-70 group-hover:opacity-100">
        Open <ArrowRight className="h-3 w-3" aria-hidden />
      </p>
    </button>
  );
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

  if (error) {
    return (
      <div className="dlg-card p-8 text-center space-y-4">
        <AlertTriangle className="h-8 w-8 text-dusty-rose mx-auto" aria-hidden />
        <p className="text-sm text-stone">{error}</p>
        <button type="button" className={ghostBtn} onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  if (!stats || jobs === null) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/2" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-[24px]" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-[24px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl text-ink">Command center</h1>
        <button type="button" className={`${ghostBtn} ml-auto`} onClick={manualRefresh}>
          <RefreshCw className={`h-4 w-4 ${spin ? "animate-spin" : ""}`} aria-hidden />
          Refresh
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Needs attention */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="font-display text-xl text-ink">Needs attention</h2>
              <span className="text-sm text-stone">
                {attentionTotal} item{attentionTotal === 1 ? "" : "s"} across the board
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <AttentionTile label="Awaiting review" value={stats.pendingReview} onClick={() => navigate("review-queue")} />
              <AttentionTile
                label="Deadlines this week"
                value={stats.needsAttention.deadlinesThisWeek}
                onClick={() => navigate("recruitment")}
              />
              <AttentionTile
                label="Incomplete profiles"
                value={stats.needsAttention.incompleteProfiles}
                onClick={() => navigate("candidates", { status: "incomplete" })}
              />
              <AttentionTile
                label="Failed logins (24h)"
                value={stats.needsAttention.failedLogins24h}
                onClick={() => navigate("settings", { tab: "audit" })}
              />
            </div>
          </section>

          {/* Active recruitment */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-display text-xl text-ink">Active recruitment</h2>
              <button
                type="button"
                className="text-sm text-ink underline underline-offset-4 min-h-[44px] inline-flex items-center"
                onClick={() => navigate("recruitment")}
              >
                View all
              </button>
            </div>
            {activeJobs.length === 0 ? (
              <div className="dlg-card p-8 text-center space-y-3">
                <p className="text-sm text-pebble">No active job postings right now.</p>
                <button type="button" className="dlg-cta inline-flex min-h-[44px] items-center gap-2 rounded-full px-5 text-sm" onClick={() => navigate("recruitment")}>
                  Open recruitment
                </button>
              </div>
            ) : (
              <div className="dlg-card p-2">
                {activeJobs.map((j) => {
                  const dl = deadlineState(j.deadlineDate);
                  return (
                    <button
                      key={j.id}
                      type="button"
                      className="w-full text-left flex flex-wrap items-center gap-3 rounded-[12px] px-3 py-3 hover:bg-fog transition-colors min-h-[44px]"
                      onClick={() => navigate("job", { id: String(j.id) })}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-ink truncate">{j.title}</p>
                        <p className="text-xs text-stone mt-0.5 truncate">
                          {[j.positionType, j.position?.placeOfAssignment, j.position?.division].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                      <span className={`text-xs shrink-0 ${dl.overdue ? "text-dusty-rose" : "text-stone"}`}>
                        {dl.overdue ? "Closed" : `Deadline ${formatDate(j.deadlineDate)}`}
                      </span>
                      <span className="rounded-full bg-fog text-ink text-xs px-2.5 py-1 shrink-0 tabular-nums">
                        {j.applicationCount} application{j.applicationCount === 1 ? "" : "s"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Recent activity */}
          <section className="space-y-3">
            <h2 className="font-display text-xl text-ink">Recent activity</h2>
            {stats.recent.length === 0 ? (
              <div className="dlg-card p-8 text-center">
                <p className="text-sm text-pebble">No applications yet.</p>
              </div>
            ) : (
              <div className="dlg-card p-2">
                {stats.recent.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="w-full text-left flex flex-wrap items-center gap-3 rounded-[12px] px-3 py-3 hover:bg-fog transition-colors min-h-[44px]"
                    onClick={() => navigate("candidate", { id: String(r.applicant.id) })}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink truncate">{fullName(r.applicant)}</p>
                      <p className="text-xs text-stone mt-0.5 truncate">
                        {[r.positionTitle || r.jobTitle, formatDate(r.dateApplied)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <StatusPill status={r.status} />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Overview aside */}
        <aside className="space-y-4 self-start lg:sticky lg:top-6">
          <div className="dlg-card p-4 space-y-1">
            <h2 className="font-display text-lg text-ink">Overview</h2>
            {(
              [
                ["Applicants", stats.applicants],
                ["Active jobs", stats.activeJobs],
                ["Applications", stats.totalApplications],
                ["Shortlisted", stats.shortlisted],
              ] as [string, number][]
            ).map(([label, value]) => (
              <div key={label} className="flex items-center justify-between text-sm py-2 border-b border-[#ececec] last:border-0">
                <span className="text-xs text-stone">{label}</span>
                <span className="text-ink tabular-nums">{value}</span>
              </div>
            ))}
            <button
              type="button"
              className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 text-sm text-ink underline underline-offset-4"
              onClick={() => navigate("analytics")}
            >
              <BarChart3 className="h-4 w-4" aria-hidden />
              Open Analytics
            </button>
          </div>
          <div className="bg-fog rounded-[12px] p-4 space-y-2">
            <p className="flex items-center gap-2 text-xs text-stone">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              {stats.needsAttention.deadlinesThisWeek} posting deadline(s) within 7 days
            </p>
            <p className="flex items-center gap-2 text-xs text-stone">
              <UserX className="h-3.5 w-3.5" aria-hidden />
              {stats.needsAttention.blockedUsers} blocked account(s)
            </p>
            <p className="flex items-center gap-2 text-xs text-stone">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              {stats.needsAttention.failedLogins24h} failed login(s) in the last 24 h
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
