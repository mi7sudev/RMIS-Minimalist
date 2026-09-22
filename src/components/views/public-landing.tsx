"use client";

// ============================================================================
// RMIS — Public landing (spec §7.1): hero + CTAs, live snapshot panel
// computed from GET /api/jobs, grid of the first 12 open positions, static
// 3-step "How to apply" explainer. 30s silent poll + refetch on focus.
// Presentation pass: hero gains a Dialog-style browser-frame product mockup
// (lg+), EmptyState for the empty board, connector line on the how-to steps.
// All data fetching, handlers, and copy are preserved exactly.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowRight, FileUp, Inbox, ScrollText } from "lucide-react";
import { SiteHeader } from "@/components/shell/site-header";
import { Footer } from "@/components/shell/footer";
import { EmptyState } from "@/components/ui/shell";
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

// ── Hero product mockup (pure decoration — static divs only) ────────────────

const MOCK_POSITIONS = [
  { title: "Supervising Science Research Specialist", meta: "₱63,970/mo · SG 22 · Metals Processing" },
  { title: "Engineer II", meta: "₱43,141/mo · SG 17 · Machining Division" },
  { title: "Science Research Specialist I", meta: "₱38,413/mo · SG 13 · R&D Division" },
] as const;

function HeroMockup() {
  return (
    <div className="dlg-card rotate-1 overflow-hidden" aria-hidden="true">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-fog px-4 py-3">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#c97b84]" />
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#f69251]" />
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#8b8b8b]" />
        <span className="ml-2.5 min-w-0 flex-1 truncate rounded-full bg-white px-3.5 py-1.5 text-[11px] leading-none text-stone">
          mirdc.gov.ph/careers
        </span>
      </div>

      {/* Mini positions board */}
      <div className="p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-[15px] text-ink">Open Positions</p>
          <span className="rounded-full bg-fog px-2.5 py-1 text-[10px] font-medium text-stone">
            3 open
          </span>
        </div>

        <div className="mt-4 space-y-2.5">
          {MOCK_POSITIONS.map((p) => (
            <div key={p.title} className="rounded-[12px] border border-border bg-white p-3.5">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-[13px] font-medium text-ink">{p.title}</p>
                <span className="status-pill status-ok">Open</span>
              </div>
              <p className="num mt-1.5 text-[11px] text-stone">{p.meta}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Position card ───────────────────────────────────────────────────────────

function LandingJobCard({ job }: { job: JobWire }) {
  const dl = deadlineState(job.deadlineDate);
  const pos = job.position;
  const salary = pos?.salaryAmount ?? null;
  return (
    <article className="dlg-card flex flex-col p-6 transition-shadow duration-200 hover:shadow-dialog-subtle">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`status-pill num ${
            dl.overdue ? "status-bad" : dl.closingSoon ? "status-warn" : "status-neutral"
          }`}
        >
          {dl.label}
        </span>
        <span className="dlg-pill bg-fog px-3 py-1 text-xs font-medium text-graphite">
          {divisionShort(pos?.division)}
        </span>
      </div>

      <div className="mt-3 flex items-start gap-3">
        <span
          aria-hidden="true"
          className="hidden h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-fog font-display text-base leading-none text-ink sm:grid"
        >
          M
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-xl leading-snug text-carbon">{job.title}</h3>
          <p className="mt-1 text-xs text-pebble">
            {pos?.placeOfAssignment || "—"} ·{" "}
            {job.numberOfVacancy} vacanc{job.numberOfVacancy === 1 ? "y" : "ies"}
          </p>
        </div>
      </div>

      <p className="num mt-3 text-[15px] font-medium text-ink">
        {salary != null ? formatCurrency(salary) : "Competitive"}
        {salary != null && <span className="font-normal text-stone">/mo</span>}
        {pos?.salaryGrade ? (
          <span className="ml-2 font-normal text-stone">SG {pos.salaryGrade}</span>
        ) : null}
      </p>

      <div className="mt-auto flex items-center justify-end gap-2 pt-4">
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

// ── How-to-apply steps (copy preserved) ─────────────────────────────────────

const APPLY_STEPS = [
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
] as const;

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
        <section className="mx-auto w-full max-w-[1200px] px-4 pb-12 pt-20 sm:px-6 sm:pb-16 sm:pt-24">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-10">
            <div className="animate-in fade-in slide-in-from-bottom-2 text-center duration-300 lg:col-span-7 lg:text-left">
              <span className="dlg-pill inline-flex items-center bg-white px-3.5 py-1.5 text-xs font-medium text-graphite shadow-dialog-subtle">
                DOST-MIRDC · Careers
              </span>
              <h1 className="text-display-hero mx-auto mt-6 max-w-4xl lg:mx-0">
                Build a career that moves the nation forward.
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-[18px] leading-relaxed text-stone lg:mx-0">
                Explore open positions at the Metals Industry Research and Development Center and
                submit your application online.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
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
            </div>

            <div className="hidden lg:col-span-5 lg:block">
              <HeroMockup />
            </div>
          </div>
        </section>

        {/* Live snapshot panel */}
        <section className="mx-auto w-full max-w-[1200px] px-4 sm:px-6">
          <div className="dlg-card p-6">
            {jobs === null && error === null ? (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="rounded-[12px] bg-fog p-4 sm:p-5">
                    <div className="skel h-3 w-20" />
                    <div className="skel mt-4 h-7 w-24" />
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
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-pebble">
                      Open positions
                    </p>
                    <p className="num mt-1 font-display text-2xl text-carbon sm:text-3xl">
                      {metrics.open}
                    </p>
                  </div>
                  <div className="rounded-[12px] bg-fog p-4 sm:p-5">
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-pebble">
                      Hiring divisions
                    </p>
                    <p className="num mt-1 font-display text-2xl text-carbon sm:text-3xl">
                      {metrics.divisions}
                    </p>
                  </div>
                  <div className="rounded-[12px] bg-fog p-4 sm:p-5">
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-pebble">
                      Soonest deadline
                    </p>
                    <p className="num mt-1 font-display text-2xl text-carbon sm:text-3xl">
                      {metrics.soonest}
                    </p>
                  </div>
                  <div className="rounded-[12px] bg-fog p-4 sm:p-5">
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-pebble">
                      Salary range
                    </p>
                    <p className="num mt-1 font-display text-2xl text-carbon sm:text-3xl">
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
          className="mx-auto w-full max-w-[1200px] scroll-mt-28 px-4 pt-12 sm:px-6 sm:pt-16"
        >
          <div className="mb-6 max-w-2xl">
            <h2 className="text-heading-lg">Open Positions</h2>
            <p className="mt-3 text-sm leading-relaxed text-stone">
              The latest vacancies published by the Human Resources office. Applications are
              submitted online — the board refreshes automatically.
            </p>
          </div>

          {gridJobs.length === 0 ? (
            <div className="dlg-card">
              <EmptyState
                icon={Inbox}
                title="No open positions right now"
                description="Check back soon or explore the full board for upcoming announcements."
              />
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

        {/* Value band — why apply here (Intercom-style quiet 3-up) */}
        <section className="mx-auto w-full max-w-[1200px] px-4 pt-12 sm:px-6 sm:pt-16">
          <div className="max-w-2xl">
            <h2 className="text-heading-lg">Why Apply With MIRDC</h2>
            <p className="mt-3 text-sm leading-relaxed text-stone">
              A government hiring process built to be transparent from posting to decision.
            </p>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              {
                icon: ScrollText,
                title: "CSC-standard position catalog",
                body: "Every posting follows Civil Service qualification standards, so you know exactly how you match before you apply.",
              },
              {
                icon: FileUp,
                title: "PDS auto-fill",
                body: "Upload your Personal Data Sheet (CS Form 212) once and your profile fills itself — no retyping.",
              },
              {
                icon: Activity,
                title: "Track your application in real time",
                body: "Follow every stage of your application the moment it moves, from submission to the shortlist decision.",
              },
            ].map((item) => (
              <div key={item.title} className="dlg-card p-6">
                <span className="grid h-9 w-9 place-items-center rounded-[12px] bg-fog">
                  <item.icon className="h-4 w-4 text-ink" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-[15px] font-medium text-ink">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-stone">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How to apply */}
        <section
          id="how-to-apply"
          className="mx-auto w-full max-w-[1200px] scroll-mt-28 px-4 py-12 sm:px-6 sm:py-16"
        >
          <div className="dlg-card p-6 sm:p-8">
            <h2 className="text-heading-lg">How to Apply</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-stone">
              Three steps from browsing to a submitted application.
            </p>

            <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-3 lg:mt-10 lg:gap-10">
              {APPLY_STEPS.map((step, i) => (
                <div key={step.title} className="relative flex gap-4 lg:flex-col">
                  {/* Connector line between numbered dots (lg+ only) */}
                  {i > 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute top-[18px] right-[calc(100%_-_18px)] hidden h-px w-[calc(100%_+_40px)] bg-[#ececec] lg:block"
                    />
                  )}
                  <span className="relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-sm font-medium text-white">
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
