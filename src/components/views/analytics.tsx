"use client";

// ============================================================================
// RMIS — Analytics (spec §7.13, `#/analytics`). Pipeline conversion funnel
// (clickable → drill filter), application volume chart (last 30 days,
// recharts), status distribution bar chart, drill-down candidate list, and the
// audit activity feed. Sources: /api/admin/stats + evaluator queue + audit
// logs.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import {
  AlertTriangle, Filter, History, Inbox, ChartPie as ChartPieIcon,
  RefreshCw, TrendingUp, UsersRound,
} from "lucide-react";
import {
  EmptyState, Monogram, PageHeader, SectionCard, SkeletonKpis, SkeletonRows, StatusPill,
} from "@/components/ui/shell";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiFetch, formatDate, fullName, humanize, timeAgo } from "@/lib/client";
import { PIPELINE_STAGES, stageForStatus, getStatusMeta, type StageKey } from "@/lib/status";
import { navigate } from "@/lib/router";
import { dotClass, pillClass, variantForStatus, type StatusVariant } from "@/lib/status-ui";
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

// ── Data-viz tokens (globals.css --viz-1..5) & shared chart chrome ──────────

const GRID = "#ececec";
const TICK = { fontSize: 11, fill: "#949494" };
const VIZ_1 = "#f69251";

/** Funnel bar fill per stage (functional status tokens from globals.css). */
const STAGE_BAR: Record<StageKey, string> = {
  "Applied": "#484758",
  "Under Review": "#a16207",
  "Shortlisted": "#2e7d4f",
  "Rejected": "#b3556a",
};

/** Stage-dot variant per stage (mirrors STAGE_BAR). */
const STAGE_VARIANT: Record<StageKey, StatusVariant> = {
  "Applied": "info",
  "Under Review": "warn",
  "Shortlisted": "ok",
  "Rejected": "bad",
};

/** Donut slice fill for a stored status spelling (stage tokens + fallback). */
function statusSliceColor(status: string): string {
  const key = STAGE_BAR[stageForStatus(status) as StageKey];
  return key ?? "#8b8b8b";
}

