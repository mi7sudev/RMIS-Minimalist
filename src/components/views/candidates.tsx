"use client";

// ============================================================================
// RMIS — Candidate registry (spec §7.11). Server-paginated (25/page) master
// list from /api/admin/applicants with KPI tiles, debounced search, profile
// status / has-account filters, list rows with quick-view modal, and a kanban
// mode over the evaluator queue. 20 s silent poll + focus refresh.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, LayoutGrid, List, Mail, Phone, RefreshCw, UserRound } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { apiFetch, formatDate, fullName, humanize } from "@/lib/client";
import { PIPELINE_STAGES, isRejectedStatus, stageForStatus, getStatusMeta, type StageKey } from "@/lib/status";
import { navigate, useHashRoute } from "@/lib/router";
import { StatusPill } from "@/components/views/review-workspace";
import { ghostBtn, ctaBtn } from "@/components/views/recruitment";

// ── Wire shapes ─────────────────────────────────────────────────────────────

type ApplicantRow = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  emailAddress: string | null;
  mobileNumber: string | null;
  gender: string | null;
  isProfileComplete: boolean;
  hasAccount: boolean;
  user: { id: string; email: string; username: string; role: string; blocked: boolean } | null;
  applicationCount: number;
};

type EduRow = Record<string, unknown>;

type ApplicantDetail = ApplicantRow & {
  middleName: string | null;
  contactNumber: string | null;
  civilStatus: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  presentAddress: string | null;
  educations: EduRow[];
  workExperiences: EduRow[];
  documents: { id: string; originalName: string; category: string; status: string; filePath: string; size: number }[];
  applications: { id: number; status: string; dateApplied: string; jobId: number; positionTitle: string | null; jobTitle: string }[];
};

type QueueRow = {
  id: number;
  status: string;
  stage: StageKey;
  dateApplied: string;
  applicantId: number;
  applicant: { id: number; firstName: string | null; lastName: string | null; emailAddress: string | null };
  job: { id: number; title: string };
};

const PAGE_SIZE = 25;

function Monogram({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fog text-xs font-medium text-ink">
      {initials || "?"}
    </span>
  );
}

function s(v: unknown): string {
  if (v === null || v === undefined) return "";
  const t = String(v).trim();
  return t;
}

