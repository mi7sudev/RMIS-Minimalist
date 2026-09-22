"use client";

// ============================================================================
// RMIS — Admin settings (spec §7.14, `#/settings?tab=users|audit|sms|email`).
// Sub-nav: Users & Roles / Audit Log / SMS Gateway / Email Notices. Deep
// linkable; the command center links to ?tab=audit.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Search, Send, ShieldCheck, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
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
import { apiFetch, formatDateTime, humanize, timeAgo } from "@/lib/client";
import { useHashRoute, navigate } from "@/lib/router";
import { ghostBtn, ctaBtn } from "@/components/views/recruitment";

const TABS = [
  { key: "users", label: "Users & Roles", icon: Users },
  { key: "audit", label: "Audit Log", icon: ShieldCheck },
  { key: "sms", label: "SMS Gateway", icon: Send },
  { key: "email", label: "Email Notices", icon: Send },
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

function RolePill({ role }: { role: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-fog px-2.5 py-1 text-xs font-medium text-graphite">
      {role}
    </span>
  );
}

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
        <p className="text-sm text-stone">{total} account{total === 1 ? "" : "s"}</p>
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
        <div className="max-h-96 overflow-y-auto scroll-thin">
          <table className="w-full text-sm">
            <thead className="bg-fog text-left text-xs text-stone">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Active</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows === null && (
                <tr><td colSpan={4} className="p-4"><Skeleton className="h-16 w-full bg-fog" /></td></tr>
              )}
              {rows?.length === 0 && (
                <tr><td colSpan={4} className="p-8 text-center text-sm text-pebble">No accounts match your filters.</td></tr>
              )}
              {rows?.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{[u.firstName, u.lastName].filter(Boolean).join(" ") || u.username}</p>
                    <p className="text-xs text-pebble">{u.email} · @{u.username}</p>
                  </td>
                  <td className="px-4 py-3"><RolePill role={u.role} /></td>
                  <td className="px-4 py-3">
                    <Switch checked={!u.blocked} disabled={busyId === u.id} onCheckedChange={() => void toggleActive(u)} aria-label={`Toggle ${u.username}`} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button type="button" className="dlg-ghost inline-flex min-h-[36px] items-center rounded-full px-3 text-xs" onClick={() => setEditUser(u)}>Edit</button>
                      <button type="button" className="inline-flex min-h-[36px] items-center rounded-full border border-dusty-rose/40 bg-dusty-rose/10 px-3 text-xs font-medium text-dusty-rose" onClick={() => setHardTarget(u)}>Delete</button>
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
          <span className="text-sm text-stone">Page {page} of {pages}</span>
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
            <AlertDialogAction className="rounded-full bg-dusty-rose text-white hover:bg-dusty-rose/90" onClick={() => void confirmHardDelete()}>Delete forever</AlertDialogAction>
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
            {usernameError && <p className="mt-1 text-xs text-dusty-rose">{usernameError}</p>}
          </div>
          <div>
            <Label className={labelCls()}>Password *</Label>
            <Input type="password" className="dlg-input min-h-[44px]" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            {passwordError && <p className="mt-1 text-xs text-dusty-rose">{passwordError}</p>}
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
            {form.password.length > 0 && form.password.length < 6 && <p className="mt-1 text-xs text-dusty-rose">Password must be at least 6 characters</p>}
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
        <div className="dlg-card p-4">
          <p className="text-xs text-pebble">Total events</p>
          <p className="font-display text-3xl text-ink tabular-nums">{summary?.totalEvents ?? "—"}</p>
        </div>
        {(["ADMIN", "EVALUATOR", "APPLICANT"] as const).map((r) => (
          <div key={r} className="dlg-card p-4">
            <p className="text-xs text-pebble">{humanize(r)}</p>
            <p className="font-display text-3xl text-ink tabular-nums">{summary?.byRole?.[r] ?? 0}</p>
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
        <div className="max-h-96 overflow-y-auto scroll-thin">
          <table className="w-full text-sm">
            <thead className="bg-fog text-left text-xs text-stone">
              <tr>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Detail</th>
                <th className="px-4 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {rows === null && <tr><td colSpan={4} className="p-4"><Skeleton className="h-16 w-full bg-fog" /></td></tr>}
              {rows?.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-sm text-pebble">No audit events match.</td></tr>}
              {rows?.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{r.userLabel ?? "System"}</p>
                    {r.userRole && <p className="text-xs text-pebble">{r.userRole}</p>}
                  </td>
                  <td className="px-4 py-3"><span className="inline-flex rounded-full bg-fog px-2.5 py-1 text-xs font-medium text-graphite">{humanize(r.action)}</span></td>
                  <td className="px-4 py-3 text-stone">{r.description ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-pebble">{timeAgo(r.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button type="button" className={ghostBtn} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className="text-sm text-stone">Page {page} of {pages}</span>
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

function StatusChip({ status }: { status: string }) {
  const cls =
    status === "sent" ? "bg-ink text-white"
    : status === "failed" ? "bg-dusty-rose/15 text-dusty-rose"
    : status === "skipped" ? "bg-fog text-pebble"
    : "bg-fog text-stone";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>{status}</span>;
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
            <p className="text-xs text-pebble">Active provider</p>
            <p className="font-display text-xl text-ink">{humanize(data?.provider ?? "…")}</p>
          </div>
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${data?.provider === "mock" ? "bg-fog text-stone" : "bg-ink text-white"}`}>
            {data?.provider === "mock" ? "Mock mode — messages are logged only" : data?.configured ? "Configured" : "Not configured"}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map(([label, value]) => (
            <div key={label} className="rounded-[12px] bg-fog p-3">
              <p className="text-xs text-pebble">{label}</p>
              <p className="font-display text-2xl text-ink tabular-nums">{value ?? "—"}</p>
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
        <div className="max-h-96 overflow-y-auto scroll-thin">
          <table className="w-full text-sm">
            <thead className="bg-fog text-left text-xs text-stone">
              <tr>
                <th className="px-4 py-3 font-medium">To</th>
                <th className="px-4 py-3 font-medium">{kind === "sms" ? "Message" : "Subject"}</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {data === null && <tr><td colSpan={4} className="p-4"><Skeleton className="h-16 w-full bg-fog" /></td></tr>}
              {data?.logs.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-sm text-pebble">Nothing sent yet.</td></tr>}
              {data?.logs.map((l) => (
                <tr key={l.id} className="border-t border-border align-top">
                  <td className="px-4 py-3 font-medium text-ink">{l.to}</td>
                  <td className="max-w-[280px] truncate px-4 py-3 text-stone">{l.subject ?? l.message ?? "—"}</td>
                  <td className="px-4 py-3"><StatusChip status={l.status} />{l.error && <p className="mt-1 text-xs text-pebble">{l.error}</p>}</td>
                  <td className="px-4 py-3 text-xs text-pebble">{timeAgo(l.createdAt)}</td>
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
      <header>
        <h1 className="font-display text-heading-md text-carbon">Settings</h1>
        <p className="mt-1 text-sm text-stone">Manage accounts, review the audit trail, and configure notification channels.</p>
      </header>

      <div className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => navigate("settings", { tab: t.key })}
            className={`inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm transition-colors lg:w-full lg:justify-start ${
              tab === t.key ? "bg-ink text-white" : "text-stone hover:bg-white"
            }`}
            aria-current={tab === t.key ? "page" : undefined}
          >
            <t.icon className="h-4 w-4" aria-hidden />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "users" && <UsersPanel />}
      {tab === "audit" && <AuditPanel />}
      {tab === "sms" && <MessagingPanel kind="sms" />}
      {tab === "email" && <MessagingPanel kind="email" />}
    </div>
  );
}
