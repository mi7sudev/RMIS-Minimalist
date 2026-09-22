"use client";

// ============================================================================
// RMIS — Candidate registry (spec §7.11). Server-paginated (25/page) master
// list from /api/admin/applicants with KPI tiles, debounced search, profile
// status / has-account filters, list rows with quick-view modal, and a kanban
// mode over the evaluator queue. 20 s silent poll + focus refresh.
// Enterprise polish pass: PageHeader, KpiCard row, single-card filter toolbar,
// table-card rows with hover quick-view, EmptyState, skeleton loading.
// Wave-3 premium pass: slate search IconChip, gradient .monogram avatars,
// IconChip kanban column headers with lg tint cards, .lift cards, arrow
// translate-x quick action, shadow-e4 quick-view modal. Handlers byte-identical.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowUpRight, Inbox, KeyRound, LayoutGrid, List, Mail, Phone,
  RefreshCw, ScanSearch, Search, Star, UserCheck, Users, XCircle, type LucideIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  EmptyState, IconChip, KpiCard, Monogram, PageHeader, SkeletonKpis, SkeletonRows,
  type ChipTone,
} from "@/components/ui/shell";
import { apiFetch, formatDate, fullName, humanize } from "@/lib/client";
import { PIPELINE_STAGES, isRejectedStatus, stageForStatus, type StageKey } from "@/lib/status";
import { dotClass, variantForCompletion, type StatusVariant } from "@/lib/status-ui";
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

/** Stage → stage-dot variant. */
const STAGE_DOT: Record<StageKey, StatusVariant> = {
  "Applied": "info",
  "Under Review": "warn",
  "Shortlisted": "ok",
  "Rejected": "bad",
};

/** Stage → IconChip tone (wave-3 semantic mapping). */
const STAGE_TONE: Record<StageKey, ChipTone> = {
  "Applied": "plum",
  "Under Review": "gold",
  "Shortlisted": "emerald",
  "Rejected": "rose",
};

/** Stage → column icon. */
const STAGE_ICON: Record<StageKey, LucideIcon> = {
  "Applied": Inbox,
  "Under Review": ScanSearch,
  "Shortlisted": Star,
  "Rejected": XCircle,
};

/** Kanban card: resting elevation + hover-lift (wave-3). */
const cardCls =
  "rounded-[12px] border border-black/[0.07] bg-white shadow-e1 lift duration-200 hover:border-ink/15";

const iconBtn =
  "focus-ring inline-flex h-9 w-9 items-center justify-center rounded-full text-stone transition-colors hover:bg-fog hover:text-ink";

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
      <Monogram size={size} warm={warm}>{initials || "?"}</Monogram>
    </span>
  );
}

function s(v: unknown): string {
  if (v === null || v === undefined) return "";
  const t = String(v).trim();
  return t;
}

