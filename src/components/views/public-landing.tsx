"use client";

// ============================================================================
// RMIS — Public landing (spec §7.1): hero + CTAs, live snapshot panel
// computed from GET /api/jobs, grid of the first 12 open positions, static
// 3-step "How to apply" explainer. 30s silent poll + refetch on focus.
// Wave-3 "Ink & Ember" pass: premium hero (gradient-ink display line, elevated
// browser-frame mockup with ember glow + floating glass chips), stats band
// with dividers, tinted-chip value band, numbered how-to cards with
// connectors, dark footer CTA panel. All data fetching, handlers, and copy
// are preserved exactly. Decorative layers are pointer-events-none.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Briefcase,
  Building2,
  CalendarClock,
  ClipboardList,
  FileUp,
  Inbox,
  ListChecks,
  ScrollText,
  Search,
  Send,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SiteHeader } from "@/components/shell/site-header";
import { Footer } from "@/components/shell/footer";
import { EmptyState, IconChip, Monogram } from "@/components/ui/shell";
import type { ChipTone } from "@/components/ui/shell";
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

// ── Float animation for hero accent chips (reduced-motion aware) ────────────

function FloatStyles() {
  return (
    <style>{`
      @media (prefers-reduced-motion: no-preference) {
        .rmis-float { animation: rmis-float 6s ease-in-out infinite; }
        .rmis-float-delay { animation: rmis-float 7.5s ease-in-out 2.2s infinite; }
      }
      @keyframes rmis-float {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-9px); }
      }
    `}</style>
  );
}

// ── Hero product mockup (pure decoration — static divs only) ────────────────

const MOCK_POSITIONS = [
  { title: "Supervising Science Research Specialist", meta: "₱63,970/mo · SG 22 · Metals Processing" },
  { title: "Engineer II", meta: "₱43,141/mo · SG 17 · Machining Division" },
  { title: "Science Research Specialist I", meta: "₱38,413/mo · SG 13 · R&D Division" },
] as const;

