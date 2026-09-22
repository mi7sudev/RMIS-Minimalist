"use client";

// ============================================================================
// RMIS — Admin settings (spec §7.14, `#/settings?tab=users|audit|sms|email`).
// Sub-nav: Users & Roles / Audit Log / SMS Gateway / Email Notices. Deep
// linkable; the command center links to ?tab=audit.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail, Pencil, Search, Send, ShieldCheck, Trash2, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { EmptyState, PageHeader, SkeletonRows, StatusPill } from "@/components/ui/shell";
import { apiFetch, formatDateTime, humanize, timeAgo } from "@/lib/client";
import { useHashRoute, navigate } from "@/lib/router";
import { pillClass } from "@/lib/status-ui";
import { ghostBtn, ctaBtn, iconBtn, iconBtnBad } from "@/components/views/recruitment";

const TABS = [
  { key: "users", label: "Users & Roles", icon: Users },
  { key: "audit", label: "Audit Log", icon: ShieldCheck },
  { key: "sms", label: "SMS Gateway", icon: Send },
  { key: "email", label: "Email Notices", icon: Mail },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function labelCls() {
  return "mb-1.5 block text-xs font-medium text-graphite";
}

// ───────────────────────────────────────────────────────────── Users panel

type UserRow = {
  id: string;
  username: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: "ADMIN" | "EVALUATOR" | "APPLICANT";
  blocked: boolean;
  createdAt: string;
  applicant?: { id: number; isProfileComplete: boolean } | null;
};

function UsersPanel() {
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("ALL");
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [busyId, setBusyId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [hardTarget, setHardTarget] = useState<UserRow | null>(null);
  const [disableTarget, setDisableTarget] = useState<UserRow | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setRows(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (q.trim()) params.set("q", q.trim());
      if (role !== "ALL") params.set("role", role);
      const data = await apiFetch<{ data: UserRow[]; total: number }>(`/api/admin/users?${params.toString()}`);
      setRows(data.data);
      setTotal(data.total);
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : "Failed to load users");
      setRows([]);
    }
  }, [q, role, page]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const toggleActive = async (u: UserRow) => {
    setBusyId(u.id);
    try {
      if (!u.blocked) {
        setDisableTarget(u); // confirm first
      } else {
        await apiFetch(`/api/admin/users/${u.id}`, { method: "PATCH", body: { isActive: true } });
        toast.success(`${u.username} re-enabled`);
        await load(true);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const confirmDisable = async () => {
    if (!disableTarget) return;
    try {
      await apiFetch(`/api/admin/users/${disableTarget.id}`, { method: "DELETE" });
      toast.success(`${disableTarget.username} disabled`);
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
    setDisableTarget(null);
  };

  const confirmHardDelete = async () => {
    if (!hardTarget) return;
    try {
      await apiFetch(`/api/admin/users/${hardTarget.id}?hard=1`, { method: "DELETE" });
      toast.success(`${hardTarget.username} permanently deleted`);
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
    setHardTarget(null);
  };

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-stone">
          <span className="num">{total}</span> account{total === 1 ? "" : "s"}
        </p>
        <button type="button" className={ctaBtn} onClick={() => setCreateOpen(true)}>Create User</button>
      </div>

      <div className="dlg-card p-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pebble" aria-hidden />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search name, email or username…" className="dlg-input min-h-[44px] pl-9" />
        </div>
        <Select value={role} onValueChange={(v) => { setRole(v); setPage(1); }}>
          <SelectTrigger className="dlg-input min-h-[44px] w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All roles</SelectItem>
            <SelectItem value="APPLICANT">Applicant</SelectItem>
            <SelectItem value="EVALUATOR">Evaluator</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="dlg-card overflow-hidden">
        <div className="max-h-96 overflow-x-auto overflow-y-auto scroll-thin">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="sticky top-0 z-10 bg-fog text-left text-xs font-medium uppercase tracking-[0.08em] text-stone">
              <tr>
                <th className="px-5 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-5 py-3 text-right"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows === null && (
                <tr><td colSpan={4} className="p-4"><SkeletonRows rows={4} rowClassName="h-12" /></td></tr>
              )}
              {rows?.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6">
                    <EmptyState icon={Users} title="No accounts match your filters." compact />
                  </td>
                </tr>
              )}
              {rows?.map((u) => (
                <tr key={u.id} className="group/row border-t border-border transition-colors hover:bg-fog/60">
                  <td className="px-5 py-3">
                    <p className="text-sm font-medium text-ink">{[u.firstName, u.lastName].filter(Boolean).join(" ") || u.username}</p>
                    <p className="num text-xs text-pebble">{u.email} · @{u.username}</p>
                  </td>
                  <td className="px-4 py-3"><span className={pillClass("neutral")}>{u.role}</span></td>
                  <td className="px-4 py-3">
                    <Switch checked={!u.blocked} disabled={busyId === u.id} onCheckedChange={() => void toggleActive(u)} aria-label={`Toggle ${u.username}`} />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100 max-lg:opacity-100">
                      <button
                        type="button"
                        className={iconBtn}
                        aria-label={`Edit ${u.username}`}
                        title="Edit"
                        onClick={() => setEditUser(u)}
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={iconBtnBad}
                        aria-label={`Delete ${u.username}`}
                        title="Delete"
                        onClick={() => setHardTarget(u)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button type="button" className={ghostBtn} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className="num text-sm text-stone">Page {page} of {pages}</span>
          <button type="button" className={ghostBtn} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => void load(true)} />
      {editUser && (
        <EditUserDialog user={editUser} onOpenChange={(o) => !o && setEditUser(null)} onSaved={() => void load(true)} />
      )}

      <AlertDialog open={!!disableTarget} onOpenChange={(o) => !o && setDisableTarget(null)}>
        <AlertDialogContent className="dlg-card-plain">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl">Disable {disableTarget?.username}?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-stone">
              The account will be signed out and cannot sign in until re-enabled. Nothing is permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dlg-ghost rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction className="dlg-cta rounded-full" onClick={() => void confirmDisable()}>Disable</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!hardTarget} onOpenChange={(o) => !o && setHardTarget(null)}>
        <AlertDialogContent className="dlg-card-plain">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl">Permanently delete {hardTarget?.username}?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-stone">
              This removes the account and its applicant profile. Administrators and your own account are protected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dlg-ghost rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full border border-[var(--bad)]/30 bg-white text-[var(--bad)] hover:bg-[var(--bad-bg)]"
              onClick={() => void confirmHardDelete()}
            >
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreateUserDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const [form, setForm] = useState({ email: "", username: "", password: "", role: "APPLICANT", firstName: "", lastName: "" });
  const [busy, setBusy] = useState(false);
  const usernameError = form.username.length > 0 && form.username.length < 3 ? "Username must be at least 3 characters" : null;
  const passwordError = form.password.length > 0 && form.password.length < 6 ? "Password must be at least 6 characters" : null;

  const submit = async () => {
    setBusy(true);
    try {
      await apiFetch("/api/admin/users", { method: "POST", body: form });
      toast.success("Account created");
      onOpenChange(false);
      setForm({ email: "", username: "", password: "", role: "APPLICANT", firstName: "", lastName: "" });
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dlg-card-plain sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle className="font-display text-2xl text-ink">Create User</DialogTitle>
          <DialogDescription className="text-sm text-stone">Staff accounts can only sign in from the MIRDC intranet.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label className={labelCls()}>Email *</Label><Input className="dlg-input min-h-[44px]" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@mirdc.gov.ph" /></div>
          <div>
            <Label className={labelCls()}>Username *</Label>
            <Input className="dlg-input min-h-[44px]" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            {usernameError && <p className="mt-1 text-xs text-[var(--bad)]">{usernameError}</p>}
          </div>
          <div>
            <Label className={labelCls()}>Password *</Label>
            <Input type="password" className="dlg-input min-h-[44px]" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            {passwordError && <p className="mt-1 text-xs text-[var(--bad)]">{passwordError}</p>}
          </div>
          <div>
            <Label className={labelCls()}>Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger className="dlg-input min-h-[44px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="APPLICANT">Applicant</SelectItem>
                <SelectItem value="EVALUATOR">Evaluator</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className={labelCls()}>First name</Label><Input className="dlg-input min-h-[44px]" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
            <div><Label className={labelCls()}>Last name</Label><Input className="dlg-input min-h-[44px]" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
          </div>
        </div>
        <DialogFooter className="flex-col gap-3 sm:flex-row">
          <button type="button" className={ghostBtn} onClick={() => onOpenChange(false)}>Cancel</button>
          <button
            type="button"
            className={ctaBtn}
            disabled={busy || !form.email || usernameError !== null || passwordError !== null || form.password.length < 6 || form.username.length < 3}
            onClick={() => void submit()}
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ user, onOpenChange, onSaved }: { user: UserRow; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [form, setForm] = useState({ firstName: user.firstName ?? "", lastName: user.lastName ?? "", role: user.role, password: "" });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { firstName: form.firstName, lastName: form.lastName, role: form.role };
      if (form.password) body.password = form.password;
      await apiFetch(`/api/admin/users/${user.id}`, { method: "PATCH", body });
      toast.success("Account updated");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="dlg-card-plain sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle className="font-display text-2xl text-ink">Edit @{user.username}</DialogTitle>
          <DialogDescription className="text-sm text-stone">{user.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className={labelCls()}>First name</Label><Input className="dlg-input min-h-[44px]" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
            <div><Label className={labelCls()}>Last name</Label><Input className="dlg-input min-h-[44px]" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
          </div>
          <div>
            <Label className={labelCls()}>Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as UserRow["role"] })}>
              <SelectTrigger className="dlg-input min-h-[44px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="APPLICANT">Applicant</SelectItem>
                <SelectItem value="EVALUATOR">Evaluator</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className={labelCls()}>Reset password</Label>
            <Input type="password" className="dlg-input min-h-[44px]" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Leave blank to keep current" />
            {form.password.length > 0 && form.password.length < 6 && <p className="mt-1 text-xs text-[var(--bad)]">Password must be at least 6 characters</p>}
          </div>
        </div>
        <DialogFooter className="flex-col gap-3 sm:flex-row">
          <button type="button" className={ghostBtn} onClick={() => onOpenChange(false)}>Cancel</button>
          <button type="button" className={ctaBtn} disabled={busy || (form.password.length > 0 && form.password.length < 6)} onClick={() => void submit()}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────────────────────────────────────── Audit panel

type AuditRow = {
  id: number;
  timestamp: string;
  userLabel: string | null;
  userRole: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  description: string | null;
  ipAddress: string | null;
};

function AuditPanel() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [summary, setSummary] = useState<{ totalEvents: number; byRole: Record<string, number> } | null>(null);
  const [actions, setActions] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("ALL");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const load = useCallback(async (silent = false) => {
    if (!silent) setRows(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (q.trim()) params.set("search", q.trim());
      if (action !== "ALL") params.set("action", action);
      const data = await apiFetch<{
        data: AuditRow[];
        total: number;
        actions: string[];
        summary: { totalEvents: number; onPage: number; topActions: { action: string; count: number }[]; byRole: Record<string, number> };
      }>(`/api/admin/audit-logs?${params.toString()}`);
      setRows(data.data);
      setSummary({ totalEvents: data.summary.totalEvents, byRole: data.summary.byRole });
      setActions(data.actions);
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : "Failed to load audit log");
      setRows([]);
    }
  }, [q, action, page]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const pages = Math.max(1, Math.ceil((rows === null ? 0 : summary?.totalEvents ?? 0) / pageSize));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            ["Total events", summary?.totalEvents],
            ...(["ADMIN", "EVALUATOR", "APPLICANT"] as const).map((r) => [humanize(r), summary?.byRole?.[r] ?? 0] as const),
          ] as [string, number | undefined][]
        ).map(([label, value]) => (
          <div key={label} className="dlg-card p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone">{label}</p>
            <p className="num mt-2 text-[28px] font-medium leading-none text-ink">{value ?? "—"}</p>
          </div>
        ))}
      </div>

      <div className="dlg-card p-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pebble" aria-hidden />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search descriptions and actors…" className="dlg-input min-h-[44px] pl-9" />
        </div>
        <Select value={action} onValueChange={(v) => { setAction(v); setPage(1); }}>
          <SelectTrigger className="dlg-input min-h-[44px] w-full sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All actions</SelectItem>
            {actions.map((a) => <SelectItem key={a} value={a}>{humanize(a)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="dlg-card overflow-hidden">
        <div className="max-h-96 overflow-y-auto scroll-thin p-2">
          {rows === null && <div className="p-2"><SkeletonRows rows={6} rowClassName="h-11" /></div>}
          {rows?.length === 0 && <EmptyState icon={ShieldCheck} title="No audit events match." compact />}
          {rows?.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[12px] px-3 py-2.5 transition-colors hover:bg-fog/60">
              <span className="num w-24 shrink-0 text-xs text-pebble" title={formatDateTime(r.timestamp)}>
                {timeAgo(r.timestamp)}
              </span>
              <span className="w-44 shrink-0 truncate">
                <span className="text-[13px] font-medium text-ink">{r.userLabel ?? "System"}</span>
                {r.userRole ? <span className="num ml-1.5 text-[11px] text-pebble">{r.userRole}</span> : null}
              </span>
              <span className={`${pillClass("neutral")} shrink-0 uppercase tracking-[0.04em]`} style={{ fontSize: "10px" }}>
                {humanize(r.action)}
              </span>
              <span className="min-w-[200px] flex-1 truncate text-[13px] text-stone">{r.description ?? "—"}</span>
            </div>
          ))}
        </div>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button type="button" className={ghostBtn} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className="num text-sm text-stone">Page {page} of {pages}</span>
          <button type="button" className={ghostBtn} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────── Messaging panels (SMS/email)

type MsgLog = {
  id: number;
  to: string;
  subject?: string;
  message?: string;
  provider: string;
  status: string;
  error: string | null;
  createdAt: string;
  attachments?: string | null;
};

type MsgPanelData = {
  provider: string;
  configured: boolean;
  stats: { total: number; sent: number; failed: number; skipped?: number; mock?: number; last24h: number };
  logs: MsgLog[];
};

/** Delivery status → functional status tone pill. */
function StatusChip({ status }: { status: string }) {
  const variant =
    status === "sent" ? "ok"
    : status === "failed" ? "bad"
    : status === "mock" ? "warn"
    : "neutral";
  return <StatusPill status={status} variant={variant} />;
}

function MessagingPanel({ kind }: { kind: "sms" | "email" }) {
  const [data, setData] = useState<MsgPanelData | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setData(null);
    try {
      setData(await apiFetch<MsgPanelData>(`/api/admin/${kind}`));
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : "Failed to load");
      setData({ provider: "mock", configured: false, stats: { total: 0, sent: 0, failed: 0, last24h: 0 }, logs: [] });
    }
  }, [kind]);

  useEffect(() => { void load(); }, [load]);

  const testSend = async () => {
    setBusy(true);
    try {
      const body = kind === "sms" ? { to, message: message || undefined } : { to, subject: subject || undefined, message: message || undefined };
      const res = await apiFetch<{ email?: { status: string }; sms?: { status: string } }>(`/api/admin/${kind}`, { method: "POST", body });
      const status = res.email?.status ?? res.sms?.status ?? "sent";
      if (status === "sent") toast.success(`Test ${kind} sent`);
      else if (status === "mock") toast.info(`Test ${kind} logged in mock mode`, { description: "Configure a provider to deliver for real." });
      else if (status === "skipped") toast.warning("Recipient skipped", { description: "Check the address or mobile number format." });
      else toast.error(`Delivery failed — check the logs`);
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  };

  const tiles: [string, number | undefined][] = [
    ["Total", data?.stats.total],
    ["Sent", data?.stats.sent],
    ["Failed", data?.stats.failed],
    ["Last 24h", data?.stats.last24h],
  ];

  return (
    <div className="space-y-4">
      <div className="dlg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone">Active provider</p>
            <p className="num mt-1 text-xl font-medium text-ink">{humanize(data?.provider ?? "…")}</p>
          </div>
          {data?.provider === "mock" ? (
            <StatusPill status="Mock mode — messages are logged only" variant="neutral" />
          ) : (
            <StatusPill status={data?.configured ? "Configured" : "Not configured"} variant={data?.configured ? "ok" : "warn"} />
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map(([label, value]) => (
            <div key={label} className="rounded-[12px] bg-fog p-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone">{label}</p>
              <p className="num mt-1 text-xl font-medium text-ink">{value ?? "—"}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="dlg-card p-6">
        <p className="mb-4 text-sm font-medium text-ink">Test send</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className={labelCls()}>{kind === "sms" ? "Mobile number (09…)" : "Recipient email"}</Label>
            <Input className="dlg-input min-h-[44px]" value={to} onChange={(e) => setTo(e.target.value)} placeholder={kind === "sms" ? "09171234567" : "name@example.com"} />
          </div>
          {kind === "email" && (
            <div>
              <Label className={labelCls()}>Subject</Label>
              <Input className="dlg-input min-h-[44px]" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="RMIS test email" />
            </div>
          )}
          <div className={kind === "email" ? "sm:col-span-2" : ""}>
            <Label className={labelCls()}>Message</Label>
            <Input className="dlg-input min-h-[44px]" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Optional message" />
          </div>
        </div>
        <button type="button" className={`${ctaBtn} mt-4`} disabled={busy || !to.trim()} onClick={() => void testSend()}>
          {busy ? "Sending…" : `Send test ${kind}`}
        </button>
      </div>

      <div className="dlg-card overflow-hidden">
        <div className="max-h-96 overflow-x-auto overflow-y-auto scroll-thin">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="sticky top-0 z-10 bg-fog text-left text-xs font-medium uppercase tracking-[0.08em] text-stone">
              <tr>
                <th className="px-5 py-3">To</th>
                <th className="px-4 py-3">{kind === "sms" ? "Message" : "Subject"}</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-5 py-3 text-right">When</th>
              </tr>
            </thead>
            <tbody>
              {data === null && <tr><td colSpan={4} className="p-4"><SkeletonRows rows={4} rowClassName="h-12" /></td></tr>}
              {data?.logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6">
                    <EmptyState icon={Send} title="Nothing sent yet." compact />
                  </td>
                </tr>
              )}
              {data?.logs.map((l) => (
                <tr key={l.id} className="border-t border-border align-top transition-colors hover:bg-fog/60">
                  <td className="px-5 py-3 font-medium text-ink">{l.to}</td>
                  <td className="max-w-[280px] truncate px-4 py-3 text-stone">{l.subject ?? l.message ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusChip status={l.status} />
                    {l.error && <p className="mt-1 text-xs text-pebble">{l.error}</p>}
                  </td>
                  <td className="num px-5 py-3 text-right text-xs text-pebble" title={formatDateTime(l.createdAt)}>
                    {timeAgo(l.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────── Root view

export default function Settings() {
  const route = useHashRoute();
  const tabParam = route.params.tab;
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "users";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage accounts, review the audit trail, and configure notification channels."
      />

      <div className="grid gap-6 lg:grid-cols-[240px_1fr] lg:items-start">
        {/* Left vertical tab rail (white card); horizontal scroll pills on mobile */}
        <nav className="dlg-card p-2 lg:sticky lg:top-6" aria-label="Settings sections">
          <div className="flex gap-1 overflow-x-auto scroll-thin lg:flex-col lg:overflow-visible">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => navigate("settings", { tab: t.key })}
                aria-current={tab === t.key ? "page" : undefined}
                className={`focus-ring inline-flex h-11 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full px-4 text-sm transition-colors ${
                  tab === t.key ? "bg-ink text-white" : "text-stone hover:bg-fog hover:text-ink"
                }`}
              >
                <t.icon className="h-4 w-4 shrink-0" aria-hidden />
                {t.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="min-w-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {tab === "users" && <UsersPanel />}
          {tab === "audit" && <AuditPanel />}
          {tab === "sms" && <MessagingPanel kind="sms" />}
          {tab === "email" && <MessagingPanel kind="email" />}
        </div>
      </div>
    </div>
  );
}