function KanbanColumn({
  label,
  icon: Icon,
  tone,
  count,
  children,
}: {
  label: string;
  icon: LucideIcon;
  tone: ChipTone;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="w-[260px] min-w-[260px] shrink-0 snap-start lg:w-auto lg:min-w-0">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <IconChip icon={Icon} tone={tone} size={28} iconSize={13} />
          <h2 className="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-ink">{label}</h2>
        </div>
        <span className="status-pill status-neutral num shrink-0">{count}</span>
      </div>
      {/* Subtle column tint on lg so the white cards pop (mesh shows through). */}
      <div className="lg:rounded-[16px] lg:border lg:border-black/[0.06] lg:bg-white/60 lg:p-2.5">
        <div className="max-h-[calc(100vh-430px)] min-h-[220px] space-y-3 overflow-y-auto scroll-thin">{children}</div>
      </div>
    </div>
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
      <DialogContent className="shadow-e4 sm:max-w-lg max-h-[92vh] overflow-y-auto scroll-thin">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Candidate</DialogTitle>
          <DialogDescription>Quick identity and pipeline snapshot.</DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="py-4 text-sm text-[var(--bad)]">{error}</p>
        ) : !detail ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-20 w-full rounded-[12px]" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <MonogramAvatar name={fullName(detail)} size={40} warm />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{fullName(detail)}</p>
                <p className="num text-xs text-pebble">#{detail.id}</p>
              </div>
              <span className="ml-auto shrink-0">
                <StatusPill
                  status={detail.isProfileComplete ? "Complete" : "Incomplete"}
                  variant={variantForCompletion(detail.isProfileComplete)}
                />
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {detail.emailAddress && (
                <a
                  href={`mailto:${detail.emailAddress}`}
                  className="focus-ring inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-fog px-3 text-xs text-ink transition-colors hover:bg-[#ececec]"
                >
                  <Mail className="h-3.5 w-3.5" aria-hidden />
                  {detail.emailAddress}
                </a>
              )}
              {detail.mobileNumber && (
                <a
                  href={`tel:${detail.mobileNumber}`}
                  className="focus-ring inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-fog px-3 text-xs text-ink transition-colors hover:bg-[#ececec]"
                >
                  <Phone className="h-3.5 w-3.5" aria-hidden />
                  {detail.mobileNumber}
                </a>
              )}
            </div>

            {/* Mini pipeline dots: Submitted → Review → Shortlisted */}
            <div className="rounded-[12px] bg-fog p-4">
              <div className="flex items-center justify-between gap-2">
                {(["Applied", "Under Review", "Shortlisted"] as StageKey[]).map((stage, i) => (
                  <div key={stage} className="flex flex-1 items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`stage-dot ${countBy(stage) > 0 ? dotClass(STAGE_DOT[stage]) : "dot-neutral"}`}
                        aria-hidden
                      />
                      <span className="text-xs text-stone">{["Submitted", "Review", "Shortlisted"][i]}</span>
                      <span className="num text-xs text-ink">{countBy(stage)}</span>
                    </div>
                  </div>
                ))}
                {anyRejected && <span className="status-pill status-bad shrink-0">Not Selected</span>}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-stone">Education</p>
              {detail.educations.length === 0 ? (
                <p className="mt-1 text-xs text-pebble">No education entries.</p>
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

            <div className="flex flex-wrap gap-1.5">
              <span className="status-pill status-neutral">
                Documents: <span className="num">{detail.documents.length}</span>
              </span>
              <span className="status-pill status-neutral">
                Applications: <span className="num">{detail.applicationCount ?? apps.length}</span>
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
      <PageHeader
        title="Candidates"
        description="Registry of every candidate on file — profiles, logins, and pipeline activity."
        actions={
          <>
            <div className="flex items-center gap-1 rounded-full bg-fog p-1" role="group" aria-label="View mode">
              <button
                type="button"
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors ${mode === "list" ? "bg-ink text-white" : "text-stone hover:text-ink"}`}
                onClick={() => setMode("list")}
                aria-pressed={mode === "list"}
              >
                <List className="h-3.5 w-3.5" aria-hidden />
                List
              </button>
              <button
                type="button"
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors ${mode === "kanban" ? "bg-ink text-white" : "text-stone hover:text-ink"}`}
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
          </>
        }
      />

      {/* KPI tiles */}
      {!error && (rows === null ? (
        <SkeletonKpis count={4} />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard label="Total on file" value={total} icon={Users} tone="info" hint="all registered candidates" />
          <KpiCard label="Showing" value={`${start}–${end}`} icon={List} tone="neutral" hint={`of ${total}`} />
          <KpiCard label="Complete profiles" value={completeOnPage} icon={UserCheck} tone="ok" hint="on this page" />
          <KpiCard label="Has login" value={accountsOnPage} icon={KeyRound} tone="neutral" hint="on this page" />
        </div>
      ))}

      {/* Filter bar — one card row */}
      <div className="dlg-card flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="relative min-w-0 flex-1 basis-56">
          <IconChip
            icon={Search}
            tone="slate"
            size={28}
            iconSize={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2"
          />
          <Input
            className="dlg-input min-h-[44px] pl-12"
            placeholder="Search name, email, employee no., mobile…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search candidates"
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as typeof status);
            setPage(1);
          }}
        >
          <SelectTrigger className="dlg-input min-h-[44px] w-40 shrink-0" aria-label="Profile status">
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
          <SelectTrigger className="dlg-input min-h-[44px] w-40 shrink-0" aria-label="Has account">
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
        <div className="dlg-card p-8">
          <EmptyState
            icon={AlertTriangle}
            tone="rose"
            title="Couldn't load candidates"
            description={error}
            action={
              <button type="button" className={ghostBtn} onClick={() => void load()}>
                Retry
              </button>
            }
          />
        </div>
      ) : rows === null ? (
        <SkeletonRows rows={6} rowClassName="h-16" />
      ) : mode === "list" ? (
        <div className="space-y-3">
          {list.length === 0 ? (
            <div className="dlg-card py-6">
              <EmptyState
                icon={Users}
                title="No candidates match"
                description="Try a different search, or clear the profile and account filters."
              />
            </div>
          ) : (
            <div className="dlg-card overflow-hidden">
              <div className="overflow-x-auto scroll-thin">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th scope="col" className="px-5 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-stone">Candidate</th>
                      <th scope="col" className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-stone">Profile</th>
                      <th scope="col" className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-stone">Applications</th>
                      <th scope="col" className="px-4 py-3"><span className="sr-only">Open</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => {
                      const name = fullName(r);
                      return (
                        <tr key={r.id} className="group/row border-b border-border transition-colors last:border-0 hover:bg-fog/60">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <MonogramAvatar name={name} size={28} />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-ink">{name}</p>
                                <p className="num truncate text-xs text-stone">
                                  {[r.emailAddress, r.mobileNumber].filter(Boolean).join(" · ") || "No contact on file"} · #{r.id}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill
                              status={r.isProfileComplete ? "Complete" : "Incomplete"}
                              variant={variantForCompletion(r.isProfileComplete)}
                            />
                          </td>
                          <td className="num px-4 py-3 text-[13px] text-stone">
                            {r.applicationCount} application{r.applicationCount === 1 ? "" : "s"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100 max-lg:opacity-100">
                              <button
                                type="button"
                                className={iconBtn}
                                aria-label={`Quick view ${name}`}
                                title="Quick view"
                                onClick={() => setModalId(r.id)}
                              >
                                <ArrowUpRight
                                  className="h-4 w-4 transition-transform group-hover/row:translate-x-0.5"
                                  aria-hidden
                                />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="num text-xs text-pebble">
                {start}–{end} of {total}
              </p>
              <div className="flex items-center gap-2">
                <button type="button" className={ghostBtn + " min-h-[36px] px-3 text-xs"} disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </button>
                <span className="num text-xs text-stone">
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
        <div className="flex snap-x snap-proximity gap-4 overflow-x-auto scroll-thin pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible lg:pb-0">
          {PIPELINE_STAGES.map((stage) => {
            const cards = kanban[stage];
            return (
              <KanbanColumn key={stage} label={stage} icon={STAGE_ICON[stage]} tone={STAGE_TONE[stage]} count={cards.length}>
                {cards.length === 0 ? (
                  <EmptyState icon={STAGE_ICON[stage]} tone={STAGE_TONE[stage]} title="No candidates" description="Nothing in this stage right now." compact />
                ) : (
                  cards.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={cardCls + " focus-ring w-full cursor-pointer p-4 text-left"}
                      onClick={() => navigate("candidate", { id: String(c.applicantId) })}
                    >
                      <div className="flex items-start gap-2.5">
                        <MonogramAvatar name={fullName(c.applicant)} />
                        <div className="min-w-0 flex-1">
                          <p className="min-w-0 truncate text-sm font-medium text-ink">{fullName(c.applicant)}</p>
                          <p className="num mt-0.5 text-xs text-pebble">Applied {formatDate(c.dateApplied)}</p>
                        </div>
                      </div>
                      <p className="mt-1 truncate text-xs text-stone">{humanize(c.job.title)}</p>
                      <div className="mt-2.5">
                        <StatusPill status={c.status} />
                      </div>
                    </button>
                  ))
                )}
              </KanbanColumn>
            );
          })}
        </div>
      )}

      <CandidateModal id={modalId} onClose={() => setModalId(null)} />
    </div>
  );
}
