"use client";

// ============================================================================
// RMIS — Sign-in view (spec §3.3, §7.3): identifier (email or username) +
// password, demo account chips, welcome toast → session refresh → role home.
// ============================================================================

import { useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { useSession } from "@/components/session-provider";
import { apiFetch } from "@/lib/client";
import { navigate, ROLE_HOME } from "@/lib/router";

const DEMO_ACCOUNTS = ["testadmin", "testevaluator", "testapplicant"] as const;

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
    <div className="flex min-h-screen items-center justify-center bg-fog px-4 py-12">
      <div className="w-full max-w-md">
        <div className="dlg-card p-6 sm:p-8">
          {/* Logo */}
          <div className="flex justify-center">
            <span className="grid h-12 w-12 place-items-center rounded-[12px] bg-ink text-xl font-medium text-white">
              M
            </span>
          </div>

          <h1 className="mt-5 text-center font-display text-3xl text-carbon">Welcome back</h1>
          <p className="mt-2 text-center text-sm text-stone">
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
                  className="dlg-ghost min-h-[36px] px-4 text-xs"
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
  );
}
