"use client";

// ============================================================================
// RMIS — Public landing (spec §7.1): hero + CTAs, live snapshot panel
// computed from GET /api/jobs, grid of the first 12 open positions, static
// 3-step "How to apply" explainer. 30s silent poll + refetch on focus.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/shell/site-header";
import { Footer } from "@/components/shell/footer";
import { apiFetch, deadlineState, formatCurrency, formatDate } from "@/lib/client";
import { divisionName } from "@/lib/constants";
import { navigate } from "@/lib/router";
import type { JobWire } from "@/lib/router";

// ── Helpers ─────────────────────────────────────────────────────────────────

function divisionShort(code: string | null | undefined): string {
  if (!code) return "—";
  return divisionName(code).split(" — ")[0] || code;
}

function salaryRangeLabel(jobs: JobWire[]): string {
  const grades = jobs
    .map((j) => j.position?.salaryGrade)
    .filter((g): g is string => typeof g === "string" && g.trim() !== "")
    .map((g) => parseInt(g, 10))
    .filter((n) => !Number.isNaN(n));
  if (grades.length > 0) {
    const min = Math.min(...grades);
    const max = Math.max(...grades);
    return min === max ? `SG ${min}` : `SG ${min}–${max}`;
  }
  const amounts = jobs
    .map((j) => j.position?.salaryAmount)
    .filter((n): n is number => typeof n === "number");
  if (amounts.length > 0) {
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    return min === max ? formatCurrency(min) : `${formatCurrency(min)} – ${formatCurrency(max)}`;
  }
  return "—";
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Position card ───────────────────────────────────────────────────────────

function LandingJobCard({ job }: { job: JobWire }) {
  const dl = deadlineState(job.deadlineDate);
  const pos = job.position;
  const salary = pos?.salaryAmount ?? null;
  return (
    <article className="dlg-card flex flex-col p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={`dlg-pill px-3 py-1 text-xs font-medium ${
            dl.overdue
              ? "border border-dusty-rose/30 bg-dusty-rose/10 text-dusty-rose"
              : dl.closingSoon
                ? "bg-ink text-white"
                : "bg-fog text-graphite"
          }`}
        >
          {dl.label}
        </span>
        <span className="dlg-pill bg-fog px-3 py-1 text-xs font-medium text-graphite">
          {divisionShort(pos?.division)}
        </span>
      </div>

      <h3 className="mt-3 font-display text-xl text-carbon">{job.title}</h3>
      <p className="mt-1 text-sm text-stone">
        {salary != null ? `${formatCurrency(salary)}/mo` : "Competitive"}
      </p>

      <p className="mt-3 text-xs text-pebble">
        {pos?.placeOfAssignment || "—"} ·{" "}
        {job.numberOfVacancy} vacanc{job.numberOfVacancy === 1 ? "y" : "ies"}
      </p>

      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        {pos?.salaryGrade ? (
          <span className="dlg-pill bg-fog px-3 py-1 text-xs font-medium text-graphite">
            SG {pos.salaryGrade}
          </span>
        ) : (
          <span />
        )}
        <button
          onClick={() => navigate("jobs", { job: String(job.id) })}
          className="dlg-ghost min-h-[44px] px-5 text-sm"
        >
          View position
        </button>
      </div>
    </article>
  );
}

// ── View ────────────────────────────────────────────────────────────────────

export default function PublicLanding() {
  const [jobs, setJobs] = useState<JobWire[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastJson = useRef("");

  const load = useCallback(async (silent: boolean) => {
    try {
      const data = await apiFetch<JobWire[]>("/api/jobs?limit=200");
      const json = JSON.stringify(data);
      if (!silent || json !== lastJson.current) {
        lastJson.current = json;
        setJobs(data);
      }
      setError(null);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Failed to load positions");
    }
  }, []);

  // Mount + 30s silent poll + refetch on focus (spec §13 cadence).
  useEffect(() => {
    void load(false);
    const timer = setInterval(() => {
      if (!document.hidden) void load(true);
    }, 30_000);
    const onFocus = () => void load(true);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const openJobs = useMemo(
    () => (jobs ?? []).filter((j) => !deadlineState(j.deadlineDate).overdue),
    [jobs]
  );

  const metrics = useMemo(() => {
    const soonest = openJobs
      .map((j) => (j.deadlineDate ? new Date(j.deadlineDate).getTime() : Number.NaN))
      .filter((t) => !Number.isNaN(t))
      .sort((a, b) => a - b)[0];
    return {
      open: openJobs.length,
      divisions: new Set(openJobs.map((j) => j.position?.division).filter(Boolean)).size,
      soonest: soonest != null ? formatDate(new Date(soonest)) : "—",
      salary: salaryRangeLabel(openJobs),
    };
  }, [openJobs]);

  const gridJobs = openJobs.slice(0, 12);

  return (
    <div className="flex min-h-screen flex-col bg-fog">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto w-full max-w-[1200px] px-4 pb-12 pt-20 text-center sm:px-6 sm:pb-16 sm:pt-24">
          <span className="dlg-pill inline-flex items-center bg-white px-3.5 py-1.5 text-xs font-medium text-graphite">
            DOST-MIRDC · Careers
          </span>
          <h1 className="text-display-hero mx-auto mt-6 max-w-4xl">
            Build a career that moves the nation forward.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[18px] leading-relaxed text-stone">
            Explore open positions at the Metals Industry Research and Development Center and
            submit your application online.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => scrollToSection("positions-grid")}
              className="dlg-cta min-h-[44px] px-7 text-sm"
            >
              Browse open positions
            </button>
            <button
              onClick={() => scrollToSection("how-to-apply")}
              className="dlg-ghost min-h-[44px] px-7 text-sm"
            >
              How to apply
            </button>
          </div>
        </section>

        {/* Live snapshot panel */}
        <section className="mx-auto w-full max-w-[1200px] px-4 sm:px-6">
          <div className="dlg-card p-6">
            {jobs === null && error === null ? (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse rounded-[12px] bg-fog p-5">
                    <div className="h-3 w-20 rounded bg-white" />
                    <div className="mt-3 h-7 w-24 rounded bg-white" />
                  </div>
                ))}
              </div>
            ) : error !== null ? (
              <div className="rounded-[12px] border border-dusty-rose/30 bg-dusty-rose/10 p-4">
                <p className="text-sm text-ink">{error}</p>
                <button
                  onClick={() => void load(false)}
                  className="mt-2 text-sm text-stone underline underline-offset-4"
                >
                  Try again
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="rounded-[12px] bg-fog p-4 sm:p-5">
                    <p className="text-xs text-pebble">Open positions</p>
                    <p className="mt-1 font-display text-2xl text-carbon sm:text-3xl">
                      {metrics.open}
                    </p>
                  </div>
                  <div className="rounded-[12px] bg-fog p-4 sm:p-5">
                    <p className="text-xs text-pebble">Hiring divisions</p>
                    <p className="mt-1 font-display text-2xl text-carbon sm:text-3xl">
                      {metrics.divisions}
                    </p>
                  </div>
                  <div className="rounded-[12px] bg-fog p-4 sm:p-5">
                    <p className="text-xs text-pebble">Soonest deadline</p>
                    <p className="mt-1 font-display text-2xl text-carbon sm:text-3xl">
                      {metrics.soonest}
                    </p>
                  </div>
                  <div className="rounded-[12px] bg-fog p-4 sm:p-5">
                    <p className="text-xs text-pebble">Salary range</p>
                    <p className="mt-1 font-display text-2xl text-carbon sm:text-3xl">
                      {metrics.salary}
                    </p>
                  </div>
                </div>
                <div className="mt-4 text-center">
                  <button
                    onClick={() => navigate("jobs")}
                    className="text-sm text-stone underline underline-offset-4 hover:text-ink"
                  >
                    Browse all positions on the board
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Positions grid */}
        <section
          id="positions-grid"
          className="mx-auto w-full max-w-[1200px] scroll-mt-24 px-4 pt-12 sm:px-6 sm:pt-16"
        >
          <div className="mb-6 max-w-2xl">
            <h2 className="text-heading-lg">Open positions</h2>
            <p className="mt-3 text-sm leading-relaxed text-stone">
              The latest vacancies published by the Human Resources office. Applications are
              submitted online — the board refreshes automatically.
            </p>
          </div>

          {gridJobs.length === 0 ? (
            <div className="dlg-card p-10 text-center">
              <p className="font-display text-xl text-carbon">No open positions right now</p>
              <p className="mt-2 text-sm text-stone">
                Check back soon or explore the full board for upcoming announcements.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {gridJobs.map((job) => (
                <LandingJobCard key={job.id} job={job} />
              ))}
            </div>
          )}

          {gridJobs.length > 0 && (
            <div className="mt-6 text-center">
              <button
                onClick={() => navigate("jobs")}
                className="inline-flex min-h-[44px] items-center gap-2 text-sm text-stone underline underline-offset-4 hover:text-ink"
              >
                See all positions on the board
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </section>

        {/* How to apply */}
        <section
          id="how-to-apply"
          className="mx-auto w-full max-w-[1200px] scroll-mt-24 px-4 py-12 sm:px-6 sm:py-16"
        >
          <div className="dlg-card p-6 sm:p-8">
            <h2 className="text-heading-lg">How to apply</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-stone">
              Three steps from browsing to a submitted application.
            </p>

            <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-3">
              {[
                {
                  title: "Browse positions",
                  body: "Review the open positions on the board and find the role that fits your qualifications.",
                },
                {
                  title: "Prepare requirements",
                  body: "Have your Personal Data Sheet (CS Form 212) and eligibility records ready before you start.",
                },
                {
                  title: "Submit before deadline",
                  body: "Create an account, complete your profile, and submit your application before the closing date.",
                },
              ].map((step, i) => (
                <div key={step.title} className="flex gap-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-sm font-medium text-white">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium text-ink">{step.title}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-stone">{step.body}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                onClick={() => navigate("signup")}
                className="dlg-cta min-h-[44px] px-7 text-sm"
              >
                Create an account
              </button>
              <button
                onClick={() => navigate("signin")}
                className="dlg-ghost min-h-[44px] px-7 text-sm"
              >
                Sign in
              </button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
