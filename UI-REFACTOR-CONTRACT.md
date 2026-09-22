# UI-REFACTOR-CONTRACT — RMIS Enterprise Polish Pass (read me first)

You are refactoring ONE PART of the RMIS front-end to enterprise-grade polish, benchmarked
against Greenhouse / Workday / Lever / Linear / Stripe / Intercom. The functional flow, API
contracts, state machine, and router are FROZEN. This is a pure presentation-layer pass.

## 0. HARD RULES (violations = rejected)

1. **Do NOT change**: `src/lib/router.ts`, `src/lib/*` (business logic), any `src/app/api/**`,
   `src/components/apply/apply-dialogs.tsx` (except pure className polish where instructed),
   `src/components/session-provider.tsx`, route names, hash URLs, view registry in `src/app/page.tsx`.
2. **Do NOT change copy that encodes contracts**: exact API error strings, status vocabulary
   (`Applied`, `Under Review`, `Shortlisted`, `Rejected`, `OPEN`, `CLOSED`), MQR verdicts
   (`Qualified`, `Partial`, `Not Qualified`), button semantics (what a button DOES may not change).
3. **Do NOT add new dependencies.** Use what exists: lucide-react, framer-motion (check
   package.json — if absent, use CSS transitions + `tw-animate-css` classes), recharts,
   shadcn/ui in `src/components/ui`, `clsx`/`tailwind-merge` via `cn()` from `@/lib/utils`.
4. **Design language stays "Dialog"**: fog `#f7f7f7` canvas, white `24px` cards, `28px` pill
   buttons, `0px` inputs, DM Sans-style display headings (`.font-display`, 32px+ only),
   Inter body, `#f69251` tangerine ONLY on primary CTA buttons. No other colored surfaces.
5. Status/functional colors are the ONE sanctioned addition (see §2). They appear ONLY in:
   status pills, status dots, timeline/checkpoints, chart series, focus rings, toast icons.
   Never as section backgrounds, borders on cards, icon colors for decoration, or text accents.
6. Every view must remain responsive (390px → 1440px) and keep the sticky footer intact.
7. `bun run lint` must pass for every file you touch. TypeScript strict — no `any`.

## 1. READ BEFORE CODING

- `src/app/globals.css` — design tokens & primitives (`.dlg-card`, `.dlg-cta`, `.dlg-ghost`,
  `.dlg-pill`, `.dlg-input`, `.font-display`, `.text-heading-*`, `.status-*`, `.skel`,
  `.focus-ring`, `.num`).
- `src/components/ui/shell.tsx` — NEW shared primitives: `PageHeader`, `KpiCard`,
  `EmptyState`, `StatusPill`, `SectionCard`, `Skeleton*`. USE THESE instead of hand-rolling.
- `src/lib/status-ui.ts` — NEW: canonical status→variant mapping + helpers.

## 2. FUNCTIONAL STATUS SYSTEM (the P0 fix)

Enterprise ATS = color-coded state. New tokens (already in globals.css):

| Token | Hex | Use |
|---|---|---|
| `--ok` | `#2e7d4f` | shortlisted, OPEN job, qualified, success toast |
| `--ok-bg` | `#e9f3ec` | pill bg |
| `--warn` | `#a16207` | under review, partial match, closing-soon |
| `--warn-bg` | `#faf3e0` | pill bg |
| `--bad` | `#b3556a` | rejected, not qualified, urgent deadline, destructive |
| `--bad-bg` | `#f9edf0` | pill bg |
| `--info` | `#484758` | applied / neutral-active stage |
| `--info-bg` | `#efeff1` | pill bg |

`<StatusPill status="Shortlisted" />` renders bg `--ok-bg`, text `--ok`, dot before label.
Dot = 6px circle, same color as text. Height 24px, `px-2.5`, text 12px/500, radius 100px.

Canonical mapping (in `src/lib/status-ui.ts`):
- Application stage: `Applied→info`, `Under Review→warn`, `Shortlisted→ok`, `Rejected→bad`,
  `REGRETTED/legacy variants` → normalize through the same file's function (it mirrors lib/status logic).
