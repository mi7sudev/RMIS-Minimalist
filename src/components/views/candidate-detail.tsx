"use client";

// ============================================================================
// RMIS — Candidate detail (spec §7.11, `#/candidate?id=<applicantId>`). FULL
// LIVE profile from the admin applicants API: personal ledger, read-only
// entity cards, document rows (files served at /api/files/{filePath}), and the
// application history with deep links into the review workspace. Focus
// refresh only — no poll (spec §13).
// Enterprise polish pass: PageHeader with back affordance, KpiCard row, and
// stacked SectionCards (Contact / Profile summary / Documents / Applications).
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, ArrowUpRight, BriefcaseBusiness, ChevronLeft, ClipboardList,
  FileText, ExternalLink, FolderOpen, GraduationCap, Mail, UserRound,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, KpiCard, PageHeader, SectionCard, SkeletonKpis, SkeletonRows } from "@/components/ui/shell";
import { apiFetch, formatDate, formatDateTime, fullName } from "@/lib/client";
import { dotClass, pillClass, variantForCompletion, variantForStatus, type StatusVariant } from "@/lib/status-ui";
import { navigate, useHashRoute } from "@/lib/router";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/views/review-workspace";
import { ghostBtn, ctaBtn } from "@/components/views/recruitment";

// ── Wire shapes ─────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

type DocumentRow = {
  id: string;
  originalName: string;
  fileName: string;
  category: string;
  status: string;
  filePath: string;
  size: number;
  createdAt: string;
};

type ApplicantDetail = {
  id: number;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  extensionName: string | null;
  emailAddress: string | null;
  mobileNumber: string | null;
  contactNumber: string | null;
  contactNumberSec: string | null;
  telephoneNumber: string | null;
  gender: string | null;
  civilStatus: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  presentAddress: string | null;
  isProfileComplete: boolean;
  user: { id: string; email: string; username: string; role: string; blocked: boolean } | null;
  educations: Row[];
  workExperiences: Row[];
  trainings: Row[];
  eligibilities: Row[];
  awards: Row[];
  documents: DocumentRow[];
  characterReferences: Row[];
  applications: {
    id: number;
    status: string;
    dateApplied: string;
    jobId: number;
    positionTitle: string | null;
    jobTitle: string;
  }[];
};

function s(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  const t = String(v).trim();
  return t;
}

function d(v: unknown): string {
  const t = s(v);
  if (!t) return "";
  const date = new Date(t);
  return Number.isNaN(date.getTime()) ? t : formatDate(date);
}

function LedgerRow({ label, value, num = false }: { label: string; value: string; num?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#ececec] py-2.5 last:border-0">
      <span className="shrink-0 pt-0.5 text-xs text-stone">{label}</span>
      <span className={cn("break-words text-right text-sm text-ink", num && "num")}>{value || "—"}</span>
    </div>
  );
}

function EntityCard({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-[12px] bg-fog p-4">
      <p className="text-sm text-ink">{title}</p>
      {lines.filter(Boolean).length > 0 && <p className="num mt-1 text-xs text-stone">{lines.filter(Boolean).join(" · ")}</p>}
    </div>
  );
}

function EntityGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[#ececec] pt-4 first:border-0 first:pt-0">
      <h3 className="text-[13px] font-medium uppercase tracking-[0.06em] text-stone">{label}</h3>
      <div className="mt-2.5 space-y-3">{children}</div>
    </div>
  );
}

function docStatusVariant(status: string): StatusVariant {
  switch (status) {
    case "EXTRACTED":
      return "ok";
    case "FAILED":
      return "bad";
    case "PARTIALLY_EXTRACTED":
      return "warn";
    default:
      return "neutral";
  }
}

