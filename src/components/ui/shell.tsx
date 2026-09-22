"use client";

// ============================================================================
// RMIS — shared presentation primitives for the enterprise polish pass.
// PageHeader, StatusPill, KpiCard, EmptyState, SectionCard, SkeletonBlocks.
// Pure presentation: no fetching, no business logic. Compose per view.
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
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
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
        <h1 className="font-display text-heading-md truncate">{title}</h1>
        {description ? (
          <p className="mt-1.5 text-sm leading-5 text-stone">{description}</p>
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

// ── KpiCard ─────────────────────────────────────────────────────────────────

const TONE_TEXT: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  ok: "text-[var(--ok)]",
  warn: "text-[var(--warn)]",
  bad: "text-[var(--bad)]",
  info: "text-[var(--info)]",
  neutral: "text-stone",
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
}: KpiCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone">{label}</p>
        {Icon ? (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-fog">
            <Icon className={cn("h-[18px] w-[18px]", TONE_TEXT[tone])} aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="num text-[32px] font-medium leading-none text-ink">{value}</span>
        {hint ? <span className="text-xs text-pebble">{hint}</span> : null}
      </div>
    </>
  );

  const base = cn(
    "dlg-card-plain border border-border p-6 text-left transition-shadow duration-200",
    onClick && "focus-ring cursor-pointer hover:border-ink/10 hover:shadow-dialog-subtle",
    className
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={ariaLabel ?? label} className={cn(base, "block w-full")}>
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
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 text-center",
        compact ? "min-h-[96px] py-6" : "min-h-[160px] py-10",
        className
      )}
    >
      <span
        className={cn(
          "mb-3 grid place-items-center rounded-full bg-fog text-pebble",
          compact ? "h-9 w-9" : "h-12 w-12"
        )}
      >
        <Icon className={compact ? "h-4 w-4" : "h-5 w-5"} aria-hidden="true" />
      </span>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-[13px] leading-5 text-stone">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

// ── SectionCard ─────────────────────────────────────────────────────────────

export function SectionCard({
  title,
  description,
  actions,
  icon: Icon,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("dlg-card p-6", className)} aria-label={title}>
      {title || actions ? (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon ? (
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-fog">
                <Icon className="h-4 w-4 text-graphite" aria-hidden="true" />
              </span>
            ) : null}
            <div className="min-w-0">
              <h2 className="truncate text-[15px] font-medium leading-6 text-ink">{title}</h2>
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
        <div key={i} className="dlg-card-plain border border-border p-6">
          <div className="skel h-3 w-20" />
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
