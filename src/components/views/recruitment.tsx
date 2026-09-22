"use client";

// ============================================================================
// RMIS — HR recruitment list + job form (spec §7.10). Filterable, sortable,
// paginated postings table (10/page, 30 s silent poll). JobFormDialog handles
// create + edit: plain-text rich sections (HTML companions generated with
// textToHtml), qualification vitals (write-through to the position master),
// and publish/deadline/processing dates.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiFetch, deadlineState, formatCurrency, formatDate } from "@/lib/client";
import type { JobWire } from "@/lib/router";
import { navigate } from "@/lib/router";
import { textToHtml } from "@/lib/sanitize";
import {
  CSC_EDUCATION_FIRST_LEVEL, CSC_EDUCATION_HIGHER_LEVEL, CSC_ELIGIBILITY_REGISTRY,
  DIVISIONS, POSITION_TYPES,
} from "@/lib/constants";

// ── Shared visuals ──────────────────────────────────────────────────────────

export const ghostBtn =
  "dlg-ghost inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-4 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50";
export const ctaBtn =
  "dlg-cta inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-50";

function OpenClosedPill({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${active ? "bg-ink text-white" : "bg-fog text-stone"}`}>
      {active ? "OPEN" : "CLOSED"}
    </span>
  );
}

function isOpenJob(j: JobWire): boolean {
  return j.isActive && !deadlineState(j.deadlineDate).overdue;
}

// ── Job form dialog (create + edit) — named export, reused by job-workspace ─

function Field({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-stone">
        {label}
        {required ? " *" : ""}
      </Label>
      {children}
      {error && <p className="text-xs text-dusty-rose">{error}</p>}
    </div>
  );
}

export function JobFormDialog({
  open,
  onOpenChange,
  job,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  job?: JobWire | null;
  onSaved: () => void;
}) {
  const editing = job != null;
  const [title, setTitle] = useState("");
  const [positionType, setPositionType] = useState("");
  const [vacancy, setVacancy] = useState("1");
  const [division, setDivision] = useState("");
  const [education, setEducation] = useState("");
  const [experience, setExperience] = useState("");
  const [training, setTraining] = useState("");
  const [eligibility, setEligibility] = useState("");
  const [license, setLicense] = useState("");
  const [brief, setBrief] = useState("");
  const [duties, setDuties] = useState("");
  const [compensation, setCompensation] = useState("");
  const [otherQuals, setOtherQuals] = useState("");
  const [publishDate, setPublishDate] = useState("");
  const [deadlineDate, setDeadlineDate] = useState("");
  const [processingDate, setProcessingDate] = useState("");
  const [errors, setErrors] = useState<{ title?: string | null; vacancy?: string | null }>({});
  const [busy, setBusy] = useState(false);

  const prefill = useCallback(() => {
    setErrors({});
    if (!job) {
      setTitle("");
      setPositionType("");
      setVacancy("1");
      setDivision("");
      setEducation("");
      setExperience("");
      setTraining("");
      setEligibility("");
      setLicense("");
      setBrief("");
      setDuties("");
      setCompensation("");
      setOtherQuals("");
      setPublishDate(new Date().toISOString().slice(0, 10));
      setDeadlineDate("");
      setProcessingDate("");
      return;
    }
    setTitle(job.title ?? "");
    setPositionType(job.positionType ?? "");
    setVacancy(String(job.numberOfVacancy ?? 1));
    setDivision(job.position?.division ?? "");
    setEducation(job.position?.cscEducation ?? "");
    setExperience(job.position?.cscWorkExperience ?? "");
    setTraining(job.position?.cscTraining ?? "");
    setEligibility(job.position?.cscEligibilityGroup ?? job.position?.cscEligibility ?? "");
    setLicense(job.position?.license ?? "");
    setBrief(job.briefDescription ?? "");
    setDuties(job.dutiesResponsibilities ?? "");
    setCompensation(job.compensationPackage ?? "");
    setOtherQuals(job.otherQualifications ?? "");
    setPublishDate(job.publishDate ? job.publishDate.slice(0, 10) : "");
    setDeadlineDate(job.deadlineDate ? job.deadlineDate.slice(0, 10) : "");
    setProcessingDate(job.processingDate ? job.processingDate.slice(0, 10) : "");
  }, [job]);

  useEffect(() => {
    if (open) prefill();
  }, [open, prefill]);

  const opt = (v: string) => {
    const t = v.trim();
    return t === "" ? undefined : t;
  };

  const submit = async () => {
    const nextErrors: { title?: string | null; vacancy?: string | null } = {};
    if (!title.trim()) nextErrors.title = "Title is required";
    const vacancyNum = Number(vacancy);
    if (!Number.isInteger(vacancyNum) || vacancyNum < 1) nextErrors.vacancy = "Vacancies must be a whole number of at least 1";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setBusy(true);
    try {
      const body = {
        title: title.trim(),
        positionType: opt(positionType),
        numberOfVacancy: vacancyNum,
        division: opt(division),
        education: opt(education),
        experience: opt(experience),
        training: opt(training),
        eligibility: opt(eligibility),
        license: opt(license),
        briefDescription: opt(brief),
        briefDescriptionHtml: textToHtml(brief) || undefined,
        dutiesResponsibilities: opt(duties),
        dutiesHtml: textToHtml(duties) || undefined,
        compensationPackage: opt(compensation),
        compensationHtml: textToHtml(compensation) || undefined,
        otherQualifications: opt(otherQuals),
        otherQualificationsHtml: textToHtml(otherQuals) || undefined,
        publishDate: publishDate || undefined,
        deadlineDate: deadlineDate || undefined,
        processingDate: processingDate || undefined,
      };
      if (editing) {
        await apiFetch(`/api/jobs/${job.id}`, { method: "PATCH", body });
        toast.success("Job posting updated");
      } else {
        await apiFetch("/api/jobs", { method: "POST", body });
        toast.success("Job posting created and published");
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save the job posting");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto scroll-thin">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{editing ? "Edit job posting" : "Create job posting"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Updates are saved to the posting; qualification vitals write through to the position master."
              : "The posting is published immediately; qualification vitals create or update the linked position."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field id="job-title" label="Title" required error={errors.title}>
            <Input
              id="job-title"
              className="dlg-input"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Science Research Specialist I"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="job-type" label="Position type">
              <Input
                id="job-type"
                className="dlg-input"
                list="rmis-position-types"
                value={positionType}
                maxLength={100}
                onChange={(e) => setPositionType(e.target.value)}
                placeholder="Select or type"
              />
              <datalist id="rmis-position-types">
                {POSITION_TYPES.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            <Field id="job-vacancy" label="Number of vacancies" required error={errors.vacancy}>
              <Input
                id="job-vacancy"
                type="number"
                min={1}
                max={99}
                className="dlg-input"
                value={vacancy}
                onChange={(e) => setVacancy(e.target.value)}
              />
            </Field>
          </div>

          <Field id="job-division" label="Division">
            <Input
              id="job-division"
              className="dlg-input"
              list="rmis-divisions"
              value={division}
              maxLength={100}
              onChange={(e) => setDivision(e.target.value)}
              placeholder="Official code or custom"
            />
            <datalist id="rmis-divisions">
              {DIVISIONS.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
              <option value="Others">Others — type your own</option>
            </datalist>
          </Field>

          <div className="bg-fog rounded-[12px] p-4 space-y-4">
            <p className="text-xs font-medium text-stone">Qualification vitals (write-through to the position master)</p>
            <Field id="job-education" label="Education (CSC standard)">
              <Input
                id="job-education"
                className="dlg-input"
                list="rmis-education-options"
                value={education}
                maxLength={1000}
                onChange={(e) => setEducation(e.target.value)}
                placeholder="Select from CSC MC 07 options or type"
              />
              <datalist id="rmis-education-options">
                {[...CSC_EDUCATION_FIRST_LEVEL, ...CSC_EDUCATION_HIGHER_LEVEL].map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="job-experience" label="Experience">
                <Input
                  id="job-experience"
                  className="dlg-input"
                  value={experience}
                  maxLength={500}
                  onChange={(e) => setExperience(e.target.value)}
                  placeholder='e.g. 1 year of relevant experience'
                />
              </Field>
              <Field id="job-training" label="Training">
                <Input
                  id="job-training"
                  className="dlg-input"
                  value={training}
                  maxLength={500}
                  onChange={(e) => setTraining(e.target.value)}
                  placeholder='e.g. 8 hours of relevant training'
                />
              </Field>
            </div>
            <Field id="job-eligibility" label="Eligibility">
              <Input
                id="job-eligibility"
                className="dlg-input"
                list="rmis-eligibility-options"
                value={eligibility}
                maxLength={500}
                onChange={(e) => setEligibility(e.target.value)}
                placeholder="CSC registry entry or custom"
              />
              <datalist id="rmis-eligibility-options">
                {CSC_ELIGIBILITY_REGISTRY.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.description}
                  </option>
                ))}
              </datalist>
            </Field>
            <Field id="job-license" label="License / special skill">
              <Input
                id="job-license"
                className="dlg-input"
                value={license}
                maxLength={500}
                onChange={(e) => setLicense(e.target.value)}
              />
            </Field>
          </div>

          <div className="space-y-4">
            <Field id="job-brief" label="Brief description">
              <Textarea id="job-brief" className="dlg-input min-h-[80px]" value={brief} maxLength={5000} onChange={(e) => setBrief(e.target.value)} />
            </Field>
            <Field id="job-duties" label="Duties & responsibilities">
              <Textarea id="job-duties" className="dlg-input min-h-[100px]" value={duties} maxLength={8000} onChange={(e) => setDuties(e.target.value)} />
            </Field>
            <Field id="job-compensation" label="Compensation package">
              <Textarea id="job-compensation" className="dlg-input min-h-[80px]" value={compensation} maxLength={4000} onChange={(e) => setCompensation(e.target.value)} />
            </Field>
            <Field id="job-quals" label="Other qualifications">
              <Textarea id="job-quals" className="dlg-input min-h-[80px]" value={otherQuals} maxLength={4000} onChange={(e) => setOtherQuals(e.target.value)} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="job-publish" label="Publish date">
              <Input id="job-publish" type="date" className="dlg-input" value={publishDate} onChange={(e) => setPublishDate(e.target.value)} />
            </Field>
            <Field id="job-deadline" label="Deadline">
              <Input id="job-deadline" type="date" className="dlg-input" value={deadlineDate} onChange={(e) => setDeadlineDate(e.target.value)} />
            </Field>
            <Field id="job-processing" label="Processing date">
              <Input id="job-processing" type="date" className="dlg-input" value={processingDate} onChange={(e) => setProcessingDate(e.target.value)} />
            </Field>
          </div>
        </div>

        <DialogFooter>
          <button type="button" className={ghostBtn} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="button" className={ctaBtn} disabled={busy} onClick={() => void submit()}>
            {busy ? "Saving…" : editing ? "Save changes" : "Create & publish"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Recruitment list ────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

export default function Recruitment() {
  const [jobs, setJobs] = useState<JobWire[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed">("all");
  const [sortBy, setSortBy] = useState<"recent" | "deadline" | "applications">("recent");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [spin, setSpin] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      const data = await apiFetch<JobWire[]>("/api/jobs?limit=200");
      setJobs(data);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Failed to load job postings");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 30 s silent poll + refetch-on-focus.
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) void load(true);
    }, 30_000);
    return () => clearInterval(id);
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

  // Debounced search (350 ms).
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim().toLowerCase());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const filtered = useMemo(() => {
    let rows = jobs ?? [];
    if (debouncedSearch) {
      rows = rows.filter((j) => {
        const hay = [
          j.title,
          j.position?.itemNumber,
          j.position?.placeOfAssignment,
          j.positionType,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(debouncedSearch);
      });
    }
    if (statusFilter === "open") rows = rows.filter(isOpenJob);
    else if (statusFilter === "closed") rows = rows.filter((j) => !isOpenJob(j));
    const sorted = [...rows];
    if (sortBy === "recent") {
      sorted.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    } else if (sortBy === "deadline") {
      sorted.sort((a, b) => {
        const av = a.deadlineDate ? new Date(a.deadlineDate).getTime() : Number.POSITIVE_INFINITY;
        const bv = b.deadlineDate ? new Date(b.deadlineDate).getTime() : Number.POSITIVE_INFINITY;
        return av - bv;
      });
    } else {
      sorted.sort((a, b) => b.applicationCount - a.applicationCount);
    }
    return sorted;
  }, [jobs, debouncedSearch, statusFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const manualRefresh = useCallback(() => {
    setSpin(true);
    void load(true).finally(() => setTimeout(() => setSpin(false), 500));
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl text-ink">Recruitment</h1>
        <span className="rounded-full bg-fog text-ink text-xs px-2.5 py-1">
          {filtered.length} posting{filtered.length === 1 ? "" : "s"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" className={ghostBtn} onClick={manualRefresh}>
            <RefreshCw className={`h-4 w-4 ${spin ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </button>
          <button type="button" className={ctaBtn} onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Create Job
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="dlg-card p-4 grid gap-3 sm:grid-cols-[1fr_180px_200px]">
        <Input
          className="dlg-input"
          placeholder="Search title, item no., or place…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search job postings"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v as typeof statusFilter);
            setPage(1);
          }}
        >
          <SelectTrigger className="dlg-input min-h-[44px] w-full" aria-label="Status filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={sortBy}
          onValueChange={(v) => {
            setSortBy(v as typeof sortBy);
            setPage(1);
          }}
        >
          <SelectTrigger className="dlg-input min-h-[44px] w-full" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Recently posted</SelectItem>
            <SelectItem value="deadline">Deadline</SelectItem>
            <SelectItem value="applications">Applications</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <div className="dlg-card p-8 text-center space-y-4">
          <AlertTriangle className="h-8 w-8 text-dusty-rose mx-auto" aria-hidden />
          <p className="text-sm text-stone">{error}</p>
          <button type="button" className={ghostBtn} onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : jobs === null ? (
        <div className="dlg-card p-6 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-[12px]" />
          ))}
        </div>
      ) : pageRows.length === 0 ? (
        <div className="dlg-card p-10 text-center space-y-3">
          <p className="text-sm text-pebble">No job postings match the current filters.</p>
          <button type="button" className={ctaBtn} onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Create Job
          </button>
        </div>
      ) : (
        <div className="dlg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#ececec] text-left text-xs text-pebble">
                <th className="px-5 py-3 font-medium">Position</th>
                <th className="px-4 py-3 font-medium">Vacancies</th>
                <th className="px-4 py-3 font-medium">Monthly salary</th>
                <th className="px-4 py-3 font-medium">Applications</th>
                <th className="px-4 py-3 font-medium">Deadline</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((j) => {
                const dl = deadlineState(j.deadlineDate);
                return (
                  <tr
                    key={j.id}
                    className="border-b border-[#ececec] last:border-0 cursor-pointer hover:bg-fog/60 transition-colors"
                    onClick={() => navigate("job", { id: String(j.id) })}
                  >
                    <td className="px-5 py-3.5">
                      <p className="text-ink">{j.title}</p>
                      <p className="text-xs text-stone mt-0.5">
                        {[j.positionType, j.position?.itemNumber, j.position?.placeOfAssignment].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-stone tabular-nums">{j.numberOfVacancy}</td>
                    <td className="px-4 py-3.5 text-stone tabular-nums">
                      {j.position?.salaryAmount != null ? formatCurrency(j.position.salaryAmount) : "—"}
                    </td>
                    <td className="px-4 py-3.5 text-stone tabular-nums">{j.applicationCount}</td>
                    <td className={`px-4 py-3.5 ${dl.overdue ? "text-dusty-rose" : "text-stone"}`}>
                      {formatDate(j.deadlineDate)}
                    </td>
                    <td className="px-5 py-3.5">
                      <OpenClosedPill active={isOpenJob(j)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {jobs !== null && filtered.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-pebble">
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" className={ghostBtn + " min-h-[36px] px-3 text-xs"} disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
              Previous
            </button>
            <span className="text-xs text-stone tabular-nums">
              Page {safePage} of {totalPages}
            </span>
            <button type="button" className={ghostBtn + " min-h-[36px] px-3 text-xs"} disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>
              Next
            </button>
          </div>
        </div>
      )}

      <JobFormDialog open={formOpen} onOpenChange={setFormOpen} job={null} onSaved={() => void load(true)} />
    </div>
  );
}