function HeroMockup() {
  return (
    <div className="relative" aria-hidden="true">
      {/* Soft ember glow behind the frame */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgba(246,146,81,0.18)] blur-3xl" />

      {/* Browser frame */}
      <div className="dlg-card-plain relative overflow-hidden rounded-3xl shadow-e4 ring-1 ring-black/5">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 border-b border-border bg-fog px-4 py-3">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#c97b84]" />
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#f69251]" />
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#8b8b8b]" />
          <span className="ml-2.5 min-w-0 flex-1 truncate bg-white px-3.5 py-1.5 text-[11px] leading-none text-stone">
            mirdc.gov.ph/careers
          </span>
        </div>

        {/* Mini positions board */}
        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-[15px] text-ink">Open Positions</p>
            <span className="dlg-pill bg-fog px-2.5 py-1 text-[10px] font-medium text-stone">
              3 open
            </span>
          </div>

          <div className="mt-4 space-y-2.5">
            {MOCK_POSITIONS.map((p) => (
              <div
                key={p.title}
                className="flex items-center gap-3 rounded-none border border-black/[0.05] bg-white p-3.5"
              >
                <Monogram size={34} className="text-[11px]">
                  M
                </Monogram>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-[13px] font-medium text-ink">{p.title}</p>
                    <span className="status-pill status-ok">Open</span>
                  </div>
                  <p className="num mt-1 text-[11px] text-stone">{p.meta}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Floating accent chips */}
      <div className="rmis-float absolute -left-6 top-10 z-10 flex items-center gap-2.5 rounded-2xl bg-white/85 py-2.5 pl-2.5 pr-4 shadow-e3 ring-1 ring-black/[0.06] backdrop-blur-md">
        <IconChip icon={BadgeCheck} tone="emerald" size={32} iconSize={16} />
        <span className="text-xs font-semibold text-ink">MQR Engine · Verified</span>
      </div>
      <div className="rmis-float-delay absolute -right-4 bottom-12 z-10 flex items-center gap-2.5 rounded-2xl bg-white/85 py-2.5 pl-2.5 pr-4 shadow-e3 ring-1 ring-black/[0.06] backdrop-blur-md">
        <IconChip icon={Activity} tone="amber" size={32} iconSize={16} />
        <span className="text-xs font-semibold text-ink">Real-time tracking</span>
      </div>
    </div>
  );
}

// ── Stats band cell ─────────────────────────────────────────────────────────

function Stat({
  icon,
  tone,
  label,
  value,
}: {
  icon: LucideIcon;
  tone: ChipTone;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 lg:px-7 lg:first:pl-0 lg:last:pr-0">
      <IconChip icon={icon} tone={tone} size={44} />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-pebble">
          {label}
        </p>
        <p className="num mt-1.5 text-[24px] font-semibold leading-[1.12] tracking-[-0.02em] text-ink sm:text-[28px] lg:text-[30px]">
          {value}
        </p>
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
    <article className="dlg-card lift flex flex-col p-6">
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

      <div className="mt-4 flex items-start gap-3.5">
        <span className="hidden shrink-0 sm:block">
          <Monogram size={44}>M</Monogram>
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-xl leading-snug text-carbon">{job.title}</h3>
          <p className="mt-1 text-xs text-pebble">
            {pos?.placeOfAssignment || "—"} ·{" "}
            {job.numberOfVacancy} vacanc{job.numberOfVacancy === 1 ? "y" : "ies"}
          </p>
        </div>
      </div>

      <p className="num mt-4 text-[16px] font-semibold text-ink">
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

const STEP_ICONS = [Search, ClipboardList, Send] as const;
const STEP_TONES: ReadonlyArray<ChipTone> = ["amber", "plum", "emerald"];

// ── Value band items (copy preserved) ───────────────────────────────────────

const VALUE_ITEMS: ReadonlyArray<{ icon: LucideIcon; tone: ChipTone; title: string; body: string }> = [
  {
    icon: ScrollText,
    tone: "amber",
    title: "CSC-standard position catalog",
    body: "Every posting follows Civil Service qualification standards, so you know exactly how you match before you apply.",
  },
  {
    icon: FileUp,
    tone: "emerald",
    title: "PDS auto-fill",
    body: "Upload your Personal Data Sheet (CS Form 212) once and your profile fills itself — no retyping.",
  },
  {
    icon: Activity,
    tone: "plum",
    title: "Track your application in real time",
    body: "Follow every stage of your application the moment it moves, from submission to the shortlist decision.",
  },
];

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
    <div className="flex min-h-screen flex-col">
      <FloatStyles />
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          {/* Local hero tint — mesh ambience still shows through */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(760px_440px_at_82%_10%,rgba(246,146,81,0.08),transparent_64%),radial-gradient(560px_400px_at_6%_0%,rgba(201,123,132,0.05),transparent_60%)]"
          />
          <div className="relative mx-auto w-full max-w-[1600px] px-4 pb-14 pt-20 sm:px-6 sm:pb-20 sm:pt-24 lg:px-8 lg:pt-28">
            <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-12 lg:gap-10">
              <div className="animate-in fade-in slide-in-from-bottom-2 text-center duration-300 lg:col-span-7 lg:text-left">
                <span className="dlg-pill inline-flex items-center gap-2 bg-white/85 py-1.5 pl-2 pr-4 text-xs font-medium text-graphite shadow-e1 ring-1 ring-black/[0.05] backdrop-blur">
                  <span className="chip chip-ink h-4.5 w-4.5" aria-hidden="true">
                    <Sparkles className="h-2.5 w-2.5" />
                  </span>
                  DOST-MIRDC · Careers
                </span>
                <h1 className="text-display-hero mx-auto mt-7 max-w-3xl lg:mx-0">
                  Build a career that{" "}
                  <span className="grad-ink">moves the nation forward.</span>
                </h1>
                <p className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-stone sm:text-[18px] lg:mx-0">
                  Explore open positions at the Metals Industry Research and Development Center and
                  submit your application online.
                </p>
                <div className="mt-9 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
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
          </div>
        </section>

        {/* Stats band — live snapshot */}
        <section className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8">
          <div className="dlg-card px-5 py-8 sm:px-7">
            {jobs === null && error === null ? (
              <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4 lg:gap-x-0 lg:gap-y-0 lg:divide-x lg:divide-black/[0.06]">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="lg:px-7 lg:first:pl-0 lg:last:pr-0">
                    <div className="skel h-3 w-20" />
                    <div className="skel mt-4 h-8 w-24" />
                  </div>
                ))}
              </div>
            ) : error !== null ? (
              <div className="rounded-none border border-dusty-rose/30 bg-dusty-rose/10 p-4">
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
                <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4 lg:gap-x-0 lg:gap-y-0 lg:divide-x lg:divide-black/[0.06]">
                  <Stat icon={Briefcase} tone="amber" label="Open positions" value={metrics.open} />
                  <Stat icon={Building2} tone="plum" label="Hiring divisions" value={metrics.divisions} />
                  <Stat icon={CalendarClock} tone="gold" label="Soonest deadline" value={metrics.soonest} />
                  <Stat icon={Banknote} tone="slate" label="Salary range" value={metrics.salary} />
                </div>
              </>
            )}
          </div>
        </section>

        {/* Positions grid */}
        <section
          id="positions-grid"
          className="mx-auto w-full max-w-[1600px] scroll-mt-28 px-4 pt-16 sm:px-6 sm:pt-20 lg:px-8"
        >
          <div className="mb-8 flex items-start gap-4 sm:gap-5">
            <IconChip icon={Briefcase} tone="amber" size={44} />
            <div className="max-w-2xl">
              <h2 className="text-heading-lg">Open Positions</h2>
              <p className="mt-3 text-sm leading-relaxed text-stone">
                The latest vacancies published by the Human Resources office. Applications are
                submitted online — the board refreshes automatically.
              </p>
            </div>
          </div>

          {gridJobs.length === 0 ? (
            <div className="dlg-card">
              <EmptyState
                icon={Inbox}
                title="No open positions right now"
                description="Check back soon or explore the full board for upcoming announcements."
              />
              <div className="pb-8 text-center">
                <button
                  onClick={() => navigate("jobs")}
                  className="inline-flex min-h-[44px] items-center gap-2 text-sm text-stone underline underline-offset-4 hover:text-ink"
                >
                  Go to the full positions board
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
              {gridJobs.map((job) => (
                <LandingJobCard key={job.id} job={job} />
              ))}
            </div>
          )}

          {gridJobs.length > 0 && (
            <div className="mt-7 text-center">
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

        {/* Value band — why apply here */}
        <section className="mx-auto w-full max-w-[1600px] px-4 pt-16 sm:px-6 sm:pt-20 lg:px-8">
          <div className="mb-8 flex items-start gap-4 sm:gap-5">
            <IconChip icon={Sparkles} tone="plum" size={44} />
            <div className="max-w-2xl">
              <h2 className="text-heading-lg">Why Apply With MIRDC</h2>
              <p className="mt-3 text-sm leading-relaxed text-stone">
                A government hiring process built to be transparent from posting to decision.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
            {VALUE_ITEMS.map((item) => (
              <div
                key={item.title}
                className="dlg-card-plain lift border border-black/[0.06] p-6 shadow-e2"
              >
                <IconChip icon={item.icon} tone={item.tone} size={44} />
                <h3 className="mt-5 text-[15px] font-semibold text-ink">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How to apply */}
        <section
          id="how-to-apply"
          className="mx-auto w-full max-w-[1600px] scroll-mt-28 px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
        >
          <div className="dlg-card p-6 sm:p-10">
            <div className="flex items-start gap-4 sm:gap-5">
              <IconChip icon={ListChecks} tone="slate" size={44} />
              <div className="max-w-2xl">
                <h2 className="text-heading-lg">How to Apply</h2>
                <p className="mt-3 text-sm leading-relaxed text-stone">
                  Three steps from browsing to a submitted application.
                </p>
              </div>
            </div>

            <div className="mt-9 grid grid-cols-1 gap-5 sm:grid-cols-3 lg:gap-6">
              {APPLY_STEPS.map((step, i) => (
                <div
                  key={step.title}
                  className="relative rounded-none border border-black/[0.06] bg-white p-5 shadow-e1"
                >
                  {/* Connector arrow between steps (lg+ only) */}
                  {i > 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute -right-7 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 place-items-center border border-black/[0.07] bg-white shadow-e1 lg:grid"
                    >
                      <ArrowRight className="h-3.5 w-3.5 text-stone" />
                    </span>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <IconChip icon={STEP_ICONS[i]} tone={STEP_TONES[i]} size={40} />
                    <span
                      className="chip chip-ink h-7 w-7 text-[13px] font-semibold"
                      style={{ borderRadius: "100px" }}
                      aria-hidden="true"
                    >
                      <span className="num">{i + 1}</span>
                    </span>
                  </div>
                  <p className="mt-4 font-semibold text-ink">{step.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-stone">{step.body}</p>
                </div>
              ))}
            </div>

            <div className="mt-9 flex flex-wrap gap-3">
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

        {/* Footer CTA band — sanctioned dark moment */}
        <section className="mx-auto w-full max-w-[1600px] px-4 pb-16 pt-2 sm:px-6 sm:pb-20 lg:px-8">
          <div className="relative overflow-hidden rounded-none bg-[linear-gradient(135deg,#1b1b28_0%,#14141d_100%)] px-6 py-12 shadow-e4 sm:px-12 sm:py-14">
            {/* Ember radials (decorative) */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-28 -top-32 h-[440px] w-[440px] rounded-full bg-[rgba(246,146,81,0.15)] blur-3xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-36 -right-20 h-[360px] w-[360px] rounded-full bg-[rgba(246,146,81,0.07)] blur-3xl"
            />
            <div className="relative z-10 flex flex-col items-start gap-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-xl">
                <h2 className="font-display text-[clamp(28px,3.2vw,42px)] leading-[1.15] tracking-[-0.01em] text-white">
                  Ready to build your career with us?
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-white/60">
                  Create your account, complete your profile once, and apply to any open position
                  in minutes.
                </p>
              </div>
              <button
                onClick={() => navigate("signup")}
                className="dlg-cta min-h-[44px] shrink-0 px-8 text-sm"
              >
                Create an account
              </button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