export default function CandidateDetail() {
  const { params } = useHashRoute();
  const id = Number(params.id);
  const valid = Number.isInteger(id) && id > 0;

  const [detail, setDetail] = useState<ApplicantDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!valid) return;
      if (!silent) setError(null);
      try {
        const data = await apiFetch<ApplicantDetail>(`/api/admin/applicants/${id}`);
        setDetail(data);
      } catch (e) {
        if (!silent) setError(e instanceof Error ? e.message : "Failed to load the candidate");
      }
    },
    [id, valid]
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Focus refresh only (no poll — spec §13).
  useEffect(() => {
    const onFocus = () => void load(true);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  if (!valid) {
    return (
      <div className="dlg-card py-6">
        <EmptyState
          icon={UserRound}
          title="No candidate selected"
          description="Open a candidate from the registry to see their full profile."
          action={
            <button type="button" className={ctaBtn} onClick={() => navigate("candidates")}>
              Go to candidates
            </button>
          }
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="dlg-card space-y-4 p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-[var(--bad)]" aria-hidden />
        <p className="text-sm text-stone">{error}</p>
        <button type="button" className={ghostBtn} onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-8 w-1/2" />
        </div>
        <SkeletonKpis count={4} />
        <div className="dlg-card p-6">
          <SkeletonRows rows={6} />
        </div>
      </div>
    );
  }

  const name = fullName(detail);
  const latestApp = detail.applications[0] ?? null;
  const latestPosition = latestApp ? latestApp.positionTitle || latestApp.jobTitle : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button
          type="button"
          aria-label="Back to candidates"
          onClick={() => navigate("candidates")}
          className="focus-ring -ml-2 mb-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-stone transition-colors hover:bg-fog hover:text-ink"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <PageHeader
          title={name}
          description={
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {latestPosition && <span>{latestPosition}</span>}
              {latestApp && (
                <>
                  <span aria-hidden>·</span>
                  <span className="num">Applied {formatDate(latestApp.dateApplied)}</span>
                </>
              )}
              <span aria-hidden>·</span>
              <span className="num">#{detail.id}</span>
              {detail.user && (
                <>
                  <span aria-hidden>·</span>
                  <span>{detail.user.username}</span>
                </>
              )}
            </span>
          }
          actions={
            <>
              <StatusPill
                status={detail.isProfileComplete ? "Complete profile" : "Incomplete profile"}
                variant={variantForCompletion(detail.isProfileComplete)}
              />
              {latestApp && <StatusPill status={latestApp.status} />}
            </>
          }
        />
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Education" value={detail.educations.length} icon={GraduationCap} />
        <KpiCard label="Experience" value={detail.workExperiences.length} icon={BriefcaseBusiness} />
        <KpiCard label="Documents" value={detail.documents.length} icon={FileText} />
        <KpiCard label="Applications" value={detail.applications.length} icon={ClipboardList} tone="info" />
      </div>

      {/* Contact */}
      <SectionCard title="Contact" icon={Mail} description="Personal details on record.">
        <div className="rounded-[12px] bg-fog p-4">
          <LedgerRow label="Email" value={detail.emailAddress ?? ""} />
          <LedgerRow label="Mobile" value={detail.mobileNumber ?? ""} num />
          <LedgerRow label="Contact number" value={detail.contactNumber ?? ""} num />
          <LedgerRow
            label="Other phones"
            value={[detail.contactNumberSec, detail.telephoneNumber].filter(Boolean).join(" · ")}
            num
          />
          <LedgerRow label="Gender" value={detail.gender ?? ""} />
          <LedgerRow label="Civil status" value={detail.civilStatus ?? ""} />
          <LedgerRow label="Birth date" value={detail.birthDate ?? ""} num />
          <LedgerRow label="Birth place" value={detail.birthPlace ?? ""} />
          <LedgerRow label="Present address" value={detail.presentAddress ?? ""} />
        </div>
        {detail.characterReferences.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-stone">Character references</p>
            <ul className="mt-1 space-y-1">
              {detail.characterReferences.map((r, i) => (
                <li key={i} className="text-sm text-ink">
                  {[s(r.name), s(r.address), s(r.telephone) || s(r.contactNumber)].filter(Boolean).join(" · ") || "—"}
                </li>
              ))}
            </ul>
          </div>
        )}
      </SectionCard>

      {/* Profile summary */}
      <SectionCard
        title="Profile summary"
        icon={UserRound}
        description="Education, experience, training, eligibility, and awards on file."
      >
        <div className="space-y-4">
          <EntityGroup label="Education">
            {detail.educations.length === 0 ? (
              <p className="text-[13px] text-pebble">No education entries on file.</p>
            ) : (
              detail.educations.map((e, i) => (
                <EntityCard
                  key={i}
                  title={[s(e.degree) || s(e.course), s(e.specifyOthers)].filter(Boolean).join(" — ") || "—"}
                  lines={[
                    [s(e.educationLevel), s(e.schoolName)].filter(Boolean).join(" · "),
                    [s(e.yearFrom) && `${s(e.yearFrom)}–${s(e.yearTo) || (e.ongoing ? "Present" : "")}`, s(e.yearGraduated) && `Graduated ${s(e.yearGraduated)}`]
                      .filter(Boolean)
                      .join(" · "),
                    s(e.awards) && `Honors: ${s(e.awards)}`,
                  ]}
                />
              ))
            )}
          </EntityGroup>

          <EntityGroup label="Experience">
            {detail.workExperiences.length === 0 ? (
              <p className="text-[13px] text-pebble">No work experience entries on file.</p>
            ) : (
              detail.workExperiences.map((w, i) => (
                <EntityCard
                  key={i}
                  title={s(w.positionTitle) || "—"}
                  lines={[
                    s(w.employerName),
                    `${d(w.dateFrom) || "—"} – ${w.isPresentWork ? "Present" : d(w.dateTo) || "—"}`,
                    [s(w.statusOfEmployment), s(w.monthlySalary) && `PHP ${s(w.monthlySalary)}`].filter(Boolean).join(" · "),
                  ]}
                />
              ))
            )}
          </EntityGroup>

          <EntityGroup label="Training">
            {detail.trainings.length === 0 ? (
              <p className="text-[13px] text-pebble">No training entries on file.</p>
            ) : (
              detail.trainings.map((t, i) => (
                <EntityCard
                  key={i}
                  title={s(t.title) || "—"}
                  lines={[
                    [s(t.typeOfTraining), s(t.numberHours) && `${s(t.numberHours)} hrs`].filter(Boolean).join(" · "),
                    `${d(t.dateFrom) || "—"} – ${d(t.dateTo) || "—"}`,
                  ]}
                />
              ))
            )}
          </EntityGroup>

          <EntityGroup label="Eligibility">
            {detail.eligibilities.length === 0 ? (
              <p className="text-[13px] text-pebble">No eligibility records on file.</p>
            ) : (
              detail.eligibilities.map((e, i) => (
                <EntityCard
                  key={i}
                  title={s(e.title) || s(e.eligibilityTitle) || "—"}
                  lines={[
                    s(e.rating) && `Rating: ${s(e.rating)}`,
                    d(e.examDate),
                    s(e.examPlace),
                    s(e.licenseNumber) && `License ${s(e.licenseNumber)}`,
                  ]}
                />
              ))
            )}
          </EntityGroup>

          <EntityGroup label="Awards">
            {detail.awards.length === 0 ? (
              <p className="text-[13px] text-pebble">No awards or accomplishments on file.</p>
            ) : (
              detail.awards.map((a, i) => (
                <EntityCard
                  key={i}
                  title={s(a.details) || "—"}
                  lines={[[s(a.recognitionType), s(a.scope), s(a.provider), d(a.dateGranted)].filter(Boolean).join(" · ")]}
                />
              ))
            )}
          </EntityGroup>
        </div>
      </SectionCard>

      {/* Documents */}
      <SectionCard title="Documents" icon={FolderOpen} description="Files are served from the document store.">
        {detail.documents.length === 0 ? (
          <p className="py-4 text-center text-sm text-pebble">No documents uploaded.</p>
        ) : (
          <div className="space-y-3">
            {detail.documents.map((doc) => (
              <div key={doc.id} className="flex flex-wrap items-center gap-3 rounded-[12px] bg-fog p-4">
                <FileText className="h-4 w-4 shrink-0 text-stone" aria-hidden />
                <div className="min-w-0 flex-1">
                  <a
                    href={`/api/files/${doc.filePath}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="focus-ring inline-flex items-center gap-1 break-all text-sm text-ink underline underline-offset-4"
                  >
                    {doc.originalName}
                    <ExternalLink className="inline h-3 w-3" aria-hidden />
                  </a>
                  <p className="num mt-0.5 text-xs text-pebble">
                    {doc.category} · {(doc.size / 1024).toFixed(0)} KB · {formatDateTime(doc.createdAt)}
                  </p>
                </div>
                <span className={pillClass(docStatusVariant(doc.status))}>{doc.status.replaceAll("_", " ")}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Applications timeline */}
      <SectionCard title="Applications" icon={ClipboardList} description="Every application on file, most recent first.">
        {detail.applications.length === 0 ? (
          <EmptyState icon={BriefcaseBusiness} title="No applications on file" />
        ) : (
          <div className="relative before:absolute before:bottom-4 before:left-[3.5px] before:top-4 before:w-px before:bg-[#ececec] before:content-['']">
            {detail.applications.map((app) => (
              <button
                key={app.id}
                type="button"
                className="group/row relative flex w-full items-center gap-3 rounded-[12px] py-3 pr-2 text-left transition-colors hover:bg-fog/60 focus-ring"
                onClick={() => navigate("evaluator-review", { id: String(app.id) })}
                aria-label={`Open review workspace for ${app.positionTitle || app.jobTitle}`}
              >
                <span className={cn("stage-dot relative shrink-0", dotClass(variantForStatus(app.status)))} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{app.positionTitle || app.jobTitle}</p>
                  <p className="num mt-0.5 text-xs text-stone">Applied {formatDate(app.dateApplied)}</p>
                </div>
                <StatusPill status={app.status} />
                <ArrowUpRight
                  className="h-4 w-4 shrink-0 text-pebble opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100 max-lg:opacity-100"
                  aria-hidden
                />
              </button>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
