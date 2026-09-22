"use client";

// ============================================================================
// RMIS — Applicant home (spec §7.3): welcome header, "Complete Your Profile"
// banner while incomplete, open-positions pane (deadline not passed, newest
// published first) and the persistent "Your Applications" journey list
// (newest first) with 3-checkpoint timelines + next-step hints.
// Data: parallel /api/applications + /api/jobs — 15 s silent poll + refetch on
// focus (never flips skeletons or clobbers good data on transient failure).
// Clicking a journey card opens the full Application detail modal (§7.7)
// with Cancel Application while the journey is still at "Submitted".
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Briefcase,
  CalendarDays,
  Check,
  MapPin,
  RefreshCw,
  X,
} from "lucide-react";
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
import { apiFetch, deadlineState, formatCurrency, formatDate, humanize } from "@/lib/client";
import { navigate, type ApplicationWire, type JobWire, type PositionWire } from "@/lib/router";
import { currentStageLabel, stageForStatus } from "@/lib/status";
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

function stagePillClass(label: string): string {
  if (label === "Not Selected") return "bg-dusty-rose/10 text-dusty-rose";
  if (label === "Shortlisted") return "bg-ink text-white";
  return "bg-fog text-graphite";
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

function CheckpointDot({ state }: { state: CheckpointState }) {
  const cls =
    state === "done"
      ? "bg-ink text-white"
      : state === "current"
        ? "bg-ink/20 text-ink animate-pulse"
        : state === "failed"
          ? "bg-dusty-rose text-white"
          : "bg-fog border border-border text-pebble";
  return (
    <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] leading-none ${cls}`}>
      {state === "done" ? <Check className="h-2.5 w-2.5" /> : state === "failed" ? <X className="h-2.5 w-2.5" /> : null}
    </span>
  );
}

/** 3-checkpoint tracking timeline: Submitted → Review → Decision (§7.3). */
function JourneyTimeline({ status }: { status: string }) {
  const stage = stageForStatus(status);
  const decided = stage === "Shortlisted" || stage === "Rejected";

  const steps: { label: string; state: CheckpointState; lineBefore: boolean }[] = [
    { label: "Submitted", state: "done", lineBefore: false },
    {
      label: "Review",
      state: stage === "Under Review" ? "current" : decided ? "done" : "pending",
      lineBefore: true,
    },
    {
      label:
        stage === "Shortlisted" ? "Shortlisted" : stage === "Rejected" ? "Not Shortlisted" : "Awaiting the shortlist decision",
      state: stage === "Shortlisted" ? "done" : stage === "Rejected" ? "failed" : "pending",
      lineBefore: decided,
    },
  ];

  return (
    <div className="mt-3 grid grid-cols-3 gap-1">
      {steps.map((s, i) => (
        <div key={`${s.label}-${i}`} className="flex flex-col items-center gap-1.5 text-center">
          <div className="flex w-full items-center">
            <div className={`h-px flex-1 ${i === 0 ? "bg-transparent" : s.lineBefore ? "bg-ink" : "bg-border"}`} />
            <CheckpointDot state={s.state} />
            <div
              className={`h-px flex-1 ${i === steps.length - 1 ? "bg-transparent" : steps[i].state === "done" ? "bg-ink" : "bg-border"}`}
            />
          </div>
          <span className={`text-[10px] leading-tight ${s.state === "current" ? "font-medium text-ink" : "text-stone"}`}>
            {s.label}
          </span>
        </div>
      ))}
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
      className="dlg-card min-h-[44px] w-full p-4 text-left transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="font-display text-lg leading-none text-pebble">{String(index + 1).padStart(2, "0")}</span>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${stagePillClass(label)}`}>{label}</span>
      </div>
      <h4 className="mt-2 font-display text-base leading-snug text-ink">{app.job?.title ?? "Position"}</h4>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone">
        {place && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {place}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="h-3 w-3" /> Applied {formatDate(app.dateApplied)}
        </span>
      </p>
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
          <div key={r.label} className="rounded-[12px] bg-fog p-3">
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
  const stage = stageForStatus(application.status);
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
      <DialogContent className="dlg-card-plain max-h-[90vh] w-full overflow-y-auto scroll-thin p-0 sm:max-w-3xl">
        <div className="p-6">
          <DialogHeader className="space-y-2 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${stagePillClass(label)}`}>{label}</span>
              <span className="rounded-full bg-fog px-3 py-1 text-xs font-medium text-graphite">
                Application #{application.id}
              </span>
            </div>
            <DialogTitle className="font-display text-2xl leading-tight text-ink">
              {job?.title ?? "Application"}
            </DialogTitle>
          </DialogHeader>

          {/* Successfully-applied strip (§7.7) */}
          <div className="mt-4 flex items-center gap-3 rounded-[12px] bg-fog p-3">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-white">
              <BadgeCheck className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-medium text-ink">Successfully Applied</p>
              <p className="text-xs text-stone">Applied {formatDate(application.dateApplied)}</p>
            </div>
          </div>

          {/* Vitals summary grid */}
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {facts.map(([k, v]) => (
              <div key={k} className="rounded-[12px] bg-fog p-3">
                <p className="text-[11px] text-pebble">{k}</p>
                <p className="mt-0.5 truncate text-sm text-ink" title={v}>
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
                className="min-h-[44px] rounded-full border border-dusty-rose/40 bg-white px-6 py-2.5 text-sm font-medium text-dusty-rose transition-colors hover:bg-dusty-rose/10 disabled:opacity-50"
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
              <AlertDialogCancel className="dlg-ghost min-h-[44px] border-0 px-5 py-2.5 text-sm">Keep it</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void cancelApplication();
                }}
                disabled={cancelling}
                className="min-h-[44px] rounded-full bg-dusty-rose px-5 py-2.5 text-sm font-medium text-white hover:bg-dusty-rose/90 disabled:opacity-50"
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
  return (
    <div className="dlg-card flex flex-col p-6">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-display text-base leading-snug text-ink">{humanize(job.title)}</h4>
        {applied && <span className="shrink-0 rounded-full bg-ink px-3 py-1 text-xs font-medium text-white">Applied</span>}
      </div>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone">
        {job.position?.placeOfAssignment && <span>{job.position.placeOfAssignment}</span>}
        {job.positionType && <span>· {humanize(job.positionType)}</span>}
        {job.position?.salaryAmount != null && <span>· {formatCurrency(job.position.salaryAmount)}</span>}
        <span className={dl.overdue ? "text-dusty-rose" : ""}>· {dl.label}</span>
      </p>
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

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:py-8">
      {/* Welcome header (§7.3) */}
      <header className="mb-6">
        <h1 className="font-display text-3xl text-ink">
          Welcome Back, {user?.firstName || "there"}
        </h1>
        <p className="mt-1 text-sm text-stone">
          Track your applications and discover the latest openings across DOST-MIRDC.
        </p>
      </header>

      {/* Complete Your Profile banner while incomplete */}
      {!profileComplete && (
        <div className="dlg-card mb-6 flex flex-col gap-3 border border-dashed border-divider p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fog text-ink">
              <AlertCircle className="h-4 w-4" />
            </span>
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
        <div className="dlg-card flex flex-col items-center gap-3 p-8 text-center">
          <AlertCircle className="h-6 w-6 text-dusty-rose" />
          <p className="text-sm text-stone">{error}</p>
          <button type="button" onClick={() => void reload(false)} className="dlg-ghost min-h-[44px] px-6 py-2.5 text-sm">
            <RefreshCw className="mr-2 inline h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="dlg-card h-44 animate-pulse p-6" />
            ))}
          </div>
          <div className="space-y-4">
            <div className="dlg-card h-40 animate-pulse p-4" />
            <div className="dlg-card h-40 animate-pulse p-4" />
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
          {/* LEFT — Open positions */}
          <section className="lg:col-start-1 lg:row-start-1">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl text-ink">Open Positions · Apply Now</h2>
              <button
                type="button"
                onClick={() => navigate("jobs")}
                className="inline-flex min-h-[44px] items-center text-sm text-stone underline-offset-4 hover:text-ink hover:underline"
              >
                View All
              </button>
            </div>
            {openJobs.length === 0 ? (
              <div className="dlg-card flex flex-col items-center gap-2 p-8 text-center">
                <Briefcase className="h-6 w-6 text-pebble" />
                <p className="text-sm text-stone">No open positions right now — check back soon.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {openJobs.map((j) => (
                  <OpenJobCard key={j.id} job={j} />
                ))}
              </div>
            )}
          </section>

          {/* RIGHT — Your applications (first on mobile, sticky rail on desktop) */}
          <section className="order-first lg:order-none lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto scroll-thin">
            <h2 className="mb-4 font-display text-xl text-ink">Your Applications</h2>
            {sortedApps.length === 0 ? (
              <div className="dlg-card flex flex-col items-center gap-3 p-8 text-center">
                <Briefcase className="h-6 w-6 text-pebble" />
                <p className="text-sm text-stone">No applications yet</p>
                <button type="button" onClick={() => navigate("jobs")} className="dlg-cta min-h-[44px] px-6 py-2.5 text-sm">
                  Browse Positions
                </button>
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
