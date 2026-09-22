"use client";

// ============================================================================
// RMIS — Profile builder (spec §7.4): the 7-part applicant profile.
// Header card (avatar from PROFILE_PICTURE, completeness ring as "X of 7" +
// thin bar, document count, Mark Complete gate) · PDS auto-fill card (§7.5) ·
// numbered 01–07 section navigation (mobile stepper strip + desktop sticky
// list) · sections 01–07. Data loads in parallel; every mutation silently
// reloads and refreshes the session (§3.2).
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileText,
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
import { apiFetch, fullName } from "@/lib/client";
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
      <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:py-8">
        <div className="dlg-card h-40 animate-pulse p-6" />
        <div className="mt-6 dlg-card h-44 animate-pulse p-6" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="dlg-card hidden h-72 animate-pulse lg:block" />
          <div className="dlg-card h-96 animate-pulse p-6" />
        </div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:py-8">
        <div className="dlg-card flex flex-col items-center gap-3 p-10 text-center">
          <AlertCircle className="h-6 w-6 text-dusty-rose" />
          <p className="text-sm text-stone">{error}</p>
          <button type="button" onClick={() => void loadAll(false)} className="dlg-ghost min-h-[44px] px-6 py-2.5 text-sm">
            <RefreshCw className="mr-2 inline h-3.5 w-3.5" /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:py-8">
      {/* ── Header card ─────────────────────────────────────────────────────── */}
      <section className="dlg-card p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          {/* Avatar */}
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-ink">
            {pictureDoc ? (
               
              <img src={`/api/files/${pictureDoc.filePath}`} alt="Profile picture" className="h-full w-full rounded-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center font-display text-lg text-white">{initials}</span>
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
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  isComplete ? "bg-ink text-white" : "border border-border bg-fog text-stone"
                }`}
              >
                {isComplete ? "Complete" : "Incomplete"}
              </span>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-stone">
              <FileText className="h-3.5 w-3.5" />
              {docs.length} document{docs.length === 1 ? "" : "s"} on file
              {!isComplete && " · PDS auto-fill available below"}
            </p>
          </div>

          {/* Completion ring — "X of 7" + thin bar (ink fill, not orange) */}
          <div className="w-full sm:w-48">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-xl text-ink">{completedCount} of 7</span>
              <span className="text-xs text-pebble">sections done</span>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-fog">
              <div className="h-full rounded-full bg-ink transition-all" style={{ width: `${(completedCount / 7) * 100}%` }} />
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
        {/* Mobile stepper strip */}
        <div className="lg:hidden">
          <div className="flex gap-1 overflow-x-auto scroll-thin pb-1">
            {SECTIONS.map((s) => (
              <button
                key={s.n}
                type="button"
                onClick={() => setActive(s.n)}
                aria-label={s.label}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                  active === s.n ? "bg-ink text-white" : "border border-border bg-white text-stone"
                }`}
              >
                {s.num}
              </button>
            ))}
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
            <span className="text-xs text-pebble">
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

        {/* Desktop sticky list */}
        <nav className="hidden lg:block lg:sticky lg:top-6" aria-label="Profile sections">
          <ul className="space-y-1.5">
            {SECTIONS.map((s) => {
              const isActive = active === s.n;
              const done = sectionDone[s.n - 1];
              return (
                <li key={s.n}>
                  <button
                    type="button"
                    onClick={() => setActive(s.n)}
                    className={`flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-left text-sm transition-colors ${
                      isActive ? "bg-ink text-white" : "text-stone hover:bg-fog hover:text-ink"
                    }`}
                  >
                    <span className={`text-xs ${isActive ? "text-white/70" : "text-pebble"}`}>{s.num}</span>
                    <span className="flex-1 truncate">{s.label}</span>
                    <span
                      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] ${
                        done
                          ? isActive
                            ? "bg-white text-ink"
                            : "bg-ink text-white"
                          : isActive
                            ? "bg-white/20"
                            : "border border-border bg-fog"
                      }`}
                    >
                      {done ? "✓" : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
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
            <AlertDialogCancel className="dlg-ghost min-h-[44px] border-0 px-5 py-2.5 text-sm">Not yet</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void markComplete();
              }}
              disabled={marking}
              className="dlg-cta min-h-[44px] border-0 px-5 py-2.5 text-sm disabled:opacity-50"
            >
              {marking ? "Marking…" : "Mark Complete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
