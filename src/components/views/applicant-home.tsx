"use client";

// ============================================================================
// RMIS — Applicant home (spec §7.3): PageHeader, "Complete Your Profile"
// banner while incomplete, open-positions pane (deadline not passed, newest
// published first) and the persistent "Your Applications" journey list
// (newest first) with 3-checkpoint status timelines + next-step hints.
// Data: parallel /api/applications + /api/jobs — 15 s silent poll + refetch on
// focus (never flips skeletons or clobbers good data on transient failure).
// Clicking a journey card opens the full Application detail modal (§7.7)
// with Cancel Application while the journey is still at "Submitted".
// Wave-3 premium pass: KPI summary row, tinted IconChips (amber/plum/emerald),
// .dlg-card + .lift surfaces, gold Route journey cards with gradient timeline
// connectors and white-ring pulsing checkpoints, shadow-e4 modal.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Briefcase,
  CalendarDays,
  ClipboardList,
  Inbox,
  MapPin,
  RefreshCw,
  Route,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState, IconChip, PageHeader, SkeletonKpis, SkeletonRows, StatusPill, type ChipTone } from "@/components/ui/shell";
import { apiFetch, deadlineState, formatCurrency, formatDate, humanize } from "@/lib/client";
import { navigate, type ApplicationWire, type JobWire, type PositionWire } from "@/lib/router";
import { currentStageLabel, stageForStatus } from "@/lib/status";
import { cn } from "@/lib/utils";
import { useSession } from "@/components/session-provider";

// ── Small helpers ───────────────────────────────────────────────────────────

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function notRequired(v: string | null | undefined): boolean {
  if (!v) return true;
  const s = v.trim().toLowerCase();
  return s === "" || s === "n/a" || s === "na" || s === "none" || s === "none required" || s === "not required";
}

/** Applicant-facing stage label → functional status variant (§2 status system). */
const STAGE_VARIANT: Record<string, "ok" | "warn" | "bad" | "info"> = {
  Submitted: "info",
  "In Review": "warn",
  Shortlisted: "ok",
  "Not Selected": "bad",
};

function stageVariant(label: string): "ok" | "warn" | "bad" | "info" | "neutral" {
  return STAGE_VARIANT[label] ?? "neutral";
}

/** §7.3 Next Step hint paragraph per pipeline stage. */
function nextStepHint(stage: string): string {
  if (stage === "Rejected")
    return "Your application was not shortlisted. You may apply for other open positions.";
  if (stage === "Shortlisted")
    return "A notice has been sent to your registered email. HR will contact you for the next steps.";
  if (stage === "Under Review") return "HR is currently evaluating your application.";
  return "Your application has been received and is awaiting evaluation.";
}

type CheckpointState = "done" | "current" | "pending" | "failed";

/** Status-colored checkpoint dot resting in a small white ring with a soft
 *  glow (glow ships in the .stage-dot primitives). The current stage gets a
 *  pulsing halo — motion-safe only. */
function CheckpointDot({ state }: { state: CheckpointState }) {
  const dot =
    state === "done"
      ? "dot-ok"
      : state === "current"
        ? "dot-warn"
        : state === "failed"
          ? "dot-bad"
          : "dot-neutral";
  return (
    <span
      className={cn(
        "inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-white shadow-[0_1px_3px_rgba(24,24,37,0.16),0_0_0_1px_rgba(24,24,37,0.05)]",
        state === "current" && "motion-safe:animate-pulse"
      )}
    >
      <span className={cn("stage-dot", dot)} />
    </span>
  );
}

