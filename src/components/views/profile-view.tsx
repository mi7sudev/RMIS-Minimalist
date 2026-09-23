"use client";

// ============================================================================
// RMIS — Profile builder (spec §7.4): the 7-part applicant profile.
// Header card (avatar, name, "N documents · M of 7 to go" meta line, circular
// % completion ring, linear progress bar, completion-requirements banner with
// the Mark Complete gate, and the compact collapsible PDS auto-fill row §7.5)
// · horizontal section stepper (pill chips, all breakpoints) · sections 01–07
// as SectionCards with per-section save indicators. Data loads in parallel;
// every mutation silently reloads and refreshes the session (§3.2).
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  Check,
  FileText,
  Info,
  RefreshCw,
} from "lucide-react";
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
import { Monogram, SkeletonRows } from "@/components/ui/shell";
import { apiFetch, fullName } from "@/lib/client";
import { useSession } from "@/components/session-provider";
import type { DocumentWire } from "@/lib/router";
import { cn } from "@/lib/utils";
import PdsUploadCard from "./profile/pds-upload-card";
import PersonalInfoSection from "./profile/personal-info-section";
import EducationSection from "./profile/education-section";
import WorkExperienceSection from "./profile/work-experience-section";
import TrainingSection from "./profile/training-section";
import EligibilitySection from "./profile/eligibility-section";
import AwardsSection from "./profile/awards-section";
import DocumentsSection from "./profile/documents-section";
import { initialsOf, type ApplicantProfile, type ReferenceData } from "./profile/section-types";

const SECTIONS = [
  { n: 1, num: "01", label: "Personal Information", short: "Personal" },
  { n: 2, num: "02", label: "Education", short: "Education" },
  { n: 3, num: "03", label: "Work Experience", short: "Work" },
  { n: 4, num: "04", label: "Training", short: "Training" },
  { n: 5, num: "05", label: "Eligibility", short: "Eligibility" },
  { n: 6, num: "06", label: "Awards", short: "Awards" },
  { n: 7, num: "07", label: "Supporting Documents", short: "Documents" },
];

function hasText(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim() !== "";
}

/** Circular completion ring — square line caps, sanctioned ember gradient. */
function CompletionRing({ pct }: { pct: number }) {
  const R = 30;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative h-[72px] w-[72px] shrink-0" role="img" aria-label={`${pct}% profile complete`}>
      <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id="profileRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f69251" />
            <stop offset="100%" stopColor="#ef8340" />
          </linearGradient>
        </defs>
        <circle cx="36" cy="36" r={R} fill="none" className="stroke-fog" strokeWidth="7" />
        <circle
          cx="36"
          cy="36"
          r={R}
          fill="none"
          stroke="url(#profileRingGrad)"
          strokeWidth="7"
          strokeDasharray={`${(pct / 100) * C} ${C}`}
          strokeLinecap="butt"
          className="motion-safe:transition-[stroke-dasharray] duration-700 ease-out"
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center">
        <span className="num font-display text-lg leading-none text-ink">
          {pct}
          <span className="text-[10px]">%</span>
        </span>
      </span>
    </div>
  );
}

