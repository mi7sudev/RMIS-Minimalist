"use client";

// ============================================================================
// RMIS — shared kanban primitives (presentation only, no business logic).
// Reference design: light bordered column with an inline header
// (stage dot + sentence-case label + bare count), white cards with a pastel
// initial avatar, name, match-percentage badge, position / department /
// relative applied date meta rows with tiny icons, a hairline divider and
// credential tag chips.
// ============================================================================

import * as React from "react";
import { cn } from "@/lib/utils";
import type { StageKey } from "@/lib/status";

// ── Stage dots (kanban board palette) ───────────────────────────────────────

/** Tiny colored dot class per pipeline stage — also reused by stage filter tabs. */
export const STAGE_DOT_CLASS: Record<StageKey | "Neutral", string> = {
  "Applied": "bg-[#3d7ef0]",
  "Under Review": "bg-[#c47f17]",
  "Shortlisted": "bg-[#2e9e5b]",
  "Rejected": "bg-[#d0454f]",
  "Neutral": "bg-[#b9b9c0]",
};

export function StageDot({ stage, className }: { stage: StageKey | "Neutral"; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("h-2 w-2 shrink-0 rounded-full", STAGE_DOT_CLASS[stage], className)}
    />
  );
}

// ── Pastel initial avatar ───────────────────────────────────────────────────

const AVATAR_PALETTE: [bg: string, fg: string][] = [
  ["#fbe3ee", "#b04a79"], // pink
  ["#efe6fc", "#7b52c9"], // purple
  ["#e2ecfc", "#3d6fc4"], // blue
  ["#eef5d8", "#6d8422"], // lime
  ["#e0f2e6", "#3d8f5f"], // green
  ["#fcefd6", "#a9741c"], // amber
  ["#def0ee", "#2f8a80"], // teal
  ["#ececf1", "#5f6072"], // slate
];

function paletteFor(name: string): [string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** Flat pastel circle with deterministic per-name color (reference board style). */
export function KanbanAvatar({ name, size = 38 }: { name: string; size?: number }) {
  const [bg, fg] = paletteFor(name);
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, background: bg, color: fg, fontSize: Math.round(size * 0.34) }}
      className="grid shrink-0 place-items-center rounded-full font-semibold"
    >
      {initialsOf(name)}
    </span>
  );
}

// ── Match-percentage badge ──────────────────────────────────────────────────

/** 100% → green, partial → amber, 0% → red; hidden when nothing is required. */
export function MatchBadge({
  metCount,
  requiredCount,
  className,
}: {
  metCount: number;
  requiredCount: number;
  className?: string;
}) {
  if (!requiredCount || requiredCount <= 0) return null;
  const pct = Math.round((metCount / requiredCount) * 100);
  const tone =
    pct >= 100
      ? "bg-[#e5f3ea] text-[#2e7d4f]"
      : pct > 0
        ? "bg-[#faf0da] text-[#a16207]"
        : "bg-[#f9e7ec] text-[#b3556a]";
  return (
    <span
      className={cn(
        "num inline-flex shrink-0 items-center rounded-none px-2 py-[3px] text-[11px] font-semibold leading-none",
        tone,
        className
      )}
      aria-label={`Meets ${pct}% of the minimum requirements`}
    >
      {pct}%
    </span>
  );
}

// ── Credential tag chips ────────────────────────────────────────────────────

const MAX_TAGS = 3;

export function KanbanTags({ tags, className }: { tags: string[]; className?: string }) {
  const visible = tags.slice(0, MAX_TAGS);
  const extra = tags.length - visible.length;
  if (visible.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {visible.map((t, i) => (
        <span
          key={`${i}-${t}`}
          className="inline-flex max-w-full items-center rounded-md bg-[#f1f1f3] px-2 py-1 text-[11px] font-medium leading-none text-[#5c5c66]"
        >
          <span className="truncate">{t}</span>
        </span>
      ))}
      {extra > 0 && (
        <span className="num inline-flex items-center rounded-md bg-[#f1f1f3] px-2 py-1 text-[11px] font-medium leading-none text-pebble">
          +{extra}
        </span>
      )}
    </div>
  );
}

// ── Card shell ──────────────────────────────────────────────────────────────

/** White card: resting hairline elevation + hover lift (clickable surfaces). */
export const KANBAN_CARD =
  "rounded-none border border-black/[0.07] bg-white shadow-e1 lift duration-200 hover:border-ink/15";

/** Hairline divider above the credential tags. */
export const KANBAN_DIVIDER = "mt-3 border-t border-black/[0.06] pt-2.5";

// ── Column ──────────────────────────────────────────────────────────────────

/**
 * Board column: bordered light container with the header INSIDE
 * (dot + label + count), cards stacked below, body scrollable and stretched
 * so all columns share the tallest height (grid items-stretch).
 */
export function KanbanColumn({
  label,
  stage,
  count,
  children,
}: {
  label: string;
  /** Stage key drives the dot color; use "Neutral" for non-pipeline columns. */
  stage: StageKey | "Neutral";
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-[290px] min-w-[290px] shrink-0 snap-start flex-col lg:w-auto lg:min-w-0">
      <div className="flex min-h-[320px] flex-col rounded-none border border-black/[0.06] bg-white/60 p-3 lg:min-h-0 lg:flex-1">
        <div className="flex items-center justify-between gap-2 px-1.5 pb-3">
          <h2 className="flex min-w-0 items-center gap-2 text-[13.5px] font-semibold tracking-[-0.01em] text-ink">
            <StageDot stage={stage} />
            <span className="truncate">{label}</span>
          </h2>
          <span className="num shrink-0 text-[13px] text-stone" aria-label={`${count} in ${label}`}>
            {count}
          </span>
        </div>
        <div className="-mx-0.5 min-h-[180px] flex-1 space-y-3 overflow-y-auto px-0.5 scroll-thin">
          {children}
        </div>
      </div>
    </div>
  );
}
