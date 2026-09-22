"use client";

// ============================================================================
// RMIS — Evaluator review queue (spec §7.8). Kanban (default) and List modes
// over /api/evaluator/queue + the applicant roster (people with zero
// applications). 15 s silent poll + focus refresh + manual refresh.
// "Qualified only" lens, stage tabs (list), bulk regret letters with confirm.
// Card / row review actions open the ReviewWorkspace in a Dialog.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, Eye, LayoutGrid, List, MailX, RefreshCw, UserRound,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, formatDate, fullName, humanize } from "@/lib/client";
import { PIPELINE_STAGES, stageForStatus, type StageKey } from "@/lib/status";
import { navigate } from "@/lib/router";
import { ReviewWorkspace, StatusPill } from "@/components/views/review-workspace";

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

function verdictChip(verdict: string | undefined): { label: string; cls: string } | null {
  switch (verdict) {
    case "ALL_MET":
      return { label: "Qualified", cls: "bg-ink text-white" };
    case "PARTIAL":
      return { label: "Partial", cls: "bg-fog text-ink" };
    case "NONE_MET":
      return { label: "Not qualified", cls: "bg-dusty-rose/15 text-dusty-rose" };
    case "NEEDS_REVIEW":
      return { label: "Verify", cls: "bg-fog text-ink" };
    case "NO_REQUIREMENTS":
      return { label: "No reqs", cls: "bg-fog text-stone" };
    default:
      return null;
  }
}