- Job: `OPEN→ok`, `CLOSED→neutral (fog bg, stone text)`.
- MQR verdict: `Qualified→ok`, `Partial→warn`, `Not Qualified→bad`.
- Profile completion: `Complete→ok`, `Partial→warn`, `Incomplete→neutral`.

## 3. SHARED PATTERNS (copy these exact structures)

### PageHeader
Every view opens with (replaces ad-hoc title blocks):
```tsx
<PageHeader
  title="Review Queue"            // .font-display .text-heading-md  (Title Case, always)
  description="…"                  // text-sm text-stone
  actions={<><Button ghost/><Button cta/></>} // right-aligned, wraps below on mobile
/>
```
Spacing: header block → content = `mt-6` (`gap-6`). Page container is provided by AppShell;
do NOT add your own max-width.

### KpiCard (for stats/needs-attention/analytics)
```tsx
<KpiCard label="Awaiting review" value={3} icon={ClipboardCheck} tone="warn"
         onClick={() => navigate("review-queue")} hint="2 new this week" />
```
Structure: white 24px card, p-6, row1 = label (12px stone, uppercase tracking) + icon in a
12px-radius `h-9 w-9` fog tile; row2 = 32px `.num` value + optional hint (12px pebble);
whole card is a `<button>` when onClick provided, hover: shadow-dialog-subtle + border-ink/10.
tone colors the icon tile text only (`--ok/--warn/--bad/--info`).

### EmptyState
```tsx
<EmptyState icon={Inbox} title="No applications yet" description="Applications appear here once candidates apply."
            action={<Button cta-sm>Open jobs</Button>} compact={false} />
```
Centered in its container, min-h 160px (compact: 96px), icon 24px pebble inside 48px fog
circle, title 14px/500 ink, description 13px stone, max-w-sm text-center.

### Table rows (recruitment / candidates / settings users)
- Row: `hover:bg-fog/60 transition-colors`; numeric cells `num` class (tabular-nums).
- Row quick actions: last cell, `opacity-0 group-hover/row:opacity-100 focus-within:opacity-100`
  (icon buttons 32px, fog tile). Always-visible on touch (`sm:` guard not needed—use also
  `max-lg:opacity-100`).
- Status column = StatusPill. Deadline >within 7 days and OPEN = `text-[--bad]` + Clock icon;
  else stone.

### Kanban (review queue)
- Column: header = dot (stage color) + label + count chip; body `max-h-[calc(100vh-320px)]
  min-h-[240px] overflow-y-auto scroll-thin space-y-3`.
- Card: white 12px radius card, p-4, hover shadow; name 14/500; job line 12px stone truncated;
  footer = StatusPill + MQR verdict pill; whole card clickable.
- Empty column body = EmptyState compact (no action).

### Skeletons
Every view that fetches: while `loading` show `PageHeader` (static) + skeleton layout of the
main surface using `<Skeleton className="h-… rounded-[12px]" />` from `@/components/ui/skeleton`
(row of KpiCards: 4× h-28; table: 6× h-14 rows; kanban: 5 columns h-64). Never render stale
data with a spinner; never flash empty-state before first load resolves.

### Motion
- View mount: `animate-in fade-in slide-in-from-bottom-2 duration-300` (tw-animate-css, already
  imported) on the view's root children — subtle, once.
- Hover lifts: `transition-shadow`, `hover:shadow-dialog-subtle` — do NOT scale cards.
- Dialogs already animate via shadcn — leave.

### Focus & a11y
- Add `.focus-ring` utility (already in globals.css) to custom buttons/rows if missing.
- Every icon-only button needs `aria-label`. KpiCard-as-button gets `aria-label` = label.
- Headings: one `h1` per view (PageHeader title), sections `h2`, cards `h3`/`h4`.

### Numbers & casing
- `.num` class on every value/date/currency/table cell (tabular-nums, tracking-tight).
- Currency: `₱22,316/mo` format preserved. Dates: `Oct 2, 2026`.
- Headings Title Case everywhere: "Command Center", "Review Queue", "Open Positions".

