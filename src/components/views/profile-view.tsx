"use client";

// ============================================================================
// RMIS — Profile builder (spec §7.4): the 7-part applicant profile.
// Header card (avatar from PROFILE_PICTURE, "X of 7" progress bar + status
// pill, document count, Mark Complete gate) · PDS auto-fill card (§7.5) ·
// vertical step rail in a sticky white card (mobile stepper strip + desktop
// rail) · sections 01–07 as SectionCards with per-section save indicators.
// Data loads in parallel; every mutation silently reloads and refreshes the
// session (§3.2).
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  RefreshCw,
  UserRound,
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
import { IconChip, Monogram, SkeletonRows, StatusPill } from "@/components/ui/shell";
import { apiFetch, fullName } from "@/lib/client";
import { variantForCompletion } from "@/lib/status-ui";
import { useSession } from "@/components/session-provider";
import type { DocumentWire } from "@/lib/router";
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
  { n: 1, num: "01", label: "Personal Information" },
  { n: 2, num: "02", label: "Education" },
  { n: 3, num: "03", label: "Work Experience" },
  { n: 4, num: "04", label: "Training" },
  { n: 5, num: "05", label: "Eligibility" },
  { n: 6, num: "06", label: "Awards" },
  { n: 7, num: "07", label: "Supporting Documents" },
];

function hasText(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim() !== "";
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

  const goTo = (delta: number) => setActive((a) => Math.min(7, Math.max(1, a + delta)));

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
            <div className="hidden w-48 space-y-2 sm:block">
              <div className="skel h-5 w-20" />
              <div className="skel h-1.5 w-full" />
            </div>
          </div>
        </div>
        <div className="skel mt-6 h-40 w-full" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="hidden lg:block">
            <SkeletonRows rows={7} rowClassName="h-11" />
          </div>
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
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
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

          {/* Name + status */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate font-display text-2xl text-ink">
                {fullName({
                  firstName: user?.firstName ?? profile?.firstName,
                  lastName: user?.lastName ?? profile?.lastName,
                })}
              </h1>
              <StatusPill status={isComplete ? "Complete" : "Incomplete"} variant={variantForCompletion(isComplete)} />
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-stone">
              <FileText className="h-3.5 w-3.5" />
              <span className="num">{docs.length}</span>
              &nbsp;document{docs.length === 1 ? "" : "s"} on file
              {!isComplete && " · PDS auto-fill available below"}
            </p>
          </div>

          {/* Completion — "X of 7" + 6px progress bar (ink fill, not orange) */}
          <div className="w-full sm:w-48">
            <div className="flex items-baseline justify-between">
              <span className="num font-display text-xl text-ink">{completedCount} of 7</span>
              <span className="text-xs text-pebble">sections done</span>
            </div>
            <div
              className="mt-2 h-1.5 w-full overflow-hidden bg-fog"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={7}
              aria-valuenow={completedCount}
              aria-label={`${completedCount} of 7 sections completed`}
            >
              <div
                className="h-full bg-gradient-to-r from-[#f69251] to-[#ef8340] motion-safe:transition-[width] duration-500 ease-out"
                style={{ width: `${(completedCount / 7) * 100}%` }}
              />
            </div>
            {canMarkComplete && (
              <button
                type="button"
                onClick={() => setMarkOpen(true)}
                className="dlg-cta mt-3 min-h-[44px] w-full px-5 py-2.5 text-sm"
              >
                Mark Complete
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── PDS upload / auto-extraction (§7.5) ────────────────────────────── */}
      <div className="mt-6">
        <PdsUploadCard docs={docs} onProfileReplaced={onProfileReplaced} onDocsChanged={reloadSilent} />
      </div>

      {/* ── Section navigation + content ───────────────────────────────────── */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
        {/* Mobile stepper strip — tonal chips (ink active / emerald done / slate upcoming) */}
        <div className="lg:hidden">
          <div className="flex gap-1.5 overflow-x-auto scroll-thin pb-1">
            {SECTIONS.map((s) => {
              const done = sectionDone[s.n - 1];
              return (
                <button
                  key={s.n}
                  type="button"
                  onClick={() => setActive(s.n)}
                  aria-label={s.label}
                  aria-current={active === s.n ? "step" : undefined}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center text-xs font-medium transition-transform ${
                    active === s.n ? "chip chip-ink" : done ? "chip chip-emerald" : "chip chip-slate"
                  }`}
                >
                  {done && active !== s.n ? <Check className="h-4 w-4" /> : s.num}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => goTo(-1)}
              disabled={active === 1}
              className="dlg-ghost inline-flex min-h-[44px] items-center gap-1 px-4 py-2 text-sm disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <span className="num text-xs text-pebble">
              Section {active} of 7 · {SECTIONS[active - 1].label}
            </span>
            <button
              type="button"
              onClick={() => goTo(1)}
              disabled={active === 7}
              className="dlg-ghost inline-flex min-h-[44px] items-center gap-1 px-4 py-2 text-sm disabled:opacity-40"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Desktop step rail — sticky card with tonal chips + ember progress */}
        <nav className="hidden self-start lg:sticky lg:top-6 lg:block" aria-label="Profile sections">
          <div className="dlg-card p-4">
            <div className="mb-3 flex items-center gap-3 px-1 pt-1">
              <IconChip icon={UserRound} tone="slate" size={38} iconSize={17} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">Profile Sections</p>
                <p className="text-xs text-stone">
                  <span className="num">{completedCount}</span> of <span className="num">7</span> complete
                </p>
              </div>
            </div>
            <div
              className="mx-1 mb-4 h-1.5 overflow-hidden bg-fog"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={7}
              aria-valuenow={completedCount}
              aria-label={`Profile sections: ${completedCount} of 7 completed`}
            >
              <div
                className="h-full bg-gradient-to-r from-[#f69251] to-[#ef8340] motion-safe:transition-[width] duration-500 ease-out"
                style={{ width: `${(completedCount / 7) * 100}%` }}
              />
            </div>
            <ol>
              {SECTIONS.map((s) => {
                const isActive = active === s.n;
                const done = sectionDone[s.n - 1];
                return (
                  <li key={s.n}>
                    <button
                      type="button"
                      onClick={() => setActive(s.n)}
                      aria-current={isActive ? "step" : undefined}
                      className={`focus-ring flex min-h-[44px] w-full items-center gap-3 py-1.5 pl-1.5 pr-3 text-left text-sm transition-colors ${
                        isActive ? "text-ink" : "text-stone hover:bg-fog hover:text-ink"
                      }`}
                    >
                      <span
                        className={`grid h-7 w-7 shrink-0 place-items-center text-[11px] font-medium ${
                          isActive ? "chip chip-ink" : done ? "chip chip-emerald" : "chip chip-slate"
                        }`}
                      >
                        {done && !isActive ? <Check className="h-3.5 w-3.5" /> : s.num}
                      </span>
                      <span className={`flex-1 truncate ${isActive ? "font-medium text-ink" : ""}`}>{s.label}</span>
                      {done && !isActive && <span className="stage-dot dot-ok" aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </nav>

        {/* Active section */}
        <div>
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