/** First-letter monogram text ("?" when empty). */
function monogramOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
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

  // Donut slices (zero-count statuses dropped so the ring stays readable).
  const donutData = useMemo(
    () => (stats?.byStatus ?? []).filter((d) => d.count > 0),
    [stats]
  );
  const donutTotal = useMemo(() => donutData.reduce((sum, d) => sum + d.count, 0), [donutData]);

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Analytics" description="Pipeline health, application volume, and audit activity." />
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

  if (!stats || queue === null || audit === null) {
    return (
      <div className="space-y-6">
        <PageHeader title="Analytics" description="Pipeline health, application volume, and audit activity." />
        <SkeletonKpis count={4} />
        <div className="grid gap-6 lg:grid-cols-2">
          <SkeletonRows rows={5} rowClassName="h-16" />
          <SkeletonRows rows={5} rowClassName="h-16" />
        </div>
        <SkeletonRows rows={4} rowClassName="h-16" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Pipeline health, application volume, and audit activity."
        actions={
          <button type="button" className={ghostBtn} onClick={manualRefresh}>
            <RefreshCw className={`h-4 w-4 ${spin ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </button>
        }
      />

      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
        {/* 1. Pipeline funnel + 3. Status distribution */}
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard
            title="Pipeline conversion"
            description="Click a stage to drill into its applicants. Percentages are of Applied."
            icon={Filter}
            chipTone="plum"
          >
            <div className="space-y-1">
              {funnel.map((f) => {
                const active = drill === f.stage;
                return (
                  <button
                    key={f.stage}
                    type="button"
                    className={`focus-ring w-full rounded-none px-3 py-3 text-left transition-colors min-h-[44px] ${
                      active ? "bg-fog ring-1 ring-ink/20" : "hover:bg-fog/60"
                    }`}
                    onClick={() => setDrill(drill === f.stage ? "All" : f.stage)}
                    aria-pressed={active}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`stage-dot ${dotClass(STAGE_VARIANT[f.stage])}`} aria-hidden />
                      <span className="flex-1 text-sm text-ink">{f.stage}</span>
                      <span className="num text-sm font-medium text-ink">{f.count}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2.5">
                      <div className="h-1.5 flex-1 overflow-hidden bg-fog shadow-[inset_0_1px_2px_rgba(24,24,37,0.08)]">
                        <div
                          className="h-full"
                          style={{ width: `${Math.min(100, f.pct)}%`, background: STAGE_BAR[f.stage] }}
                        />
                      </div>
                      <span className="num w-10 shrink-0 text-right text-xs text-stone">{f.pct}%</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </SectionCard>

          <div className="space-y-6">
            <SectionCard
              title="Applications per day"
              description="Last 30 days, from the review queue."
              icon={TrendingUp}
              chipTone="plum"
            >
              <div className="mt-2">
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={volume} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                    <defs>
                      <linearGradient id="analytics-volume-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={VIZ_1} stopOpacity={0.12} />
                        <stop offset="100%" stopColor={VIZ_1} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" tick={TICK} tickMargin={8} interval={6} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={TICK} axisLine={false} tickLine={false} />
                    <RTooltip />
                    <Area
                      type="monotone"
                      dataKey="applications"
                      stroke={VIZ_1}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                      fill="url(#analytics-volume-fill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            <SectionCard
              title="Status distribution"
              description="All applications by stored status."
              icon={ChartPieIcon}
              chipTone="plum"
            >
              {donutData.length === 0 ? (
                <EmptyState icon={Inbox} tone="plum" title="No applications recorded yet." compact />
              ) : (
                // minmax(0,1fr): the legend rows' nowrap labels must not floor
                // the 1fr track's auto minimum (observed OV=61 at 1024px).
                <div className="mt-2 grid grid-cols-1 items-center gap-6 sm:grid-cols-[200px_minmax(0,1fr)]">
                  {/* Donut with centered total — the award-dash staple */}
                  <div className="relative mx-auto h-[200px] w-[200px]">
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_rgba(24,24,37,0.05)]"
                    />
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <RTooltip />
                        <Pie
                          data={donutData}
                          dataKey="count"
                          nameKey="status"
                          innerRadius={64}
                          outerRadius={92}
                          paddingAngle={2}
                          cornerRadius={4}
                          strokeWidth={0}
                          startAngle={90}
                          endAngle={-270}
                        >
                          {donutData.map((d) => (
                            <Cell key={d.status} fill={statusSliceColor(d.status)} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 grid place-items-center">
                      <div className="text-center">
                        <p className="num font-display text-[32px] font-semibold leading-none tracking-[-0.02em] text-carbon">
                          {donutTotal}
                        </p>
                        <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-pebble">
                          Applications
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Legend — stage dot + label + count, mirrors funnel rows */}
                  <ul className="space-y-2.5">
                    {donutData.map((d) => (
                      <li key={d.status} className="flex items-center gap-2.5 text-sm">
                        <span
                          aria-hidden
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: statusSliceColor(d.status) }}
                        />
                        <span className="min-w-0 flex-1 truncate text-stone">{d.status}</span>
                        <span className="num font-medium text-ink">{d.count}</span>
                        <span className="num w-12 text-right text-xs text-pebble">
                          {donutTotal > 0 ? `${Math.round((d.count / donutTotal) * 100)}%` : "0%"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </SectionCard>
          </div>
        </div>

        {/* 4. Drill-down */}
        <SectionCard
          title="Drill-down"
          description={drill === "All" ? "All stages." : `Filtered to ${drill}.`}
          icon={UsersRound}
          chipTone="plum"
          actions={
            <>
              <Select value={drill} onValueChange={(v) => setDrill(v as Drill)}>
                <SelectTrigger className="dlg-input min-h-[44px] w-full sm:w-[170px]" aria-label="Stage drill filter">
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
                <SelectTrigger className="dlg-input min-h-[44px] w-full sm:w-[140px]" aria-label="Recruitment cycle">
                  <SelectValue placeholder="All time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-time">All time</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
        >
          {drillRows.length === 0 ? (
            <EmptyState icon={UsersRound} tone="plum" title="No applicants in this selection." compact />
          ) : (
            <div className="max-h-96 space-y-1 overflow-y-auto scroll-thin pr-1">
              {drillRows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="flex min-h-[44px] w-full items-center gap-3 rounded-none p-3 text-left transition-colors hover:bg-fog/60 focus-ring"
                  onClick={() => navigate("candidate", { id: String(r.applicantId) })}
                >
                  <span aria-hidden="true" className="contents">
                    <Monogram size={32} className="rounded-full">{monogramOf(fullName(r.applicant))}</Monogram>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{fullName(r.applicant)}</p>
                    <p className="truncate text-xs text-stone">
                      {r.job.title} · Applied {formatDate(r.dateApplied)}
                    </p>
                  </div>
                  <StatusPill status={getStatusMeta(r.status).label} variant={variantForStatus(r.status)} />
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        {/* 5. Recent activity (audit feed) */}
        <SectionCard
          title="Recent activity"
          description={`${auditTotal} logged event${auditTotal === 1 ? "" : "s"}`}
          icon={History}
          chipTone="plum"
        >
          {audit.length === 0 ? (
            <EmptyState icon={Inbox} tone="plum" title="No audit events recorded yet." compact />
          ) : (
            <div className="max-h-96 space-y-1 overflow-y-auto scroll-thin pr-1">
              {audit.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-none px-3 py-2.5 transition-colors hover:bg-fog/60"
                >
                  <span
                    className={`${pillClass("neutral")} shrink-0 uppercase tracking-[0.06em]`}
                    style={{ fontSize: "10px" }}
                  >
                    {humanize(a.action)}
                  </span>
                  <span className="max-w-[240px] truncate text-[13px] font-medium text-ink">
                    {a.userLabel || "System"}
                  </span>
                  <span className="min-w-[160px] flex-1 truncate text-[13px] text-stone">
                    {a.description || "—"}
                  </span>
                  <span className="num shrink-0 text-xs text-pebble">{timeAgo(a.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
