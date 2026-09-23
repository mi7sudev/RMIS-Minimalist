"use client";

// ============================================================================
// RMIS — Evaluator review workspace (spec §7.9, §9.3).
// Default export = smart wrapper: with an `applicationId` prop it renders the
// workspace body (used inside the review-queue modal); without one it reads
// the deep-link `#/evaluator-review?id=<applicationId>` from useHashRoute and
// renders page-style with a close action back to the review queue.
// LEFT = frozen-snapshot dossier (underline section tabs), RIGHT = decision
// rail (requirements match, credentials, state banner, decisions, notices,
// direct email). Enterprise polish pass: functional status pills/dots only —
// every handler, fetch, and confirmation dialog is unchanged.
// Wave-3 premium pass: warm monogram dossier header, gradient ink→ember
// active-tab underline, tone chips on verdict actions, mini emerald/rose
// requirement indicators, IconChip rail headers. Handlers byte-identical.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowLeft, Award, BadgeCheck, BookOpen, BriefcaseBusiness,
  Check, Eye, FileText, Gavel, GraduationCap, History, IdCard, ListChecks, Mail,
  Minus, Mails, Paperclip, RotateCcw, ScanSearch, Send, Star, UserRound, X, XCircle,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  EmptyState, IconChip, Monogram, PageHeader, SkeletonRows, type ChipTone,
} from "@/components/ui/shell";
import { apiFetch, formatDate, formatDateTime, fullName, timeAgo } from "@/lib/client";
import { getStatusMeta, stageForStatus, type Tone } from "@/lib/status";
import { pillClass, variantForStatus, variantForVerdict, type StatusVariant } from "@/lib/status-ui";
import { navigate, useHashRoute } from "@/lib/router";
import { cn } from "@/lib/utils";
import type { RequirementsReport } from "@/lib/requirements";

// ── Wire shapes (GET /api/evaluator/applications/[id]) ──────────────────────

type SnapRow = Record<string, unknown>;

type ReviewPayload = {
  id: number;
  status: string;
  reason: string | null;
  dateApplied: string;
  applicantId: number;
  jobId: number;
  job: {
    id: number;
    title: string;
    positionType: string | null;
    position: {
      positionTitle: string;
      placeOfAssignment: string | null;
      itemNumber: string | null;
    } | null;
  };
  applicant: {
    id: number;
    firstName: string | null;
    lastName: string | null;
    emailAddress: string | null;
    contactNumber: string | null;
    gender: string | null;
    isProfileComplete: boolean;
  };
  snapshots: {
    profile: SnapRow | null;
    educations: SnapRow[];
    experiences: SnapRow[];
    trainings: SnapRow[];
    eligibilities: SnapRow[];
    awards: SnapRow[];
    documents: unknown[];
  };
  requirements: RequirementsReport;
};

type NoticeRow = {
  id: number;
  type: "regret" | "interview" | "skills_exam";
  subject: string;
  status: string;
  to: string;
  sentAt: string;
};

type DirectEmailRow = {
  id: number;
  to: string;
  subject: string;
  status: string;
  provider: string;
  error: string | null;
  attachments: string | null;
  createdAt: string;
};

type NoticeSendResult = {
  type: string;
  email: { status: string; to?: string; error?: string | null };
  sms: { status: string; to?: string; error?: string | null };
};

// ── Small shared visuals ────────────────────────────────────────────────────

/** Legacy tone→class bridge (kept for existing importers). */
export function toneClass(tone: Tone): string {
  const map: Record<Tone, StatusVariant> = {
    success: "ok",
    warning: "warn",
    danger: "bad",
    info: "info",
    primary: "info",
    neutral: "neutral",
  };
  return pillClass(map[tone]);
}

/**
 * Canonical stage/status pill. Displays the normalized status label; the
 * variant comes from variantForStatus unless explicitly overridden (used for
 * completion / verdict labels that are not application statuses).
 */
export function StatusPill({
  status,
  variant,
  className = "",
}: {
  status: string | null | undefined;
  variant?: StatusVariant;
  className?: string;
}) {
  const label = getStatusMeta(status).label;
  const v: StatusVariant = variant ?? variantForStatus(status);
  return <span className={cn(pillClass(v), "shrink-0", className)}>{label}</span>;
}

function verdictMeta(verdict: string): { chip: string; variant: StatusVariant; meaning: string } {
  switch (verdict) {
    case "ALL_MET":
      return { chip: "Qualified", variant: variantForVerdict("Qualified"), meaning: "Meets the minimum requirements" };
    case "PARTIAL":
      return { chip: "Partial", variant: variantForVerdict("Partial"), meaning: "Partially meets the minimum requirements" };
    case "NONE_MET":
      return { chip: "Not qualified", variant: variantForVerdict("Not qualified"), meaning: "Does not meet the minimum requirements" };
    case "NEEDS_REVIEW":
      return { chip: "Verify", variant: variantForVerdict("Verify"), meaning: "Needs manual verification" };
    case "NO_REQUIREMENTS":
      return { chip: "No reqs", variant: variantForVerdict("No reqs"), meaning: "No published requirements" };
    default:
      return { chip: verdict, variant: variantForVerdict(verdict), meaning: "" };
  }
}

