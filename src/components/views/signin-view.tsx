"use client";

// ============================================================================
// RMIS — Sign-in view (spec §3.3, §7.3): identifier (email or username) +
// password, demo account chips, welcome toast → session refresh → role home.
// Wave-3 "Ink & Ember" pass: lg+ split screen with a dark brand panel (ember
// glow, "M" watermark, glass trust rows) on the left and the upgraded form
// card on the right; below lg the panel collapses to a compact dark strip.
// Demo chips are tinted selectable pills. All handlers, API calls, and copy
// are preserved exactly.
// ============================================================================

import { useState } from "react";
import type { FormEvent } from "react";
import { Activity, Check, FileSpreadsheet, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { IconChip, Monogram } from "@/components/ui/shell";
import type { ChipTone } from "@/components/ui/shell";
import { useSession } from "@/components/session-provider";
import { apiFetch } from "@/lib/client";
import { navigate, ROLE_HOME } from "@/lib/router";
import { cn } from "@/lib/utils";

const DEMO_ACCOUNTS = ["testadmin", "testevaluator", "testapplicant"] as const;

const TRUST_POINTS: ReadonlyArray<{ icon: LucideIcon; tone: ChipTone; text: string }> = [
  { icon: FileSpreadsheet, tone: "amber", text: "PDS auto-fill" },
  { icon: Activity, tone: "emerald", text: "Real-time status tracking" },
  { icon: ShieldCheck, tone: "plum", text: "Data Privacy Act compliant" },
];

/** Dark brand panel — lg+ only. Decorative glows are pointer-events-none. */
function AuthBrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-[linear-gradient(180deg,#1b1b28_0%,#14141d_100%)] lg:flex lg:w-[42%] xl:w-[46%]">
      {/* Ember glow + watermark (decorative) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 -top-32 h-[480px] w-[480px] rounded-full bg-[rgba(246,146,81,0.16)] blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -right-16 h-[360px] w-[360px] rounded-full bg-[rgba(246,146,81,0.07)] blur-3xl"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-[130px] -right-8 select-none font-display text-[400px] leading-none text-white/[0.04]"
      >
        M
      </span>

      <div className="relative z-10 flex w-full max-w-md flex-col justify-center px-12 py-16 xl:pl-20 xl:pr-16">
        <div className="inline-flex w-fit items-center gap-3 bg-white/[0.06] py-2 pl-2 pr-4 ring-1 ring-white/10 backdrop-blur">
          <Monogram warm size={32}>
            M
          </Monogram>
          <span className="text-sm font-semibold text-white/90">MIRDC Recruitment</span>
        </div>

        <h1 className="mt-10 font-display text-[clamp(30px,2.6vw,38px)] leading-[1.18] tracking-[-0.01em] text-white">
          Build a career that moves the nation forward.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-white/55">
          The official hiring portal of the Metals Industry Research and Development Center.
        </p>

        <ul className="mt-10 space-y-3">
          {TRUST_POINTS.map((point) => (
            <li
              key={point.text}
              className="flex items-center gap-3.5 rounded-2xl bg-white/[0.05] p-3.5 ring-1 ring-white/10 backdrop-blur-sm"
            >
              <IconChip icon={point.icon} tone={point.tone} size={36} iconSize={16} />
              <span className="text-[13px] font-medium text-white/85">{point.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

/** Compact dark brand strip — below lg only. */
function MobileBrandStrip() {
  return (
    <div className="relative overflow-hidden bg-[linear-gradient(180deg,#1b1b28_0%,#14141d_100%)] px-4 py-4 lg:hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-20 left-1/2 h-44 w-44 -translate-x-1/2 rounded-full bg-[rgba(246,146,81,0.16)] blur-2xl"
      />
      <div className="relative z-10 flex items-center justify-center gap-2.5">
        <Monogram warm size={28}>M</Monogram>
        <span className="text-sm font-semibold text-white">MIRDC Recruitment</span>
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
    <div className="flex min-h-screen flex-col lg:flex-row">
      <AuthBrandPanel />
      <MobileBrandStrip />

      {/* Form column */}
      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="dlg-card-plain shadow-e3 ring-1 ring-black/[0.06] p-6 sm:p-8 lg:p-10">
            {/* Card header — mobile/tablet only; the lg+ brand panel carries brand + heading */}
            <div className="lg:hidden">
              <h2 className="text-center font-display text-3xl text-carbon">Welcome back</h2>
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
                {DEMO_ACCOUNTS.map((name) => {
                  const selected = identifier === name && password === "password123";
                  return (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setIdentifier(name);
                        setPassword("password123");
                      }}
                      className={cn(
                        "inline-flex min-h-[44px] items-center gap-1.5 px-4 text-xs font-medium transition-all duration-150",
                        selected
                          ? "bg-[linear-gradient(135deg,#2b2b3d,#181825)] text-[#f0ede8] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_2px_4px_rgba(24,24,37,0.25)]"
                          : "bg-[linear-gradient(135deg,#f0eff2,#e4e3e8)] text-graphite shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_1px_2px_rgba(24,24,37,0.06)] hover:brightness-[1.03]"
                      )}
                    >
                      {selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                      {name}
                    </button>
                  );
                })}
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
