"use client";

// ============================================================================
// RMIS — Job workspace (spec §7.10, `#/job?id=<id>&tab=`). Header with
// count-aware delete confirm, edit dialog; Overview (safe-rendered rich text +
// sticky summary + mini pipeline), Pipeline kanban, Candidates — all from the
// evaluator queue filtered to this job.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiFetch, deadlineState, formatCurrency, formatDate, fullName, humanize } from "@/lib/client";
import { PIPELINE_STAGES, stageForStatus, getStatusMeta, type StageKey } from "@/lib/status";
import { navigate, useHashRoute, type JobWire, type ApplicantMini } from "@/lib/router";
import { JobFormDialog, ghostBtn, ctaBtn } from "@/components/views/recruitment";

type QueueRow = {
  id: number;
  status: string;
  stage: StageKey;
  dateApplied: string;
  applicantId: number;
  applicant: ApplicantMini;
  job: { id: number; title: string };
  match: { verdict: string; metCount: number; requiredCount: number };
};

const TABS = ["overview", "pipeline", "candidates"] as const;
type TabKey = (typeof TABS)[number];

function OpenClosedPill({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${active ? "bg-ink text-white" : "bg-fog text-stone"}`}>
      {active ? "OPEN" : "CLOSED"}
    </span>
  );
}

function RichSection({ title, html, text }: { title: string; html: string | null; text: string | null }) {
  if (!html && !text) return null;
  return (
    <section>
      <h3 className="font-display text-lg text-ink">{title}</h3>
      {html ? (
        <div className="rich-text text-sm text-stone mt-2" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="text-sm text-stone mt-2 whitespace-pre-line">{text}</p>
      )}
    </section>
  );
}

function Monogram({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fog text-xs font-medium text-ink">
      {initials || "?"}
    </span>
  );
}

export default function JobWorkspace() {
  const { params } = useHashRoute();
  const id = Number(params.id);
  const valid = Number.isInteger(id) && id > 0;
  const rawTab = (params.tab || "overview") as TabKey;
  const tab: TabKey = TABS.includes(rawTab) ? rawTab : "overview";

  const [job, setJob] = useState<JobWire | null>(null);
  const [queue, setQueue] = useState<QueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [spin, setSpin] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!valid) return;
      if (!silent) setError(null);
      try {
        const [jobs, q] = await Promise.all([
          apiFetch<JobWire[]>("/api/jobs?limit=200"),
          apiFetch<{ data: QueueRow[] }>("/api/evaluator/queue?pageSize=100"),
        ]);
        setJob(jobs.find((j) => j.id === id) ?? null);
        setQueue(q.data.filter((r) => r.job?.id === id));
      } catch (e) {
        if (!silent) setError(e instanceof Error ? e.message : "Failed to load the job posting");
      }
    },
    [id, valid]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) void load(true);
    }, 30_000);
    return () => clearInterval(timer);
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

  const apps = useMemo(() => queue ?? [], [queue]);
  const pipeline = useMemo(() => {
    const map: Record<StageKey, QueueRow[]> = { "Applied": [], "Under Review": [], "Shortlisted": [], "Rejected": [] };
    for (const r of apps) map[stageForStatus(r.status)].push(r);
    return map;
  }, [apps]);

  const deleteJob = async () => {
    if (!job) return;
    setDeleteBusy(true);
    try {
      await apiFetch(`/api/jobs/${job.id}?scope=all`, { method: "DELETE" });
      toast.success("Job posting deleted", {
        description: apps.length > 0 ? `${apps.length} linked application(s) and their snapshots were removed.` : undefined,
      });
      setDeleteOpen(false);
      navigate("recruitment");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete the job posting");
    } finally {
      setDeleteBusy(false);
    }
  };

  const manualRefresh = useCallback(() => {
    setSpin(true);
    void load(true).finally(() => setTimeout(() => setSpin(false), 500));
  }, [load]);

  if (!valid) {
    return (
      <div className="dlg-card p-8 text-center space-y-3">
        <p className="text-sm text-stone">No job selected.</p>
        <button type="button" className={ctaBtn} onClick={() => navigate("recruitment")}>
          Go to recruitment
        </button>
      </div>
    );
  }

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

  if (!job) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-64 w-full rounded-[24px]" />
      </div>
    );
  }

  const pos = job.position;
  const dl = deadlineState(job.deadlineDate);
  const vitals = [job.positionType, pos?.itemNumber, pos?.placeOfAssignment, pos?.division].filter(Boolean).join(" · ");
  const salary =
    pos?.salaryAmount != null
      ? formatCurrency(pos.salaryAmount)
      : null;
  const sgStep = [pos?.salaryGrade, pos?.salaryStep].filter(Boolean).join(" · ");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <button type="button" className={ghostBtn} onClick={() => navigate("recruitment")}>
          ← Back to Recruitment
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-2xl text-ink">{job.title}</h1>
              <OpenClosedPill active={job.isActive && !dl.overdue} />
            </div>
            <p className="text-sm text-stone mt-1">{vitals || "—"}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={ghostBtn} onClick={manualRefresh} aria-label="Refresh">
              <RefreshCw className={`h-4 w-4 ${spin ? "animate-spin" : ""}`} aria-hidden />
            </button>
            <button type="button" className={ghostBtn} onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" aria-hidden />
              Edit
            </button>
            <button type="button" className={ghostBtn + " text-dusty-rose"} onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete
            </button>
          </div>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => navigate("job", { id: String(id), tab: v })}
      >
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="candidates">Candidates</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="mt-4">
          <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
            <div className="dlg-card p-6 space-y-6">
              <RichSection title="Brief description" html={job.briefDescriptionHtml} text={job.briefDescription} />
              <RichSection title="Duties & responsibilities" html={job.dutiesHtml} text={job.dutiesResponsibilities} />
              <RichSection title="Compensation package" html={job.compensationHtml} text={job.compensationPackage} />
              <RichSection title="Other qualifications" html={job.otherQualificationsHtml} text={job.otherQualifications} />
              {!job.briefDescriptionHtml && !job.briefDescription && !job.dutiesHtml && !job.dutiesResponsibilities && !job.compensationHtml && !job.compensationPackage && !job.otherQualificationsHtml && !job.otherQualifications && (
                <p className="text-sm text-pebble text-center py-6">No description published for this posting.</p>
              )}
            </div>

            {/* Sticky summary */}
            <div className="space-y-4 self-start xl:sticky xl:top-6">
              <div className="dlg-card p-4 space-y-2">
                <h3 className="font-display text-lg text-ink">Summary</h3>
                <div className="flex items-center justify-between text-sm py-1.5 border-b border-[#ececec] last:border-0">
                  <span className="text-xs text-stone">Vacancies</span>
                  <span className="text-ink tabular-nums">{job.numberOfVacancy}</span>
                </div>
                <div className="flex items-center justify-between text-sm py-1.5 border-b border-[#ececec] last:border-0">
                  <span className="text-xs text-stone">Monthly salary</span>
                  <span className="text-ink tabular-nums">{salary ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between text-sm py-1.5 border-b border-[#ececec] last:border-0">
                  <span className="text-xs text-stone">SG · step</span>
                  <span className="text-ink">{sgStep || "—"}</span>
                </div>
                <div className="flex items-center justify-between text-sm py-1.5 border-b border-[#ececec] last:border-0">
                  <span className="text-xs text-stone">Applications</span>
                  <span className="text-ink tabular-nums">{apps.length}</span>
                </div>
                <div className="flex items-center justify-between text-sm py-1.5 border-b border-[#ececec] last:border-0">
                  <span className="text-xs text-stone">Published</span>
                  <span className="text-ink">{formatDate(job.publishDate)}</span>
                </div>
                <div className={`flex items-center justify-between text-sm py-1.5 border-b border-[#ececec] last:border-0 ${dl.overdue ? "text-dusty-rose" : ""}`}>
                  <span className="text-xs text-stone">Deadline</span>
                  <span className={dl.overdue ? "text-dusty-rose" : "text-ink"}>
                    {formatDate(job.deadlineDate)}
                    {dl.overdue ? " · closed" : ""}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm py-1.5">
                  <span className="text-xs text-stone">Processing</span>
                  <span className="text-ink">{formatDate(job.processingDate)}</span>
                </div>
              </div>

              {/* Mini pipeline */}
              <div className="dlg-card p-4 space-y-2">
                <h3 className="font-display text-lg text-ink">Pipeline</h3>
                {PIPELINE_STAGES.map((stage) => (
                  <div key={stage} className="flex items-center justify-between text-sm py-1">
                    <span className="flex items-center gap-2 text-stone text-xs">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${stage === "Shortlisted" ? "bg-ink" : stage === "Rejected" ? "bg-dusty-rose" : "bg-pebble"}`}
                        aria-hidden
                      />
                      {stage}
                    </span>
                    <span className="text-ink tabular-nums">{pipeline[stage].length}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Pipeline */}
        <TabsContent value="pipeline" className="mt-4">
          <div className="flex gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible">
            {PIPELINE_STAGES.map((stage) => {
              const rows = pipeline[stage];
              return (
                <div key={stage} className="w-[240px] shrink-0 lg:w-auto lg:min-w-0">
                  <div className="flex items-center justify-between px-1 pb-2">
                    <h2 className="text-sm font-medium text-ink">{stage}</h2>
                    <span className="rounded-full bg-fog text-stone text-xs px-2 py-0.5">{rows.length}</span>
                  </div>
                  <div className="space-y-2">
                    {rows.length === 0 ? (
                      <p className="text-xs text-pebble px-1 py-3">No applications in this stage.</p>
                    ) : (
                      rows.map((app) => (
                        <button
                          key={app.id}
                          type="button"
                          className="dlg-card-plain border border-[#ececec] rounded-[12px] p-3 w-full text-left hover:shadow-md transition-shadow min-h-[44px]"
                          onClick={() => navigate("evaluator-review", { id: String(app.id) })}
                        >
                          <p className="text-sm text-ink truncate">{fullName(app.applicant)}</p>
                          <p className="text-xs text-stone mt-1">
                            Applied {formatDate(app.dateApplied)} · {getStatusMeta(app.status).label}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* Candidates */}
        <TabsContent value="candidates" className="mt-4">
          <div className="space-y-3">
            {apps.length === 0 ? (
              <div className="dlg-card p-10 text-center">
                <p className="text-sm text-pebble">No applications for this posting yet.</p>
              </div>
            ) : (
              apps.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  className="dlg-card-plain border border-[#ececec] rounded-[12px] p-4 w-full flex items-center gap-3 text-left hover:shadow-md transition-shadow min-h-[44px]"
                  onClick={() => navigate("candidate", { id: String(app.applicantId) })}
                >
                  <Monogram name={fullName(app.applicant)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink truncate">{fullName(app.applicant)}</p>
                    <p className="text-xs text-stone mt-0.5">
                      {humanize(app.job.title)} · Applied {formatDate(app.dateApplied)}
                    </p>
                  </div>
                  <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium ${getStatusMeta(app.status).tone === "danger" ? "bg-dusty-rose/15 text-dusty-rose" : getStatusMeta(app.status).tone === "success" ? "bg-ink text-white" : "bg-fog text-ink"}`}>
                    {getStatusMeta(app.status).label}
                  </span>
                </button>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit dialog */}
      <JobFormDialog open={editOpen} onOpenChange={setEditOpen} job={job} onSaved={() => void load(true)} />

      {/* Count-aware delete confirm (spec §6.2 / §7.10) */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this posting?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete “{job.title}”
              {apps.length > 0
                ? ` and its ${apps.length} linked application${apps.length === 1 ? "" : "s"} — including their PDS snapshots.`
                : "."}{" "}
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-dusty-rose/10 text-dusty-rose hover:bg-dusty-rose/20"
              onClick={(e) => {
                e.preventDefault();
                void deleteJob();
              }}
            >
              {deleteBusy ? "Deleting…" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