/** MQR verdict pill for queue cards / list rows (null when no verdict). */
export function VerdictPill({ verdict, className = "" }: { verdict: string | null | undefined; className?: string }) {
  if (!verdict) return null;
  const vm = verdictMeta(verdict);
  return <span className={cn(pillClass(vm.variant), "shrink-0", className)}>{vm.chip}</span>;
}

const ghostBtn =
  "dlg-ghost inline-flex min-h-[44px] items-center justify-center gap-2 px-4 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const ctaBtn =
  "dlg-cta inline-flex min-h-[44px] items-center justify-center gap-2 px-5 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-50";
const destructiveGhost =
  "border-[var(--bad)]/30 text-[var(--bad)] hover:bg-[var(--bad-bg)]";

/** Gradient monogram avatar (wave-3) with initials derived from the name. */
function MonogramAvatar({ name, size = 36, warm = false }: { name: string; size?: number; warm?: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span aria-hidden="true">
      <Monogram size={size} warm={warm} className="rounded-full">{initials || "?"}</Monogram>
    </span>
  );
}

/** Requirement check status → mini matched/missing indicator chip. */
function checkChip(status: string): { icon: typeof Check; tone: ChipTone } {
  switch (status) {
    case "MET":
      return { icon: Check, tone: "emerald" };
    case "NOT_MET":
      return { icon: X, tone: "rose" };
    case "REVIEW":
      return { icon: Eye, tone: "slate" };
    default:
      return { icon: Minus, tone: "slate" };
  }
}

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  const s = String(v).trim();
  return s;
}

function LedgerRow({ label, value, num = false }: { label: string; value: string; num?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#ececec] py-2.5 last:border-0">
      <span className="shrink-0 pt-0.5 text-xs text-stone">{label}</span>
      <span className={cn("break-words text-right text-sm text-ink", num && "num")}>{value || "—"}</span>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-pebble">{children}</p>;
}

function snapshotDisplayDate(v: unknown): string {
  const s = str(v);
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : formatDate(d);
}

// ── Dossier section tabs (underline style) ──────────────────────────────────

const DOSSIER_TABS = [
  { value: "profile", label: "Profile", icon: UserRound },
  { value: "education", label: "Education", icon: GraduationCap },
  { value: "experience", label: "Experience", icon: BriefcaseBusiness },
  { value: "training", label: "Training", icon: BookOpen },
  { value: "eligibility", label: "Eligibility", icon: BadgeCheck },
  { value: "awards", label: "Awards", icon: Award },
  { value: "documents", label: "Documents", icon: FileText },
] as const;

const tabsListCls =
  "h-auto w-full flex-wrap justify-start gap-1 rounded-none border-b border-border bg-transparent p-0";
const tabTriggerCls =
  "flex-none gap-1.5 rounded-none border-0 border-b-2 border-transparent bg-transparent px-3 py-2.5 text-[13px] font-medium text-stone shadow-none transition-colors hover:text-ink data-[state=active]:bg-transparent data-[state=active]:text-ink data-[state=active]:shadow-none data-[state=active]:[background-image:linear-gradient(90deg,#181825,#f69251)] data-[state=active]:[background-size:100%_2px] data-[state=active]:[background-position:bottom] data-[state=active]:[background-repeat:no-repeat]";

// ── Snapshot tab renderers ──────────────────────────────────────────────────

function EducationCards({ rows }: { rows: SnapRow[] }) {
  if (!rows.length) return <EmptyNote>No education entries on file.</EmptyNote>;
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="rounded-none bg-fog p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-ink">{str(r.degree) || str(r.course) || str(r.specifyOthers) || "—"}</p>
            {r.ongoing === true && <span className="status-pill status-neutral shrink-0">Ongoing</span>}
          </div>
          <p className="mt-1 text-xs text-stone">
            {[str(r.educationLevel), str(r.schoolName)].filter(Boolean).join(" · ") || "—"}
          </p>
          <p className="num mt-0.5 text-xs text-pebble">
            {[str(r.yearFrom) && `${str(r.yearFrom)}–${str(r.yearTo) || (r.ongoing ? "Present" : "")}`, str(r.yearGraduated) && `Graduated ${str(r.yearGraduated)}`, str(r.unitsEarned) && `${str(r.unitsEarned)} units`]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
          {str(r.awards) && <p className="mt-1 text-xs text-stone">Honors: {str(r.awards)}</p>}
        </div>
      ))}
    </div>
  );
}

function ExperienceCards({ rows }: { rows: SnapRow[] }) {
  if (!rows.length) return <EmptyNote>No work experience entries on file.</EmptyNote>;
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="rounded-none bg-fog p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-ink">{str(r.positionTitle) || "—"}</p>
            {r.isPresentWork === true && (
              <span className="shrink-0 bg-ink px-2 py-0.5 text-xs text-white">Present</span>
            )}
          </div>
          <p className="mt-1 text-xs text-stone">{str(r.employerName) || "—"}</p>
          <p className="num mt-0.5 text-xs text-pebble">
            {[
              (str(r.dateFrom) || str(r.dateTo)) &&
                `${snapshotDisplayDate(r.dateFrom) || "—"} – ${r.isPresentWork ? "Present" : snapshotDisplayDate(r.dateTo) || "—"}`,
              str(r.statusOfEmployment),
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
      ))}
    </div>
  );
}

