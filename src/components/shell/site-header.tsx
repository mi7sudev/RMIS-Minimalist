"use client";

// ============================================================================
// RMIS — Public header (spec §7.1): full-width sticky enterprise bar anchored
// to the top edge — hairline bottom border, frosted glass, brand mark left;
// Positions link + primary sign-in affordance right.
// Presentation pass v2 (user feedback):
//   • Floating "top-4 glass card" replaced with a top-0 full-width bar so page
//     content can never poke through the side gaps (the reported overlap).
//   • "Sign up" removed from the nav — "Sign in" is now the single orange CTA
//     (hidden while already on the sign-in view to avoid a dead control).
//   • Container widened to the system-wide 1600px grid (wide-screen fix).
// All navigation behavior is preserved exactly.
// ============================================================================

import { useSession } from "@/components/session-provider";
import { navigate, ROLE_HOME, useHashRoute } from "@/lib/router";

export function SiteHeader() {
  const { user } = useSession();
  const { view } = useHashRoute();
  const onSignInView = view === "signin";

  return (
    <header className="glass sticky top-0 z-40 border-b border-black/[0.07] shadow-e1">
      <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <button
          onClick={() => navigate("home")}
          className="flex min-h-[44px] items-center gap-3"
          aria-label="MIRDC Recruitment home"
        >
          <span
            className="grid h-9 w-9 shrink-0 place-items-center text-base font-semibold text-[#2a1608]"
            style={{
              background: "linear-gradient(145deg, #f9a468 0%, #ef8340 100%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4), 0 2px 6px rgba(246,146,81,0.4)",
            }}
          >
            M
          </span>
          <span
            className="hidden text-sm font-semibold tracking-[-0.01em] text-ink sm:inline"
          >
            MIRDC Recruitment
          </span>
        </button>

        {/* Right cluster */}
        <nav className="flex items-center gap-2" aria-label="Primary">
          {view !== "jobs" && (
            <button
              onClick={() => navigate("jobs")}
              className="dlg-ghost inline-flex min-h-[44px] items-center px-4 text-sm sm:px-5"
            >
              Positions
            </button>
          )}

          {user ? (
            <button
              onClick={() => navigate(ROLE_HOME[user.role])}
              className="dlg-cta inline-flex min-h-[44px] items-center whitespace-nowrap px-6 text-sm"
            >
              Dashboard
            </button>
          ) : (
            !onSignInView && (
              <button
                onClick={() => navigate("signin")}
                className="dlg-cta inline-flex min-h-[44px] items-center whitespace-nowrap px-4 text-sm sm:px-6"
                aria-label="Sign in to RMIS"
              >
                Sign in
              </button>
            )
          )}
        </nav>
      </div>
    </header>
  );
}

export default SiteHeader;