### Buttons
- Primary CTA: `.dlg-cta` pill, `h-10 px-5` desktop. One CTA per view header.
- Secondary: `.dlg-ghost`. Destructive: ghost with `text-[--bad] border-[--bad]/30`.
- Icon button: `h-9 w-9 grid place-items-center rounded-full hover:bg-fog text-stone hover:text-ink`.

## 4. PER-VIEW INSTRUCTIONS

### A) auth + public (signin, signup, public-landing)
- signin/signup: two-column split on lg (left: reassurance panel — 3 trust bullets with icons,
  demo-account hint card; right: form card). Keep demo chips + exact behaviors. Inputs dlg-input.
- public-landing: hero gets a **browser-frame product mockup** card per Dialog reference
  (three dots `#c97b84` `#f69251` `#8b8b8b`, 12px radius inner, white frame, inside a real
  mini-mockup of the positions board — pure divs, no images). Hero grid: copy left (lg:col-7),
  mockup right (lg:col-5), mockup hidden on <md. Keep live stats snapshot card & CTAs & how-to-apply.
- How-to-apply: keep 3 steps, add connector line between numbered dots on lg.

### B) applicant (applicant-home, profile-view + profile/*)
- applicant-home: left column = open positions (cards); right column = "Your Applications"
  with a **stage timeline** using status colors (done=--ok dot, current=--warn dot ring,
  future=fog dot) — reuse existing checkpoint logic, just restyle. Keep all behaviors
  (apply gate, fast-track, journey card, next-step hint).
- profile-view: replace left stepper with sticky in-card vertical steps (number chip → check
  chip when complete using --ok). Add autosave indicator near section header: "Saving… / Saved ✓"
  wired to the existing autosave state (add local state if the view tracks `saving` already).
  Keep all section components' logic; restyle their cards to SectionCard pattern.
- Keep "Save Changes" CTA behavior; it may move into each SectionCard header row.

### C) evaluator (review-queue, review-workspace, candidates, candidate-detail)
- review-queue: Kanban pattern above; toolbar = segmented control (Kanban/List) using
  shadcn Tabs or ToggleGroup styled as pill group; keep qualified-only toggle & refresh.
- review-workspace (the dossier modal): keep 2-pane layout; restyle right rail into:
  Requirements match (each row: requirement + StatusPill of verdict + evidence line) and
  Credentials chips; Decision rail unchanged functionally — restyle buttons (Shortlist CTA).
  Add subtle left-pane section icons. Keep every handler.
- candidates/candidate-detail: KpiCard row (clickable), table pattern with hover quick-view,
  completion StatusPill.

### D) admin (command-center, recruitment, job-workspace, analytics, settings)
- command-center: KpiCards row (4) + two-column main; "Needs attention" cards clickable;
  recent activity rows get actor avatar (initials tile) + StatusPill; overview card = dense
  definition list with `.num`.
- recruitment: filter bar collapses into one card row (search grows, selects w-40); table
  pattern; status pills; hover row actions (View / Edit). Keep create dialog.
- job-workspace: keep form; restyle into SectionCard groups with PageHeader + back link.
- analytics: restyle recharts — palette `#f69251` (primary series), `#242433`, `#c97b84`,
  `#8b8b8b`; grid `#ececec` dashed, axis ticks 11px pebble; bars `radius={[6,6,0,0]}` and
  max bar size 28; funnel rows get StatusPill tones + % bars using stage colors; charts in
  SectionCards with 16px headers. Keep drill-down behavior.
- settings: replace full-width pill tabs with a left vertical tab rail (icon + label, active =
  ink pill) inside a card, content right; users table pattern; audit rows = dense monospace-ish
  rows with `num` timestamps; keep all CRUD + panels.

## 5. SELF-CHECK BEFORE REPORTING

- `bun run lint` clean for your files; no TypeScript errors introduced.
- All original interactions still wired (click handlers, mutations, navigation).
- No orange outside CTA buttons. No status colors outside sanctioned uses.
- Responsive at 390px: no horizontal scroll, headers stack, tables scroll within card.
- Sticky footer intact (don't remove min-h-screen flex column structure).
