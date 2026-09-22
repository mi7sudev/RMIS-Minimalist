"use client";

// ============================================================================
// RMIS — Apply flow (spec §7.6): gating, confirm step, MQR failure
// presentation, and the 5-step PDS fast-track for incomplete profiles.
// Used by the jobs view. Orange #f69251 strictly on the primary CTA.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { apiFetch, humanize, deadlineState } from "@/lib/client";
import { navigate } from "@/lib/router";
import { useSession } from "@/components/session-provider";
import type { JobWire, MqrResults } from "@/lib/router";
import type { SessionUser } from "@/lib/router";
import { MQR_MEETS } from "@/lib/mqr.shared";

type JobLike = Pick<JobWire, "id" | "title" | "positionType" | "numberOfVacancy" | "deadlineDate"> &
  { position?: { itemNumber?: string | null; placeOfAssignment?: string | null; positionTitle?: string } | null };

// ── Gate + opener (shared by jobs board) ────────────────────────────────────

export function useApplyFlow() {
  const { user, refresh } = useSession();
  const [activeJob, setActiveJob] = useState<JobLike | null>(null);
  const [startStep, setStartStep] = useState<"confirm" | "fasttrack">("confirm");

  const requestApply = useCallback(
    (job: JobLike) => {
      if (!user) {
        toast.info("Please sign in to apply", {
          description: "Create an account or sign in to submit an application.",
          action: { label: "Sign in", onClick: () => navigate("signin") },
        });
        navigate("signin");
        return;
      }
      if (user.role !== "APPLICANT") {
        toast.error("Only applicant accounts can apply for positions.");
        return;
      }
      if (!user.applicant?.isProfileComplete) {
        setActiveJob(job);
        setStartStep("fasttrack");
        return;
      }
      setActiveJob(job);
      setStartStep("confirm");
    },
    [user]
  );

  return {
    requestApply,
    dialogs: activeJob && user ? (
      <ApplyDialogs
        job={activeJob}
        user={user}
        initialStep={startStep}
        onClose={() => setActiveJob(null)}
        onApplied={async () => {
          await refresh();
        }}
      />
    ) : null,
  };
}

// ── MQR failure presentation (spec §7.6) ────────────────────────────────────

function MqrFailure({ mqr, onGoProfile }: { mqr: MqrResults; onGoProfile: () => void }) {
  const dims: [string, string][] = [
    ["Education", mqr.education],
    ["Work Experience", mqr.workExperience],
    ["Training", mqr.training],
    ["Eligibility", mqr.eligibility],
  ];
  return (
    <div className="space-y-4">
      <div className="rounded-[12px] bg-dusty-rose/10 border border-dusty-rose/30 p-4">
        <p className="text-sm font-medium text-ink">Requirements Not Met</p>
        <p className="text-sm text-stone mt-1">
          Your credentials do not satisfy every minimum qualification for this position. Nothing was submitted.
        </p>
      </div>
      <ul className="space-y-2">
        {dims.map(([label, verdict]) => (
          <li key={label} className="flex items-start gap-3 rounded-[12px] bg-fog p-3">
            <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${verdict === MQR_MEETS ? "bg-ink text-white" : "bg-dusty-rose/20 text-dusty-rose"}`}>
              {verdict === MQR_MEETS ? "✓" : "✕"}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{label}</p>
              <p className="text-xs text-stone break-words">{verdict}</p>
            </div>
          </li>
        ))}
      </ul>
      <button onClick={onGoProfile} className="dlg-cta px-6 py-2.5 text-sm w-full min-h-[44px]">
        Update Profile
      </button>
    </div>
  );
}

// ── Fast-track checklist (spec §8.3 requirements) ───────────────────────────

type CompletionReq = { id: string; label: string; met: boolean };

function Checklist({ requirements }: { requirements: CompletionReq[] }) {
  return (
    <ul className="space-y-2">
      {requirements.map((r) => (
        <li key={r.id} className="flex items-center gap-3 text-sm">
          <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${r.met ? "bg-ink text-white" : "bg-fog text-pebble border border-border"}`}>
            {r.met ? "✓" : "○"}
          </span>
          <span className={r.met ? "text-ink" : "text-stone"}>{r.label}</span>
        </li>
      ))}
    </ul>
  );
}

// ── Main dialogs ────────────────────────────────────────────────────────────

