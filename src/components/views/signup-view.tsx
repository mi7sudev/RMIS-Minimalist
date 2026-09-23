"use client";

// ============================================================================
// RMIS — Registration view (spec §3.4, §7.2): first/last name, email,
// password (≥6, show/hide) + confirmation, mandatory RA 10173 consent.
// Success → auto-login → session refresh → profile builder.
// Wave-3 "Ink & Ember" pass: same split-screen as sign-in — dark brand panel
// (ember glow, "M" watermark, glass trust rows) on lg+, compact dark strip
// below lg, upgraded form card. Every field, validation, and behavior is
// preserved exactly.
// ============================================================================

import { useState } from "react";
import type { FormEvent } from "react";
import { Activity, Eye, EyeOff, FileSpreadsheet, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { IconChip, Monogram } from "@/components/ui/shell";
import type { ChipTone } from "@/components/ui/shell";
import { useSession } from "@/components/session-provider";
import { apiFetch } from "@/lib/client";
import { navigate } from "@/lib/router";

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

export default function SignUpView() {
  const { refresh } = useSession();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  const validate = (): string | null => {
    if (!firstName.trim()) return "Enter your first name";
    if (!lastName.trim()) return "Enter your last name";
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim()))
      return "Enter a valid email address";
    if (password.length < 6) return "Password must be at least 6 characters";
    if (password !== confirmPassword) return "Passwords do not match";
    if (!consent) return "Please accept the data-privacy notice to continue";
    return null;
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/auth/register", {
        method: "POST",
        body: {
          email: email.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          password,
        },
      });
      // Auto-login immediately after registration (spec §3.4).
      try {
        await apiFetch("/api/auth/login", {
          method: "POST",
          body: { identifier: email.trim(), password },
        });
        toast.success("Welcome to RMIS");
        await refresh();
        navigate("profile");
      } catch {
        toast.success("Account created", {
          description: "Sign in with your new account to continue.",
        });
        navigate("signin");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed. Please try again.");
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
              <h2 className="text-center font-display text-3xl text-carbon">
                Create your account
              </h2>
            </div>
            <p className="mt-2 text-center text-sm text-stone lg:mt-0 lg:text-left">
              Register to apply for positions at DOST-MIRDC.
            </p>

            <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="firstName" className="mb-1.5 block text-sm font-medium text-ink">
                    First name *
                  </label>
                  <Input
                    id="firstName"
                    name="firstName"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="dlg-input min-h-[44px]"
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="mb-1.5 block text-sm font-medium text-ink">
                    Last name *
                  </label>
                  <Input
                    id="lastName"
                    name="lastName"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="dlg-input min-h-[44px]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink">
                  Email *
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="dlg-input min-h-[44px]"
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink">
                  Password * <span className="font-normal text-pebble">(minimum 6 characters)</span>
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="dlg-input min-h-[44px] pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-0.5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-stone hover:bg-fog hover:text-ink"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-ink">
                  Confirm password *
                </label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="dlg-input min-h-[44px]"
                />
              </div>

              {/* Mandatory data-privacy consent (RA 10173) */}
              <label className="flex cursor-pointer items-start gap-3 rounded-none bg-fog p-4 ring-1 ring-black/[0.04]">
                <Checkbox
                  checked={consent}
                  onCheckedChange={(v) => setConsent(v === true)}
                  className="mt-0.5"
                  aria-label="Data privacy consent"
                />
                <span className="text-xs leading-relaxed text-graphite">
                  I have read and accept the data-privacy notice in compliance with the Data Privacy
                  Act of 2012 (RA 10173)
                </span>
              </label>

              <button
                type="submit"
                disabled={busy}
                className="dlg-cta min-h-[44px] w-full text-sm disabled:opacity-50"
              >
                {busy ? "Creating account…" : "Create account"}
              </button>
            </form>
          </div>

          <div className="mt-5 flex justify-center">
            <button
              onClick={() => navigate("signin")}
              className="min-h-[44px] text-sm text-stone underline underline-offset-4 hover:text-ink"
            >
              Sign in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