function KpiTile({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  const cls =
    "dlg-card p-4 text-left transition-shadow" + (onClick ? " cursor-pointer hover:shadow-md min-h-[44px]" : "");
  return (
    <button type="button" className={cls} onClick={onClick} disabled={!onClick}>
      <p className="text-xs text-pebble">{label}</p>
      <p className="font-display text-2xl text-ink mt-1">{value}</p>
    </button>
  );
}

// ── Quick-view modal ────────────────────────────────────────────────────────

function CandidateModal({ id, onClose }: { id: number | null; onClose: () => void }) {
  const [detail, setDetail] = useState<ApplicantDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id === null) {
      setDetail(null);
      setError(null);
      return;
    }
    let alive = true;
    apiFetch<ApplicantDetail>(`/api/admin/applicants/${id}`)
      .then((d) => {
        if (alive) setDetail(d);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Failed to load the candidate");
      });
    return () => {
      alive = false;
    };
  }, [id]);

  const apps = detail?.applications ?? [];
  const countBy = (stage: StageKey) => apps.filter((a) => stageForStatus(a.status) === stage).length;
  const anyRejected = apps.some((a) => isRejectedStatus(a.status));

  return (
    <Dialog open={id !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto scroll-thin">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Candidate</DialogTitle>
          <DialogDescription>Quick identity and pipeline snapshot.</DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-sm text-dusty-rose py-4">{error}</p>
        ) : !detail ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-20 w-full rounded-[12px]" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Monogram name={fullName(detail)} />
              <div className="min-w-0">
                <p className="text-sm text-ink truncate">{fullName(detail)}</p>
                <p className="text-xs text-pebble">#{detail.id}</p>
              </div>
              <span
                className={`ml-auto rounded-full px-2.5 py-1 text-xs shrink-0 ${detail.isProfileComplete ? "bg-ink text-white" : "bg-fog text-stone"}`}
              >
                {detail.isProfileComplete ? "Complete" : "Incomplete"}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {detail.emailAddress && (
                <a
                  href={`mailto:${detail.emailAddress}`}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-fog px-3 text-xs text-ink hover:bg-[#ececec]"
                >
                  <Mail className="h-3.5 w-3.5" aria-hidden />
                  {detail.emailAddress}
                </a>
              )}
              {detail.mobileNumber && (
                <a
                  href={`tel:${detail.mobileNumber}`}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-fog px-3 text-xs text-ink hover:bg-[#ececec]"
                >
                  <Phone className="h-3.5 w-3.5" aria-hidden />
                  {detail.mobileNumber}
                </a>
              )}
            </div>

            {/* Mini pipeline dots: Submitted → Review → Shortlisted */}
            <div className="bg-fog rounded-[12px] p-4">
              <div className="flex items-center justify-between gap-2">
                {(["Applied", "Under Review", "Shortlisted"] as StageKey[]).map((stage, i) => (
                  <div key={stage} className="flex flex-1 items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full ${countBy(stage) > 0 ? "bg-ink" : "bg-[#dcdcdc]"}`}
                        aria-hidden
                      />
                      <span className="text-xs text-stone">{["Submitted", "Review", "Shortlisted"][i]}</span>
                      <span className="text-xs text-ink tabular-nums">{countBy(stage)}</span>
                    </div>
                  </div>
                ))}
                {anyRejected && (
                  <span className="rounded-full bg-dusty-rose/15 text-dusty-rose text-xs px-2 py-0.5 shrink-0">Not Selected</span>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-stone">Education</p>
              {detail.educations.length === 0 ? (
                <p className="text-xs text-pebble mt-1">No education entries.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {detail.educations.slice(0, 2).map((e, i) => (
                    <li key={i} className="text-sm text-ink">
                      {[s(e.degree) || s(e.course), s(e.schoolName)].filter(Boolean).join(" · ") || "—"}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="rounded-full bg-fog text-ink text-xs px-2.5 py-1">
                {detail.documents.length} document{detail.documents.length === 1 ? "" : "s"}
              </span>
              <span className="rounded-full bg-fog text-ink text-xs px-2.5 py-1">
                {detail.applicationCount ?? apps.length} application{(detail.applicationCount ?? apps.length) === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        )}

        <DialogFooter>
          <button type="button" className={ghostBtn} onClick={onClose}>
            Close
          </button>
          {detail && (
            <button type="button" className={ctaBtn} onClick={() => navigate("candidate", { id: String(detail.id) })}>
              View full profile
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Registry ────────────────────────────────────────────────────────────────

export default function Candidates() {
  const { params } = useHashRoute();
  const initialStatus = params.status === "complete" || params.status === "incomplete" ? params.status : "all";

  const [rows, setRows] = useState<ApplicantRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<"all" | "complete" | "incomplete">(initialStatus as "all" | "complete" | "incomplete");
  const [hasAccount, setHasAccount] = useState<"all" | "yes" | "no">("all");
  const [mode, setMode] = useState<"list" | "kanban">("list");
  const [modalId, setModalId] = useState<number | null>(null);
  const [queue, setQueue] = useState<QueueRow[] | null>(null);
  const [spin, setSpin] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setError(null);
      try {
        const sp = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
        if (debounced) sp.set("search", debounced);
        if (status !== "all") sp.set("status", status);
        if (hasAccount !== "all") sp.set("hasAccount", hasAccount);
        const res = await apiFetch<{ data: ApplicantRow[]; total: number }>(`/api/admin/applicants?${sp.toString()}`);
        setRows(res.data);
        setTotal(res.total);
      } catch (e) {
        if (!silent) setError(e instanceof Error ? e.message : "Failed to load candidates");
      }
    },
    [page, debounced, status, hasAccount]
  );

  const loadQueue = useCallback(async (silent = true) => {
    try {
      const res = await apiFetch<{ data: QueueRow[] }>("/api/evaluator/queue?pageSize=100");
      setQueue(res.data);
    } catch {
      /* silent — kanban is best-effort */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (mode === "kanban") void loadQueue();
  }, [mode, loadQueue]);

  // 20 s silent poll + focus refresh.
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) {
        void load(true);
        if (mode === "kanban") void loadQueue();
      }
    }, 20_000);
    return () => clearInterval(id);
  }, [load, loadQueue, mode]);
  useEffect(() => {
    const onFocus = () => {
      void load(true);
      if (mode === "kanban") void loadQueue();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load, loadQueue, mode]);

  // Debounced search (350 ms).
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const manualRefresh = useCallback(() => {
    setSpin(true);
    void load(true).finally(() => setTimeout(() => setSpin(false), 500));
  }, [load]);

  const list = rows ?? [];
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);
  const completeOnPage = list.filter((r) => r.isProfileComplete).length;
  const accountsOnPage = list.filter((r) => r.hasAccount).length;

  const kanban = useMemo(() => {
    const map: Record<StageKey, QueueRow[]> = { "Applied": [], "Under Review": [], "Shortlisted": [], "Rejected": [] };
    for (const r of queue ?? []) map[stageForStatus(r.status)].push(r);
    return map;
  }, [queue]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl text-ink">Candidates</h1>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-full bg-fog p-1">
            <button
              type="button"
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-xs font-medium ${mode === "list" ? "bg-ink text-white" : "text-stone hover:text-ink"}`}
              onClick={() => setMode("list")}
              aria-pressed={mode === "list"}
            >
              <List className="h-3.5 w-3.5" aria-hidden />
              List
            </button>
            <button
              type="button"
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-xs font-medium ${mode === "kanban" ? "bg-ink text-white" : "text-stone hover:text-ink"}`}
              onClick={() => setMode("kanban")}
              aria-pressed={mode === "kanban"}
            >
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
              Kanban
            </button>
          </div>
          <button type="button" className={ghostBtn} onClick={manualRefresh}>
            <RefreshCw className={`h-4 w-4 ${spin ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="dlg-card p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label="Total on file" value={String(total)} />
        <KpiTile label="Showing" value={`${start}–${end}`} />
        <KpiTile label="Complete profiles (page)" value={String(completeOnPage)} />
        <KpiTile label="Has login (page)" value={String(accountsOnPage)} />
      </div>

      {/* Filter bar */}
      <div className="dlg-card p-4 grid gap-3 sm:grid-cols-[1fr_180px_160px]">
        <Input
          className="dlg-input"
          placeholder="Search name, email, employee no., mobile…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search candidates"
        />
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as typeof status);
            setPage(1);
          }}
        >
          <SelectTrigger className="dlg-input min-h-[44px] w-full" aria-label="Profile status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All profiles</SelectItem>
            <SelectItem value="complete">Complete</SelectItem>
            <SelectItem value="incomplete">Incomplete</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={hasAccount}
          onValueChange={(v) => {
            setHasAccount(v as typeof hasAccount);
            setPage(1);
          }}
        >
          <SelectTrigger className="dlg-input min-h-[44px] w-full" aria-label="Has account">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            <SelectItem value="yes">Has login</SelectItem>
            <SelectItem value="no">No login</SelectItem>
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
      ) : rows === null ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-[12px]" />
          ))}
        </div>
      ) : mode === "list" ? (
        <div className="space-y-3">
          {list.length === 0 ? (
            <div className="dlg-card p-10 text-center">
              <p className="text-sm text-pebble">No candidates match the current filters.</p>
            </div>
          ) : (
            list.map((r) => (
              <button
                key={r.id}
                type="button"
                className="dlg-card-plain border border-[#ececec] rounded-[12px] p-4 w-full flex flex-wrap items-center gap-3 text-left hover:shadow-md transition-shadow min-h-[44px]"
                onClick={() => setModalId(r.id)}
              >
                <Monogram name={fullName(r)} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-ink truncate">{fullName(r)}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs shrink-0 ${r.isProfileComplete ? "bg-ink text-white" : "bg-fog text-stone"}`}
                    >
                      {r.isProfileComplete ? "Complete" : "Incomplete"}
                    </span>
                  </div>
                  <p className="text-xs text-stone mt-0.5 truncate">
                    {[r.emailAddress, r.mobileNumber].filter(Boolean).join(" · ") || "No contact on file"} · #{r.id}
                  </p>
                </div>
                <span className="rounded-full bg-fog text-stone text-xs px-2.5 py-1 shrink-0">
                  {r.applicationCount} application{r.applicationCount === 1 ? "" : "s"}
                </span>
              </button>
            ))
          )}

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-xs text-pebble">
                {start}–{end} of {total}
              </p>
              <div className="flex items-center gap-2">
                <button type="button" className={ghostBtn + " min-h-[36px] px-3 text-xs"} disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </button>
                <span className="text-xs text-stone tabular-nums">
                  Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
                </span>
                <button
                  type="button"
                  className={ghostBtn + " min-h-[36px] px-3 text-xs"}
                  disabled={page >= Math.ceil(total / PAGE_SIZE)}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Kanban */
        <div className="flex gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible">
          {PIPELINE_STAGES.map((stage) => {
            const cards = kanban[stage];
            return (
              <div key={stage} className="w-[240px] shrink-0 lg:w-auto lg:min-w-0">
                <div className="flex items-center justify-between px-1 pb-2">
                  <h2 className="text-sm font-medium text-ink">{stage}</h2>
                  <span className="rounded-full bg-fog text-stone text-xs px-2 py-0.5">{cards.length}</span>
                </div>
                <div className="space-y-2">
                  {cards.length === 0 ? (
                    <p className="text-xs text-pebble px-1 py-3">No candidates in this stage.</p>
                  ) : (
                    cards.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="dlg-card-plain border border-[#ececec] rounded-[12px] p-3 w-full text-left hover:shadow-md transition-shadow min-h-[44px]"
                        onClick={() => navigate("candidate", { id: String(c.applicantId) })}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm text-ink truncate">{fullName(c.applicant)}</span>
                          <UserRound className="h-4 w-4 text-pebble shrink-0" aria-hidden />
                        </div>
                        <p className="text-xs text-stone mt-1 truncate">{humanize(c.job.title)}</p>
                        <p className="text-xs text-pebble mt-0.5">Applied {formatDate(c.dateApplied)}</p>
                        <div className="mt-2">
                          <StatusPill status={c.status} />
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CandidateModal id={modalId} onClose={() => setModalId(null)} />
    </div>
  );
}