export function ApplyDialogs({
  job,
  user,
  initialStep,
  onClose,
  onApplied,
}: {
  job: JobLike;
  user: SessionUser;
  initialStep: "confirm" | "fasttrack";
  onClose: () => void;
  onApplied?: () => void | Promise<void>;
}) {
  const { refresh } = useSession();
  const [step, setStep] = useState<"confirm" | "mqr-fail" | "fasttrack" | "done">(initialStep);
  const [mqr, setMqr] = useState<MqrResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [ftPhase, setFtPhase] = useState<"upload" | "review" | "submit" | "done">("upload");
  const [ftProgress, setFtProgress] = useState(0);
  const [ftError, setFtError] = useState<{ message: string; fileName?: string } | null>(null);
  const [ftSummary, setFtSummary] = useState<{ applied: Record<string, number>; replaced: number } | null>(null);
  const [ftRequirements, setFtRequirements] = useState<CompletionReq[] | null>(null);
  const [certified, setCertified] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setStep(initialStep), [initialStep]);

  const jobTitle = job.position?.positionTitle || job.title;
  const place = job.position?.placeOfAssignment || "DOST Compound, Taguig";

  // Normal apply: verify → submit (spec §7.6 Path A).
  const submitApplication = useCallback(async () => {
    setBusy(true);
    try {
      const check = await apiFetch<{ mqrResults: MqrResults; allMet: boolean }>("/api/jobs/verify-mqr", {
        method: "POST",
        body: { jobId: job.id },
      });
      if (!check.allMet) {
        setMqr(check.mqrResults);
        setStep("mqr-fail");
        return;
      }
      await apiFetch("/api/jobs/apply", { method: "POST", body: { jobId: job.id } });
      toast.success("Application submitted", { description: `You applied for ${jobTitle}. Track it from your home.` });
      setStep("done");
      await refresh();
      await onApplied?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      if (/complete your profile/i.test(msg)) {
        setStep("fasttrack");
        setFtPhase("review");
      } else if (/Minimum Qualification Requirements/i.test(msg)) {
        const details = (e as unknown as { details?: { mqrResults?: MqrResults } }).details;
        if (details?.mqrResults) setMqr(details.mqrResults);
        setStep("mqr-fail");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }, [job.id, jobTitle, refresh, onApplied]);

  // Fast-track pipeline (spec §7.5): upload → extract → auto-apply.
  const runFastTrack = useCallback(async (file: File) => {
    setFtError(null);
    setFtProgress(15);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", "PDS");
      const doc = await apiFetch<{ id: string }>("/api/applicant/documents", { method: "POST", formData: fd });
      setFtProgress(45);
      const ext = await apiFetch<{ merged: Record<string, unknown> | null; results: { status: string; error?: string }[] }>(
        "/api/applicant/documents/extract",
        { method: "POST", body: { documentIds: [doc.id] } }
      );
      setFtProgress(75);
      const failed = ext.results.find((r) => r.status === "FAILED" || r.status === "PARTIALLY_EXTRACTED");
      if (!ext.merged) {
        setFtError({ message: failed?.error || "Extraction failed. Try a clearer PDS file (XLSX recommended).", fileName: file.name });
        setFtPhase("upload");
        setFtProgress(0);
        return;
      }
      const applied = await apiFetch<{ applied: Record<string, number>; replaced: { personal: number }; profileCompletion: { complete: boolean; requirements: CompletionReq[] }; message: string }>(
        "/api/applicant/profile/auto-apply",
        { method: "POST", body: { extraction: ext.merged } }
      );
      setFtProgress(90);
      setFtSummary({ applied: applied.applied, replaced: applied.replaced?.personal ?? 0 });
      setFtRequirements(applied.profileCompletion.requirements);
      await refresh();
      setFtProgress(100);
      setFtPhase("review");
    } catch (e) {
      setFtError({ message: e instanceof Error ? e.message : "Upload failed. Please try again.", fileName: file.name });
      setFtPhase("upload");
      setFtProgress(0);
    }
  }, [refresh]);

  // Fast-track submit (spec §7.6 Path B): MQR → complete → apply.
  const submitFastTrack = useCallback(async () => {
    setBusy(true);
    try {
      const check = await apiFetch<{ mqrResults: MqrResults; allMet: boolean }>("/api/jobs/verify-mqr", {
        method: "POST",
        body: { jobId: job.id },
      });
      if (!check.allMet) {
        setMqr(check.mqrResults);
        setStep("mqr-fail");
        return;
      }
      await apiFetch("/api/applicant/profile/complete", { method: "POST" });
      await apiFetch("/api/jobs/apply", { method: "POST", body: { jobId: job.id } });
      toast.success("Application submitted", { description: "Your PDS data was applied and your application is in." });
      setFtPhase("done");
      setStep("done");
      await refresh();
      await onApplied?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      if (/Minimum Qualification Requirements/i.test(msg)) {
        const details = (e as unknown as { details?: { mqrResults?: MqrResults } }).details;
        if (details?.mqrResults) setMqr(details.mqrResults);
        setStep("mqr-fail");
      } else if (/complete your profile/i.test(msg)) {
        toast.error(msg);
        navigate("profile");
        onClose();
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }, [job.id, jobTitle, refresh, onApplied, onClose]);

  const dl = deadlineState(job.deadlineDate);
  const canSubmit = ftRequirements?.every((r) => r.met) ?? false;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg dlg-card-plain p-0 overflow-hidden max-h-[90vh] overflow-y-auto scroll-thin">
        {/* Confirm step */}
        {step === "confirm" && (
          <div className="p-6">
            <DialogHeader className="text-left space-y-2">
              <div className="dlg-pill inline-flex w-fit items-center bg-fog px-3 py-1 text-xs font-medium text-graphite">Application</div>
              <DialogTitle className="font-display text-2xl text-carbon">{jobTitle}</DialogTitle>
              <DialogDescription className="text-sm text-stone">
                {place} · {job.positionType ? humanize(job.positionType) : "—"} · {job.numberOfVacancy} vacanc{job.numberOfVacancy === 1 ? "y" : "ies"}
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-[12px] bg-fog p-3">
                <p className="text-xs text-pebble">Item No.</p>
                <p className="text-ink">{job.position?.itemNumber || "—"}</p>
              </div>
              <div className="rounded-[12px] bg-fog p-3">
                <p className="text-xs text-pebble">Deadline</p>
                <p className={`text-ink ${dl.overdue ? "text-dusty-rose" : ""}`}>{dl.label}</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-stone">
              Your profile will be submitted for evaluation against the minimum qualification requirements. HR verifies all credentials at the next stage.
            </p>
            <div className="mt-5 flex gap-3">
              <button onClick={onClose} className="dlg-ghost flex-1 px-6 py-2.5 text-sm min-h-[44px]">Cancel</button>
              <button onClick={submitApplication} disabled={busy} className="dlg-cta flex-1 px-6 py-2.5 text-sm min-h-[44px] disabled:opacity-50">
                {busy ? "Submitting…" : "Submit Application"}
              </button>
            </div>
          </div>
        )}

        {/* MQR failure */}
        {step === "mqr-fail" && mqr && (
          <div className="p-6">
            <DialogHeader className="text-left space-y-1">
              <DialogTitle className="font-display text-2xl text-carbon">Minimum Qualifications</DialogTitle>
              <DialogDescription className="text-sm text-stone">Automated evaluation for {jobTitle}</DialogDescription>
            </DialogHeader>
            <div className="mt-4">
              <MqrFailure mqr={mqr} onGoProfile={() => { navigate("profile"); onClose(); }} />
            </div>
          </div>
        )}

        {/* Fast-track */}
        {step === "fasttrack" && (
          <div className="p-6">
            <DialogHeader className="text-left space-y-1">
              <div className="dlg-pill inline-flex w-fit items-center bg-fog px-3 py-1 text-xs font-medium text-graphite">Fast-track application</div>
              <DialogTitle className="font-display text-2xl text-carbon">Apply with your PDS</DialogTitle>
              <DialogDescription className="text-sm text-stone">
                Your profile is incomplete. Upload your Personal Data Sheet and RMIS fills your profile automatically.
              </DialogDescription>
            </DialogHeader>

            {/* Step indicator */}
            <div className="mt-4 flex items-center gap-2 text-xs text-pebble">
              {["Upload", "Extract", "Auto-fill", "Review", "Submit"].map((label, i) => {
                const active = (ftPhase === "upload" && i <= 0) || (ftPhase === "review" && i === 3) || (ftPhase === "submit" && i === 4) || (ftPhase === "done" && i === 4);
                const done = (ftPhase === "review" && i < 3) || (ftPhase === "submit" && i < 4) || ftPhase === "done";
                return (
                  <span key={label} className={`dlg-pill px-2.5 py-1 ${done ? "bg-ink text-white" : active ? "bg-fog text-ink" : "bg-fog/60 text-pebble"}`}>
                    {i + 1}. {label}
                  </span>
                );
              })}
            </div>

            {ftPhase === "upload" && (
              <div className="mt-4">
                {ftProgress > 0 && (
                  <div className="mb-4">
                    <div className="h-1.5 w-full rounded-full bg-fog overflow-hidden">
                      <div className="h-full bg-tangerine transition-all" style={{ width: `${ftProgress}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-pebble">
                      {ftProgress < 40 ? "Uploading…" : ftProgress < 70 ? "Extracting from your PDS…" : "Applying to your profile…"}
                    </p>
                  </div>
                )}
                {ftError && (
                  <div className="mb-4 rounded-[12px] border border-dusty-rose/30 bg-dusty-rose/10 p-3">
                    <p className="text-sm text-ink">{ftError.message}</p>
                    {ftError.fileName && <p className="mt-0.5 text-xs text-pebble">{ftError.fileName}</p>}
                  </div>
                )}
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex min-h-[140px] w-full flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-divider bg-white p-6 text-center transition-colors hover:bg-fog"
                >
                  <span className="text-sm font-medium text-ink">Upload PDS — CS Form 212</span>
                  <span className="text-xs text-pebble">XLSX, PDF or DOCX · up to 10 MB</span>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.xlsx,.xls,.xlsm"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) {
                      setFtPhase("upload");
                      void runFastTrack(f);
                    }
                  }}
                />
                <div className="mt-4 flex justify-between">
                  <button onClick={onClose} className="dlg-ghost px-6 py-2.5 text-sm min-h-[44px]">Not now</button>
                  <button onClick={() => navigate("profile")} className="text-sm text-stone underline underline-offset-4 min-h-[44px] px-3">
                    Fill my profile manually
                  </button>
                </div>
              </div>
            )}

            {ftPhase === "review" && ftSummary && (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(ftSummary.applied).map(([k, v]) => (
                    <span key={k} className="dlg-pill bg-fog px-3 py-1 text-xs text-graphite">
                      {humanize(k)}: +{v}
                    </span>
                  ))}
                  {ftSummary.replaced > 0 && (
                    <span className="dlg-pill bg-fog px-3 py-1 text-xs text-graphite">{ftSummary.replaced} replaced</span>
                  )}
                </div>
                <div className="rounded-[12px] bg-fog p-4">
                  <p className="mb-3 text-sm font-medium text-ink">Completion requirements</p>
                  <Checklist requirements={ftRequirements ?? []} />
                </div>
                {canSubmit ? (
                  <div className="space-y-4">
                    <label className="flex cursor-pointer items-start gap-3 rounded-[12px] bg-fog p-4">
                      <Checkbox checked={certified} onCheckedChange={(v) => setCertified(v === true)} className="mt-0.5" />
                      <span className="text-xs leading-relaxed text-graphite">
                        I certify that the information extracted from my PDS is true and correct, in compliance with civil-service requirements. False statements may result in disqualification.
                      </span>
                    </label>
                    <div className="flex gap-3">
                      <button onClick={() => { setFtPhase("upload"); setFtProgress(0); setFtSummary(null); }} className="dlg-ghost flex-1 px-6 py-2.5 text-sm min-h-[44px]">
                        Upload another document
                      </button>
                      <button onClick={submitFastTrack} disabled={busy || !certified} className="dlg-cta flex-1 px-6 py-2.5 text-sm min-h-[44px] disabled:opacity-50">
                        {busy ? "Submitting…" : "Certify & Submit"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 rounded-[12px] border border-dashed border-divider p-4">
                    <p className="text-sm text-stone">Your profile still misses some requirements after extraction. Your data is saved — complete the missing sections to continue.</p>
                    <div className="flex gap-3">
                      <button onClick={() => { navigate("profile"); onClose(); }} className="dlg-cta flex-1 px-6 py-2.5 text-sm min-h-[44px]">
                        Go to Profile
                      </button>
                      <button onClick={() => { setFtPhase("upload"); setFtProgress(0); setFtSummary(null); }} className="dlg-ghost flex-1 px-6 py-2.5 text-sm min-h-[44px]">
                        Upload another document
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Done */}
        {step === "done" && (
          <div className="p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ink text-white text-xl">✓</div>
            <h3 className="mt-4 font-display text-2xl text-carbon">Application submitted</h3>
            <p className="mt-2 text-sm text-stone">
              We received your application for {jobTitle}. You will receive an SMS confirmation shortly.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button onClick={() => { navigate("home"); onClose(); }} className="dlg-cta flex-1 px-6 py-2.5 text-sm min-h-[44px]">
                View My Applications
              </button>
              <button onClick={() => { navigate("profile"); onClose(); }} className="dlg-ghost flex-1 px-6 py-2.5 text-sm min-h-[44px]">
                Review Profile
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
