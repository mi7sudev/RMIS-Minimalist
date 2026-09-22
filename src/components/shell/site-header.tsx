"use client";

// ============================================================================
// RMIS — Floating public pill header (spec §7.1): white rounded-[32px] pill,
// brand mark left; Positions link + sign-in affordance + orange CTA right.
// Used by the public landing and the anonymous jobs board (PublicShell).
// Presentation pass: Dialog shadow token, 64px pill height, hover-underline
// text link. All navigation behavior is preserved exactly.
// ============================================================================

import { useSession } from "@/components/session-provider";
import { navigate, ROLE_HOME, useHashRoute } from "@/lib/router";

export function SiteHeader() {
  const { user } = useSession();
  const { view } = useHashRoute();

  return (
    <header className="sticky top-4 z-40 px-4 sm:px-6">
      <div
        className="glass mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between gap-3 rounded-[32px] border border-white/60 px-4 shadow-e2 sm:px-6"
      >
        {/* Brand */}
        <button
          onClick={() => navigate("home")}
          className="flex min-h-[44px] items-center gap-3"
          aria-label="MIRDC Recruitment home"
        >
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-base font-semibold text-[#2a1608]"
            style={{
              background: "linear-gradient(145deg, #f9a468 0%, #ef8340 100%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4), 0 2px 6px rgba(246,146,81,0.4)",
            }}
          >
            M
          </span>
          <span className="text-sm font-semibold tracking-[-0.01em] text-ink">
            MIRDC Recruitment
          </span>
        </button>

        {/* Right cluster */}
        <nav className="flex items-center gap-2" aria-label="Primary">
          {view !== "jobs" && (
            <button
              onClick={() => navigate("jobs")}
              className="dlg-ghost hidden min-h-[44px] items-center px-5 text-sm sm:inline-flex"
            >
              Positions
            </button>
          )}

          {user ? (
            <>
              <button
                onClick={() => navigate(ROLE_HOME[user.role])}
                className="dlg-ghost hidden min-h-[44px] items-center px-5 text-sm sm:inline-flex"
              >
                Dashboard
              </button>
              <button
                onClick={() => navigate(ROLE_HOME[user.role])}
                className="dlg-cta inline-flex min-h-[44px] items-center px-6 text-sm"
              >
                Dashboard
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => navigate("signin")}
                className="hidden min-h-[44px] items-center rounded-full px-3 text-sm text-stone underline-offset-4 transition-colors hover:text-ink hover:underline sm:inline-flex"
              >
                Sign in
              </button>
              <button
                onClick={() => navigate("signin")}
                className="dlg-cta inline-flex min-h-[44px] items-center px-6 text-sm"
              >
                Sign in
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export default SiteHeader;
