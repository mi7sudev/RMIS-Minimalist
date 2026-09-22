"use client";

// ============================================================================
// RMIS — Evaluator review queue (spec §7.8). Kanban (default) and List modes
// over /api/evaluator/queue + the applicant roster (people with zero
// applications). 15 s silent poll + focus refresh + manual refresh.
// "Qualified only" lens, stage tabs (list), bulk regret letters with confirm.
// Card / row review actions open the ReviewWorkspace in a Dialog.
// Enterprise polish pass: PageHeader toolbar, stage-dot kanban columns with
// scroll-thin bodies, StatusPill/VerdictPill footers, table-card list with
// hover quick actions, skeleton loading. Handlers unchanged.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowUpRight, Inbox, LayoutGrid, List, MailX, RefreshCw, UserRound,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState, PageHeader, SkeletonKanban, SkeletonRows } from "@/components/ui/shell";
import { apiFetch, formatDate, fullName, humanize } from "@/lib/client";
import { PIPELINE_STAGES, stageForStatus, type StageKey } from "@/lib/status";
import { dotClass, variantForCompletion, type StatusVariant } from "@/lib/status-ui";
import { navigate } from "@/lib/router";
import { ReviewWorkspace, StatusPill, VerdictPill } from "@/components/views/review-workspace";

// ── Wire shapes ─────────────────────────────────────────────────────────────

type QueueRow = {
  id: number;
  status: string;
  stage: StageKey;
  reason: string | null;
  dateApplied: string;
  applicantId: number;
  jobId: number;
  applicant: {
    id: number;
    firstName: string | null;
    lastName: string | null;
    emailAddress: string | null;
    contactNumber: string | null;
    gender: string | null;
    isProfileComplete: boolean;
  };
  job: {
    id: number;
    title: string;
    position: { positionTitle: string; placeOfAssignment: string | null } | null;
  };
  match: { verdict: string; metCount: number; requiredCount: number };
};

type RosterRow = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  emailAddress: string | null;
  mobileNumber: string | null;
  gender: string | null;
  isProfileComplete: boolean;
  hasAccount: boolean;
  applicationCount: number;
};

type RegretSummary = {
  total: number;
  sent: number;
  alreadySent: number;
  shortlisted: number;
  failed: number;
  notFound: number;
};

// ── Small shared visuals ────────────────────────────────────────────────────

const ghostBtn =
  "dlg-ghost inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-4 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const iconBtn =
  "focus-ring inline-flex h-9 w-9 items-center justify-center rounded-full text-stone transition-colors hover:bg-fog hover:text-ink";

const cardCls =
  "rounded-[12px] border border-border bg-white transition-all duration-200 hover:border-ink/10 hover:shadow-dialog-subtle";

/** Stage → stage-dot variant (Applicants column is neutral). */
const STAGE_DOT: Record<StageKey, StatusVariant> = {
  "Applied": "info",
  "Under Review": "warn",
  "Shortlisted": "ok",
  "Rejected": "bad",
};

