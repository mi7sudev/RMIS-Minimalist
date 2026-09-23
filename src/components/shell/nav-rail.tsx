"use client";

// ============================================================================
// RMIS — Desktop left navigation rail (spec §13 view registry, §7.10 nav
// config). PREMIUM DARK RAIL (Linear/Notion pattern): deep-ink gradient,
// glass hover states, glowing active pill, ember brand mark. LABELED w-64 by
// default; user may collapse to w-16 icon-only (persisted in localStorage
// "rmis.rail-expanded"). Bottom: user dropdown with sign out.
// ============================================================================

import { useEffect, useState } from "react";
import {
  Briefcase,
  ChartColumn,
  Gauge,
  House,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ScanSearch,
  Settings2,
  UserRound,
  UsersRound,
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
      items: [{ view: "operations", label: "Command Center", icon: Gauge }],
    },
    {
      group: "Recruitment",
      items: [
        { view: "recruitment", label: "Jobs", icon: Briefcase },
        { view: "candidates", label: "Candidates", icon: UsersRound },
        { view: "review-queue", label: "Review", icon: ScanSearch },
      ],
    },
    {
      group: "Insights",
      items: [{ view: "analytics", label: "Analytics", icon: ChartColumn }],
    },
    {
      group: "Administration",
      items: [{ view: "settings", label: "Settings", icon: Settings2 }],
    },
  ],
  EVALUATOR: [
    {
      group: "My Work",
      items: [{ view: "review-queue", label: "Review Queue", icon: ScanSearch }],
    },
    {
      group: "Browse",
      items: [
        { view: "candidates", label: "Candidates", icon: UsersRound },
        { view: "recruitment", label: "Jobs", icon: Briefcase },
      ],
    },
  ],
  APPLICANT: [
    { group: "Portal", items: [{ view: "home", label: "Home", icon: House }] },
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

  if (!user) return null;
  const groups = NAV_CONFIG[user.role] ?? [];
  const activeKey = PARENT_VIEW[view] ?? view;

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={`rail sticky top-0 hidden h-screen shrink-0 flex-col text-[var(--rail-text)] transition-[width] duration-200 lg:flex ${
          expanded ? "w-64" : "w-16"
        }`}
      >
        {/* Brand → role home */}
        <div className={`flex h-16 shrink-0 items-center ${expanded ? "px-3" : "justify-center"}`}>
          <button
            onClick={() => navigate(ROLE_HOME[user.role])}
            className="flex min-h-[44px] items-center gap-3"
            aria-label="Go to my workspace"
          >
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-none text-base font-semibold text-[#2a1608]"
              style={{
                background: "linear-gradient(145deg, #f9a468 0%, #ef8340 100%)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4), 0 2px 6px rgba(246,146,81,0.4)",
              }}
            >
              M
            </span>
            {expanded && (
              <span className="min-w-0 text-left">
                <span className="block truncate text-sm font-semibold text-white">MIRDC Recruitment</span>
                <span className="block truncate text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--rail-text-dim)]">
                  DOST · RMIS
                </span>
              </span>
            )}
          </button>
        </div>

        {/* Sections */}
        <nav className="flex-1 space-y-6 overflow-y-auto scroll-thin px-2.5 py-4" aria-label="Workspace">
          {groups.map((g) => (
            <div key={g.group}>
              {expanded ? (
                <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--rail-text-dim)]">
                  {g.group}
                </p>
              ) : (
                <div className="mx-auto mb-2 h-px w-6 bg-white/10" aria-hidden="true" />
              )}
              <ul className="space-y-1">
                {g.items.map((item) => {
                  const active = item.view === activeKey;
                  const button = (
                    <button
                      onClick={() => navigate(item.view)}
                      aria-current={active ? "page" : undefined}
                      className={`group relative flex min-h-[44px] w-full items-center gap-3 text-sm transition-all duration-150 ${
                        expanded ? "px-3.5" : "justify-center px-0"
                      } ${
                        active
                          ? "bg-[var(--rail-active-bg)] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                          : "text-[var(--rail-text)] hover:bg-[var(--rail-hover-bg)] hover:text-white"
                      }`}
                    >
                      {/* Ember active indicator */}
                      <span
                        aria-hidden="true"
                        className={`absolute -left-2.5 top-1/2 h-5 w-[3px] -translate-y-1/2 transition-opacity duration-200 ${
                          active ? "opacity-100" : "opacity-0"
                        }`}
                        style={{
                          background: "linear-gradient(180deg, #f9a468, #ef8340)",
                          boxShadow: "0 0 8px rgba(246,146,81,0.7)",
                        }}
                      />
                      <item.icon
                        className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                          active
                            ? "text-[#f9a468]"
                            : "text-[var(--rail-text-dim)] group-hover:text-white"
                        }`}
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
        <div className="shrink-0 space-y-1 p-2.5" style={{ borderTop: "1px solid var(--rail-border)" }}>
          <button
            onClick={toggleExpanded}
            className={`flex min-h-[44px] w-full items-center gap-3 text-sm text-[var(--rail-text)] hover:bg-[var(--rail-hover-bg)] hover:text-white ${
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
                className={`flex min-h-[44px] w-full items-center gap-3 text-left hover:bg-[var(--rail-hover-bg)] ${
                  expanded ? "px-2" : "justify-center px-0"
                }`}
                aria-label="Account menu"
              >
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-[#2a1608]"
                  style={{
                    background: "linear-gradient(145deg, #f9a468 0%, #ef8340 100%)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4), 0 2px 6px rgba(246,146,81,0.35)",
                  }}
                >
                  {initialsOf(user)}
                </span>
                {expanded && (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-white">
                      {displayNameOf(user)}
                    </span>
                    <span className="block truncate text-xs text-[var(--rail-text-dim)]">{user.role}</span>
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
                className="cursor-pointer gap-2 text-[var(--bad)] focus:text-[var(--bad)]"
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