export default function ProfileView() {
  const { user, refresh } = useSession();
  const [profile, setProfile] = useState<ApplicantProfile | null>(null);
  const [reference, setReference] = useState<ReferenceData | null>(null);
  const [docs, setDocs] = useState<DocumentWire[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(1);
  const [seed, setSeed] = useState(0);
  const [markOpen, setMarkOpen] = useState(false);
  const [marking, setMarking] = useState(false);

  const loadAll = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true);
    try {
      const [profileRes, docsRes] = await Promise.all([
        apiFetch<ApplicantProfile>("/api/applicant/profile"),
        apiFetch<DocumentWire[]>("/api/applicant/documents"),
      ]);
      setProfile(profileRes);
      setDocs(docsRes);
      setError(null);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Unable to load your profile");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const ref = await apiFetch<ReferenceData>("/api/reference");
        setReference(ref);
      } catch {
        // Reference data is optional (datalist/eligibility suggestions).
      }
      await loadAll(false);
    })();
  }, [loadAll]);

  const reloadSilent = useCallback(async () => {
    await loadAll(true);
  }, [loadAll]);

  /** After PDS auto-apply / clear: reload AND re-seed the personal form. */
  const onProfileReplaced = useCallback(async () => {
    await loadAll(true);
    setSeed((s) => s + 1);
  }, [loadAll]);

  // ── Completeness (§7.4 header card) ───────────────────────────────────────
  const personalDone = profile ? hasText(profile.firstName) && hasText(profile.lastName) && hasText(profile.emailAddress) : false;
  const educationDone = (profile?.educations?.length ?? 0) > 0;
  const workDone = (profile?.workExperiences?.length ?? 0) > 0;
  const trainingDone = (profile?.trainings?.length ?? 0) > 0;
  const eligibilityDone = (profile?.eligibilities?.length ?? 0) > 0;
  const awardsDone = (profile?.awards?.length ?? 0) > 0;
  const documentsDone = docs.length > 0;
  const sectionDone = [personalDone, educationDone, workDone, trainingDone, eligibilityDone, awardsDone, documentsDone];
  const completedCount = sectionDone.filter(Boolean).length;
  const isComplete = profile?.isProfileComplete === true;
  const canMarkComplete = personalDone && educationDone && workDone && !isComplete;
  const pct = Math.round((completedCount / 7) * 100);
  const remaining = 7 - completedCount;

  const markComplete = async () => {
    setMarking(true);
    try {
      await apiFetch("/api/applicant/profile", { method: "PUT", body: { isProfileComplete: true } });
      toast.success("Profile marked as complete", {
        description: "You can now apply to open positions. HR verifies your credentials at the next stage.",
      });
      setMarkOpen(false);
      await refresh();
      await reloadSilent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to mark your profile complete");
    } finally {
      setMarking(false);
    }
  };

  const pictureDoc = docs.find((d) => d.category === "PROFILE_PICTURE");
  const initials = initialsOf(user?.firstName ?? profile?.firstName, user?.lastName ?? profile?.lastName);

  // ── Loading / error states ────────────────────────────────────────────────
  if (loading) {
    return (
      <div>
        <div className="dlg-card-plain border border-border p-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-none">
              <div className="skel h-full w-full" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="skel h-4 w-48" />
              <div className="skel h-3 w-36" />
            </div>
            <div className="skel h-[72px] w-[72px] shrink-0" />
          </div>
          <div className="skel mt-5 h-1.5 w-full" />
          <div className="skel mt-5 h-16 w-full" />
        </div>
        <div className="dlg-card mt-6 p-2">
          <div className="flex gap-2 overflow-hidden">
            {SECTIONS.map((s) => (
              <div key={s.n} className="skel h-11 w-28 shrink-0" />
            ))}
          </div>
        </div>
        <div className="mt-6">
          <SkeletonRows rows={4} rowClassName="h-20" />
        </div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div>
        <div className="dlg-card flex flex-col items-center gap-3 p-10 text-center">
          <AlertCircle className="h-6 w-6 text-[var(--bad)]" />
          <p className="text-sm text-stone">{error}</p>
          <button type="button" onClick={() => void loadAll(false)} className="dlg-ghost min-h-[44px] px-6 py-2.5 text-sm">
            <RefreshCw className="mr-2 inline h-3.5 w-3.5" /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ── Header card ─────────────────────────────────────────────────────── */}
      <section className="dlg-card p-6">
        <div className="flex items-start gap-4">
          {/* Avatar — gradient monogram tile when no photo is on file */}
          <div className="h-14 w-14 shrink-0">
            {pictureDoc ? (
              <img
                src={`/api/files/${pictureDoc.filePath}`}
                alt="Profile picture"
                className="h-14 w-14 rounded-none object-cover shadow-e1"
              />
            ) : (
              <Monogram size={56}>{initials}</Monogram>
            )}
          </div>

          {/* Name + meta line */}
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-2xl text-ink">
              {fullName({
                firstName: user?.firstName ?? profile?.firstName,
                lastName: user?.lastName ?? profile?.lastName,
              })}
            </h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-stone">
              <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                <span className="num">{docs.length}</span> document{docs.length === 1 ? "" : "s"}
              </span>
              <span aria-hidden="true">·</span>
              {isComplete ? (
                <span className="inline-flex items-center gap-1 font-medium text-[var(--ok)]">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" /> Profile complete
                </span>
              ) : (
                <span>
                  <span className="num">{remaining}</span> of <span className="num">7</span> to go
                </span>
              )}
            </p>
          </div>

          {/* Completion ring */}
          <CompletionRing pct={pct} />
        </div>

        {/* Linear progress — ember gradient (sanctioned profile-header motif) */}
        <div
          className="mt-5 h-1.5 w-full overflow-hidden bg-fog"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={`${pct}% profile completed`}
        >
          <div
            className="h-full bg-gradient-to-r from-[#f69251] to-[#ef8340] motion-safe:transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Completion requirements banner (hidden once complete) */}
        {!isComplete && (
          <div className="mt-5 flex flex-col gap-3 bg-fog p-4 sm:flex-row sm:items-center">
            <Info className="h-4 w-4 shrink-0 text-stone" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-sm leading-relaxed text-stone">
              Profile completion requires your Personal Information (first name, last name, and email) and at least one
              entry each in Education and Work Experiences.
            </p>
            {canMarkComplete && (
              <button
                type="button"
                onClick={() => setMarkOpen(true)}
                className="dlg-cta min-h-[44px] w-full shrink-0 px-5 py-2.5 text-sm sm:w-auto"
              >
                Mark Complete
              </button>
            )}
          </div>
        )}

        {/* PDS upload / auto-extraction (§7.5) — compact collapsible row */}
        <div className="mt-5">
          <PdsUploadCard docs={docs} onProfileReplaced={onProfileReplaced} onDocsChanged={reloadSilent} />
        </div>
      </section>

      {/* ── Section stepper — horizontal pill chips (all breakpoints) ──────── */}
      <div className="dlg-card mt-6 p-2">
        <div className="flex gap-1.5 overflow-x-auto scroll-thin" role="tablist" aria-label="Profile sections">
          {SECTIONS.map((s) => {
            const done = sectionDone[s.n - 1];
            const isActive = active === s.n;
            return (
              <button
                key={s.n}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(s.n)}
                className={cn(
                  "flex min-h-[44px] shrink-0 items-center gap-2 px-3 py-1.5 text-sm transition-colors",
                  isActive ? "bg-fog" : "hover:bg-fog/60"
                )}
              >
                <span
                  className={cn(
                    "grid h-6 w-6 shrink-0 place-items-center text-[11px] font-medium",
                    isActive ? "chip chip-ink" : done ? "chip chip-emerald" : "chip chip-slate"
                  )}
                  aria-hidden="true"
                >
                  {done && !isActive ? <Check className="h-3.5 w-3.5" /> : s.num}
                </span>
                <span className={cn("whitespace-nowrap", isActive ? "font-medium text-ink" : "text-stone")}>
                  {s.short}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Active section ─────────────────────────────────────────────────── */}
      <div className="mt-6 min-w-0">
        {active === 1 && <PersonalInfoSection profile={profile} seed={seed} refreshSession={refresh} />}
        {active === 2 && (
          <EducationSection
            items={profile?.educations ?? []}
            courses={(reference?.courses ?? []).map((c) => c.name)}
            onChanged={reloadSilent}
          />
        )}
        {active === 3 && <WorkExperienceSection items={profile?.workExperiences ?? []} onChanged={reloadSilent} />}
        {active === 4 && <TrainingSection items={profile?.trainings ?? []} onChanged={reloadSilent} />}
        {active === 5 && (
          <EligibilitySection
            items={profile?.eligibilities ?? []}
            referenceNames={(reference?.eligibilities ?? []).map((e) => e.name)}
            onChanged={reloadSilent}
          />
        )}
        {active === 6 && <AwardsSection items={profile?.awards ?? []} onChanged={reloadSilent} />}
        {active === 7 && <DocumentsSection docs={docs} onChanged={reloadSilent} />}
      </div>

      {/* Mark Complete confirm (§7.4) */}
      <AlertDialog open={markOpen} onOpenChange={setMarkOpen}>
        <AlertDialogContent className="dlg-card-plain">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl text-ink">Mark your profile as complete?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-stone">
              Your profile will be ready for application and subject to verification by HR. All statements become part
              of your civil-service application record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dlg-ghost min-h-[44px] px-5 py-2.5 text-sm">Not yet</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void markComplete();
              }}
              disabled={marking}
              className="dlg-cta min-h-[44px] px-5 py-2.5 text-sm disabled:opacity-50"
            >
              {marking ? "Marking…" : "Mark Complete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