function Monogram({ name, className = "" }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      aria-hidden
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fog text-xs font-medium text-ink ${className}`}
    >
      {initials || "?"}
    </span>
  );
}

function useFocusRefresh(fn: () => void) {
  useEffect(() => {
    const onFocus = () => fn();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [fn]);
}

function KanbanColumn({
  label,
  dot,
  count,
  children,
}: {
  label: string;
  dot: StatusVariant;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="w-[260px] min-w-[260px] shrink-0 snap-start lg:w-auto lg:min-w-0">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={dotClass(dot)} aria-hidden />
          <h2 className="truncate text-[13px] font-medium text-ink">{label}</h2>
        </div>
        <span className="status-pill status-neutral num shrink-0">{count}</span>
      </div>
      <div className="max-h-[calc(100vh-330px)] min-h-[200px] space-y-3 overflow-y-auto scroll-thin">{children}</div>
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export default function ReviewQueue() {
  const [queue, setQueue] = useState<QueueRow[] | null>(null);
  const [roster, setRoster] = useState<RosterRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qualifiedOnly, setQualifiedOnly] = useState(false);
  const [mode, setMode] = useState<"kanban" | "list">("kanban");
  const [listStage, setListStage] = useState<"All" | StageKey>("All");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [regretOpen, setRegretOpen] = useState(false);
  const [regretBusy, setRegretBusy] = useState(false);
  const [spin, setSpin] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      const [q, r] = await Promise.all([
        apiFetch<{ data: QueueRow[] }>("/api/evaluator/queue?pageSize=100"),
        apiFetch<{ data: RosterRow[] }>("/api/admin/applicants?pageSize=100"),
      ]);
      setQueue(q.data);
      setRoster(r.data);
      if (!silent) setError(null);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Failed to load the review queue");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 15 s silent poll + refetch-on-focus (spec §13).
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) void load(true);
    }, 15_000);
    return () => clearInterval(id);
  }, [load]);
  useFocusRefresh(() => void load(true));

  const manualRefresh = useCallback(() => {
    setSpin(true);
    void load(true).finally(() => setTimeout(() => setSpin(false), 500));
  }, [load]);

  const applications = useMemo(() => queue ?? [], [queue]);
  const filtered = useMemo(
    () => (qualifiedOnly ? applications.filter((r) => r.match?.verdict === "ALL_MET") : applications),
    [applications, qualifiedOnly]
  );
  const listRows = useMemo(
    () => (listStage === "All" ? filtered : filtered.filter((r) => stageForStatus(r.status) === listStage)),
    [filtered, listStage]
  );
  const rejectedIds = useMemo(
    () => filtered.filter((r) => stageForStatus(r.status) === "Rejected").map((r) => r.id),
    [filtered]
  );

  const kanbanColumns = useMemo(() => {
    const map: Record<StageKey, QueueRow[]> = { "Applied": [], "Under Review": [], "Shortlisted": [], "Rejected": [] };
    for (const r of filtered) map[stageForStatus(r.status)].push(r);
    return map;
  }, [filtered]);

  const rosterCards = useMemo(() => (roster ?? []).filter((r) => r.applicationCount === 0), [roster]);

  const sendRegrets = async () => {
    setRegretBusy(true);
    try {
      const res = await apiFetch<{ summary: RegretSummary }>("/api/evaluator/applications/regrets", {
        method: "POST",
        body: { applicationIds: rejectedIds },
      });
      const s = res.summary;
      const parts = [
        `${s.sent} sent`,
        `${s.alreadySent} already sent`,
        s.shortlisted ? `${s.shortlisted} shortlisted skipped` : "",
        s.failed ? `${s.failed} failed` : "",
        s.notFound ? `${s.notFound} not found` : "",
      ].filter(Boolean);
      if (s.sent > 0) {
        toast.success(`Regret letters: ${s.sent} sent`, { description: parts.join(" · ") });
      } else {
        toast.info("No new regret letters sent", { description: parts.join(" · ") });
      }
      setRegretOpen(false);
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send regret letters");
    } finally {
      setRegretBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header + toolbar */}
      <PageHeader
        title="Review Queue"
        description="Screen applications, verify minimum qualifications, and advance candidates through the pipeline."
        actions={
          <>
            <span className="status-pill status-neutral num">
              {filtered.length} application{filtered.length === 1 ? "" : "s"}
            </span>
            <label className="focus-ring inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border border-border bg-white px-3.5 text-sm text-stone transition-colors hover:border-ink/10">
              <Switch checked={qualifiedOnly} onCheckedChange={setQualifiedOnly} aria-label="Qualified only" />
              Qualified only
            </label>
            <div className="flex items-center gap-1 rounded-full bg-fog p-1" role="group" aria-label="View mode">
              <button
                type="button"
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors ${mode === "kanban" ? "bg-ink text-white" : "text-stone hover:text-ink"}`}
                onClick={() => setMode("kanban")}
                aria-pressed={mode === "kanban"}
              >
                <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
                Kanban
              </button>
              <button
                type="button"
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors ${mode === "list" ? "bg-ink text-white" : "text-stone hover:text-ink"}`}
                onClick={() => setMode("list")}
                aria-pressed={mode === "list"}
              >
                <List className="h-3.5 w-3.5" aria-hidden />
                List
              </button>
            </div>
            <button type="button" className={ghostBtn} onClick={manualRefresh}>
              <RefreshCw className={`h-4 w-4 ${spin ? "animate-spin" : ""}`} aria-hidden />
              Refresh
            </button>
          </>
        }
      />

      {/* Stage tabs (list mode only) */}
      {mode === "list" && (
        <div className="flex flex-wrap items-center gap-2">
          {(["All", ...PIPELINE_STAGES] as const).map((s) => {
            const count = s === "All" ? filtered.length : filtered.filter((r) => stageForStatus(r.status) === s).length;
            const active = listStage === s;
            return (
              <button
                key={s}
                type="button"
                className={`inline-flex min-h-[36px] items-center gap-2 rounded-full px-3.5 text-xs font-medium transition-colors ${active ? "bg-ink text-white" : "dlg-ghost"}`}
                onClick={() => setListStage(s)}
                aria-pressed={active}
              >
                {s !== "All" && <span className={dotClass(STAGE_DOT[s])} aria-hidden />}
                {s}
                <span className={`num rounded-full px-1.5 ${active ? "bg-white/20" : "bg-fog"}`}>{count}</span>
              </button>
            );
          })}
          {listStage === "Rejected" && rejectedIds.length > 0 && (
            <button
              type="button"
              className={ghostBtn + " border-[var(--bad)]/30 text-[var(--bad)]"}
              onClick={() => setRegretOpen(true)}
            >
              <MailX className="h-4 w-4" aria-hidden />
              Send regret letters ({rejectedIds.length})
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="dlg-card space-y-4 p-8 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-[var(--bad)]" aria-hidden />
          <p className="text-sm text-stone">{error}</p>
          <button type="button" className={ghostBtn} onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {!error && (queue === null || roster === null) && (
        mode === "kanban" ? <SkeletonKanban columns={5} /> : <SkeletonRows rows={8} rowClassName="h-16" />
      )}

      {/* Kanban */}
      {!error && queue !== null && roster !== null && mode === "kanban" && (
        <div className="flex snap-x snap-proximity gap-4 overflow-x-auto scroll-thin pb-2 lg:grid lg:grid-cols-5 lg:overflow-visible lg:pb-0">
          {/* Applicants column (roster) */}
          <KanbanColumn label="Applicants" dot="neutral" count={rosterCards.length}>
            {rosterCards.length === 0 ? (
              <EmptyState icon={Inbox} title="No applicants" description="Registered applicants waiting to apply appear here." compact />
            ) : (
              rosterCards.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={cardCls + " focus-ring w-full cursor-pointer p-4 text-left"}
                  onClick={() => navigate("candidate", { id: String(r.id) })}
                >
                  <div className="flex items-start gap-2.5">
                    <Monogram name={fullName(r)} />
                    <div className="min-w-0 flex-1">
                      <p className="min-w-0 truncate text-sm font-medium text-ink">{fullName(r)}</p>
                      <p className="mt-0.5 truncate text-xs text-stone">{r.emailAddress || "No email on record"}</p>
                    </div>
                    <UserRound className="h-4 w-4 shrink-0 text-pebble" aria-hidden />
                  </div>
                  <div className="mt-2.5">
                    <StatusPill
                      status={r.isProfileComplete ? "Profile complete" : "Profile incomplete"}
                      variant={variantForCompletion(r.isProfileComplete)}
                    />
                  </div>
                </button>
              ))
            )}
          </KanbanColumn>

          {/* Pipeline columns */}
          {PIPELINE_STAGES.map((stage) => {
            const rows = kanbanColumns[stage];
            return (
              <KanbanColumn key={stage} label={stage} dot={STAGE_DOT[stage]} count={rows.length}>
                {rows.length === 0 ? (
                  <EmptyState icon={Inbox} title="No applications" description="Nothing in this stage right now." compact />
                ) : (
                  rows.map((row) => {
                    const position = row.job.position?.positionTitle || row.job.title;
                    const place = row.job.position?.placeOfAssignment ?? null;
                    return (
                      <div
                        key={row.id}
                        role="button"
                        tabIndex={0}
                        className={cardCls + " focus-ring cursor-pointer p-4"}
                        onClick={() => setSelectedId(row.id)}
                        onKeyDown={(e) => e.key === "Enter" && setSelectedId(row.id)}
                        aria-label={`Review application from ${fullName(row.applicant)}`}
                      >
                        <div className="flex items-start gap-2.5">
                          <Monogram name={fullName(row.applicant)} />
                          <div className="min-w-0 flex-1">
                            <p className="min-w-0 truncate text-sm font-medium text-ink">{fullName(row.applicant)}</p>
                            <p className="num mt-0.5 text-xs text-pebble">Applied {formatDate(row.dateApplied)}</p>
                          </div>
                          <button
                            type="button"
                            className={iconBtn + " -mr-1.5 -mt-1 h-8 w-8 shrink-0"}
                            aria-label={`Open ${fullName(row.applicant)}'s profile`}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate("candidate", { id: String(row.applicantId) });
                            }}
                          >
                            <UserRound className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                        <p className="mt-1 truncate text-xs text-stone">
                          {[humanize(position), place].filter(Boolean).join(" · ")}
                        </p>
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          <StatusPill status={row.status} />
                          <VerdictPill verdict={row.match?.verdict} />
                        </div>
                      </div>
                    );
                  })
                )}
              </KanbanColumn>
            );
          })}
        </div>
      )}

      {/* List */}
      {!error && queue !== null && roster !== null && mode === "list" && (
        <div className="space-y-3">
          {listRows.length === 0 ? (
            <div className="dlg-card py-6">
              <EmptyState
                icon={Inbox}
                title="No applications in the queue"
                description={listStage === "All" ? "Applications appear here once candidates apply." : `No applications in the ${listStage} stage yet.`}
              />
            </div>
          ) : (
            <div className="dlg-card overflow-hidden">
              <div className="overflow-x-auto scroll-thin">
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th scope="col" className="px-5 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-stone">Candidate</th>
                      <th scope="col" className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-stone">Position</th>
                      <th scope="col" className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-stone">Applied</th>
                      <th scope="col" className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-stone">Status</th>
                      <th scope="col" className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-stone">Verdict</th>
                      <th scope="col" className="px-4 py-3"><span className="sr-only">Open</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {listRows.map((row) => {
                      const decided = stageForStatus(row.status) === "Shortlisted" || stageForStatus(row.status) === "Rejected";
                      const position = row.job.position?.positionTitle || row.job.title;
                      const place = row.job.position?.placeOfAssignment ?? null;
                      const name = fullName(row.applicant);
                      return (
                        <tr key={row.id} className="group/row border-b border-border transition-colors last:border-0 hover:bg-fog/60">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <Monogram name={name} />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-ink">{name}</p>
                                <p className="truncate text-xs text-stone">{row.applicant.emailAddress || "No email on record"}</p>
                              </div>
                            </div>
                          </td>
                          <td className="max-w-[220px] px-4 py-3">
                            <p className="truncate text-[13px] text-ink">{humanize(position)}</p>
                            <p className="truncate text-xs text-stone">{place || "—"}</p>
                          </td>
                          <td className="num whitespace-nowrap px-4 py-3 text-[13px] text-stone">{formatDate(row.dateApplied)}</td>
                          <td className="px-4 py-3"><StatusPill status={row.status} /></td>
                          <td className="px-4 py-3"><VerdictPill verdict={row.match?.verdict} /></td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100 max-lg:opacity-100">
                              <button
                                type="button"
                                className={iconBtn}
                                aria-label={decided ? `View decision for ${name}` : `Review application from ${name}`}
                                title={decided ? "View decision" : "Review"}
                                onClick={() => setSelectedId(row.id)}
                              >
                                <ArrowUpRight className="h-4 w-4" aria-hidden />
                              </button>
                              <button
                                type="button"
                                className={iconBtn}
                                aria-label={`Open ${name}'s profile`}
                                title="Open profile"
                                onClick={() => navigate("candidate", { id: String(row.applicantId) })}
                              >
                                <UserRound className="h-4 w-4" aria-hidden />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Review modal */}
      <Dialog open={selectedId !== null} onOpenChange={(v) => !v && setSelectedId(null)}>
        <DialogContent className="sm:max-w-6xl w-[min(96vw,1152px)] max-h-[92vh] overflow-y-auto scroll-thin">
          <DialogHeader className="sr-only">
            <DialogTitle>Review application</DialogTitle>
            <DialogDescription>Applicant dossier and decision rail</DialogDescription>
          </DialogHeader>
          {selectedId !== null && (
            <ReviewWorkspace
              applicationId={selectedId}
              onClose={() => setSelectedId(null)}
              onDecided={() => void load(true)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk regret confirm */}
      <AlertDialog open={regretOpen} onOpenChange={setRegretOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send {rejectedIds.length} regret letter{rejectedIds.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Formal regret emails will be sent to every rejected-stage application currently filtered. Shortlisted
              applications are hard-skipped, and applicants who already received a letter are not emailed again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="border border-[var(--bad)]/30 bg-[var(--bad-bg)] text-[var(--bad)] hover:bg-[var(--bad-bg)]/80"
              onClick={(e) => {
                e.preventDefault();
                void sendRegrets();
              }}
            >
              {regretBusy ? "Sending…" : "Send letters"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
