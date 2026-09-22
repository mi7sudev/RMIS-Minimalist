"use client";

// ============================================================================
// RMIS — Registration view (spec §3.4, §7.2): first/last name, email,
// password (≥6, show/hide) + confirmation, mandatory RA 10173 consent.
// Success → auto-login → session refresh → profile builder.
// ============================================================================

import { useState } from "react";
import type { FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useSession } from "@/components/session-provider";
import { apiFetch } from "@/lib/client";
import { navigate } from "@/lib/router";

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
    <div className="flex min-h-screen items-center justify-center bg-fog px-4 py-12">
      <div className="w-full max-w-md">
        <div className="dlg-card p-6 sm:p-8">
          {/* Logo */}
          <div className="flex justify-center">
            <span className="grid h-12 w-12 place-items-center rounded-[12px] bg-ink text-xl font-medium text-white">
              M
            </span>
          </div>

          <h1 className="mt-5 text-center font-display text-3xl text-carbon">Create your account</h1>
          <p className="mt-2 text-center text-sm text-stone">
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
                  className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-stone hover:bg-fog hover:text-ink"
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
            <label className="flex cursor-pointer items-start gap-3 rounded-[12px] bg-fog p-4">
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
  );
}
