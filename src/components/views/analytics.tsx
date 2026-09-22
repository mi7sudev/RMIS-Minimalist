"use client";

// ============================================================================
// RMIS — Analytics (spec §7.13, `#/analytics`). Pipeline conversion funnel
// (clickable → drill filter), application volume line chart (last 30 days,
// recharts), status distribution bar chart, drill-down candidate list, and the
// audit activity feed. Sources: /api/admin/stats + evaluator queue + audit
// logs.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiFetch, formatDate, fullName, humanize, timeAgo } from "@/lib/client";
import { PIPELINE_STAGES, stageForStatus, type StageKey } from "@/lib/status";
import { navigate } from "@/lib/router";
import { StatusPill } from "@/components/views/review-workspace";
import { ghostBtn } from "@/components/views/recruitment";

type Stats = {
  byStatus: { status: string; count: number }[];
  totalApplications: number;
  pendingReview: number;
  shortlisted: number;
  rejected: number;
};

type QueueRow = {
  id: number;
  status: string;
  stage: StageKey;
  dateApplied: string;
  applicantId: number;
  applicant: { id: number; firstName: string | null; lastName: string | null; emailAddress: string | null };
  job: { id: number; title: string };
  match: { verdict: string; metCount: number; requiredCount: number };
};

type AuditRow = {
  id: number;
  timestamp: string;
  userLabel: string | null;
  userRole: string | null;
  action: string;
  description: string | null;
};

type Drill = "All" | StageKey;

const INK = "#181825";
const GRID = "#ececec";

function Monogram({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fog text-xs font-medium text-ink">
      {initials || "?"}
    </span>
  );
}

