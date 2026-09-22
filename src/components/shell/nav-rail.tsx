"use client";

// ============================================================================
// RMIS — Desktop left navigation rail (spec §13 view registry, §7.10 nav
// config). Enterprise pattern (Workday/Linear): LABELED w-64 rail by default;
// user may collapse to w-16 icon-only (persisted in localStorage
// "rmis.rail-expanded"). Active view = filled ink pill. Bottom: user dropdown
// with sign out.
// ============================================================================

import { useEffect, useState } from "react";
import {
  BarChart3,
  Briefcase,
  ClipboardCheck,
  Home,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  UserRound,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSession } from "@/components/session-provider";
import { navigate, ROLE_HOME } from "@/lib/router";
import type { Role, SessionUser } from "@/lib/router";

// ── Navigation config (per role) ────────────────────────────────────────────

export type NavItem = { view: string; label: string; icon: LucideIcon };
export type NavGroup = { group: string; items: NavItem[] };

export const NAV_CONFIG: Record<Role, NavGroup[]> = {
  ADMIN: [
    {
      group: "Operations",
      items: [{ view: "operations", label: "Command Center", icon: LayoutDashboard }],
    },
    {
      group: "Recruitment",
      items: [
        { view: "recruitment", label: "Jobs", icon: Briefcase },
        { view: "candidates", label: "Candidates", icon: Users },
        { view: "review-queue", label: "Review", icon: ClipboardCheck },
      ],
    },
    {
      group: "Insights",
      items: [{ view: "analytics", label: "Analytics", icon: BarChart3 }],
    },
    {
      group: "Administration",
      items: [{ view: "settings", label: "Settings", icon: Settings }],
    },
  ],
  EVALUATOR: [
    {
      group: "My Work",
      items: [{ view: "review-queue", label: "Review Queue", icon: ClipboardCheck }],
    },
    {
      group: "Browse",
      items: [
        { view: "candidates", label: "Candidates", icon: Users },
        { view: "recruitment", label: "Jobs", icon: Briefcase },
      ],
    },
  ],
  APPLICANT: [
    { group: "Portal", items: [{ view: "home", label: "Home", icon: Home }] },
    { group: "Account", items: [{ view: "profile", label: "Profile", icon: UserRound }] },
  ],
};

/** Detail views highlight their parent rail section. */
const PARENT_VIEW: Record<string, string> = {
  job: "recruitment",
  candidate: "candidates",
  "evaluator-review": "review-queue",
};

// ── Shared helpers ──────────────────────────────────────────────────────────

export function performSignOut() {
  // Fire-and-forget audit/logout (spec §3.5) — never blocks navigation.
  void fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
  navigate("signin");
  window.location.reload();
}

export function initialsOf(user: SessionUser): string {
  const a = user.firstName?.[0] ?? "";
  const b = user.lastName?.[0] ?? "";
  const s = `${a}${b}` || user.username?.slice(0, 2) || user.email?.slice(0, 2) || "?";
  return s.toUpperCase();
}

export function displayNameOf(user: SessionUser): string {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.username ||
    user.email ||
    "Account"
  );
}

// ── NavRail ─────────────────────────────────────────────────────────────────

export function NavRail({ view }: { view: string }) {
  const { user } = useSession();
  // Enterprise default: labeled rail. localStorage "0" opts out.
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    try {
      setExpanded(window.localStorage.getItem("rmis.rail-expanded") !== "0");
    } catch {
      /* storage unavailable */
    }
  }, []);

  const toggleExpanded = () => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("rmis.rail-expanded", next ? "1" : "0");
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  };

  // Pending counts badge placeholder (kept for future socket push).

  if (!user) return null;
  const groups = NAV_CONFIG[user.role] ?? [];
  const activeKey = PARENT_VIEW[view] ?? view;

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-white transition-[width] duration-200 lg:flex ${
          expanded ? "w-64" : "w-16"
        }`}
      >
        {/* Brand → role home */}
        <div className={`flex h-16 shrink-0 items-center border-b border-border/70 ${expanded ? "px-3" : "justify-center"}`}>
          <button
            onClick={() => navigate(ROLE_HOME[user.role])}
            className="flex min-h-[44px] items-center gap-3"
            aria-label="Go to my workspace"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-ink text-base font-medium text-white">
              M
            </span>
            {expanded && <span className="text-sm font-medium text-ink">MIRDC Recruitment</span>}
          </button>
        </div>

        {/* Sections */}
        <nav className="flex-1 space-y-5 overflow-y-auto scroll-thin px-2 py-4" aria-label="Workspace">
          {groups.map((g) => (
            <div key={g.group}>
              {expanded ? (
                <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-pebble">
                  {g.group}
                </p>
              ) : (
                <div className="mx-auto mb-2 h-px w-6 bg-border" aria-hidden="true" />
              )}
              <ul className="space-y-1">
                {g.items.map((item) => {
                  const active = item.view === activeKey;
                  const button = (
                    <button
                      onClick={() => navigate(item.view)}
                      aria-current={active ? "page" : undefined}
                      className={`group relative flex min-h-[44px] w-full items-center gap-3 rounded-full text-sm transition-colors duration-150 ${
                        expanded ? "px-3.5" : "justify-center px-0"
                      } ${
                        active
                          ? "bg-ink text-white"
                          : "text-stone hover:bg-fog hover:text-ink"
                      }`}
                    >
                      <item.icon
                        className={`h-[18px] w-[18px] shrink-0 ${active ? "" : "text-graphite group-hover:text-ink"}`}
                        aria-hidden="true"
                      />
                      {expanded && <span className="truncate">{item.label}</span>}
                    </button>
                  );
                  return (
                    <li key={item.view}>
                      {expanded ? (
                        button
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>{button}</TooltipTrigger>
                          <TooltipContent side="right" className="rounded-lg bg-ink text-xs text-white">
                            {item.label}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Bottom: collapse toggle + user dropdown */}
        <div className="shrink-0 space-y-1 border-t border-border/70 p-2">
          <button
            onClick={toggleExpanded}
            className={`flex min-h-[44px] w-full items-center gap-3 rounded-full text-sm text-stone hover:bg-fog hover:text-ink ${
              expanded ? "px-3.5" : "justify-center px-0"
            }`}
            aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
          >
            {expanded ? (
              <PanelLeftClose className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            ) : (
              <PanelLeftOpen className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            )}
            {expanded && <span>Collapse</span>}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-full text-left hover:bg-fog ${
                  expanded ? "px-2" : "justify-center px-0"
                }`}
                aria-label="Account menu"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-xs font-medium text-white">
                  {initialsOf(user)}
                </span>
                {expanded && (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {displayNameOf(user)}
                    </span>
                    <span className="block truncate text-xs text-pebble">{user.role}</span>
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-64 rounded-2xl">
              <DropdownMenuLabel>
                <span className="block truncate text-sm font-medium text-ink">
                  {displayNameOf(user)}
                </span>
                <span className="block truncate text-xs text-pebble">{user.email}</span>
                <span className="dlg-pill mt-1.5 inline-flex bg-fog px-2.5 py-0.5 text-[11px] font-medium text-graphite">
                  {user.role}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={performSignOut}
                className="cursor-pointer gap-2 text-dusty-rose focus:text-dusty-rose"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </TooltipProvider>
  );
}

export default NavRail;
