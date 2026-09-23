"use client";

// ============================================================================
// RMIS — shared presentation primitives for the premium enterprise pass.
// PageHeader, StatusPill, KpiCard, EmptyState, SectionCard, Monogram,
// SkeletonBlocks. Pure presentation: no fetching, no business logic.
// ============================================================================

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { pillClass, type StatusVariant } from "@/lib/status-ui";

// ── PageHeader ──────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between animate-in fade-in slide-in-from-bottom-2 duration-300",
        className
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-pebble">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-heading-md tracking-[-0.01em] truncate">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// ── StatusPill ──────────────────────────────────────────────────────────────

export function StatusPill({
  status,
  variant,
  className,
}: {
  /** Raw stored status spelling (normalized internally). */
  status?: string | null;
  /** Explicit variant overrides status mapping. */
  variant?: StatusVariant;
  className?: string;
}) {
  const v: StatusVariant = variant ?? "neutral";
  return (
    <span className={cn(pillClass(v), className)}>
      {status ?? ""}
    </span>
  );
}

// ── Monogram (gradient avatar tile) ─────────────────────────────────────────

export function Monogram({
  children,
  warm = false,
  className,
  size = 36,
}: {
  children: React.ReactNode;
  warm?: boolean;
  className?: string;
  size?: number;
}) {
  return (
    <span
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
      className={cn("monogram", warm && "monogram-warm", className)}
    >
      {children}
    </span>
  );
}

// ── Tinted icon chip ────────────────────────────────────────────────────────

export type ChipTone = "amber" | "emerald" | "rose" | "slate" | "ink" | "gold" | "plum";

export function IconChip({
  icon: Icon,
  tone = "slate",
  size = 40,
  iconSize,
  className,
}: {
  icon: LucideIcon;
  tone?: ChipTone;
  size?: number;
  iconSize?: number;
  className?: string;
}) {
  return (
    <span
      style={{ width: size, height: size }}
      className={cn("chip", `chip-${tone}`, className)}
      aria-hidden="true"
    >
      <Icon style={{ width: iconSize ?? Math.round(size * 0.46), height: iconSize ?? Math.round(size * 0.46) }} />
    </span>
  );
}

// ── KpiCard ─────────────────────────────────────────────────────────────────

const TONE_CHIP: Record<NonNullable<KpiCardProps["tone"]>, ChipTone> = {
  ok: "emerald",
  warn: "gold",
  bad: "rose",
  info: "plum",
  neutral: "slate",
};

export type KpiCardProps = {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: "ok" | "warn" | "bad" | "info" | "neutral";
  onClick?: () => void;
  ariaLabel?: string;
  className?: string;
  /** Optional decorative trailing element (sparkline, delta, etc.). */
  aside?: React.ReactNode;
};

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  onClick,
  ariaLabel,
  className,
  aside,
}: KpiCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="pt-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-stone">{label}</p>
        {Icon ? <IconChip icon={Icon} tone={TONE_CHIP[tone]} size={40} /> : null}
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="num text-[34px] font-semibold leading-none tracking-[-0.02em] text-ink">{value}</span>
          {hint ? <span className="text-xs font-medium text-pebble">{hint}</span> : null}
        </div>
        {aside}
      </div>
    </>
  );

  const base = cn(
    "dlg-card-plain border border-black/[0.07] bg-gradient-to-b from-white to-[#fdfdfc] p-6 shadow-e2",
    onClick &&
      "group focus-ring cursor-pointer lift hover:border-ink/15",
    className
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={ariaLabel ?? label} className={cn(base, "block w-full text-left")}>
        {body}
      </button>
    );
  }
  return <div className={base}>{body}</div>;
}

// ── EmptyState ──────────────────────────────────────────────────────────────

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  tone = "slate",
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
  tone?: ChipTone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 text-center",
        compact ? "min-h-[104px] py-6" : "min-h-[176px] py-10",
        className
      )}
    >
      <span
        className={cn(
          "chip mb-4",
          `chip-${tone}`,
          compact ? "h-10 w-10" : "h-14 w-14"
        )}
      >
        <Icon className={compact ? "h-4.5 w-4.5" : "h-6 w-6"} aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-[13px] leading-5 text-stone">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

// ── SectionCard ─────────────────────────────────────────────────────────────

const SECTION_CHIP_TONE: Record<string, ChipTone> = {};

export function SectionCard({
  title,
  description,
  actions,
  icon: Icon,
  chipTone,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  icon?: LucideIcon;
  chipTone?: ChipTone;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("dlg-card p-6", className)} aria-label={title}>
      {title || actions ? (
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {Icon ? (
              <IconChip
                icon={Icon}
                tone={chipTone ?? SECTION_CHIP_TONE[title ?? ""] ?? "slate"}
                size={36}
                iconSize={16}
              />
            ) : null}
            <div className="min-w-0">
              <h2 className="truncate text-[15px] font-semibold leading-6 text-ink">{title}</h2>
              {description ? <p className="truncate text-xs text-stone">{description}</p> : null}
            </div>
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

// ── Skeleton blocks ─────────────────────────────────────────────────────────

export function SkeletonKpis({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-4 lg:grid-cols-4", className)} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="dlg-card-plain border border-black/[0.07] p-6 shadow-e1">
          <div className="flex items-start justify-between">
            <div className="skel h-3 w-20" />
            <div className="skel h-10 w-10 rounded-xl" />
          </div>
          <div className="skel mt-4 h-8 w-16" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonRows({
  rows = 6,
  className,
  rowClassName = "h-14",
}: {
  rows?: number;
  className?: string;
  rowClassName?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={cn("skel w-full", rowClassName)} />
      ))}
    </div>
  );
}

export function SkeletonKanban({ columns = 5, className }: { columns?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5", className)} aria-hidden="true">
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="space-y-3">
          <div className="skel h-8 w-full" />
          <div className="skel h-28 w-full" />
        </div>
      ))}
    </div>
  );
}