function TrainingCards({ rows }: { rows: SnapRow[] }) {
  if (!rows.length) return <EmptyNote>No training entries on file.</EmptyNote>;
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="rounded-none bg-fog p-4">
          <p className="text-sm text-ink">{str(r.title) || "—"}</p>
          <p className="num mt-1 text-xs text-stone">
            {[str(r.typeOfTraining), str(r.numberHours) && `${str(r.numberHours)} hrs`, str(r.hourDecimal) && `${str(r.hourDecimal)} hrs`]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
          <p className="num mt-0.5 text-xs text-pebble">
            {snapshotDisplayDate(r.dateFrom) || snapshotDisplayDate(r.dateTo)
              ? `${snapshotDisplayDate(r.dateFrom) || "—"} – ${snapshotDisplayDate(r.dateTo) || "—"}`
              : "—"}
          </p>
        </div>
      ))}
    </div>
  );
}

function EligibilityCards({ rows }: { rows: SnapRow[] }) {
  if (!rows.length) return <EmptyNote>No eligibility records on file.</EmptyNote>;
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="rounded-none bg-fog p-4">
          <p className="text-sm text-ink">{str(r.title) || str(r.eligibilityTitle) || "—"}</p>
          <p className="num mt-1 text-xs text-stone">
            {[str(r.rating) && `Rating: ${str(r.rating)}`, snapshotDisplayDate(r.examDate), str(r.examPlace), str(r.licenseNumber) && `License ${str(r.licenseNumber)}`]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
      ))}
    </div>
  );
}