/** 3-checkpoint tracking timeline: Submitted → Review → Decision (§7.3). */
function JourneyTimeline({ status }: { status: string }) {
  const stage = stageForStatus(status);
  const decided = stage === "Shortlisted" || stage === "Rejected";

  const steps: { label: string; short?: string; state: CheckpointState }[] = [
    { label: "Submitted", state: "done" },
    {
      label: "Review",
      state: stage === "Under Review" ? "current" : decided ? "done" : "pending",
    },
    {
      label:
        stage === "Shortlisted" ? "Shortlisted" : stage === "Rejected" ? "Not Shortlisted" : "Awaiting the shortlist decision",
      // Responsive copy swap (3-d, presentation-only): the full label wraps to 4+ lines
      // inside a 3-up timeline at 320px; "Shortlisted"/"Not Shortlisted" stay verbatim.
      short: stage === "Shortlisted" || stage === "Rejected" ? undefined : "Awaiting decision",
      state: stage === "Shortlisted" ? "done" : stage === "Rejected" ? "failed" : "pending",
    },
  ];

  return (
    <div className="mt-3 grid grid-cols-3 gap-1">
      {steps.map((s, i) => {
        const reached = s.state !== "pending";
        return (
          <div key={`${s.label}-${i}`} className="flex flex-col items-center gap-1.5 text-center">
            <div className="flex w-full items-center">
              {/* Traversed connectors pick up a subtle ok→warn gradient tint. */}
              <div
                className={cn(
                  "h-px flex-1",
                  i === 0 ? "bg-transparent" : reached ? "bg-gradient-to-r from-[var(--ok)]/60 to-[var(--warn)]/45" : "bg-divider"
                )}
              />
              <CheckpointDot state={s.state} />
              <div
                className={cn(
                  "h-px flex-1",
                  i === steps.length - 1
                    ? "bg-transparent"
                    : steps[i + 1].state !== "pending"
                      ? "bg-gradient-to-r from-[var(--ok)]/60 to-[var(--warn)]/45"
                      : "bg-divider"
                )}
              />
            </div>
            <span className={cn("text-[10px] leading-tight", s.state === "current" ? "font-medium text-ink" : "text-stone")}>
              {s.short ? (
                <>
                  <span className="sm:hidden">{s.short}</span>
                  <span className="hidden sm:inline">{s.label}</span>
                </>
              ) : (
                s.label
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Application journey card ────────────────────────────────────────────────

function ApplicationJourneyCard({ app, index, onOpen }: { app: ApplicationWire; index: number; onOpen: () => void }) {
  const stage = stageForStatus(app.status);
  const label = currentStageLabel(app.status);
  const place = app.job?.position?.placeOfAssignment ?? null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="dlg-card lift focus-ring min-h-[44px] w-full p-4 text-left"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconChip icon={Route} tone="gold" size={38} iconSize={17} />
          <div className="min-w-0">
            <h3 className="truncate font-display text-base leading-snug text-ink">{app.job?.title ?? "Position"}</h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone">
              {place && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {place}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3 w-3" /> Applied <span className="num">{formatDate(app.dateApplied)}</span>
              </span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusPill status={label} variant={stageVariant(label)} />
          <span className="num text-[10px] font-medium tracking-wide text-pebble">#{String(index + 1).padStart(2, "0")}</span>
        </div>
      </div>
      <JourneyTimeline status={app.status} />
      <p className="mt-3 border-t border-border pt-2.5 text-xs leading-relaxed text-stone">{nextStepHint(stage)}</p>
    </button>
  );
}

// ── Application detail modal (spec §7.7) ────────────────────────────────────

function RichSection({ title, text, html }: { title: string; text?: string | null; html?: string | null }) {
  if (html && html.trim()) {
    return (
      <section className="space-y-2">
        <h4 className="font-display text-lg text-ink">{title}</h4>
        <div className="rich-text text-sm leading-relaxed text-stone" dangerouslySetInnerHTML={{ __html: html }} />
      </section>
    );
  }
  if (text && text.trim()) {
    return (
      <section className="space-y-2">
        <h4 className="font-display text-lg text-ink">{title}</h4>
        <p className="whitespace-pre-line text-sm leading-relaxed text-stone">{text}</p>
      </section>
    );
  }
  return null;
}

function MqrLedger({ position }: { position: PositionWire | null }) {
  if (!position) return null;
  const rows: { label: string; value: string | null | undefined }[] = [
    { label: "Education", value: position.cscEducation },
    { label: "Work Experience", value: position.cscWorkExperience },
    { label: "Training", value: position.cscTraining },
    { label: "Eligibility", value: position.cscEligibilityGroup || position.cscEligibility },
    { label: "License / Certification", value: position.license },
  ];
  const visible = rows.filter((r) => !notRequired(r.value));
  if (visible.length === 0) return null;
  return (
    <section className="space-y-2">
      <h4 className="font-display text-lg text-ink">Minimum Qualification Requirements</h4>
      <div className="space-y-2">
        {visible.map((r) => (
          <div key={r.label} className="rounded-none bg-fog p-3">
            <p className="text-xs font-medium text-graphite">{r.label}</p>
            <p className="mt-0.5 whitespace-pre-line text-sm text-stone">{r.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ApplicationDetailModal({
  application,
  onClose,
  onCancelled,
}: {
  application: ApplicationWire;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const job = application.job ?? null;
  const position = job?.position ?? null;
  const label = currentStageLabel(application.status);
  const cancellable = label === "Submitted";
  const dl = deadlineState(job?.deadlineDate ?? null);

  const cancelApplication = async () => {
    setCancelling(true);
    try {
      await apiFetch(`/api/applications/${application.id}`, { method: "DELETE" });
      toast.success("Application cancelled", { description: "Your application has been withdrawn." });
      setConfirmOpen(false);
      onClose();
      onCancelled();
    } catch (e) {
      // Progressed applications: surface the server's guidance (e.g. "contact HR") as-is.
      toast.error(e instanceof Error ? e.message : "Unable to cancel this application");
      setConfirmOpen(false);
    } finally {
      setCancelling(false);
    }
  };

  const facts: [string, string][] = [
    ["Place of Assignment", position?.placeOfAssignment ?? "—"],
    ["Employment Type", job?.positionType ? humanize(job.positionType) : position?.positionType ? humanize(position.positionType) : "—"],
    ["Vacancies", job ? String(job.numberOfVacancy) : "—"],
    ["Monthly Salary", formatCurrency(position?.salaryAmount ?? null)],
    ["Salary Grade", position?.salaryGrade ? `SG-${position.salaryGrade}${position.salaryStep ? ` Step ${position.salaryStep}` : ""}` : "—"],
    ["Item No.", position?.itemNumber ?? "—"],
    ["Published", formatDate(job?.publishDate ?? null)],
    ["Deadline", job ? dl.label : "—"],
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="dlg-card-plain max-h-[90vh] w-full overflow-y-auto scroll-thin p-0 shadow-e4 sm:max-w-3xl">
        <div className="p-6">
          <DialogHeader className="space-y-2 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={label} variant={stageVariant(label)} />
              <span className="num bg-fog px-3 py-1 text-xs font-medium text-graphite">
                Application #{application.id}
              </span>
            </div>
            <DialogTitle className="font-display text-2xl leading-tight text-ink">
              {job?.title ?? "Application"}
            </DialogTitle>
          </DialogHeader>

          {/* Successfully-applied strip (§7.7) */}
          <div className="mt-4 flex items-center gap-3 rounded-none bg-fog p-3">
            <IconChip icon={BadgeCheck} tone="emerald" size={36} iconSize={17} />
            <div>
              <p className="text-sm font-medium text-ink">Successfully Applied</p>
              <p className="text-xs text-stone">
                Applied <span className="num">{formatDate(application.dateApplied)}</span>
              </p>
            </div>
          </div>

          {/* Vitals summary grid */}
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {facts.map(([k, v]) => (
              <div key={k} className="rounded-none bg-fog p-3">
                <p className="text-[11px] text-pebble">{k}</p>
                <p className="num mt-0.5 truncate text-sm text-ink" title={v}>
                  {v}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-6">
            <MqrLedger position={position} />
            <RichSection title="Brief Description" text={job?.briefDescription} html={job?.briefDescriptionHtml} />
            <RichSection title="Duties & Responsibilities" text={job?.dutiesResponsibilities} html={job?.dutiesHtml} />
            <RichSection title="Compensation Package" text={job?.compensationPackage} html={job?.compensationHtml} />
            <RichSection title="Other Qualifications" text={job?.otherQualifications} html={job?.otherQualificationsHtml} />
          </div>

          <div className="mt-8 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
            {cancellable && (
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={cancelling}
                className="min-h-[44px] border border-[var(--bad)]/30 bg-white px-6 py-2.5 text-sm font-medium text-[var(--bad)] transition-colors hover:bg-fog disabled:opacity-50"
              >
                Cancel Application
              </button>
            )}
            <button type="button" onClick={onClose} className="dlg-ghost min-h-[44px] px-6 py-2.5 text-sm">
              Close
            </button>
          </div>
        </div>

        {/* Nested destructive confirm (§7.7) */}
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent className="dlg-card-plain">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display text-xl text-ink">Cancel this application?</AlertDialogTitle>
              <AlertDialogDescription className="text-sm leading-relaxed text-stone">
                Your application for {job?.title ?? "this position"} will be withdrawn. You may apply again while the
                position is still open. Once review has started, applications can no longer be cancelled.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="dlg-ghost min-h-[44px] px-5 py-2.5 text-sm">Keep it</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void cancelApplication();
                }}
                disabled={cancelling}
                className="min-h-[44px] border border-[var(--bad)]/30 bg-white px-5 py-2.5 text-sm font-medium text-[var(--bad)] transition-colors hover:bg-fog disabled:opacity-50"
              >
                {cancelling ? "Cancelling…" : "Cancel Application"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

// ── Job card (open positions pane) ──────────────────────────────────────────

function OpenJobCard({ job }: { job: JobWire }) {
  const dl = deadlineState(job.deadlineDate);
  const applied = (job.applications?.length ?? 0) > 0;
  const urgent = dl.closingSoon && !dl.overdue;
  return (
    <div className="dlg-card lift flex flex-col p-6">
      <div className="flex items-start gap-3">
        <IconChip icon={Briefcase} tone="amber" size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-base leading-snug text-ink">{humanize(job.title)}</h3>
            {applied && <StatusPill status="Applied" variant="info" className="shrink-0" />}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone">
            {job.position?.placeOfAssignment && <span>{job.position.placeOfAssignment}</span>}
            {job.positionType && <span>· {humanize(job.positionType)}</span>}
          </p>
        </div>
      </div>
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
        {job.position?.salaryAmount != null ? (
          <p className="num text-sm font-semibold text-ink">{formatCurrency(job.position.salaryAmount)}</p>
        ) : (
          <span />
        )}
        <span className={cn("status-pill num", urgent ? "status-warn" : "status-neutral")}>{dl.label}</span>
      </div>
      <div className="mt-4 flex-1" />
      <button
        type="button"
        onClick={() => navigate("jobs", { job: String(job.id) })}
        className="dlg-ghost inline-flex min-h-[44px] w-fit items-center gap-2 px-5 py-2 text-sm"
      >
        View details <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── KPI-style summary card (KpiCard visual language, arbitrary chip tones) ──

function SummaryCard({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  icon: LucideIcon;
  tone: ChipTone;
}) {
  return (
    <div className="dlg-card-plain border border-black/[0.07] bg-gradient-to-b from-white to-[#fdfdfc] p-6 shadow-e2">
      <div className="flex items-start justify-between gap-3">
        <p className="pt-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-stone">{label}</p>
        <IconChip icon={icon} tone={tone} size={40} />
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <span className="num text-[34px] font-semibold leading-none tracking-[-0.02em] text-ink">{value}</span>
        {hint ? <span className="pb-1 text-xs font-medium text-pebble">{hint}</span> : null}
      </div>
    </div>
  );
}

// ── Main view ───────────────────────────────────────────────────────────────

export default function ApplicantHome() {
  const { user } = useSession();
  const [apps, setApps] = useState<ApplicationWire[] | null>(null);
  const [jobs, setJobs] = useState<JobWire[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApplicationWire | null>(null);

  const reload = useCallback(async (silent: boolean) => {
    try {
      const [appRes, jobRes] = await Promise.all([
        apiFetch<ApplicationWire[]>("/api/applications"),
        apiFetch<JobWire[]>("/api/jobs"),
      ]);
      setApps(appRes);
      setJobs(jobRes);
      setError(null);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Unable to load your workspace");
      // Silent failures keep the last good data (§13 polling contract).
    }
  }, []);

  useEffect(() => {
    void reload(false);
    const interval = setInterval(() => {
      if (!document.hidden) void reload(true);
    }, 15_000);
    const onFocus = () => void reload(true);
    const onVisible = () => {
      if (!document.hidden) void reload(true);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);

  const loading = apps === null && jobs === null;
  const today = startOfToday();
  const openJobs = (jobs ?? [])
    .filter((j) => !j.deadlineDate || new Date(j.deadlineDate) >= today)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 6);
  const sortedApps = (apps ?? []).sort((a, b) => Date.parse(b.dateApplied) - Date.parse(a.dateApplied));
  const profileComplete = user?.applicant?.isProfileComplete ?? false;
  const inProgress = sortedApps.filter((a) => {
    const s = stageForStatus(a.status);
    return s === "Applied" || s === "Under Review";
  }).length;

  return (
    <div>
      {/* Page header (§3 PageHeader pattern) */}
      <PageHeader
        title="My Application"
        description="Track your applications and discover the latest openings across DOST-MIRDC."
      />

      {/* Complete Your Profile banner while incomplete */}
      {!profileComplete && (
        <div className="dlg-card mt-6 flex flex-col gap-3 border border-dashed border-divider p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <IconChip icon={AlertCircle} tone="gold" size={36} iconSize={17} className="mt-0.5" />
            <div>
              <p className="font-display text-lg leading-tight text-ink">Complete Your Profile</p>
              <p className="mt-0.5 text-sm text-stone">
                Finish the 7-part profile to unlock applications — upload your PDS and we&apos;ll fill it for you.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("profile")}
            className="dlg-cta min-h-[44px] w-fit shrink-0 px-6 py-2.5 text-sm"
          >
            Complete profile
          </button>
        </div>
      )}

      {/* Error state with retry */}
      {error && apps === null && (
        <div className="dlg-card mt-6 flex flex-col items-center gap-3 p-8 text-center">
          <IconChip icon={AlertCircle} tone="rose" size={44} />
          <p className="text-sm text-stone">{error}</p>
          <button type="button" onClick={() => void reload(false)} className="dlg-ghost min-h-[44px] px-6 py-2.5 text-sm">
            <RefreshCw className="mr-2 inline h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      {!loading && (
        /* KPI-style summary — counts derived from the same wire data as below. */
        <div className="mt-6 grid animate-in fade-in slide-in-from-bottom-2 grid-cols-1 gap-4 duration-300 sm:grid-cols-3">
          <SummaryCard label="Open Positions" value={openJobs.length} hint="published now" icon={Briefcase} tone="amber" />
          <SummaryCard label="My Applications" value={sortedApps.length} hint="total submitted" icon={Inbox} tone="plum" />
          <SummaryCard label="In Progress" value={inProgress} hint="awaiting decision" icon={ClipboardList} tone="emerald" />
        </div>
      )}

      {loading ? (
        /* First-load skeletons — never stale data, never a blank pane. */
        <div className="mt-6 space-y-10">
          <SkeletonKpis count={3} className="grid-cols-1 sm:grid-cols-3 lg:grid-cols-3" />
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:items-start lg:gap-10 xl:gap-14">
            <SkeletonKpis count={4} className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 [&>div]:h-44" />
            <div className="space-y-4">
              <SkeletonRows rows={1} rowClassName="h-44" />
              <SkeletonRows rows={1} rowClassName="h-44" />
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6 grid animate-in fade-in slide-in-from-bottom-2 gap-10 duration-300 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:items-start lg:gap-10 xl:gap-14">
          {/* LEFT — Open positions */}
          <section className="lg:col-start-1 lg:row-start-1">
            <div className="mb-4 flex items-center gap-3">
              <h2 className="font-display text-xl text-ink">Open Positions</h2>
              <span className="status-pill status-neutral num">{openJobs.length}</span>
              <span className="hidden h-px flex-1 bg-divider sm:block" aria-hidden />
              <button
                type="button"
                onClick={() => navigate("jobs")}
                className="focus-ring inline-flex min-h-[44px] items-center gap-1.5 text-sm text-stone underline-offset-4 hover:text-ink hover:underline"
              >
                View All <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            {openJobs.length === 0 ? (
              <div className="dlg-card">
                <EmptyState
                  icon={Briefcase}
                  tone="amber"
                  title="No open positions right now"
                  description="New openings appear here as soon as they are published."
                  action={
                    <button
                      type="button"
                      onClick={() => navigate("jobs")}
                      className="dlg-ghost inline-flex min-h-[44px] items-center px-5 py-2 text-sm"
                    >
                      Browse All Jobs
                    </button>
                  }
                />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {openJobs.map((j) => (
                  <OpenJobCard key={j.id} job={j} />
                ))}
              </div>
            )}
          </section>

          {/* RIGHT — Your applications (first on mobile, sticky rail on desktop) */}
          <section className="order-first lg:order-none lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto scroll-thin">
            <div className="mb-4 flex items-center gap-3">
              <h2 className="font-display text-xl text-ink">Your Applications</h2>
              {sortedApps.length > 0 && (
                <span className="status-pill status-neutral num">{sortedApps.length}</span>
              )}
              <span className="hidden h-px flex-1 bg-divider sm:block" aria-hidden />
            </div>
            {sortedApps.length === 0 ? (
              <div className="dlg-card">
                <EmptyState
                  icon={Inbox}
                  tone="plum"
                  title="No applications yet"
                  description="Applications you submit are tracked here with live status updates."
                  action={
                    <button
                      type="button"
                      onClick={() => navigate("jobs")}
                      className="dlg-cta inline-flex min-h-[44px] items-center px-6 py-2.5 text-sm"
                    >
                      Browse Positions
                    </button>
                  }
                />
              </div>
            ) : (
              <div className="space-y-4">
                {sortedApps.map((app, i) => (
                  <ApplicationJourneyCard key={app.id} app={app} index={i} onOpen={() => setDetail(app)} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {detail && (
        <ApplicationDetailModal
          application={detail}
          onClose={() => setDetail(null)}
          onCancelled={() => {
            setDetail(null);
            void reload(true);
          }}
        />
      )}
    </div>
  );
}