function Monogram({ name, className = "" }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fog text-xs font-medium text-ink ${className}`}>
      {initials || "?"}
    </span>
  );
}

function CardVerdictChip({ row }: { row: QueueRow }) {
  const chip = verdictChip(row.match?.verdict);
  if (!chip) return null;
  return <span className={`rounded-full px-2 py-0.5 text-xs shrink-0 ${chip.cls}`}>{chip.label}</span>;
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
      {/* Toolbar */}
      <div className="dlg-card p-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-2xl text-ink">Review queue</h1>
          <span className="rounded-full bg-fog text-ink text-xs px-2.5 py-1">
            {filtered.length} application{filtered.length === 1 ? "" : "s"}
          </span>
        </div>

        <label className="flex items-center gap-2 text-sm text-stone cursor-pointer">
          <Switch checked={qualifiedOnly} onCheckedChange={setQualifiedOnly} aria-label="Qualified only" />
          Qualified only
        </label>

        <div className="flex items-center gap-1 rounded-full bg-fog p-1">
          <button
            type="button"
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-xs font-medium ${mode === "kanban" ? "bg-ink text-white" : "text-stone hover:text-ink"}`}
            onClick={() => setMode("kanban")}
            aria-pressed={mode === "kanban"}
          >
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
            Kanban
          </button>
          <button
            type="button"
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-xs font-medium ${mode === "list" ? "bg-ink text-white" : "text-stone hover:text-ink"}`}
            onClick={() => setMode("list")}
            aria-pressed={mode === "list"}
          >
            <List className="h-3.5 w-3.5" aria-hidden />
            List
          </button>
        </div>

        {mode === "list" && listStage === "Rejected" && rejectedIds.length > 0 && (
          <button type="button" className={ghostBtn + " text-dusty-rose"} onClick={() => setRegretOpen(true)}>
            <MailX className="h-4 w-4" aria-hidden />
            Send regret letters ({rejectedIds.length})
          </button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <button type="button" className={ghostBtn} onClick={manualRefresh}>
            <RefreshCw className={`h-4 w-4 ${spin ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </button>
        </div>
      </div>

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
                className={`inline-flex min-h-[36px] items-center gap-2 rounded-full px-3.5 text-xs font-medium ${active ? "bg-ink text-white" : "dlg-ghost"}`}
                onClick={() => setListStage(s)}
                aria-pressed={active}
              >
                {s}
                <span className={`rounded-full px-1.5 ${active ? "bg-white/20" : "bg-fog"}`}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="dlg-card p-8 text-center space-y-4">
          <AlertTriangle className="h-8 w-8 text-dusty-rose mx-auto" aria-hidden />
          <p className="text-sm text-stone">{error}</p>
          <button type="button" className={ghostBtn} onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {!error && (queue === null || roster === null) && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-[12px]" />
            ))}
          </div>
        </div>
      )}

      {/* Kanban */}
      {!error && queue !== null && roster !== null && mode === "kanban" && (
        <div className="flex gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-5 lg:overflow-visible">
          {/* Applicants column (roster) */}
          <div className="w-[260px] shrink-0 lg:w-auto lg:min-w-0">
            <div className="flex items-center justify-between px-1 pb-2">
              <h2 className="text-sm font-medium text-ink">Applicants</h2>
              <span className="rounded-full bg-fog text-stone text-xs px-2 py-0.5">{rosterCards.length}</span>
            </div>
            <div className="space-y-2">
              {rosterCards.length === 0 ? (
                <p className="text-xs text-pebble px-1 py-3">No registered applicants waiting to apply.</p>
              ) : (
                rosterCards.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="dlg-card-plain border border-[#ececec] rounded-[12px] p-3 w-full text-left hover:shadow-md transition-shadow min-h-[44px]"
                    onClick={() => navigate("candidate", { id: String(r.id) })}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm text-ink truncate">{fullName(r)}</span>
                      <UserRound className="h-4 w-4 text-pebble shrink-0" aria-hidden />
                    </div>
                    <p className="text-xs text-stone mt-1 truncate">{r.emailAddress || "No email on record"}</p>
                    <p className="text-xs text-pebble mt-0.5">
                      {r.isProfileComplete ? "Profile complete" : "Profile incomplete"}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Pipeline columns */}
          {PIPELINE_STAGES.map((stage) => {
            const rows = kanbanColumns[stage];
            return (
              <div key={stage} className="w-[260px] shrink-0 lg:w-auto lg:min-w-0">
                <div className="flex items-center justify-between px-1 pb-2">
                  <h2 className="text-sm font-medium text-ink">{stage}</h2>
                  <span className="rounded-full bg-fog text-stone text-xs px-2 py-0.5">{rows.length}</span>
                </div>
                <div className="space-y-2">
                  {rows.length === 0 ? (
                    <p className="text-xs text-pebble px-1 py-3">No applications in this stage.</p>
                  ) : (
                    rows.map((row) => {
                      const position = row.job.position?.positionTitle || row.job.title;
                      const place = row.job.position?.placeOfAssignment ?? null;
                      return (
                        <div
                          key={row.id}
                          role="button"
                          tabIndex={0}
                          className="dlg-card-plain border border-[#ececec] rounded-[12px] p-3 cursor-pointer hover:shadow-md transition-shadow"
                          onClick={() => setSelectedId(row.id)}
                          onKeyDown={(e) => e.key === "Enter" && setSelectedId(row.id)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-sm text-ink truncate">{fullName(row.applicant)}</span>
                            <button
                              type="button"
                              className="shrink-0 -mt-0.5 -mr-0.5 p-1.5 rounded-full text-pebble hover:text-ink hover:bg-fog"
                              aria-label="Open profile"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate("candidate", { id: String(row.applicantId) });
                              }}
                            >
                              <UserRound className="h-4 w-4" aria-hidden />
                            </button>
                          </div>
                          <p className="text-xs text-stone mt-1 truncate">
                            {[humanize(position), place].filter(Boolean).join(" · ")}
                          </p>
                          <p className="text-xs text-pebble mt-0.5">Applied {formatDate(row.dateApplied)}</p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            <StatusPill status={row.status} />
                            <CardVerdictChip row={row} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List */}
      {!error && queue !== null && roster !== null && mode === "list" && (
        <div className="space-y-3">
          {listRows.length === 0 ? (
            <div className="dlg-card p-8 text-center">
              <p className="text-sm text-pebble">No applications {listStage === "All" ? "in the queue" : `in the ${listStage} stage`} yet.</p>
            </div>
          ) : (
            listRows.map((row, i) => {
              const decided = stageForStatus(row.status) === "Shortlisted" || stageForStatus(row.status) === "Rejected";
              const position = row.job.position?.positionTitle || row.job.title;
              const place = row.job.position?.placeOfAssignment ?? null;
              return (
                <div
                  key={row.id}
                  className="dlg-card-plain border border-[#ececec] rounded-[12px] p-4 flex flex-wrap items-center gap-3 sm:flex-nowrap"
                >
                  <span className="text-xs text-pebble w-6 shrink-0 tabular-nums">{i + 1}</span>
                  <Monogram name={fullName(row.applicant)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-ink truncate">{fullName(row.applicant)}</span>
                      <StatusPill status={row.status} />
                    </div>
                    <p className="text-xs text-stone mt-0.5 truncate">
                      {[humanize(position), place].filter(Boolean).join(" · ")} · Applied {formatDate(row.dateApplied)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" className={ghostBtn} onClick={() => setSelectedId(row.id)}>
                      <Eye className="h-4 w-4" aria-hidden />
                      {decided ? "View Decision" : "Review"}
                    </button>
                    <button
                      type="button"
                      className={ghostBtn}
                      onClick={() => navigate("candidate", { id: String(row.applicantId) })}
                    >
                      Profile
                    </button>
                  </div>
                </div>
              );
            })
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
              className="bg-dusty-rose/10 text-dusty-rose hover:bg-dusty-rose/20"
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