export default function Analytics() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [queue, setQueue] = useState<QueueRow[] | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [auditTotal, setAuditTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [drill, setDrill] = useState<Drill>("All");
  const [cycle, setCycle] = useState("all-time");
  const [spin, setSpin] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      const [s, q, a] = await Promise.all([
        apiFetch<Stats>("/api/admin/stats"),
        apiFetch<{ data: QueueRow[] }>("/api/evaluator/queue?pageSize=100"),
        apiFetch<{ data: AuditRow[]; total: number }>("/api/admin/audit-logs?pageSize=20"),
      ]);
      setStats(s);
      setQueue(q.data);
      setAudit(a.data);
      setAuditTotal(a.total);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Failed to load analytics");
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

  const rows = useMemo(() => queue ?? [], [queue]);

  const funnel = useMemo(() => {
    const applied = rows.filter((r) => stageForStatus(r.status) === "Applied").length;
    return PIPELINE_STAGES.map((stage) => {
      const count = rows.filter((r) => stageForStatus(r.status) === stage).length;
      const pct = applied > 0 ? Math.round((count / applied) * 100) : 0;
      return { stage, count, pct };
    });
  }, [rows]);

  const volume = useMemo(() => {
    const buckets = new Map<string, number>();
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(today.getDate() - i);
      buckets.set(day.toISOString().slice(0, 10), 0);
    }
    for (const r of rows) {
      const key = new Date(r.dateApplied);
      if (Number.isNaN(key.getTime())) continue;
      const k = key.toISOString().slice(0, 10);
      if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
    }
    return Array.from(buckets.entries()).map(([day, applications]) => ({
      day: formatDate(`${day}T00:00:00`).replace(/,.*/, ""),
      applications,
    }));
  }, [rows]);

  const drillRows = useMemo(
    () => (drill === "All" ? rows : rows.filter((r) => stageForStatus(r.status) === drill)),
    [rows, drill]
  );

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

  if (!stats || queue === null || audit === null) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/3" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-[24px]" />
          <Skeleton className="h-64 rounded-[24px]" />
        </div>
        <Skeleton className="h-64 rounded-[24px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl text-ink">Analytics</h1>
        <button type="button" className={`${ghostBtn} ml-auto`} onClick={manualRefresh}>
          <RefreshCw className={`h-4 w-4 ${spin ? "animate-spin" : ""}`} aria-hidden />
          Refresh
        </button>
      </div>

      {/* 1. Pipeline funnel + 3. Status distribution */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="dlg-card p-6 space-y-2">
          <h2 className="font-display text-xl text-ink">Pipeline conversion</h2>
          <p className="text-xs text-stone">Click a stage to drill into its applicants. Percentages are of Applied.</p>
          <div className="mt-2 space-y-2">
            {funnel.map((f) => {
              const active = drill === f.stage;
              return (
                <button
                  key={f.stage}
                  type="button"
                  className={`w-full text-left rounded-[12px] px-3 py-3 transition-colors min-h-[44px] ${active ? "bg-ink text-white" : "bg-fog hover:bg-[#ececec]"}`}
                  onClick={() => setDrill(drill === f.stage ? "All" : f.stage)}
                  aria-pressed={active}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className={`text-sm ${active ? "text-white" : "text-ink"}`}>{f.stage}</span>
                    <span className={`text-sm tabular-nums ${active ? "text-white" : "text-ink"}`}>{f.count}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-white/40 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${active ? "bg-white" : "bg-ink"}`}
                      style={{ width: `${Math.min(100, f.pct)}%` }}
                    />
                  </div>
                  <p className={`text-xs mt-1 ${active ? "text-white/70" : "text-pebble"}`}>{f.pct}% of Applied</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          <div className="dlg-card p-6">
            <h2 className="font-display text-xl text-ink">Applications per day</h2>
            <p className="text-xs text-stone">Last 30 days, from the review queue.</p>
            <div className="mt-4">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={volume} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#949494" }} tickMargin={8} interval={6} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#949494" }} />
                  <RTooltip />
                  <Line type="monotone" dataKey="applications" stroke={INK} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="dlg-card p-6">
            <h2 className="font-display text-xl text-ink">Status distribution</h2>
            <div className="mt-4">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.byStatus} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="status" tick={{ fontSize: 10, fill: "#949494" }} tickMargin={8} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#949494" }} />
                  <RTooltip />
                  <Bar dataKey="count" fill="#242433" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Drill-down */}
      <div className="dlg-card p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-xl text-ink">Drill-down</h2>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select value={drill} onValueChange={(v) => setDrill(v as Drill)}>
              <SelectTrigger className="dlg-input min-h-[44px] w-[170px]" aria-label="Stage drill filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All stages</SelectItem>
                {PIPELINE_STAGES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={cycle} onValueChange={setCycle}>
              <SelectTrigger className="dlg-input min-h-[44px] w-[140px]" aria-label="Recruitment cycle">
                <SelectValue placeholder="All time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-time">All time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {drillRows.length === 0 ? (
          <p className="text-sm text-pebble py-4 text-center">No applicants in this selection.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto scroll-thin space-y-2 pr-1">
            {drillRows.map((r) => (
              <button
                key={r.id}
                type="button"
                className="w-full bg-fog rounded-[12px] p-3 flex items-center gap-3 text-left hover:bg-[#ececec] transition-colors min-h-[44px]"
                onClick={() => navigate("candidate", { id: String(r.applicantId) })}
              >
                <Monogram name={fullName(r.applicant)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink truncate">{fullName(r.applicant)}</p>
                  <p className="text-xs text-stone truncate">
                    {r.job.title} · Applied {formatDate(r.dateApplied)}
                  </p>
                </div>
                <StatusPill status={r.status} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 5. Recent activity (audit feed) */}
      <div className="dlg-card p-6 space-y-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="font-display text-xl text-ink">Recent activity</h2>
          <span className="text-xs text-stone">{auditTotal} logged event{auditTotal === 1 ? "" : "s"}</span>
        </div>
        {audit.length === 0 ? (
          <p className="text-sm text-pebble py-4 text-center">No audit events recorded yet.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto scroll-thin space-y-2 pr-1">
            {audit.map((a) => (
              <div key={a.id} className="bg-fog rounded-[12px] p-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm text-ink truncate max-w-[240px]">{a.userLabel || "System"}</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs text-ink">{humanize(a.action)}</span>
                <span className="text-xs text-stone truncate flex-1 min-w-[160px]">{a.description || "—"}</span>
                <span className="text-xs text-pebble shrink-0">{timeAgo(a.timestamp)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