function AwardCards({ rows }: { rows: SnapRow[] }) {
  if (!rows.length) return <EmptyNote>No awards or accomplishments on file.</EmptyNote>;
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="rounded-none bg-fog p-4">
          <p className="text-sm text-ink">{str(r.details) || "—"}</p>
          <p className="num mt-1 text-xs text-stone">
            {[str(r.recognitionType), str(r.scope), str(r.provider), snapshotDisplayDate(r.dateGranted)]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Decision rail pieces ────────────────────────────────────────────────────

/** Requirement check status → pill (verdict colors). */
function checkPill(status: string): { label: string; variant: StatusVariant } {
  switch (status) {
    case "MET":
      return { label: "Met", variant: "ok" };
    case "NOT_MET":
      return { label: "Not met", variant: "bad" };
    case "REVIEW":
      return { label: "Verify", variant: "neutral" };
    default:
      return { label: "Not required", variant: "neutral" };
  }
}

function RequirementsMatchPanel({ report }: { report: RequirementsReport }) {
  const vm = verdictMeta(report.verdict);
  const allMet = report.requiredCount > 0 && report.metCount === report.requiredCount;
  const summaryCls = allMet ? "text-[var(--ok)]" : report.metCount > 0 ? "text-[var(--warn)]" : "text-stone";
  return (
    <div className="dlg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconChip icon={ListChecks} tone="gold" size={36} iconSize={16} />
          <div className="min-w-0">
            <h3 className="text-[15px] font-medium leading-6 text-ink">Requirements match</h3>
            <p className="mt-0.5 text-xs text-stone">{vm.meaning}</p>
          </div>
        </div>
        <StatusPill status={vm.chip} variant={vm.variant} className="shrink-0" />
      </div>
      <p className={cn("num mt-2 text-sm font-medium", summaryCls)}>
        {report.metCount} of {report.requiredCount} standards met
      </p>
      {report.checks.length > 0 && (
        <div className="mt-3 max-h-96 space-y-2.5 overflow-y-auto scroll-thin pr-1">
          {report.checks.map((c, i) => {
            const cp = checkPill(c.status);
            const cc = checkChip(c.status);
            return (
              <div key={i} className="rounded-none border border-border p-3.5">
                <div className="flex items-start gap-2.5">
                  <IconChip icon={cc.icon} tone={cc.tone} size={22} iconSize={12} className="mt-0.5" />
                  <p className="min-w-0 flex-1 text-[13px] leading-5 text-ink line-clamp-2">{c.standard || "—"}</p>
                  <StatusPill status={cp.label} variant={cp.variant} className="shrink-0" />
                </div>
                <p className="num mt-1.5 text-xs leading-5 text-stone line-clamp-2">
                  {c.applicantSummary || "No applicant data on file."}
                </p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  {c.shortfall ? (
                    <p className="text-xs text-[var(--bad)]">{c.shortfall}</p>
                  ) : (
                    <span aria-hidden />
                  )}
                  <span className="shrink-0 bg-fog px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-pebble">
                    {c.dimension}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CredentialsRow({ payload }: { payload: ReviewPayload }) {
  const p = payload.snapshots.profile;
  const personalCount = p ? Object.values(p).filter((v) => v !== null && v !== "" && v !== undefined).length : 0;
  const items: [string, number][] = [
    ["Personal", personalCount],
    ["Education", payload.snapshots.educations.length],
    ["Work", payload.snapshots.experiences.length],
    ["Training", payload.snapshots.trainings.length],
    ["Eligibility", payload.snapshots.eligibilities.length],
    ["Awards", payload.snapshots.awards.length],
  ];
  return (
    <div className="dlg-card p-4">
      <div className="flex items-center gap-2.5">
        <IconChip icon={IdCard} tone="slate" size={28} iconSize={13} />
        <h3 className="text-[15px] font-medium leading-6 text-ink">Credentials on file</h3>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {items.map(([label, n]) => (
          <span key={label} className="status-pill status-neutral">
            {label}: <span className="num">{n}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function stateBanner(stage: string): { text: string; cls: string } {
  if (stage === "Shortlisted") return { text: "Applicant has been notified.", cls: "text-stone" };
  if (stage === "Rejected") return { text: "Applicant was not shortlisted.", cls: "text-stone" };
  if (stage === "Under Review") return { text: "Review in progress.", cls: "text-ink" };
  return { text: "Awaiting review.", cls: "text-stone" };
}

// ── Notice form dialog (interview / skills exam) ────────────────────────────

function NoticeFormDialog({
  applicationId,
  kind,
  onClose,
  onSent,
}: {
  applicationId: number;
  kind: "interview" | "skills_exam";
  onClose: () => void;
  onSent: () => void;
}) {
  const [examType, setExamType] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [venue, setVenue] = useState("");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const ready = date.trim() !== "" && time.trim() !== "" && venue.trim() !== "";

  const submit = async () => {
    setBusy(true);
    try {
      const res = await apiFetch<NoticeSendResult>(`/api/evaluator/applications/${applicationId}/notice`, {
        method: "POST",
        body: {
          type: kind,
          date: date || undefined,
          time: time || undefined,
          venue: venue || undefined,
          contact: contact || undefined,
          notes: notes || undefined,
          examType: kind === "skills_exam" ? examType || undefined : undefined,
        },
      });
      const label = kind === "interview" ? "Interview invitation" : "Skills-exam notice";
      toast.success(`${label} sent`, {
        description: `Email: ${res.email?.status ?? "unknown"} · SMS: ${res.sms?.status ?? "unknown"}`,
      });
      onSent();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send the notice");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {kind === "interview" ? "Send interview invitation" : "Send skills-exam notice"}
          </DialogTitle>
          <DialogDescription>
            The notice fans out as an email plus a companion SMS to the applicant.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {kind === "skills_exam" && (
            <div className="space-y-1.5">
              <Label htmlFor="notice-exam-type" className="text-xs text-stone">
                Exam type
              </Label>
              <Input
                id="notice-exam-type"
                className="dlg-input"
                value={examType}
                onChange={(e) => setExamType(e.target.value)}
                placeholder="e.g. Encoding / trade test"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="notice-date" className="text-xs text-stone">
                Date *
              </Label>
              <Input id="notice-date" type="date" className="dlg-input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notice-time" className="text-xs text-stone">
                Time *
              </Label>
              <Input id="notice-time" type="time" className="dlg-input" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notice-venue" className="text-xs text-stone">
              Venue *
            </Label>
            <Input
              id="notice-venue"
              className="dlg-input"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="Building / room"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notice-contact" className="text-xs text-stone">
              HR contact
            </Label>
            <Input
              id="notice-contact"
              className="dlg-input"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Name / number for questions"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notice-notes" className="text-xs text-stone">
              Notes
            </Label>
            <Textarea id="notice-notes" className="dlg-input min-h-[80px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <button type="button" className={ghostBtn} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={ctaBtn} disabled={!ready || busy} onClick={() => void submit()}>
            <Send className="h-4 w-4" aria-hidden />
            {busy ? "Sending…" : "Send notice"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Direct email card ───────────────────────────────────────────────────────

function parseAttachments(json: string | null): { name: string; bytes: number }[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as { name: string; bytes: number }[]) : [];
  } catch {
    return [];
  }
}

function emailStatusVariant(status: string): StatusVariant {
  return status === "sent" || status === "mock" ? "neutral" : "bad";
}

function DirectEmailCard({
  applicationId,
  emails,
  onSent,
}: {
  applicationId: number;
  emails: DirectEmailRow[] | null;
  onSent: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFiles = (list: FileList | null) => {
    if (!list) return;
    const next = Array.from(list);
    if (next.length + files.length > 3) {
      toast.error("A maximum of 3 attachments is allowed");
      return;
    }
    if (next.some((f) => f.size > 5 * 1024 * 1024)) {
      toast.error("Each attachment must be 5 MB or smaller");
      return;
    }
    setFiles((prev) => [...prev, ...next].slice(0, 3));
    if (fileRef.current) fileRef.current.value = "";
  };

  const send = async () => {
    if (!message.trim()) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("subject", subject.trim());
      fd.set("message", message.trim());
      for (const f of files) fd.append("attachments", f);
      const res = await apiFetch<{ email: { status: string; error?: string | null }; attachments: number }>(
        `/api/evaluator/applications/${applicationId}/email`,
        { method: "POST", formData: fd }
      );
      if (res.email?.status === "failed") {
        toast.error("Email delivery failed", { description: res.email.error ?? undefined });
      } else {
        toast.success(`Direct email ${res.email?.status}`, {
          description: res.attachments ? `${res.attachments} attachment(s) included.` : undefined,
        });
      }
      setSubject("");
      setMessage("");
      setFiles([]);
      onSent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send the email");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dlg-card p-4">
      <div className="flex items-center gap-2.5">
        <IconChip icon={Mail} tone="slate" size={28} iconSize={13} />
        <h3 className="text-[15px] font-medium leading-6 text-ink">Direct email</h3>
      </div>
      <p className="mt-1 text-xs text-stone">Recipient is resolved from the applicant record — attachments ≤ 3 files × 5 MB.</p>
      <div className="mt-3 space-y-3">
        <Input
          className="dlg-input"
          placeholder="Subject"
          value={subject}
          maxLength={200}
          onChange={(e) => setSubject(e.target.value)}
          aria-label="Email subject"
        />
        <Textarea
          className="dlg-input min-h-[100px]"
          placeholder="Message *"
          value={message}
          maxLength={5000}
          onChange={(e) => setMessage(e.target.value)}
          aria-label="Email message"
        />
        <div>
          <label className="dlg-ghost focus-ring inline-flex min-h-[44px] cursor-pointer items-center gap-2 px-4 text-sm">
            <Paperclip className="h-4 w-4" aria-hidden />
            Attach files
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => pickFiles(e.target.files)}
              aria-label="Attach files"
            />
          </label>
          {files.length > 0 && (
            <ul className="mt-2 space-y-1">
              {files.map((f) => (
                <li key={f.name} className="flex items-center justify-between gap-2 text-xs text-stone">
                  <span className="truncate">{f.name}</span>
                  <button
                    type="button"
                    className="focus-ring shrink-0 text-[var(--bad)] hover:underline"
                    onClick={() => setFiles((prev) => prev.filter((x) => x !== f))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="button" className={ctaBtn + " w-full"} disabled={!message.trim() || busy} onClick={() => void send()}>
          <Send className="h-4 w-4" aria-hidden />
          {busy ? "Sending…" : "Send email"}
        </button>
      </div>
      <div className="mt-4 border-t border-[#ececec] pt-3">
        <p className="text-xs font-medium text-stone">History</p>
        <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto scroll-thin">
          {emails === null ? (
            <p className="text-xs text-pebble">Loading…</p>
          ) : emails.length === 0 ? (
            <p className="text-xs text-pebble">No direct emails sent yet.</p>
          ) : (
            emails.map((m) => {
              const atts = parseAttachments(m.attachments);
              return (
                <div key={m.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-ink">{m.subject || "(no subject)"}</span>
                  <span className="flex shrink-0 items-center gap-2 text-pebble">
                    {atts.length > 0 && <span className="num">{atts.length} att.</span>}
                    <span className="num">{timeAgo(m.createdAt)}</span>
                    <span className={pillClass(emailStatusVariant(m.status))}>{m.status}</span>
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ── The workspace BODY (shared by modal + page) ─────────────────────────────

export function ReviewWorkspace({
  applicationId,
  onClose,
  onDecided,
}: {
  applicationId: number;
  onClose?: () => void;
  onDecided?: () => void;
}) {
  const [payload, setPayload] = useState<ReviewPayload | null>(null);
  const [notices, setNotices] = useState<NoticeRow[] | null>(null);
  const [emails, setEmails] = useState<DirectEmailRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");
  const [confirmAction, setConfirmAction] = useState<{ status: string; title: string; description: string; destructive?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [noticeKind, setNoticeKind] = useState<"interview" | "skills_exam" | null>(null);
  const [regretOpen, setRegretOpen] = useState(false);
  const [regretBusy, setRegretBusy] = useState(false);
  const [tab, setTab] = useState("profile");

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setError(null);
      try {
        const [p, n, m] = await Promise.all([
          apiFetch<ReviewPayload>(`/api/evaluator/applications/${applicationId}`),
          apiFetch<{ notices: NoticeRow[] }>(`/api/evaluator/applications/${applicationId}/notice`),
          apiFetch<{ directEmails: DirectEmailRow[] }>(`/api/evaluator/applications/${applicationId}/email`),
        ]);
        setPayload(p);
        setNotices(n.notices);
        setEmails(m.directEmails);
      } catch (e) {
        if (!silent) setError(e instanceof Error ? e.message : "Failed to load the application");
      }
    },
    [applicationId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const refetch = useCallback(() => void load(true), [load]);

  const stage = payload ? stageForStatus(payload.status) : "Applied";
  const applicantName = payload ? fullName(payload.applicant) : "Applicant";
  const email = payload?.applicant.emailAddress ?? null;

  const decide = async (status: string) => {
    setBusy(true);
    try {
      await apiFetch(`/api/evaluator/applications/${applicationId}`, {
        method: "PATCH",
        body: { status, reason: remarks.trim() || undefined },
      });
      const label = getStatusMeta(status).label;
      const silentRevert = status === "Applied";
      if (silentRevert) {
        toast.info("Returned to the review queue", { description: "No notification was sent to the applicant." });
      } else {
        toast.success(`Applicant marked as ${label}`, {
          description: email ? `A notification email was sent to ${email}.` : "No email on record — HR will contact the applicant directly.",
        });
      }
      setConfirmAction(null);
      setRemarks("");
      onDecided?.();
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update the application");
    } finally {
      setBusy(false);
    }
  };

  const sendRegret = async () => {
    setRegretBusy(true);
    try {
      const res = await apiFetch<NoticeSendResult>(`/api/evaluator/applications/${applicationId}/notice`, {
        method: "POST",
        body: { type: "regret" },
      });
      toast.success("Regret letter sent", {
        description: `Email: ${res.email?.status ?? "unknown"} · SMS: ${res.sms?.status ?? "unknown"}`,
      });
      setRegretOpen(false);
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send the regret letter");
    } finally {
      setRegretBusy(false);
    }
  };

  const openConfirm = (status: string) => {
    const label = getStatusMeta(status).label;
    const consequence = email
      ? `An email will be sent to ${email}.`
      : "No email on record — HR will contact the applicant directly.";
    setConfirmAction({
      status,
      title: `Mark as ${label}?`,
      description: `${consequence}${remarks.trim() ? ` Remarks will be included: “${remarks.trim()}”` : ""}`,
      destructive: status === "Rejected",
    });
  };

  const regretAlreadySent = (notices ?? []).some((n) => n.type === "regret" && (n.status === "sent" || n.status === "mock"));
  const noticeLabel: Record<NoticeRow["type"], string> = {
    regret: "Regret letter",
    interview: "Interview invitation",
    skills_exam: "Skills-exam notice",
  };

  if (error) {
    return (
      <div className="dlg-card p-8">
        <EmptyState
          icon={AlertTriangle}
          tone="rose"
          title="Couldn't load the application"
          description={error}
          action={
            <div className="flex items-center justify-center gap-3">
              <button type="button" className={ghostBtn} onClick={() => void load()}>
                Retry
              </button>
              {onClose && (
                <button type="button" className={ghostBtn} onClick={onClose}>
                  Close
                </button>
              )}
            </div>
          }
        />
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="dlg-card space-y-5 p-6">
          <div className="space-y-2.5">
            <Skeleton className="h-7 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
          <div className="flex gap-2 border-b border-border pb-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-20" />
            ))}
          </div>
          <SkeletonRows rows={6} />
        </div>
        <div className="space-y-4">
          <div className="dlg-card p-4">
            <Skeleton className="mb-3 h-4 w-32" />
            <SkeletonRows rows={3} rowClassName="h-6" />
          </div>
          <div className="dlg-card p-4">
            <Skeleton className="mb-3 h-4 w-24" />
            <SkeletonRows rows={4} rowClassName="h-6" />
          </div>
        </div>
      </div>
    );
  }

  const p = payload.snapshots.profile ?? {};
  const characterRefs = Array.isArray(p.characterReferences) ? (p.characterReferences as SnapRow[]) : [];
  const banner = stateBanner(stage);
  const positionTitle = payload.job.position?.positionTitle || payload.job.title;
  const place = payload.job.position?.placeOfAssignment ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      {/* ── LEFT: frozen dossier ── */}
      <div className="dlg-card space-y-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <MonogramAvatar name={applicantName} size={48} warm />
            <div className="min-w-0">
              <h2 className="font-display text-2xl leading-tight text-ink">{applicantName}</h2>
              <p className="num mt-1 text-sm text-stone">
                {[positionTitle, place].filter(Boolean).join(" · ")} · Applied {formatDate(payload.dateApplied)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <StatusPill status={payload.status} />
            <button
              type="button"
              className="focus-ring inline-flex min-h-[44px] items-center text-sm font-medium text-ink underline underline-offset-4"
              onClick={() => navigate("candidate", { id: String(payload.applicant.id) })}
            >
              View full profile
            </button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className={tabsListCls}>
            {DOSSIER_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className={tabTriggerCls}>
                <t.icon className="size-3.5" aria-hidden />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="profile" className="pt-4">
            <div className="rounded-none bg-fog p-4">
              <LedgerRow label="Email" value={str(p.emailAddress) || str(payload.applicant.emailAddress)} />
              <LedgerRow label="Mobile" value={str(p.mobileNumber) || str(p.contactNumber)} num />
              <LedgerRow label="Other phone" value={[str(p.contactNumberSec), str(p.telephoneNumber)].filter(Boolean).join(" · ")} num />
              <LedgerRow label="Gender" value={str(p.gender)} />
              <LedgerRow label="Civil status" value={str(p.civilStatus)} />
              <LedgerRow label="Birth date" value={snapshotDisplayDate(p.birthDate)} num />
              <LedgerRow label="Birth place" value={str(p.birthPlace)} />
              <LedgerRow label="Address" value={str(p.presentAddress)} />
            </div>
            <div className="mt-4">
              <p className="text-xs font-medium text-stone">Character references</p>
              {characterRefs.length === 0 ? (
                <p className="mt-1 text-sm text-pebble">None on file.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {characterRefs.map((r, i) => (
                    <li key={i} className="text-sm text-ink">
                      {[str(r.name), str(r.address), str(r.telephone) || str(r.contactNumber)].filter(Boolean).join(" · ") || "—"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>
          <TabsContent value="education" className="pt-4">
            <EducationCards rows={payload.snapshots.educations} />
          </TabsContent>
          <TabsContent value="experience" className="pt-4">
            <ExperienceCards rows={payload.snapshots.experiences} />
          </TabsContent>
          <TabsContent value="training" className="pt-4">
            <TrainingCards rows={payload.snapshots.trainings} />
          </TabsContent>
          <TabsContent value="eligibility" className="pt-4">
            <EligibilityCards rows={payload.snapshots.eligibilities} />
          </TabsContent>
          <TabsContent value="awards" className="pt-4">
            <AwardCards rows={payload.snapshots.awards} />
          </TabsContent>
          <TabsContent value="documents" className="pt-4">
            <div className="rounded-none bg-fog p-6 text-center">
              <IconChip icon={FileText} tone="slate" size={40} className="mx-auto" />
              <p className="mt-2 text-sm text-stone">Supporting documents are verified in person at the next stage.</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── RIGHT: decision rail ── */}
      <div className="space-y-4 self-start lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto scroll-thin">
        <RequirementsMatchPanel report={payload.requirements} />
        <CredentialsRow payload={payload} />

        <div className={`rounded-none bg-fog p-4 text-sm ${banner.cls}`}>
          <StatusPill status={payload.status} className="mr-2" />
          {banner.text}
        </div>

        {(stage === "Applied" || stage === "Under Review") && (
          <div className="dlg-card space-y-3 p-4">
            <div className="flex items-center gap-2.5">
              <IconChip icon={Gavel} tone="slate" size={28} iconSize={13} />
              <h3 className="text-[15px] font-medium leading-6 text-ink">Decision</h3>
            </div>
            <Textarea
              className="dlg-input min-h-[80px]"
              placeholder="Remarks (optional) — included as the reason"
              value={remarks}
              maxLength={500}
              onChange={(e) => setRemarks(e.target.value)}
              aria-label="Remarks"
            />
            <div className="space-y-2">
              {stage === "Applied" && (
                <button type="button" className={ghostBtn + " w-full"} onClick={() => openConfirm("Under Review")}>
                  <IconChip icon={ScanSearch} tone="gold" size={28} iconSize={14} />
                  Start Review
                </button>
              )}
              <button type="button" className={ctaBtn + " w-full"} onClick={() => openConfirm("Shortlisted")}>
                <IconChip icon={Star} tone="emerald" size={28} iconSize={14} />
                Shortlist
              </button>
              <button
                type="button"
                className={ghostBtn + " w-full " + destructiveGhost}
                onClick={() => openConfirm("Rejected")}
              >
                <IconChip icon={XCircle} tone="rose" size={28} iconSize={14} />
                Not Qualified
              </button>
            </div>
            <p className="text-xs text-pebble">
              {email ? `Decisions email ${email}.` : "No email on record for this applicant."}
            </p>
          </div>
        )}

        {(stage === "Shortlisted" || stage === "Rejected") && (
          <div className="dlg-card space-y-3 p-4">
            <div className="flex items-center gap-2.5">
              <IconChip icon={History} tone="slate" size={28} iconSize={13} />
              <h3 className="text-[15px] font-medium leading-6 text-ink">Revise decision</h3>
            </div>
            <p className="text-xs text-pebble">Changing the decision notifies the applicant.</p>
            <button
              type="button"
              className={
                ghostBtn + " w-full" + (stage === "Shortlisted" ? " " + destructiveGhost : "")
              }
              onClick={() =>
                stage === "Shortlisted"
                  ? setConfirmAction({
                      status: "Rejected",
                      title: "Mark as Not Qualified?",
                      description: email
                        ? `The decision will be flipped and a regret letter will be emailed to ${email}.`
                        : "The decision will be flipped. No email on record — HR will contact the applicant directly.",
                      destructive: true,
                    })
                  : setConfirmAction({
                      status: "Shortlisted",
                      title: "Mark as Shortlisted?",
                      description: email
                        ? `The decision will be flipped and the shortlist notice will be emailed to ${email}.`
                        : "The decision will be flipped. No email on record — HR will contact the applicant directly.",
                    })
              }
            >
              {stage === "Shortlisted" ? (
                <>
                  <IconChip icon={XCircle} tone="rose" size={28} iconSize={14} />
                  Flip to Not Qualified
                </>
              ) : (
                <>
                  <IconChip icon={Star} tone="emerald" size={28} iconSize={14} />
                  Flip to Shortlisted
                </>
              )}
            </button>
            <button
              type="button"
              className={ghostBtn + " w-full"}
              onClick={() =>
                setConfirmAction({
                  status: "Applied",
                  title: "Return to review queue?",
                  description: "This reverts the application to Applied and does NOT notify the applicant.",
                })
              }
            >
              <IconChip icon={RotateCcw} tone="slate" size={28} iconSize={14} />
              Return to Review
            </button>
          </div>
        )}

        {/* Notices */}
        <div className="dlg-card space-y-3 p-4">
          <div className="flex items-center gap-2.5">
            <IconChip icon={Mails} tone="slate" size={28} iconSize={13} />
            <h3 className="text-[15px] font-medium leading-6 text-ink">Notices</h3>
          </div>
          <div className="max-h-48 space-y-1.5 overflow-y-auto scroll-thin">
            {notices === null ? (
              <p className="text-xs text-pebble">Loading…</p>
            ) : notices.length === 0 ? (
              <p className="text-xs text-pebble">No notices sent yet.</p>
            ) : (
              notices.map((n) => (
                <div key={n.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-ink">{noticeLabel[n.type] ?? n.type}</span>
                  <span className="flex shrink-0 items-center gap-2 text-pebble">
                    <span className="num">{formatDateTime(n.sentAt)}</span>
                    <span className={pillClass(n.status === "sent" || n.status === "mock" ? "neutral" : "bad")}>{n.status}</span>
                  </span>
                </div>
              ))
            )}
          </div>
          {stage === "Shortlisted" && (
            <div className="space-y-2">
              <button type="button" className={ghostBtn + " w-full"} onClick={() => setNoticeKind("interview")}>
                Send Interview Invitation
              </button>
              <button type="button" className={ghostBtn + " w-full"} onClick={() => setNoticeKind("skills_exam")}>
                Send Skills-Exam Notice
              </button>
            </div>
          )}
          {stage === "Rejected" && (
            <button
              type="button"
              className={ghostBtn + " w-full " + destructiveGhost}
              disabled={regretAlreadySent || regretBusy}
              onClick={() => setRegretOpen(true)}
            >
              {regretAlreadySent ? "Regret letter sent" : regretBusy ? "Sending…" : "Send Regret Letter"}
            </button>
          )}
        </div>

        <DirectEmailCard applicationId={applicationId} emails={emails} onSent={refetch} />
      </div>

      {/* Decision confirm */}
      <AlertDialog open={confirmAction !== null} onOpenChange={(v) => !v && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmAction?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirmAction?.destructive ? "border border-[var(--bad)]/30 bg-[var(--bad-bg)] text-[var(--bad)] hover:bg-[var(--bad-bg)]/80" : ""}
              onClick={(e) => {
                e.preventDefault();
                if (confirmAction) void decide(confirmAction.status);
              }}
            >
              {busy ? "Working…" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Regret confirm */}
      <AlertDialog open={regretOpen} onOpenChange={setRegretOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send the regret letter?</AlertDialogTitle>
            <AlertDialogDescription>
              {email
                ? `A formal regret letter will be emailed to ${email}.`
                : "No email on record — the send will be logged as skipped and HR will contact the applicant directly."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="border border-[var(--bad)]/30 bg-[var(--bad-bg)] text-[var(--bad)] hover:bg-[var(--bad-bg)]/80"
              onClick={(e) => {
                e.preventDefault();
                void sendRegret();
              }}
            >
              Send regret letter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Notice form */}
      {noticeKind && (
        <NoticeFormDialog
          applicationId={applicationId}
          kind={noticeKind}
          onClose={() => setNoticeKind(null)}
          onSent={refetch}
        />
      )}
    </div>
  );
}

// ── Deep-link page (default export, prop-detection wrapper) ─────────────────

function ReviewWorkspacePage() {
  const { params } = useHashRoute();
  const id = Number(params.id);
  const valid = Number.isInteger(id) && id > 0;
  const close = useCallback(() => navigate("review-queue"), []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Review Workspace"
        description="Applicant dossier and decision rail."
        actions={
          <button type="button" className={ghostBtn} onClick={close}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to review queue
          </button>
        }
      />
      {valid ? (
        <ReviewWorkspace applicationId={id} onClose={close} />
      ) : (
        <div className="dlg-card py-6">
          <EmptyState
            icon={FileText}
            title="No application selected"
            description="Open a review from the queue to see the applicant dossier."
            action={
              <button type="button" className={ctaBtn} onClick={close}>
                Go to review queue
              </button>
            }
          />
        </div>
      )}
    </div>
  );
}

export default function ReviewWorkspaceRoute(props: {
  applicationId?: number;
  onClose?: () => void;
  onDecided?: () => void;
}) {
  if (typeof props.applicationId === "number") {
    return <ReviewWorkspace applicationId={props.applicationId} onClose={props.onClose} onDecided={props.onDecided} />;
  }
  return <ReviewWorkspacePage />;
}
