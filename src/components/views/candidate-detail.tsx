"use client";

// ============================================================================
// RMIS — Candidate detail (spec §7.11, `#/candidate?id=<applicantId>`). FULL
// LIVE profile from the admin applicants API: personal ledger, read-only
// entity cards, document rows (files served at /api/files/{filePath}), and the
// application history with deep links into the review workspace. Focus
// refresh only — no poll (spec §13).
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch, formatDate, formatDateTime, fullName } from "@/lib/client";
import { getStatusMeta } from "@/lib/status";
import { navigate, useHashRoute } from "@/lib/router";
import { StatusPill, toneClass } from "@/components/views/review-workspace";
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

function LedgerRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-[#ececec] last:border-0">
      <span className="text-xs text-pebble shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-ink text-right break-words">{value || "—"}</span>
    </div>
  );
}

function EntityCard({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="bg-fog rounded-[12px] p-4">
      <p className="text-sm text-ink">{title}</p>
      {lines.filter(Boolean).length > 0 && <p className="text-xs text-stone mt-1">{lines.filter(Boolean).join(" · ")}</p>}
    </div>
  );
}

function docStatusCls(status: string): string {
  switch (status) {
    case "EXTRACTED":
      return "bg-ink text-white";
    case "FAILED":
      return "bg-dusty-rose/15 text-dusty-rose";
    case "PARTIALLY_EXTRACTED":
      return "bg-fog text-ink";
    default:
      return "bg-fog text-stone";
  }
}

function KpiTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="dlg-card p-4">
      <p className="text-xs text-pebble">{label}</p>
      <p className="font-display text-2xl text-ink mt-1 tabular-nums">{value}</p>
    </div>
  );
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
      <div className="dlg-card p-8 text-center space-y-3">
        <p className="text-sm text-stone">No candidate selected.</p>
        <button type="button" className={ctaBtn} onClick={() => navigate("candidates")}>
          Go to candidates
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

  if (!detail) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/2" />
        <div className="dlg-card p-6 space-y-4">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-40 w-full rounded-[12px]" />
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
      <div className="space-y-3">
        <button type="button" className={ghostBtn} onClick={() => navigate("candidates")}>
          ← Back to candidates
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl text-ink">{name}</h1>
          <span className={`rounded-full px-2.5 py-1 text-xs ${detail.isProfileComplete ? "bg-ink text-white" : "bg-fog text-stone"}`}>
            {detail.isProfileComplete ? "Complete profile" : "Incomplete profile"}
          </span>
          {latestApp && <StatusPill status={latestApp.status} />}
        </div>
        <p className="text-sm text-stone">
          {latestPosition ? `${latestPosition} · ` : ""}
          {latestApp ? `Applied ${formatDate(latestApp.dateApplied)} · ` : ""}
          #{detail.id}
          {detail.user ? ` · ${detail.user.username}` : ""}
        </p>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label="Education" value={detail.educations.length} />
        <KpiTile label="Experience" value={detail.workExperiences.length} />
        <KpiTile label="Documents" value={detail.documents.length} />
        <KpiTile label="Applications" value={detail.applications.length} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="education">Education</TabsTrigger>
          <TabsTrigger value="experience">Experience</TabsTrigger>
          <TabsTrigger value="training">Training</TabsTrigger>
          <TabsTrigger value="eligibility">Eligibility</TabsTrigger>
          <TabsTrigger value="awards">Awards</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="applications">Applications</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="dlg-card p-6">
            <div className="bg-fog rounded-[12px] p-4">
              <LedgerRow label="Email" value={detail.emailAddress ?? ""} />
              <LedgerRow label="Mobile" value={detail.mobileNumber ?? ""} />
              <LedgerRow label="Contact number" value={detail.contactNumber ?? ""} />
              <LedgerRow
                label="Other phones"
                value={[detail.contactNumberSec, detail.telephoneNumber].filter(Boolean).join(" · ")}
              />
              <LedgerRow label="Gender" value={detail.gender ?? ""} />
              <LedgerRow label="Civil status" value={detail.civilStatus ?? ""} />
              <LedgerRow label="Birth date" value={detail.birthDate ?? ""} />
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
          </div>
        </TabsContent>

        <TabsContent value="education" className="mt-4">
          <div className="dlg-card p-6 space-y-3">
            {detail.educations.length === 0 ? (
              <p className="text-sm text-pebble py-4 text-center">No education entries on file.</p>
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
          </div>
        </TabsContent>

        <TabsContent value="experience" className="mt-4">
          <div className="dlg-card p-6 space-y-3">
            {detail.workExperiences.length === 0 ? (
              <p className="text-sm text-pebble py-4 text-center">No work experience entries on file.</p>
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
          </div>
        </TabsContent>

        <TabsContent value="training" className="mt-4">
          <div className="dlg-card p-6 space-y-3">
            {detail.trainings.length === 0 ? (
              <p className="text-sm text-pebble py-4 text-center">No training entries on file.</p>
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
          </div>
        </TabsContent>

        <TabsContent value="eligibility" className="mt-4">
          <div className="dlg-card p-6 space-y-3">
            {detail.eligibilities.length === 0 ? (
              <p className="text-sm text-pebble py-4 text-center">No eligibility records on file.</p>
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
          </div>
        </TabsContent>

        <TabsContent value="awards" className="mt-4">
          <div className="dlg-card p-6 space-y-3">
            {detail.awards.length === 0 ? (
              <p className="text-sm text-pebble py-4 text-center">No awards or accomplishments on file.</p>
            ) : (
              detail.awards.map((a, i) => (
                <EntityCard
                  key={i}
                  title={s(a.details) || "—"}
                  lines={[[s(a.recognitionType), s(a.scope), s(a.provider), d(a.dateGranted)].filter(Boolean).join(" · ")]}
                />
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <div className="dlg-card p-6 space-y-3">
            {detail.documents.length === 0 ? (
              <p className="text-sm text-pebble py-4 text-center">No documents uploaded.</p>
            ) : (
              detail.documents.map((doc) => (
                <div
                  key={doc.id}
                  className="bg-fog rounded-[12px] p-4 flex flex-wrap items-center gap-3"
                >
                  <FileText className="h-4 w-4 text-stone shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <a
                      href={`/api/files/${doc.filePath}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-ink underline underline-offset-4 break-all inline-flex items-center gap-1"
                    >
                      {doc.originalName}
                      <ExternalLink className="h-3 w-3 inline" aria-hidden />
                    </a>
                    <p className="text-xs text-pebble mt-0.5">
                      {doc.category} · {(doc.size / 1024).toFixed(0)} KB · {formatDateTime(doc.createdAt)}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs shrink-0 ${docStatusCls(doc.status)}`}>
                    {doc.status.replaceAll("_", " ")}
                  </span>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="applications" className="mt-4">
          <div className="dlg-card p-6 space-y-3">
            {detail.applications.length === 0 ? (
              <p className="text-sm text-pebble py-4 text-center">No applications on file.</p>
            ) : (
              detail.applications.map((app) => {
                const meta = getStatusMeta(app.status);
                return (
                  <button
                    key={app.id}
                    type="button"
                    className="bg-fog rounded-[12px] p-4 w-full flex items-center gap-3 text-left hover:shadow-md transition-shadow min-h-[44px]"
                    onClick={() => navigate("evaluator-review", { id: String(app.id) })}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink truncate">{app.positionTitle || app.jobTitle}</p>
                      <p className="text-xs text-stone mt-0.5">Applied {formatDate(app.dateApplied)}</p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium ${toneClass(meta.tone)}`}>
                      {meta.label}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
