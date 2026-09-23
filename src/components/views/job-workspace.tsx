"use client";

// ============================================================================
// RMIS — Job workspace (spec §7.10, `#/job?id=<id>&tab=`). Header with
// count-aware delete confirm, edit dialog; Overview (safe-rendered rich text +
// sticky summary + mini pipeline), Pipeline kanban, Candidates — all from the
// evaluator queue filtered to this job.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, Building2, ChevronLeft, ClipboardList, Clock, FileText,
  KanbanSquare, MapPin, Pencil, RefreshCw, Trash2,
} from "lucide-react";
import { IconChip, Monogram, SectionCard, StatusPill } from "@/components/ui/shell";
import {
  KanbanAvatar, KanbanColumn, KanbanTags, KANBAN_CARD, KANBAN_DIVIDER, MatchBadge,
} from "@/components/ui/kanban";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiFetch, appliedAgo, deadlineState, formatCurrency, formatDate, fullName, humanize } from "@/lib/client";
import { PIPELINE_STAGES, stageForStatus, getStatusMeta, type StageKey } from "@/lib/status";
import { navigate, useHashRoute, type JobWire, type ApplicantMini } from "@/lib/router";
import { dotClass, variantForJobStatus, variantForStatus, type StatusVariant } from "@/lib/status-ui";
import { cn } from "@/lib/utils";
import { JobFormDialog, ghostBtn, ghostBadBtn, ctaBtn, iconBtn } from "@/components/views/recruitment";

type QueueRow = {
  id: number;
  status: string;
  stage: StageKey;
  dateApplied: string;
  applicantId: number;
  applicant: ApplicantMini;
  job: { id: number; title: string; position: { positionTitle: string; placeOfAssignment: string | null } | null };
  match: { verdict: string; metCount: number; requiredCount: number };
  tags: string[];
};

const TABS = ["overview", "pipeline", "candidates"] as const;
type TabKey = (typeof TABS)[number];

/** Functional color variant (matches the analytics funnel bars + overview dots). */
const STAGE_VARIANT: Record<StageKey, StatusVariant> = {
  "Applied": "info",
  "Under Review": "warn",
  "Shortlisted": "ok",
  "Rejected": "bad",
};

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

function RichSection({ title, html, text }: { title: string; html: string | null; text: string | null }) {
  if (!html && !text) return null;
  return (
    <section>
      <h3 className="text-[15px] font-medium leading-6 text-ink">{title}</h3>
      {html ? (
        <div className="rich-text text-sm text-stone mt-2" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="text-sm text-stone mt-2 whitespace-pre-line">{text}</p>
      )}
    </section>
  );
}

