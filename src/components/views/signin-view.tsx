"use client";

// ============================================================================
// RMIS — Sign-in view (spec §3.3, §7.3): identifier (email or username) +
// password, demo account chips, welcome toast → session refresh → role home.
// Presentation pass: lg+ split screen — quiet trust panel on fog (left) and
// the existing white form card (right). All handlers, API calls, and copy
// are preserved exactly.
// ============================================================================

import { useState } from "react";
import type { FormEvent } from "react";
import { Activity, ClipboardList, FileSpreadsheet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { useSession } from "@/components/session-provider";
import { apiFetch } from "@/lib/client";
import { navigate, ROLE_HOME } from "@/lib/router";

const DEMO_ACCOUNTS = ["testadmin", "testevaluator", "testapplicant"] as const;

const TRUST_POINTS: ReadonlyArray<{ icon: LucideIcon; text: string }> = [
  { icon: ClipboardList, text: "CSC-standard position catalog" },
  { icon: FileSpreadsheet, text: "PDS auto-fill from your Civil Service Form 212" },
  { icon: Activity, text: "Track your application in real time" },
];

/** Quiet reassurance panel — lg+ only, sits directly on the fog canvas. */
function AuthTrustPanel({ heading }: { heading: string }) {
  return (
    <div className="hidden items-center lg:flex lg:w-[42%] xl:w-[46%]">
      <div className="w-full max-w-md px-12 xl:pl-20 xl:pr-16">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-ink text-base font-medium text-white">
            M
          </span>
          <span className="text-sm font-medium text-ink">MIRDC Recruitment</span>
        </div>

        <h1 className="mt-10 font-display text-heading-md">{heading}</h1>

        <ul className="mt-9 space-y-5">
          {TRUST_POINTS.map((point) => (
            <li key={point.text} className="flex items-center gap-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white">
                <point.icon className="h-4 w-4 text-graphite" aria-hidden="true" />
              </span>
              <span className="text-xs leading-relaxed text-stone">{point.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function SignInView() {
  const { refresh } = useSession();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!identifier.trim()) {
      toast.error("Enter your email or username");
      return;
    }
    if (!password) {
      toast.error("Enter your password");
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/auth/login", {
        method: "POST",
        body: { identifier: identifier.trim(), password },
      });
      toast.success("Welcome to RMIS");
      const user = await refresh();
      navigate(user ? ROLE_HOME[user.role] : "jobs");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-fog lg:flex-row">
      <AuthTrustPanel heading="Welcome back." />

      {/* Form column */}
      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="dlg-card p-6 sm:p-8 lg:p-10">
            {/* Card header — mobile/tablet only; the lg+ split panel carries brand + heading */}
            <div className="lg:hidden">
              <div className="flex justify-center">
                <span className="grid h-12 w-12 place-items-center rounded-[12px] bg-ink text-xl font-medium text-white">
                  M
                </span>
              </div>
              <h2 className="mt-5 text-center font-display text-3xl text-carbon">Welcome back</h2>
            </div>
            <p className="mt-2 text-center text-sm text-stone lg:mt-0 lg:text-left">
              Sign in with your email or username to continue.
            </p>

            <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
              <div>
                <label htmlFor="identifier" className="mb-1.5 block text-sm font-medium text-ink">
                  Email or username
                </label>
                <Input
                  id="identifier"
                  name="identifier"
                  autoComplete="username"
                  placeholder="you@example.gov.ph"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="dlg-input min-h-[44px]"
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink">
                  Password
                </label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="dlg-input min-h-[44px]"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="dlg-cta min-h-[44px] w-full text-sm disabled:opacity-50"
              >
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>

            {/* Demo accounts */}
            <div className="mt-6 border-t border-border pt-5">
              <p className="text-xs font-medium uppercase tracking-wider text-pebble">Demo accounts</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {DEMO_ACCOUNTS.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setIdentifier(name);
                      setPassword("password123");
                    }}
                    className="dlg-ghost min-h-[44px] px-4 text-xs"
                  >
                    {name}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-pebble">
                password123 · staff accounts are restricted to the MIRDC intranet; applicants can
                sign in from any network.
              </p>
            </div>
          </div>

          {/* Links */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <button
              onClick={() => navigate("signup")}
              className="min-h-[44px] text-sm text-stone underline underline-offset-4 hover:text-ink"
            >
              Create an account
            </button>
            <button
              onClick={() => navigate("jobs")}
              className="min-h-[44px] text-sm text-stone underline underline-offset-4 hover:text-ink"
            >
              Back to positions
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