function JobStatusPill({ job, overdue }: { job: JobWire; overdue: boolean }) {
  const open = job.isActive && !overdue;
  return (
    <StatusPill
      status={open ? "OPEN" : "CLOSED"}
      variant={variantForJobStatus(open ? "OPEN" : "CLOSED")}
    />
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
      {/* Header — PageHeader pattern with back affordance */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-start gap-1.5">
          <button
            type="button"
            aria-label="Back to jobs"
            title="Back to jobs"
            className="focus-ring -ml-2 mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-stone transition-colors hover:bg-fog hover:text-ink"
            onClick={() => navigate("recruitment")}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <div className="min-w-0 flex items-center gap-3">
            <span aria-hidden="true" className="contents">
              <Monogram warm size={44} className="max-sm:hidden">M</Monogram>
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display text-heading-md truncate">{job.title}</h1>
                <JobStatusPill job={job} overdue={dl.overdue} />
              </div>
              <p className="mt-1.5 text-sm leading-5 text-stone">{vitals || "—"}</p>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button type="button" className={cn(iconBtn, "h-9 w-9")} onClick={manualRefresh} aria-label="Refresh" title="Refresh">
            <RefreshCw className={`h-4 w-4 ${spin ? "animate-spin" : ""}`} aria-hidden />
          </button>
          <button type="button" className={ghostBtn} onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" aria-hidden />
            Edit
          </button>
          <button type="button" className={ghostBadBtn} onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4" aria-hidden />
            Delete
          </button>
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
            <SectionCard bodyClassName="space-y-6" title="Posting description" icon={FileText} chipTone="plum">
              <RichSection title="Brief description" html={job.briefDescriptionHtml} text={job.briefDescription} />
              <RichSection title="Duties & responsibilities" html={job.dutiesHtml} text={job.dutiesResponsibilities} />
              <RichSection title="Compensation package" html={job.compensationHtml} text={job.compensationPackage} />
              <RichSection title="Other qualifications" html={job.otherQualificationsHtml} text={job.otherQualifications} />
              {!job.briefDescriptionHtml && !job.briefDescription && !job.dutiesHtml && !job.dutiesResponsibilities && !job.compensationHtml && !job.compensationPackage && !job.otherQualificationsHtml && !job.otherQualifications && (
                <p className="text-sm text-pebble text-center py-6">No description published for this posting.</p>
              )}
            </SectionCard>

            {/* Sticky summary */}
            <div className="space-y-4 self-start xl:sticky xl:top-6">
              <SectionCard title="Summary" icon={ClipboardList} chipTone="slate">
                <dl>
                  {(
                    [
                      ["Vacancies", <span key="v" className="num text-sm font-medium text-ink">{job.numberOfVacancy}</span>],
                      ["Monthly salary", <span key="s" className="num text-sm font-medium text-ink">{salary ?? "—"}</span>],
                      ["SG · step", <span key="g" className="text-sm font-medium text-ink">{sgStep || "—"}</span>],
                      ["Applications", <span key="a" className="num text-sm font-medium text-ink">{apps.length}</span>],
                      ["Published", <span key="p" className="num text-sm font-medium text-ink">{formatDate(job.publishDate)}</span>],
                      [
                        "Deadline",
                        <span key="d" className={`num text-sm font-medium ${dl.overdue ? "text-[var(--bad)]" : "text-ink"}`}>
                          {formatDate(job.deadlineDate)}
                          {dl.overdue ? " · closed" : ""}
                        </span>,
                      ],
                      ["Processing", <span key="pr" className="num text-sm font-medium text-ink">{formatDate(job.processingDate)}</span>],
                    ] as [string, React.ReactNode][]
                  ).map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3 border-b border-[#ececec] py-2 last:border-0">
                      <dt className="text-xs text-stone">{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </SectionCard>

              {/* Mini pipeline */}
              <SectionCard title="Pipeline" icon={KanbanSquare} chipTone="amber">
                <div className="space-y-1">
                  {PIPELINE_STAGES.map((stage) => (
                    <div key={stage} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="flex items-center gap-2.5 text-xs text-stone">
                        <span className={`stage-dot ${dotClass(STAGE_VARIANT[stage])}`} aria-hidden />
                        {stage}
                      </span>
                      <span className="num text-sm font-medium text-ink">{pipeline[stage].length}</span>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>
          </div>
        </TabsContent>

        {/* Pipeline — reference board: bordered columns with dot + label + count headers */}
        <TabsContent value="pipeline" className="mt-4">
          <div className="flex snap-x snap-proximity items-stretch gap-4 overflow-x-auto scroll-thin pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible lg:pb-0">
            {PIPELINE_STAGES.map((stage) => {
              const rows = pipeline[stage];
              return (
                <KanbanColumn key={stage} label={stage} stage={stage} count={rows.length}>
                  {rows.length === 0 ? (
                    <p className="px-1 py-3 text-xs text-pebble">No applications in this stage.</p>
                  ) : (
                    rows.map((app) => {
                      const position = app.job.position?.positionTitle || app.job.title;
                      const place = app.job.position?.placeOfAssignment ?? null;
                      const name = fullName(app.applicant);
                      return (
                        <button
                          key={app.id}
                          type="button"
                          className={KANBAN_CARD + " focus-ring w-full cursor-pointer p-4 text-left"}
                          onClick={() => navigate("evaluator-review", { id: String(app.id) })}
                          aria-label={`Review application from ${name}`}
                        >
                          <div className="flex items-start gap-2.5">
                            <KanbanAvatar name={name} />
                            <div className="min-w-0 flex-1">
                              <p className="min-w-0 truncate text-sm font-semibold text-ink">{name}</p>
                              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-stone">
                                <Building2 className="h-3.5 w-3.5 shrink-0 text-pebble" aria-hidden />
                                <span className="min-w-0 flex-1 truncate">{humanize(position)}</span>
                              </p>
                              <p className="mt-1 flex items-center gap-1.5 text-xs text-stone">
                                {place && (
                                  <>
                                    <MapPin className="h-3.5 w-3.5 shrink-0 text-pebble" aria-hidden />
                                    <span className="min-w-0 truncate">{place}</span>
                                    <span className="shrink-0 text-pebble" aria-hidden>·</span>
                                  </>
                                )}
                                <Clock className="h-3.5 w-3.5 shrink-0 text-pebble" aria-hidden />
                                <span className="shrink-0 whitespace-nowrap text-pebble">Applied {appliedAgo(app.dateApplied)}</span>
                              </p>
                            </div>
                            <MatchBadge metCount={app.match?.metCount ?? 0} requiredCount={app.match?.requiredCount ?? 0} />
                          </div>
                          {(app.tags ?? []).length > 0 && (
                            <div className={KANBAN_DIVIDER}>
                              <KanbanTags tags={app.tags ?? []} />
                            </div>
                          )}
                        </button>
                      );
                    })
                  )}
                </KanbanColumn>
              );
            })}
          </div>
        </TabsContent>

        {/* Candidates */}
        <TabsContent value="candidates" className="mt-4">
          <div className="space-y-2">
            {apps.length === 0 ? (
              <div className="dlg-card p-6">
                <p className="text-sm text-pebble text-center py-6">No applications for this posting yet.</p>
              </div>
            ) : (
              apps.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  className="dlg-card-plain lift min-h-[44px] w-full rounded-[12px] border border-[#ececec] p-4 flex items-center gap-3 text-left transition-shadow duration-200 hover:shadow-dialog-subtle focus-ring"
                  onClick={() => navigate("candidate", { id: String(app.applicantId) })}
                >
                  <span aria-hidden="true" className="contents">
                    <Monogram size={36}>{monogramOf(fullName(app.applicant))}</Monogram>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink truncate">{fullName(app.applicant)}</p>
                    <p className="text-xs text-stone mt-0.5">
                      {humanize(app.job.title)} · Applied {formatDate(app.dateApplied)}
                    </p>
                  </div>
                  <StatusPill status={getStatusMeta(app.status).label} variant={variantForStatus(app.status)} />
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
              className="rounded-full border border-[var(--bad)]/30 bg-white text-[var(--bad)] hover:bg-[var(--bad-bg)]"
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
