# RMIS Light-Mode UI/UX — Complete Style Specification

**System:** RMIS v3.8 — DOST-MIRDC Recruitment Management & Information System
**Purpose:** hand this document to another agent/system and reproduce the EXACT light-mode look — every color, border, edge, card, container, modal, control, layout scaffold and motion rule. Nothing else is required.
**Source of truth:** `src/app/globals.css` + `src/components/ui/*` + `src/components/dash/kit.tsx` ("Atlas" design system).

> **Scope notes (deliberate exclusions)**
> - ❌ **System flow** — no routing, deep links, navigation logic, or data behavior. Visuals only.
> - ❌ **The header's smooth-scroll effect** — the public `SiteHeader` condenses on scroll (>40px: padding 1.5→0.5, logo shrink `h-10/sm:h-14` → `h-9/sm:h-11`, blur deepens). That scroll-reactive behavior is excluded. The header's *static* chrome is documented in §14.4.
> - ✅ Everything else: full palette, typography, radii, shadows, borders, cards, containers, modals, sheets, drawers, forms, tables, tabs, pills, charts, states, layout, motion.

---

## 1. Design Laws (read first)

1. **Blue is rationed.** `#1591DC` (RMIS electric blue) is the ONLY saturated interactive color: CTA fill, focus rings, active nav, progress fill, selected states, links on some surfaces. It never appears as passive decoration.
2. **Blue-tinted neutrals.** The whole neutral ladder (canvas → borders → washes) is cool gray with a blue cast. No warm beiges.
3. **Elevation = shadow + surface + hairline.** Light mode floats cards on a tinted canvas with soft blue-tinted two-layer shadows and 1px hairline borders. (Dark mode is zero-shadow; irrelevant here.)
4. **Never pure black text.** Primary ink is `#151515`; secondary `#1a1d23`; muted `#5c6470`. Surfaces are pure `#ffffff` on canvas `#f3f7fb`.
5. **Semantic colors are low-saturation.** Success/warning/danger/info are muted inks used mostly as 10% washes with dark ink text and 40–50% borders — never saturated fills (solid forms exist but are rare).
6. **Radius ladder is fixed.** 4px tags · 8px fields/menus · 14px cards/dialogs · 18–22px feature panels · 9999px pill CTAs. No in-between values.
7. **Motion is mechanical.** One CSS easing `cubic-bezier(0.72,0,0.12,1)`; Framer work uses `cubic-bezier(0.22,1,0.36,1)`. Durations 150–500ms. Reduced-motion gates all choreography.
8. **Parchment `#e9ebdf` is the "on-color" ink** for solid semantic fills (text sitting on success/warning/danger/info solids), inherited from the dark sibling — it is the system's single "bright".

---

## 2. Typography

### 2.1 Families

| Role | Family | CSS var | Usage |
|---|---|---|---|
| Display / headings / body / UI | **Inter** (variable) | `--font-sans` | Everything |
| Labels / eyebrows / badges / micro-UI | **Space Grotesk** | `--font-label` | `.kicker`, badges (`font-label`), nav micro-labels |

Load via Google Fonts (or `next/font`): Inter variable + Space Grotesk, `display: swap`, assigned to `--font-sans` / `--font-label`. Body applies `font-family: var(--font-sans), "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`.

### 2.2 Weight system

| Weight | Voice |
|---|---|
| 300 | Display tiers (`.display-hero`, `.display-xl`), stat numerals, standfirst |
| **380** | **Body + headings + buttons** (the spec body weight — set on `body` and `h1–h6` and `[data-slot="button"]`) |
| 400 | Kicker/label voice |
| 500 | Form labels, tab triggers, table medium |
| 570–600 | Card/dialog titles (`font-semibold`) |
| 700 | Dashboard page titles, card titles, KPI numerals (`font-bold`) |

```css
body   { font-weight: 380; font-feature-settings: "rlig" 1, "calt" 1, "tnum" 1; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
h1–h6  { font-weight: 380; letter-spacing: -0.01em; text-wrap: balance; }
```

### 2.3 Type scale (Tailwind v4 token ladder — metrics baked into tokens)

| Tier | Size | Line-height | Tracking | Voice |
|---|---|---|---|---|
| `text-xs` | 12 | 1.2 | +0.012em | caption |
| `text-sm` | 14 | 1.5 | +0.01em | body-sm |
| `text-base` | 16 | 1.5 | 0 | body |
| `text-lg` | 18 | 1.2 | −0.01em | subheading |
| `text-xl` | 20 | 1.2 | −0.01em | bridge |
| `text-2xl` | 24 | 1.2 | −0.01em | heading-sm |
| `text-3xl` | 36 | 1.05 | −0.01em | heading |
| `text-4xl` | 48 | 1.05 | −0.01em | heading-lg |
| `text-5xl` | 60 | 1 | −0.02em | — |
| `text-6xl` | 72 | 1 | −0.022em | display |
| `text-7xl` | 96 | 1 | −0.022em | — |

### 2.4 Typography utility classes (copy-paste)

```css
.display-hero { font-weight: 300; letter-spacing: -0.022em; line-height: 1;   font-size: clamp(2.75rem, 1.2rem + 7vw, 4.5rem); }
.display-xl   { font-weight: 300; letter-spacing: -0.02em;  line-height: 1.05; font-size: clamp(2rem, 1.1rem + 3.8vw, 3rem); }
.display-lg   { font-weight: 380; letter-spacing: -0.01em;  line-height: 1.05; font-size: clamp(1.625rem, 1.1rem + 2.2vw, 2.25rem); }
.heading-md   { font-weight: 380; letter-spacing: -0.01em;  line-height: 1.2;  font-size: clamp(1.5rem, 1.6667vw, 1.5rem); }
.standfirst   { font-weight: 300; line-height: 1.45; letter-spacing: 0; }
.stat-numeral { font-weight: 300; letter-spacing: -0.02em; line-height: 1; font-variant-numeric: tabular-nums; }
.kicker       { font-family: var(--font-label), ui-sans-serif, system-ui, sans-serif;
                font-size: 0.8125rem; font-weight: 400; letter-spacing: 0.013em; line-height: 1.2; }
.kicker-gold  { color: var(--gold); }   /* gold = #7a5518 in light */
```

### 2.5 The dashboard micro-label register (used EVERYWHERE — memorize this)

Eyebrows, table heads, cell labels, panel sub-labels:

```html
<!-- Eyebrow above page titles (with 3×12px vertical blue tick) -->
<p class="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
  <span aria-hidden class="h-3 w-1 rounded-full bg-primary"></span>
  Eyebrow text
</p>

<!-- Cell/field label -->
<div class="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Label</div>

<!-- Sidebar section label -->
<p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Section</p>
```

Numbers are always `tabular-nums`; big dashboard numerals: `font-bold tabular-nums tracking-[-0.03em] leading-none` at `text-4xl` / `text-[40px]` / `text-[26px]` / `text-2xl` depending on tier.

---

## 3. Color Tokens — Light Mode (`:root` block, copy-paste)

This is the complete light token sheet. Paste as `:root` (dark sheet NOT included — light is the target).

```css
:root {
  --radius: 8px;

  /* Brand — RMIS electric blue + muted teal link voice */
  --brand: #175247;
  --brand-light: #1d6b5d;
  --primary: #1591DC;             /* THE interactive blue */
  --primary-hover: #0E7ABF;       /* darkened primary — button hover */
  --primary-foreground: #ffffff;
  --royal-gold: #7a5518;

  /* Core surfaces — cool enterprise ladder on a blue-tinted canvas */
  --canvas: #f3f7fb;
  --ink: #151515;
  --surface: #ffffff;
  --surface-foreground: #151515;
  --gold: #7a5518;

  /* Decorative colour-block accents */
  --accent-1: #185849;   /* Forest Deep teal */
  --accent-2: #a8402f;   /* muted rust */
  --accent-3: #0e352c;   /* Midnight Moss */

  --background: #f3f7fb;          /* blue-tinted canvas */
  --foreground: #151515;
  --card: #ffffff;                /* pure-white surfaces */
  --card-foreground: #151515;
  --popover: #ffffff;
  --popover-foreground: #151515;

  --secondary: #eff4f9;           /* cool blue wash — hovers / inset rows */
  --secondary-foreground: #1a1d23;
  --muted: #ecf2f8;
  --muted-foreground: #5c6470;    /* cool gray secondary text */

  --accent: #eaf1f8;              /* ghost hover wash */
  --accent-foreground: #1a1d23;

  --destructive: #a8402f;

  --border: #e0e8f2;              /* blue-tinted hairline */
  --input: #cdd3dc;               /* field stroke */
  --input-hover: #98a1ae;
  --ring: #1591DC;                /* focus-visible = 2px blue outline */

  /* Semantic fills + parchment ink */
  --success: #3d6b4f;   --success-foreground: #e9ebdf;
  --warning: #9a6b1f;   --warning-foreground: #e9ebdf;
  --danger:  #a8402f;   --danger-foreground:  #e9ebdf;
  --info:    #185849;   --info-foreground:    #e9ebdf;

  /* Semantic ink for washes (text on 10% tints) */
  --danger-ink: #8f3a2b;
  --success-ink: #2f5a40;
  --warning-ink: #7a5518;
  --info-ink: #175247;

  --tablehead: #f0f5fa;           /* solid sticky table-header band */
  --scrollbar-thumb: #cdd3dc;

  /* Material aliases (light = fields read WHITE) */
  --void: #ffffff;                /* recessed field bed — white in light */
  --ember: #ffffff;               /* raised surface */
  --rim: #e4e8ee;                 /* card/panel hairline */
  --teal: #185849;
  --moss: #0e352c;

  /* Charts — deliberately NO blue */
  --chart-1: #2e6b5e;
  --chart-2: #b98a3e;
  --chart-3: #8b5e3c;
  --chart-4: #a8402f;
  --chart-5: #5d5e54;

  /* Sidebar */
  --sidebar: #f7fafd;
  --sidebar-foreground: #151515;
  --sidebar-primary: #1591DC;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #eaf1f8;
  --sidebar-accent-foreground: #151515;
  --sidebar-border: #e0e8f2;
  --sidebar-ring: #1591DC;

  /* Ambient wash + focus halo primitives */
  --pui-canvas: radial-gradient(900px 320px at 50% -120px,
    color-mix(in oklab, #1591DC 4%, transparent), transparent 65%);
  --pui-ring: 0 0 0 3px color-mix(in oklab, #1591DC 22%, transparent);
}
```

### 3.1 Neutral ladder (blue-tinted), sorted light→dark

| Token | Hex | Role |
|---|---|---|
| sidebar | `#f7fafd` | sidebar canvas |
| background/canvas | `#f3f7fb` | app canvas |
| tablehead | `#f0f5fa` | sticky table-head band |
| secondary | `#eff4f9` | hover/inset wash, segmented track |
| muted | `#ecf2f8` | skeleton/wash, neutral pill bg |
| accent | `#eaf1f8` | ghost hover wash |
| border | `#e0e8f2` | hairlines |
| rim | `#e4e8ee` | card/dialog hairlines |
| input | `#cdd3dc` | field strokes, scrollbar thumb |
| input-hover | `#98a1ae` | field hover stroke, scrollbar hover |
| muted-foreground | `#5c6470` | secondary text |
| secondary/accent-foreground | `#1a1d23` | — |
| foreground/ink | `#151515` | primary text |
| card/surface | `#ffffff` | raised surfaces |

### 3.2 Semantic system (3 forms per tone)

| Tone | Wash pill (bg / text / border) | Solid (bg / text) | Dot |
|---|---|---|---|
| neutral | `#ecf2f8` / `#5c6470` / `#cdd3dc` | `#eaf1f8` / `#1a1d23` | `#5c6470` |
| primary | `#1591DC 10%` / `#175247` / `#1591DC 40%` | `#1591DC` / `#ffffff` | `#1591DC` |
| success | `#3d6b4f 10%` / `#2f5a40` / `#3d6b4f 40%` | `#3d6b4f` / `#e9ebdf` | `#3d6b4f` |
| warning | `#9a6b1f 10%` / `#7a5518` / `#9a6b1f 40%` | `#9a6b1f` / `#e9ebdf` | `#9a6b1f` |
| danger | `#a8402f 10%` / `#8f3a2b` / `#a8402f 40%` | `#a8402f` / `#ffffff` | `#a8402f` |
| info | `#185849 10%` / `#175247` / `#185849 50%` | `#185849` / `#ffffff` | `#175247` |

Soft surface variant (icon chips, soft cards):

| Tone | Soft surface |
|---|---|
| neutral | `bg-secondary text-foreground/80 border-border` |
| primary | `bg-primary/5 border-primary/25 text-primary` |
| success | `bg-success/5 border-success/25 text-success` |
| warning | `bg-warning/5 border-warning/25 text-warning` |
| danger | `bg-destructive/5 border-destructive/25 text-destructive` |
| info | `bg-chart-2/10 border-chart-2/30 text-chart-2` (amber `#b98a3e`) |

---

## 4. Tailwind v4 Wiring (`@theme` blocks, copy-paste)

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));   /* keep — harmless, light-only target */

@theme inline {
  /* …map every --token above to --color-* utilities: */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-sans);
  --font-label: var(--font-label);
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  --color-card: var(--card);            --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);      --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);      --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);          --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);        --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-brand: var(--brand);          --color-brand-light: var(--brand-light);
  --color-gold: var(--gold);
  --color-ink: var(--ink);              --color-canvas: var(--canvas);
  --color-surface: var(--surface);      --color-surface-foreground: var(--surface-foreground);
  --color-void: var(--void);            --color-ember: var(--ember);
  --color-rim: var(--rim);              --color-teal: var(--teal);  --color-moss: var(--moss);
  --color-danger-ink: var(--danger-ink);
  --color-success-ink: var(--success-ink);
  --color-warning-ink: var(--warning-ink);
  --color-info-ink: var(--info-ink);
  --color-tablehead: var(--tablehead);
  --color-input-hover: var(--input-hover);
  --color-success: var(--success);      --color-success-foreground: var(--success-foreground);
  --color-warning: var(--warning);      --color-warning-foreground: var(--warning-foreground);
  --color-danger: var(--danger);        --color-danger-foreground: var(--danger-foreground);
  --color-info: var(--info);            --color-info-foreground: var(--info-foreground);
  --color-chart-1: var(--chart-1);      --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);      --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);      --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
}

@theme {
  /* Static material colours — same identity everywhere */
  --color-parchment: #e9ebdf;
  --color-obsidian: #151515;
  --color-copper: #8b867f;
  --color-fog: #cbccc4;
  --color-limestone: #b6b8af;
  --color-forest: #185849;
  --color-midnight: #0e352c;

  /* RADIUS LADDER — the fixed grammar */
  --radius-sm: 4px;      /* tags, badges, menu items */
  --radius-md: 8px;      /* fields, dropdown/select/command panels, icon chips */
  --radius-lg: 14px;     /* cards, dialogs, pui-card */
  --radius-xl: 18px;     /* feature tiles */
  --radius-2xl: 22px;    /* hero panels */
  --radius-3xl: 36px;    /* pill-large */
  /* (CTAs are hardcoded 9999px pills — see §7) */

  /* ELEVATION — two-layer cool-blue-tinted diffuse shadows (light only) */
  --shadow-2xs: 0 1px 2px rgb(21 47 73 / 0.04);
  --shadow-xs: 0 1px 2px rgb(21 47 73 / 0.05);
  --shadow-sm: 0 1px 2px rgb(21 47 73 / 0.06), 0 6px 16px -6px rgb(21 47 73 / 0.1);
  --shadow-md: 0 2px 4px rgb(21 47 73 / 0.05), 0 14px 36px -14px rgb(21 47 73 / 0.16);
  --shadow-lg: 0 4px 10px rgb(21 47 73 / 0.06), 0 28px 56px -20px rgb(21 47 73 / 0.2);
  --shadow-xl: 0 8px 16px rgb(21 47 73 / 0.08), 0 40px 80px -24px rgb(21 47 73 / 0.24);
  --shadow-2xl: 0 12px 24px rgb(21 47 73 / 0.1), 0 56px 96px -28px rgb(21 47 73 / 0.28);
  --inset-shadow-2xs: inset 0 1px 1px rgb(21 47 73 / 0.04);
  --inset-shadow-xs: inset 0 1px 2px rgb(21 47 73 / 0.05);
  --inset-shadow-sm: inset 0 2px 4px rgb(21 47 73 / 0.06);
  --drop-shadow-xs: drop-shadow(0 1px 2px rgb(21 47 73 / 0.08));
  --drop-shadow-sm: drop-shadow(0 2px 6px rgb(21 47 73 / 0.1));
  --drop-shadow-md: drop-shadow(0 6px 16px rgb(21 47 73 / 0.14));
  --drop-shadow-lg: drop-shadow(0 16px 32px rgb(21 47 73 / 0.18));

  /* Motion signature */
  --ease-deliberate: cubic-bezier(0.72, 0, 0.12, 1);

  /* TYPE SCALE with metrics baked in — see §2.3 table; wire each tier as:
     --text-xs: 0.75rem; --text-xs--line-height: 1.2; --text-xs--letter-spacing: 0.012em;
     … (xs 12 → 7xl 96, values per §2.3) */
}
```

**When to use which shadow:** `shadow-2xs/xs` = hairline lift (chips) · `shadow-sm` = resting cards/panels/kpi tiles · `shadow-md` = hover lift · `shadow-lg` = floating emphasis · `shadow-xs` on pills/chips/inputs · **no shadow on table bands, section dividers, page background**.

---

## 5. Global Base CSS (copy-paste)

```css
@layer base {
  * { @apply border-border; }

  html {
    -webkit-text-size-adjust: 100%;
    color-scheme: light;
    background-color: var(--background);
    /* THE CANVAS — a whisper of brand blue bleeding from the top edge */
    background-image: radial-gradient(
      1200px 560px at 50% -180px,
      color-mix(in oklab, #1591DC 4%, transparent),
      transparent 68%
    );
    background-attachment: fixed;
  }

  body {
    @apply bg-background text-foreground;
    overflow-x: clip;                    /* horizontal-overflow guard */
    font-weight: 380;
    font-feature-settings: "rlig" 1, "calt" 1, "tnum" 1;
    font-family: var(--font-sans), "Inter", -apple-system, BlinkMacSystemFont,
      "Segoe UI", Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }

  h1, h2, h3, h4, h5, h6 { font-weight: 380; letter-spacing: -0.01em; text-wrap: balance; }
  .tabular-nums { font-variant-numeric: tabular-nums; }

  ::selection { background-color: var(--primary); color: var(--primary-foreground); }

  :focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }

  /* Scrollbar — global */
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border: 2px solid var(--background);
  }
  ::-webkit-scrollbar-thumb:hover { background: var(--input-hover); }
}
```

**Slim scrollbars for inner scroll lists** (`.pui-scroll` — apply to any max-height list):

```css
.pui-scroll {
  scrollbar-width: thin;
  scrollbar-color: color-mix(in oklab, var(--muted-foreground) 30%, transparent) transparent;
}
.pui-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
.pui-scroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: color-mix(in oklab, var(--muted-foreground) 28%, transparent);
}
.pui-scroll::-webkit-scrollbar-track { background: transparent; }
```

Inline-scrollbar alternative used on rails (no class needed):

```html
[scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border
```

---

## 6. Global Component Surface Layer (copy-paste — THIS re-skins every primitive)

Unlayered rules (they outrank utility classes). This is the single most important block: it converts stock shadcn/ui components into the RMIS look. **Effective rendered values come from here**, not from the components' own utility classes.

```css
/* ---- Cards --------------------------------------------------------------- */
[data-slot="card"] {
  border-radius: var(--radius-lg);   /* 14px — overrides any rounded-none */
  border: 1px solid var(--rim);
  background: var(--card);
}

/* ---- Fields: inputs / selects / textareas → recessed WHITE beds ---------- */
[data-slot="input"],
[data-slot="textarea"],
[data-slot="select-trigger"] {
  border-radius: var(--radius-md);   /* 8px */
  background: var(--void);           /* #ffffff in light */
  border-color: var(--input);        /* #cdd3dc */
  transition: border-color 0.2s var(--ease-deliberate),
    box-shadow 0.2s var(--ease-deliberate);
}
[data-slot="input"]::placeholder,
[data-slot="textarea"]::placeholder {
  color: color-mix(in oklab, var(--muted-foreground) 70%, transparent);
}
[data-slot="input"]:hover,
[data-slot="textarea"]:hover,
[data-slot="select-trigger"]:hover { border-color: var(--input-hover); } /* #98a1ae */
[data-slot="input"]:focus-visible,
[data-slot="textarea"]:focus-visible,
[data-slot="select-trigger"]:focus-visible {
  border-color: color-mix(in oklab, var(--foreground) 55%, var(--input));
  box-shadow: var(--pui-ring);       /* 0 0 0 3px #1591DC @ 22% */
  outline: none;
}
[data-slot="input"][aria-invalid="true"],
[data-slot="textarea"][aria-invalid="true"] {
  border-color: var(--destructive);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--destructive) 16%, transparent);
}
[data-slot="select-trigger"] { height: 2.75rem; padding-inline: 0.875rem; }
/* Multiline fields → a whisper of teal */
[data-slot="textarea"] { background: color-mix(in oklab, var(--teal) 3%, var(--void)); }

/* ---- Buttons → pill grammar ---------------------------------------------- */
[data-slot="button"] {
  border-radius: 9999px;
  font-weight: 380;
  letter-spacing: 0.01em;
  transition: background-color 0.2s var(--ease-deliberate),
    border-color 0.2s var(--ease-deliberate), color 0.2s var(--ease-deliberate),
    opacity 0.2s var(--ease-deliberate);
}
[data-slot="button"]:not([data-variant="ghost"]):not([data-variant="link"]):active {
  transform: translateY(0.5px);
}
[data-slot="button"][data-variant="default"] {
  background: var(--primary); color: var(--primary-foreground);
  border: 1px solid var(--primary);
}
[data-slot="button"][data-variant="default"]:hover {
  background: var(--primary-hover); border-color: var(--primary-hover);
}
[data-slot="button"][data-variant="outline"] {
  background: transparent; border: 1px solid var(--rim); color: var(--foreground);
}
[data-slot="button"][data-variant="outline"]:hover {
  background: var(--accent); border-color: var(--input-hover);
}
[data-slot="button"][data-variant="secondary"] {
  background: var(--secondary); color: var(--secondary-foreground);
  border: 1px solid var(--rim);
}
[data-slot="button"][data-variant="secondary"]:hover { background: var(--accent); }
[data-slot="button"][data-variant="ghost"] { background: transparent; }
[data-slot="button"][data-variant="ghost"]:hover { background: var(--accent); }
[data-slot="button"][data-variant="destructive"] {
  background: var(--destructive); color: #e9ebdf; border: 1px solid var(--destructive);
}
[data-slot="button"][data-variant="destructive"]:hover {
  background: color-mix(in oklab, var(--destructive) 82%, #151515);
}
[data-slot="button"][data-variant="link"] { color: var(--brand); border-radius: 4px; }
[data-slot="button"][data-variant="link"]:hover { color: var(--brand-light); }

/* ---- Badges → 4px tags ---------------------------------------------------- */
[data-slot="badge"] { border-radius: 4px; }

/* ---- Progress → pill track with blue gradient fill ------------------------ */
[data-slot="progress"] {
  border-radius: 999px;
  background: var(--void);
  border: 1px solid color-mix(in oklab, var(--rim) 70%, transparent);
}
[data-slot="progress-indicator"] {
  border-radius: 999px;
  background: linear-gradient(90deg, var(--primary),
    color-mix(in oklab, var(--primary) 62%, var(--copper, #8b867f)));
}

/* ---- Dialogs / Sheets → floating white slabs ------------------------------ */
[data-slot="dialog-content"],
[data-slot="alert-dialog-content"] {
  border-radius: var(--radius-lg);   /* 14px */
  border: 1px solid var(--rim);
  background: var(--card);
}
[data-slot="dialog-overlay"],
[data-slot="alert-dialog-overlay"] {
  background: rgb(0 0 0 / 0.55);
  backdrop-filter: blur(3px);
}

/* ---- Drawer (mobile bottom sheet) ------------------------------------------ */
[data-slot="drawer-content"],
[data-slot="sheet-content"] { border-color: var(--rim); }
[data-slot="drawer-content"] { border-radius: var(--radius-lg) var(--radius-lg) 0 0; }

/* ---- Dropdown / Select / Popover / Command panels -------------------------- */
[data-slot="select-content"],
[data-slot="dropdown-menu-content"],
[data-slot="popover-content"],
[data-slot="hover-card-content"],
[data-slot="command"],
[data-slot="context-menu-content"],
[data-slot="menubar-content"] {
  border-radius: var(--radius-md);   /* 8px */
  border: 1px solid var(--rim);
  background: var(--popover);
  color: var(--popover-foreground);
}
[data-slot="select-item"],
[data-slot="dropdown-menu-item"],
[data-slot="command-item"] { border-radius: 4px; }
[data-slot="tooltip-content"] {
  border-radius: 4px;
  background: var(--surface);
  color: var(--surface-foreground);
  border: 1px solid var(--rim);
}

/* ---- Empty-state icon tile → teal-washed gradient -------------------------- */
[data-slot="empty-result-icon"] {
  border-radius: var(--radius-md);
  border: 1px solid color-mix(in oklab, var(--teal) 35%, transparent);
  background: linear-gradient(135deg,
    color-mix(in oklab, var(--teal) 16%, transparent),
    color-mix(in oklab, var(--teal) 5%, transparent));
  color: var(--info-ink);
}
```

> ⚠️ **Do NOT** apply the legacy `.premium` class in the replica — it is a dead compatibility shim (buttons would lose the pill grammar: 8px radius / weight 500). The pill + 14px card grammar above is the live look.

**pui primitives** (optional utility layer used on some surfaces):

```css
.pui-card   { border-radius: var(--radius-lg); border: 1px solid var(--rim); background: var(--card); }
.pui-card-interactive { transition: border-color .25s var(--ease-deliberate), background-color .25s var(--ease-deliberate); }
.pui-card-interactive:hover {
  border-color: color-mix(in oklab, var(--copper, #8b867f) 45%, var(--rim));
  background: color-mix(in oklab, var(--foreground) 3%, var(--card));
}
.pui-tile   { border-radius: var(--radius-md); }
.pui-chip   { border-radius: 9999px; border: 1px solid var(--rim); background: var(--surface); }
```

**Colour-block utilities** (flat decorative blocks):

```css
.block-surface { background: var(--surface); color: var(--surface-foreground); }
.block-ink     { background: #e9ebdf; color: #151515; }
.block-primary { background: var(--primary); color: var(--primary-foreground); }
.block-accent  { background: var(--teal); color: #e9ebdf; }
.block-red     { background: var(--accent-2); color: #e9ebdf; }
.block-deep    { background: var(--moss); color: #e9ebdf; }
.block-gold    { background: var(--gold); color: #151515; }
.link-arrow    { display: inline-flex; align-items: center; gap: .5rem; font-weight: 380; }
.link-arrow::after { content: ">"; font-weight: 400; transition: transform .2s var(--ease-deliberate); }
.link-arrow:hover::after { transform: translateX(3px); }
```

---

## 7. Buttons

Base (from `button.tsx`, pill-grammar effective via §6):

```html
inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full
text-sm leading-none transition-colors duration-200 outline-none
focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring
disabled:pointer-events-none disabled:opacity-40
[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0
```

| Variant | Fill | Border | Text | Hover |
|---|---|---|---|---|
| `default` | `#1591DC` | `#1591DC` | `#ffffff` | bg+border → `#0E7ABF`; active presses `translateY(0.5px)` |
| `outline` | transparent | `#e4e8ee` (rim) | `#151515` | bg → `#eaf1f8` (accent), border → `#98a1ae` |
| `secondary` | `#eff4f9` | rim | `#1a1d23` | bg → `#eaf1f8` |
| `ghost` | transparent | none | `#151515` | bg → `#eaf1f8` (no press translate) |
| `destructive` | `#a8402f` | `#a8402f` | `#e9ebdf` | bg → 82% rust mixed w/ `#151515` |
| `link` | none | none | `#175247` | → `#1d6b5d`, underline, **radius 4px** |

| Size | Height | Padding | Text |
|---|---|---|---|
| default | `h-10` (40px) | `px-5` | 14px |
| sm | `h-9` (36px) | `px-4`, gap-1.5 | 12px |
| lg | `h-12` (48px) | `px-7` | 16px |
| icon | `size-10` | — | — |

Recurring button idioms in views:
- Header action: `size="sm"` + `h-9 px-4 text-[13px] font-semibold` + icon.
- Quick-view round toggle: `size-10 rounded-full bg-primary text-primary-foreground hover:scale-105 hover:bg-primary-hover active:scale-95 transition-[transform,background-color] duration-200` with focus ring `ring-offset-2 ring-offset-card`.
- Ghost row actions (edit/delete): `h-9 rounded-md px-3 text-muted-foreground hover:bg-primary/10 hover:text-primary` (edit) / `hover:bg-destructive/10 hover:text-destructive` (delete).
- Icon-square CTA chip inline with a text link: `grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground group-hover/link:bg-primary-hover`.
- Custom hard CTA (header "Sign in"): `inline-flex h-10 items-center gap-1.5 rounded-full border border-primary bg-primary px-5 text-sm text-primary-foreground hover:bg-primary-hover hover:border-primary-hover active:opacity-60`.
- Saving state: `Loader2` icon with `animate-spin` inside the button.

---

## 8. Badges, Pills & Status Marks

### 8.1 Badge (4px tag register)

```html
inline-flex items-center justify-center rounded-[4px] border px-2 py-0.5
font-label text-[11px] font-normal tracking-[0.02em] w-fit whitespace-nowrap
shrink-0 [&>svg]:size-3 gap-1 transition-colors overflow-hidden
```

| Variant | Recipe |
|---|---|
| default | `bg-primary text-primary-foreground border-transparent` (hover `bg-primary-hover`) |
| secondary | `border-rim bg-secondary text-secondary-foreground` (hover `bg-accent`) |
| gold | `bg-gold text-[#151515]` (`#7a5518` fill) |
| success | `bg-success/15 text-success-ink border-transparent` (hover 25%) |
| warning | `bg-warning/15 text-warning-ink border-transparent` |
| destructive | `border-destructive/40 bg-destructive/10 text-danger-ink` |
| outline | `border-input text-foreground` |

### 8.2 Pill (round status chip — the primary status register)

```html
<!-- kit Pill -->
<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold
             {TONE_CLASSES[tone].pill}">…</span>
```
Tone recipes = §3.2 wash column. With icon: `<CheckCircle2 class="size-3" strokeWidth={2} />`.

### 8.3 StatusTag (status label with tag icon — never colour-only)

```html
<span class="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border
             font-medium tracking-[0.01em] {tone pill classes}
             px-2 py-1 text-xs">   <!-- sm: px-2 py-0.5 text-[11px] -->
  <Tag class="size-3.5" strokeWidth={2.25} /> <span class="truncate">{label}</span>
</span>
```

### 8.4 Dot / MiniPipeline

```html
<span class="inline-block size-2 shrink-0 rounded-full {tone dot}" />
<!-- pipeline mini: dots joined by h-px w-3 bg-border, inactive dots bg-muted-foreground/25 -->
```

### 8.5 Score & Trend chips

```html
<!-- ScoreChip: Pill with tabular-nums, tone = success ≥80 / warning ≥50 / neutral 0 -->
<!-- TrendChip up:   inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums bg-success/10 text-success + up-arrow svg size-3 -->
<!-- TrendChip down: bg-destructive/10 text-destructive (svg rotate-180) -->
<!-- TrendChip flat: bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground, "— steady" -->
```

### 8.6 AI provenance chips

```html
<!-- DocChip (field label) / "AI filled" (card) -->
<span class="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10
             px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-primary">
  <Sparkles class="size-2.5" /> AI
</span>
<!-- Name-lockup variant: border-primary/20 bg-primary/5 px-2 py-1 text-[11px] text-primary -->
```

### 8.7 Count badge on tabs

```html
<span class="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full
             bg-secondary px-1 text-[10px] font-semibold tabular-nums text-muted-foreground">7</span>
```

---

## 9. Cards & Containers

### 9.1 shadcn Card (base register — 14px)

```
Card:        bg-card text-card-foreground flex flex-col gap-6 rounded-none border py-6
             → effective via §6: 14px radius, rim border, white bg
CardHeader:  grid auto-rows-min gap-1.5 px-6 …
CardTitle:   leading-tight font-semibold tracking-[-0.01em]
CardDescription: text-muted-foreground text-sm leading-relaxed
CardContent: px-6
CardFooter:  flex items-center px-6
```

### 9.2 Atlas Panel — the workhorse surface (20px)

```html
<section class="rounded-[20px] border border-border/70 bg-card shadow-sm p-5 sm:p-6">
  <!-- PanelHead -->
  <div class="mb-5 flex items-start justify-between gap-3">
    <div class="min-w-0">
      <h2 class="text-base font-bold tracking-[-0.01em] text-foreground">Title</h2>
      <p class="mt-0.5 text-xs text-muted-foreground">Sub</p>
    </div>
    <div class="flex shrink-0 items-center gap-2">…actions…</div>
  </div>
</section>
```
`flush` prop drops the padding (tables sit flush inside).

### 9.3 Tile / KpiTile — stat cards (18px)

```html
<div class="group relative w-full overflow-hidden rounded-[18px] border border-border/70 bg-card
            p-5 text-left shadow-sm transition duration-200
            hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
  <div class="flex items-center gap-3">
    <span class="grid size-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset ring-black/[0.04] {toneSoft}">
      <Icon class="size-[18px]" />
    </span>
    <span class="min-w-0 truncate text-xs font-semibold text-muted-foreground">Label</span>
  </div>
  <p class="mt-3 text-4xl font-bold tabular-nums leading-none tracking-[-0.03em] text-foreground">12</p>
  <p class="mt-1.5 line-clamp-1 text-xs text-muted-foreground">sub</p>
</div>
```
KPI variant: value `text-[40px]`, label below, optional TrendChip top-right, optional 40px sparkline at bottom (`mt-3 -mb-1`).

### 9.4 HeroBand — gradient welcome zone (22px)

```html
<section class="relative overflow-hidden rounded-[22px] border border-primary/15 bg-card p-6 shadow-sm sm:p-7">
  <span aria-hidden class="pointer-events-none absolute inset-0" style="background:
    radial-gradient(720px 240px at 8% -60%, rgb(21 145 220 / 0.14), transparent 70%),
    radial-gradient(560px 220px at 96% 120%, rgb(21 145 220 / 0.08), transparent 70%);" />
  <div class="relative flex flex-wrap items-end justify-between gap-4">
    <div class="min-w-0">
      <p class="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
        <span aria-hidden class="h-3 w-1 rounded-full bg-primary"></span> Eyebrow
      </p>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 class="text-[30px] font-bold leading-[1.08] tracking-[-0.03em] text-foreground sm:text-[38px]">Title</h1>
        <!-- optional Pill chip -->
      </div>
      <p class="mt-2 max-w-2xl text-sm text-muted-foreground">Sub</p>
    </div>
    <div class="flex shrink-0 items-center gap-2">…actions…</div>
  </div>
  <div class="relative mt-5">…children…</div>
</section>
```
Lite variant (profile header): `p-5 sm:p-6`.

Glass banner riding inside the hero:

```html
<div class="flex flex-col items-start gap-4 rounded-2xl bg-gradient-to-r from-primary/[0.08] to-transparent
            p-4 ring-1 ring-inset ring-primary/15 sm:flex-row sm:items-center sm:justify-between">
  <div class="flex items-start gap-3">
    <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary
                 ring-1 ring-inset ring-primary/15"><Info class="size-[18px]" /></span>
    <div>
      <p class="text-sm font-semibold tracking-[-0.01em] text-foreground">Title</p>
      <p class="mt-1 text-sm leading-relaxed text-muted-foreground">Body</p>
    </div>
  </div>
  <Button class="shrink-0">CTA <ArrowRight class="size-4" /></Button>
</div>
```

### 9.5 DarkPanel — the single deep-navy accent per screen

```html
<section class="relative overflow-hidden rounded-[20px] bg-[#0c2236] p-5 text-white shadow-md sm:p-6">
  <span aria-hidden class="pointer-events-none absolute inset-0" style="background:
    radial-gradient(480px 200px at 90% -40%, rgb(21 145 220 / 0.35), transparent 70%),
    radial-gradient(320px 160px at 0% 110%, rgb(21 145 220 / 0.18), transparent 70%);" />
  <div class="relative">…</div>
</section>
```

### 9.6 DaysCard — emphasized mini metric

```html
<div class="flex shrink-0 flex-col items-center justify-center rounded-[18px]
            bg-gradient-to-b from-primary/[0.08] to-primary/[0.03] px-5 py-4 text-center
            ring-1 ring-inset ring-primary/15">
  <p class="text-[26px] font-bold leading-none tabular-nums tracking-[-0.02em] text-primary">8</p>
  <p class="mt-1.5 text-[11px] font-semibold leading-tight text-muted-foreground">Days</p>
</div>
```

### 9.7 EntityCard — list-item card (education/work/training…)

```html
<div class="rounded-2xl border border-border bg-card p-4 shadow-xs transition duration-150
            hover:border-primary/30 sm:p-5
            {fromExtraction && 'border-primary/45 ring-1 ring-inset ring-primary/15'}">
  <div class="flex items-start gap-3">
    <div class="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground">
      <Icon class="size-4" strokeWidth={1.5} />
    </div>
    <div class="min-w-0 flex-1">
      <h3 class="text-[15px] font-semibold leading-snug tracking-[-0.01em] text-foreground">Title</h3>
      <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">subtitle</p>
    </div>
  </div>
  <dl class="mt-3 grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
    <div class="flex min-w-0 flex-col gap-0.5">
      <dt class="text-[11px] font-medium uppercase tracking-[0.07em] text-muted-foreground/80">Label</dt>
      <dd class="whitespace-pre-line break-words text-sm font-medium leading-snug text-foreground">Value</dd>
    </div>
  </dl>
  <div class="mt-3.5 flex items-center justify-end gap-1.5 border-t border-border/60 pt-3">
    <!-- ghost Edit / Delete buttons per §7 -->
  </div>
</div>
```

### 9.8 Posting detail cells

```html
<!-- SummaryCell -->
<div class="rounded-xl border border-border bg-secondary/40 p-3.5 sm:p-4">
  <div class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
    {icon}<span>Label</span>
  </div>
  <div class="mt-1.5 break-all text-sm font-semibold tracking-[-0.01em] text-foreground">Value</div>
</div>

<!-- DateCell (urgent flips to warning) -->
<div class="flex items-center gap-2.5 rounded-xl border p-3.5 sm:p-4
            {urgent ? 'border-warning/40 bg-warning/10' : 'border-border bg-secondary/40'}">
  <span class={urgent ? 'text-warning' : 'text-muted-foreground'}>{icon}</span>
  <div>
    <div class="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Label</div>
    <div class="text-sm font-semibold tracking-[-0.01em] {urgent ? 'text-warning' : 'text-foreground'}">Value</div>
  </div>
</div>

<!-- DetailSection (document block) -->
<div class="mt-6 rounded-2xl border border-border bg-card p-5 shadow-xs sm:mt-8 sm:p-6">
  <h3 class="flex items-center gap-2.5 text-base font-semibold tracking-[-0.01em] text-foreground">
    <span class="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-secondary text-primary">{icon}</span>
    Title
  </h3>
  <div class="mt-4">…body…</div>
</div>
```

### 9.9 Informational banners (quiet — never alerts)

```html
<!-- Blue info note -->
<div class="flex items-start gap-3 rounded-xl border border-primary/15 bg-primary/5 px-3.5 py-2.5 sm:px-4 sm:py-3">
  <span aria-hidden class="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-primary">
    <Info class="size-2.5 text-primary-foreground" strokeWidth={3} />
  </span>
  <p class="text-[12.5px] leading-relaxed text-foreground/85 sm:text-[13.5px]">Message…</p>
</div>

<!-- Extraction note (sparkles, stronger border) -->
<div class="flex items-start gap-2.5 rounded-xl border border-primary/25 bg-primary/5 px-3.5 py-2.5
            text-xs leading-relaxed text-primary">
  <Sparkles class="mt-0.5 size-4 shrink-0" /> <span>…</span>
</div>

<!-- Error row block (inline fetch failure) -->
<div class="flex items-center gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3.5">
  <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive">
    <AlertTriangle class="size-4" />
  </span>
  <div class="min-w-0 flex-1">
    <p class="text-sm font-semibold text-destructive">Something went wrong</p>
    <p class="mt-0.5 text-xs text-destructive/80">{message}</p>
  </div>
  <Button variant="outline" size="sm">Try again</Button>
</div>
```

### 9.10 Segmented control + count

```html
<div class="inline-flex items-center gap-0.5 rounded-lg bg-secondary p-0.5" role="tablist">
  <button class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium
                 transition-colors focus-visible:ring-2 focus-visible:ring-ring
                 {active ? 'bg-card shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'}">…</button>
</div>
```

### 9.11 Underline ViewTabs (dashboard register)

```html
<div class="flex items-center gap-4 border-b border-border" role="tablist">
  <button class="-mb-px inline-flex items-center gap-1.5 border-b-2 py-2.5 text-sm font-medium transition-colors
                 {active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}">
    Label <count badge per §8.7>
  </button>
</div>
```

---

## 10. Modals & Overlays

### 10.1 Dialog / AlertDialog (centered floating slab)

- **Overlay:** `fixed inset-0 z-50` · light: `rgb(0 0 0 / 0.55)` + `backdrop-filter: blur(3px)` · fade in/out.
- **Content:** centered (`top-[50%] left-[50%] -translate-x/y-1/2`) · `z-50` · `w-full max-w-[calc(100%-2rem)] sm:max-w-lg` · `flex flex-col gap-4 p-6` · **`max-h-[calc(100vh-2rem)] overflow-hidden`** (tall forms scroll internally, footer stays visible) · 14px radius + rim border + white bg (§6) · open/close: `fade + zoom-95`, `duration-500 ease-deliberate`.
- **Close button:** `absolute top-4 right-4 grid size-8 place-items-center opacity-70 hover:opacity-100` (X icon `size-4`).
- **Header:** `flex flex-col gap-2 text-center sm:text-left`; **Title:** `text-lg leading-tight font-semibold tracking-[-0.01em]`; **Description:** `text-muted-foreground text-sm`.
- **Footer:** `flex flex-col-reverse gap-2 sm:flex-row sm:justify-end` (Cancel = outline variant, Action = default variant).
- AlertDialogAction override for destructive confirms: `className="bg-destructive text-white hover:bg-destructive/85"`.

### 10.2 ResponsiveFormDialog — THE form modal pattern

One form surface, two idioms (breakpoint `min-width: 768px`):

**Desktop (≥ md):**
```html
<DialogContent class="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]">
  <DialogHeader class="shrink-0 border-b border-border/70 px-6 py-4 text-left"> Title + desc </DialogHeader>
  <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5"> …fields… </div>
  <DialogFooter class="shrink-0 border-t border-border/70 bg-secondary/40 px-6 py-4">
    <!-- optional ErrorDigest (mb-2 w-full) -->
    <div class="flex w-full flex-col gap-2.5 sm:flex-row sm:items-center">
      <div class="min-w-0 flex-1"><PrivacyNote /></div>
      <div class="flex shrink-0 items-center justify-end gap-2.5">
        <Button variant="outline">Cancel</Button> <Button>Submit</Button>
      </div>
    </div>
  </DialogFooter>
</DialogContent>
```

**Mobile (< md): vaul bottom sheet** (drag-to-dismiss):
```html
<DrawerContent class="flex h-auto max-h-[92dvh]! flex-col p-0">
  <DrawerHeader class="shrink-0 border-b border-border/70 px-5 pb-4 pt-1 text-left">…</DrawerHeader>
  <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">…fields…</div>
  <DrawerFooter class="shrink-0 border-t border-border/70 bg-secondary/40
                       px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
    <PrivacyNote />
    <div class="flex items-center gap-2.5">
      <Button variant="outline" class="flex-1">Cancel</Button>
      <Button class="flex-1">Submit</Button>
    </div>
  </DrawerFooter>
</DrawerContent>
```

- **Unsaved-changes guard:** while `dirty`, every user-initiated close (overlay, Esc, drag, Cancel) opens an AlertDialog: "Discard unsaved changes?" — `Cancel → "Keep editing"`, destructive `AlertDialogAction → "Discard changes"`.
- **ErrorDigest** (validation list): `rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5` + `text-xs font-semibold text-destructive` header with `CircleAlert size-3.5` + `list-disc` items `text-xs text-destructive`.
- **PrivacyNote:** `inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground` + `Lock size-3` + "Your details stay private and secure."

### 10.3 Sheet (side panel)

Right sheet: `inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm` · `bg-popover` · slides in/out 300/500ms · same overlay as dialog · close `absolute top-4 right-4 size-10 opacity-70 hover:opacity-100`. Header `flex flex-col gap-1.5 p-4`; Footer `mt-auto flex flex-col gap-2 p-4`; Title `font-semibold`; Description `text-muted-foreground text-sm`. Mobile nav drawer uses: `w-72 bg-card p-0`.

### 10.4 Drawer (vaul bottom sheet)

`bg-background` · bottom: `mt-24 max-h-[80vh] border-t` · effective top radius 14px (§6) · drag handle: `mx-auto mt-4 h-2 w-[100px] shrink-0 rounded-lg bg-muted` (visible on bottom sheets) · overlay `bg-black/50 backdrop-blur-[2px]`.

### 10.5 Popover family (dropdown / select / command / hover-card / context-menu)

All panels: 8px radius + rim border + white popover bg (§6) · `p-1` · item `rounded-[4px] px-2 py-2 text-sm focus:bg-accent focus:text-accent-foreground` · disabled `opacity-50` · separator `bg-border -mx-1 my-1 h-px` · label `px-2 py-1.5 text-sm font-medium` (select label: `text-xs text-muted-foreground`) · destructive item: `text-danger-ink focus:bg-destructive/15` · animations: fade + zoom-95 + 2px slide per side · min-w `8rem` · select content: `max-h-(--radix-select-content-available-height)`, popper offset 1, checked item shows right Check `size-4` + `data-[state=checked]:text-primary` · select trigger per §6 (`h-11 px-3.5`, placeholder `text-muted-foreground`).

### 10.6 Tooltip

`block-surface` (white bg) · `rounded-none border border-foreground/10 px-3 py-2 text-xs text-balance` · fade+zoom+slide · arrow `size-2.5 rotate-45 fill-surface` · `z-50`.

### 10.7 Command palette (⌘K)

Renders inside CommandDialog (dialog chrome §10.1) · input placeholder "Search applicants, positions, or navigate…" · items `rounded-xl` + `mr-2 size-4 text-primary/70` icons + hint `text-xs text-muted-foreground` + trailing `ChevronRight text-muted-foreground/50` · group headings default · empty: "No results found."

### 10.8 Toasts (Sonner)

```tsx
<Sonner richColors position="top-right" style={{
  "--normal-bg": "var(--popover)",      // #ffffff
  "--normal-text": "var(--popover-foreground)", // #151515
  "--normal-border": "var(--border)",   // #e0e8f2
  "--border-radius": "0px",             // sharp toast blocks — intentional
}} />
```

---

## 11. Form Controls

### 11.1 Anatomy of a field (canonical wrapper)

```html
<div class="space-y-1.5">
  <label class="flex items-center gap-2 text-[13px] font-medium text-foreground" for="{id}">
    Label <span aria-hidden class="ml-0.5 text-destructive">*</span>   <!-- required star -->
  </label>
  {control}
  <p id="{id}-error" role="alert" class="text-xs font-medium text-destructive">Error</p>
  <!-- or hint: -->
  <p id="{id}-hint" class="text-xs text-muted-foreground">Helper</p>
</div>
```
Wire `aria-invalid={!!error}` + `aria-describedby` to the error/hint id. Validation timing: blur-after-touch + on submit.

### 11.2 Controls (effective values via §6)

| Control | Classes / geometry |
|---|---|
| **Input** | `h-12 w-full px-3.5 text-base md:text-sm` · 8px radius · white bg · border `#cdd3dc` → hover `#98a1ae` · focus: border `color-mix(#151515 55%, #cdd3dc)` + `0 0 0 3px #1591DC/22%` · placeholder `#5c6470` @70% · invalid: `#a8402f` border + 3px `#a8402f/16%` ring · disabled: `bg-foreground/5 text-foreground/40` |
| **Textarea** | same + `min-h-24 field-sizing-content px-3.5 py-2.5` · **bg = teal whisper** `color-mix(#185849 3%, #ffffff)` |
| **Select trigger** | `h-11 px-3.5 text-sm` · chevron `size-4 opacity-50 text-muted-foreground` · placeholder muted · 8px radius white bed |
| **Checkbox** | `size-4 rounded-none border border-input` · checked: `bg-primary border-primary text-white` + Check `size-3.5` · hover border-input-hover · focus ring-1 primary |
| **Radio** | `size-4 rounded-full border border-input text-primary` · inner dot `fill-primary size-2` centered |
| **Switch** | `h-[1.15rem] w-8 rounded-none` · track checked `bg-primary`, unchecked `bg-input` · thumb `size-4` `bg-muted-foreground` → checked `bg-white` slides `translate-x-[calc(100%-2px)]` |
| **Label** | `text-sm leading-none font-medium select-none` (override to `text-[13px]` in dense forms) |

Field grids inside sections: `grid grid-cols-1 gap-x-6 gap-y-5 p-4 sm:p-5 md:grid-cols-2 lg:grid-cols-3`. Yes/No pairs: `RadioGroup className="flex flex-row items-center gap-6 pt-1"`.

### 11.3 The form surface container (groups separated by hairlines)

```html
<div class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
  <!-- SubSection (collapsible group) -->
  <section>
    <button aria-expanded class="flex w-full items-center gap-2.5 rounded-t-xl px-4 py-4 text-left
                                 transition-colors hover:bg-secondary/40 sm:px-5">
      <Icon class="size-[18px] shrink-0 text-primary" strokeWidth={1.5} />
      <h3 class="text-[15px] font-semibold tracking-[-0.01em] text-foreground">Group title</h3>
      <span class="ml-2 hidden items-center gap-2 text-[13px] text-muted-foreground sm:flex">
        <span aria-hidden class="text-border">·</span><span class="tabular-nums">3 of 14 Completed</span>
      </span>
      <ChevronDown class="ml-auto size-4 shrink-0 text-muted-foreground/70 transition-transform duration-200 rotate-180" />
    </button>
    <div class="border-t border-border/70"> …field grid… </div>
  </section>
  <!-- more sections… -->
</div>
```
Phone defaults: core groups open, auxiliary collapsed (recomputed when crossing 768px); desktop: all open.

### 11.4 Mobile save bar (fixed, safe-area aware)

```html
<div class="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-card/95 px-4 pt-3
            pb-[calc(0.75rem+env(safe-area-inset-bottom))]
            shadow-[0_-6px_20px_-8px_rgb(9_14_24/0.25)] backdrop-blur md:hidden"
     role="toolbar" aria-label="Save changes">
  <div class="mx-auto flex max-w-xl items-center gap-3">
    {autosave indicator} <Button class="ml-auto">Save Changes</Button>
  </div>
</div>
```
Autosave indicator: `inline-flex items-center gap-1.5 text-xs font-medium` — saving: `Loader2 size-3.5 animate-spin text-muted-foreground` + "Saving…" · saved: `CheckCircle2 size-3.5 text-success` + "Changes saved" · error: `AlertCircle size-3.5 text-destructive` + message in destructive.

### 11.5 Search input

```html
<div class="relative">
  <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
  <Input class="h-9 rounded-lg pl-9 pr-8" />
  <button aria-label="Clear search" class="absolute inset-y-0 right-0 grid w-8 place-items-center
          text-muted-foreground hover:text-foreground"><X class="size-3.5" /></button>
</div>
```

---

## 12. Data Display

### 12.1 Table (with sticky solid header band)

```html
<div class="relative w-full h-full">                <!-- table container -->
  <table class="w-full caption-bottom text-sm">
    <thead class="sticky top-0 z-10 [&_tr]:border-b bg-tablehead">  <!-- #f0f5fa SOLID -->
      <tr><th class="text-muted-foreground h-11 px-3 text-left align-middle text-[11px]
                     font-semibold uppercase tracking-[0.12em] whitespace-nowrap">Column</th></tr>
    </thead>
    <tbody class="[&_tr:last-child]:border-0">
      <tr class="hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors">
        <td class="p-3 align-middle whitespace-nowrap">Cell</td>
      </tr>
    </tbody>
    <tfoot class="bg-tablehead border-t text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">…</tfoot>
  </table>
</div>
```
Header band MUST be opaque (never opacity tint) so rows don't bleed through when scrolling inside a card. For scrollable tables: wrap in `max-h-*` container with slim scrollbar (§5).

### 12.2 shadcn Tabs (underline register)

List: `inline-flex h-11 w-fit items-center justify-start rounded-none border-b border-border bg-transparent p-0`
Trigger: `inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-none -mb-px border-b-2 border-transparent px-4 text-sm font-medium whitespace-nowrap transition-colors duration-150 text-muted-foreground hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground`

### 12.3 Stat (labelled metric)

```html
<div class="flex min-w-0 flex-col gap-0.5">
  <span class="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Label</span>
  <span class="text-2xl font-semibold tabular-nums tracking-[-0.02em] {tone ink}">Value</span>
  <span class="text-xs text-muted-foreground">hint</span>
</div>
```

### 12.4 Monogram (gradient initials avatar)

```html
<span aria-hidden style="background-image: linear-gradient(135deg,
      hsl({hue} 72% 88%), hsl({(hue+40)%360} 70% 78%))"
      class="grid shrink-0 place-items-center rounded-full font-bold text-[#12324d]
             ring-2 ring-white/80 shadow-xs {size}">
  AB
</span>
<!-- sizes: sm size-8 text-[11px] · md size-10 text-[13px] · lg size-14 text-lg · xl size-20 text-2xl -->
<!-- hue = stable hash of the label (h = h*31 + charCodeAt, h % 360) — deterministic per name -->
```
Solid gradient variant (topbar/rail account): `bg-gradient-to-br from-primary to-[#0e6fae] text-white` (+ rail: `shadow-[0_6px_14px_-6px_rgb(21_145_220/0.7)]`).

shadcn Avatar (image slots): `size-8 rounded-none overflow-hidden`; fallback `bg-primary text-primary-foreground text-[11px] font-semibold`.

### 12.5 Progress meters

```html
<!-- kit Meter (animated width) -->
<span class="block h-2 w-full overflow-hidden rounded-full bg-secondary">
  <span class="block h-full rounded-full bg-primary" style="width: 71%"></span>  <!-- 0.7s ease-out -->
</span>
<!-- tone fills: primary #1591DC · success #3d6b4f · warning #9a6b1f · danger #a8402f · info #b98a3e -->

<!-- StageMeters (segmented strip) -->
<span class="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-secondary">
  <span class="h-full rounded-full bg-{tone}" style="flex-grow: {count}"></span>…
</span>

<!-- shadcn Progress (effective): pill track, white bg, rim/70 border; indicator gradient -->
<!-- background: linear-gradient(90deg, #1591DC, color-mix(#1591DC 62%, #8b867f)) -->
```

### 12.6 Donut & Sparkline (inline SVG)

- **Donut:** default `size=116, thickness=14`; `-rotate-90` svg; track `stroke-secondary`; segments `strokeLinecap="round"` with 2px gap; animate dash 0.9s `[0.22,1,0.36,1]` delay `0.15 + i*0.12`; center content absolutely centered. Completion ring variant: primary arc + transparent remainder, center readout `text-[15px] font-semibold tabular-nums` + `%` in `text-[10px] text-muted-foreground`, `size=72 thickness=7`.
- **Sparkline:** `240×56 viewBox` (rendered `h-14 w-full` or `h-10`), stroke `stroke-primary` (or success/warning/destructive) `width 2.5 round`, gradient area fill `stopOpacity 0.22→0`, end dot `r=3.5 fill-card stroke 2.5`.

### 12.7 StageStepper (horizontal stage tracker)

```html
<ol class="flex items-start">
  <li class="relative flex-1">
    <!-- connector (i>0): absolute left-0 right-1/2 top-[19px] h-[3px] -translate-y-1/2 rounded-full
         done → bg-primary · reached → bg-primary/50 · ahead → bg-border -->
    <div class="relative flex flex-col items-start gap-2 pr-4">
      <span class="grid size-10 place-items-center rounded-full border-2 bg-card transition-colors
                   {done    : 'border-primary bg-primary text-white shadow-[0_6px_16px_-6px_rgb(21_145_220/0.6)]'}
                   {current : 'border-primary/60 text-primary shadow-[0_0_0_5px_rgb(21_145_220/0.14)]'}
                   {rejected terminal: 'border-destructive bg-destructive text-white shadow-[0_6px_16px_-6px_rgb(168_64_47/0.55)]'}
                   {ahead   : 'border-border bg-card text-muted-foreground/60'}">
        <!-- done: check svg · current: size-3 bg-primary dot · ahead: size-2.5 bg-muted-foreground/35 dot -->
      </span>
      <p class="text-[13px] font-bold leading-tight {tone ink}">Stage</p>
      <p class="mt-0.5 text-[11px] font-medium text-muted-foreground">Date | —</p>
    </div>
  </li>
</ol>
```

### 12.8 JourneyRail (courier-tracking checkpoints)

```html
<ol class="flex w-full items-start">
  <li class="min-w-0 flex-1">
    <div class="flex items-center">
      <span class="relative z-10 grid size-8 shrink-0 place-items-center rounded-lg
                   {done: 'bg-success text-success-foreground' + Check size-4 strokeWidth 3}
                   {current: 'bg-primary text-primary-foreground' + number 01/02 + animate-ping halo bg-primary/40}
                   {upcoming: 'border border-input bg-background text-muted-foreground' + number}
                   {failed: 'bg-destructive text-white' + X size-4 strokeWidth 3}">
        <span class="text-[11px] font-extrabold tabular-nums">02</span>
      </span>
      <!-- connector: traversed → h-0.5 rounded-full bg-success · ahead → h-0 border-t-2 border-dashed border-border -->
    </div>
    <div class="min-w-0 pr-3 pt-2.5">
      <p class="text-xs font-bold tracking-[-0.01em] {state ink}">Label</p>
      <p class="mt-1 text-[11px] leading-snug text-muted-foreground">Desc</p>
    </div>
  </li>
</ol>
```
Label inks: done `text-foreground` · current `text-primary` · upcoming `text-muted-foreground` · failed `text-destructive`.

### 12.9 WizardSteps (compact numbered progress)

```html
<ol class="flex flex-wrap items-center gap-x-1.5 gap-y-2">
  <li class="flex items-center gap-1.5">
    <span aria-hidden class="h-px w-4 bg-border"></span>
    <span aria-current="step" class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold
          {done: 'border-success/30 bg-success/10 text-success' + Check size-3 strokeWidth 3}
          {active: 'border-primary/30 bg-primary/10 text-primary'}
          {ahead: 'border-border bg-secondary text-muted-foreground'}">2 Step</span>
  </li>
</ol>
```

### 12.10 Skeletons

Base: `bg-muted animate-pulse rounded-none` (usage overrides radius).
- Tile grid: `grid gap-4 sm:grid-cols-2 xl:grid-cols-4` + `h-[118px] rounded-2xl` per tile.
- Ledger: `divide-y rounded-2xl border border-border bg-card`; rows `flex items-center gap-3 px-4 py-3.5` with `size-9 rounded-full` avatar + two bars (`h-3.5 w-40`, `h-3 w-56`) + `h-6 w-16 rounded-full` pill.
- Board: columns `rounded-2xl border border-border bg-secondary/50 p-3` with `h-4 w-24` title + `h-[104px] rounded-xl bg-card` cards.
- Page: header bars `h-3 w-24` + `h-8 w-64`, then tiles + ledger/board.

---

## 13. States & Feedback

### 13.1 EmptyState (Atlas — gradient tile)

```html
<div class="flex flex-col items-center justify-center px-6 py-14 text-center">
  <span class="relative grid size-16 place-items-center rounded-[22px]
               bg-gradient-to-br from-primary/10 via-primary/5 to-transparent
               ring-1 ring-inset ring-primary/15">
    <span aria-hidden class="absolute inset-0 rounded-[22px] bg-gradient-to-t from-primary/[0.06] to-transparent" />
    <Icon class="size-7 text-primary/70" />
  </span>
  <p class="mt-4 text-[15px] font-bold text-foreground">No applications yet</p>
  <p class="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">sub</p>
  <div class="mt-5">{action}</div>
</div>
```

### 13.2 EmptyResult (square icon register — quiet)

```html
<div class="mx-auto flex w-full max-w-sm flex-col items-center px-6 py-10 text-center sm:py-12">
  <div data-slot="empty-result-icon"
       class="mb-4 grid size-12 shrink-0 place-items-center rounded-none border border-border
              bg-muted/40 text-muted-foreground">
    <Inbox class="size-5" strokeWidth={1.5} />
  </div>
  <!-- effective via §6: 8px radius + teal gradient wash + info-ink -->
  <h2 class="text-base font-semibold tracking-[-0.01em] text-foreground">No Data Found</h2>
  <p class="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">description</p>
  <div class="mt-5">{action}</div>
</div>
```

### 13.3 ErrorResult (static, no theatre)

Same shell as 13.2; icon block `size-12 rounded-none border border-destructive/30 bg-destructive/10 text-danger-ink` with `AlertTriangle size-5 strokeWidth 1.5`; optional `Try again` outline `size="sm"` button.

### 13.4 SuccessResult (animated)

`Card` shell `mx-auto max-w-sm`; content `flex flex-col items-center px-6 py-2`; 128px Lottie (`/dot-lottie/success.lottie`, loop+autoplay); title `mt-4 text-center text-xl font-semibold tracking-[-0.01em] text-success`; desc `mt-2 max-w-xs text-center text-sm text-muted-foreground`; action `mt-5`. Entrance: container `{opacity:0, scale:0.97}→{1,1}` 0.45s easeOut; text staggered rise 0.6/0.8/0.6s (+0.2/+0.3 delays).

---

## 14. Layout Scaffolds

### 14.1 PageShell — every page container

```html
<div class="mx-auto w-full max-w-[1440px] 2xl:max-w-[1720px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
```
Plus the page-enter motion: `{opacity:0, y:10} → {opacity:1, y:0}`, 0.28s, `[0.22, 1, 0.36, 1]`.

### 14.2 PageHeader

```html
<header class="mb-6 sm:mb-7">
  <p class="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
    <span aria-hidden class="h-3 w-1 rounded-full bg-primary"></span> Eyebrow
  </p>
  <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
    <h1 class="text-[28px] font-bold leading-[1.1] tracking-[-0.03em] text-foreground sm:text-[34px]">Title</h1>
    {optional Pill chip}
    <div class="ml-auto flex items-center gap-2">{actions}</div>
  </div>
  <p class="mt-2 max-w-2xl text-sm text-muted-foreground">Sub</p>
</header>
```

### 14.3 Workspace grids

- **Two-pane (applicant home, 12-col):** `grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6` · main `lg:col-span-7 2xl:col-span-8` · rail `lg:col-span-5 2xl:col-span-4` · rail is `Panel` with `flex flex-col lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)]`, header pinned (`mb-4 shrink-0 border-b border-border pb-4`), cards in `min-h-0 flex-1 lg:overflow-y-auto lg:pr-1` + thin scrollbar.
- **Profile settings-hub:** `mt-5 grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-6 scroll-mt-32`.
- Card lists: `space-y-4`.

### 14.4 Shell chrome (static visuals only — scroll effects excluded per request)

**Desktop rail (sidebar, md+):** `sticky top-0 h-dvh w-64 (collapsed w-[72px]) border-r border-border/60` · bg gradient `bg-gradient-to-b from-[#f8fbfe] via-[#f5f9fd] to-[#f1f6fb]` · brand row `h-16 border-b border-border/60 px-4` (MIRDC.png `h-8 w-auto`, mark-only `size-9`) · nav `px-3 py-4` · item `min-h-11 w-full rounded-xl px-3 py-2 text-sm gap-3` — active `bg-primary text-white shadow-[0_8px_20px_-8px_rgb(21_145_220/0.6)]` (icon gets `drop-shadow-[0_1px_2px_rgb(0_0_0/0.2)]`), inactive `text-muted-foreground hover:bg-accent hover:text-foreground` · collapsed items center + tooltip right · account card `rounded-2xl border border-border/70 bg-card p-2.5 shadow-sm` with gradient initials + sign-out `size-8 rounded-lg hover:bg-destructive/10 hover:text-destructive`.

**Topbar (authed):** `sticky top-0 z-20 h-16 shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-xl px-3 sm:px-5` · breadcrumb: muted workspace button (`rounded-md px-2 py-1 hover:bg-accent hover:text-foreground`) + `ChevronRight size-3.5 text-muted-foreground/50` + `font-semibold tracking-[-0.01em]` current · search pill `h-10 w-56 rounded-full border border-border/80 bg-card/70 px-4 text-muted-foreground shadow-xs hover:w-64 hover:border-primary/30 hover:bg-card hover:shadow-sm` with `⌘K` kbd `h-5 rounded-md border border-border bg-secondary px-1.5 text-[10px] font-semibold` · account chip `rounded-full border border-border/80 bg-card py-1 pl-1 pr-2.5 shadow-xs hover:border-primary/30 hover:shadow-sm` + `size-7 rounded-full bg-gradient-to-br from-primary to-[#0e6fae] text-[10px] font-bold text-white` initials.

**Public SiteHeader (static look):** `sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-xl py-1.5` · content `mx-auto max-w-[1400px] 2xl:max-w-[1680px] px-4 sm:px-6 lg:px-8` · logo `h-10 sm:h-14 w-auto object-contain` · nav links `font-label text-sm tracking-[0.01em] text-foreground/70 hover:text-foreground` (text-swap hover: upper copy slides up, brand-tint copy slides in) · CTA pill per §7. *(Condense-on-scroll behavior excluded by request.)*

### 14.5 Sticky sub-nav (profile sections) — mobile + desktop

**Desktop (lg+):** `sticky top-16` vertical list `flex flex-col gap-1` · item `relative min-h-11 w-full rounded-xl px-3 py-2 text-left` — active `bg-primary/10 text-primary` + left indicator `absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-primary`, inactive `text-muted-foreground hover:bg-accent hover:text-foreground` · number chip `grid size-8 rounded-full border text-[12px] font-semibold tabular-nums` — reached `border-primary bg-primary text-primary-foreground`, ahead `border-border bg-card text-muted-foreground` · label `text-sm font-medium leading-tight` + approx `text-xs` ("Approx 5 Min").

**Mobile (< lg):** `sticky top-16 z-30` pill strip — container `flex items-center gap-2 overflow-x-auto rounded-xl border border-border bg-card p-1.5 shadow-xs` (scrollbar hidden) · pill `inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium` — active `border-primary/30 bg-primary/10 text-primary`, inactive `border-border bg-card text-muted-foreground hover:text-foreground` · number chip `size-6` (same reach logic, Check `size-3`) · edge fades `pointer-events-none absolute inset-y-0 w-8 bg-gradient-to-r/l from-card to-transparent` when overflow exists · active pill auto-centers (`scrollIntoView inline: center`).

### 14.6 Footer (sticky, watermark recipe)

```html
<footer class="relative mt-auto overflow-hidden border-t border-rim bg-card">
  <!-- Seal watermark — bottom-left bleed behind text -->
  <div class="pointer-events-none absolute bottom-0 left-0 z-0 opacity-10">
    <img src="/govph-seal-mono-footer.jpg" alt="" aria-hidden
         class="h-40 w-40 object-contain sm:h-56 sm:w-56" />
  </div>
  <div class="relative z-10 mx-auto max-w-[1400px] 2xl:max-w-[1680px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
    <div class="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div class="flex max-w-2xl items-start gap-3 text-xs leading-relaxed text-muted-foreground">
        <span class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[4px] border border-rim bg-background text-gold">
          <ShieldCheck class="size-4" />
        </span>
        <p>Legal note…</p>
      </div>
      <p class="shrink-0 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">© 2026 DOST-MIRDC · RMIS</p>
    </div>
  </div>
</footer>
```
Shell law: root wrapper `min-h-dvh flex flex-col` (+ `bg-background`), footer `mt-auto` — sticks to viewport bottom on short pages, pushes naturally on long pages. Watermark: grayscale seal image, absolute bottom-left, `opacity-10`, `z-0`, text layer `relative z-10`, footer `overflow-hidden`; no blend modes, no shadows.

### 14.7 Page loader (branded intro, once per session)

Overlay `fixed inset-0 z-[100] flex items-center justify-center bg-[#112E81]` · logos `h-12 sm:h-16` + `h-10 sm:h-14` fade-rise · wordmark "RMIS" `text-3xl sm:text-5xl font-light uppercase tracking-[0.3em] text-parchment` masked slide-up · progress `h-[2px] w-48 sm:w-64 bg-white/15` track with `#E8A317` fill (scaleX 1.2s) · kicker "DOST-MIRDC" `text-[10px] sm:text-xs font-bold uppercase tracking-[0.3em] text-[#E8A317]` · curtain exits `y:-100%` 0.7s `[0.76, 0, 0.24, 1]` after ~1.5s · skipped entirely under reduced-motion.

---

## 15. Motion System

**CSS easing:** `--ease-deliberate: cubic-bezier(0.72, 0, 0.12, 1)` — all control transitions (buttons/fields 0.2s, pui-card hover 0.25s).
**Framer easing:** `[0.22, 1, 0.36, 1]` for entrances/growth; `[0.76, 0, 0.24, 1]` for the loader curtain; `easeOut` for micro-stagger.

| Interaction | Spec |
|---|---|
| Page enter | `opacity 0→1, y 10→0` · 0.28s · [0.22,1,0.36,1] |
| Section swap (profile) | in `{opacity:0,y:8}` / out `{opacity:0,y:-6}` · 0.18s easeOut · `AnimatePresence mode="wait"` |
| Card hover lift | `-translate-y-0.5` (or `-translate-y-px`) + `border-primary/30` + `shadow-md` · 150–200ms |
| Button press | `translateY(0.5px)` (not ghost/link) |
| Round toggle press | `hover:scale-105` / `active:scale-95` |
| Arrow nudges | `group-hover:translate-x-0.5/1` on trailing chevrons/arrows · 200ms |
| Quick-view expand | height 0↔auto + opacity · 0.2s [0.22,1,0.36,1] |
| Meter fill | width 0→pct · 0.7s [0.22,1,0.36,1] |
| Donut draw | dash 0.9s, stagger +0.12s/segment from 0.15s |
| Journey ping | `animate-ping` halo `bg-primary/40` on current node only |
| Overlay/panel open | fade + zoom-95 (+2px slide) · dialogs `duration-500 ease-deliberate`, menus 150–200ms |
| Text swap hover (header) | upper copy `-translate-y-full`, brand copy slides in · 200ms |
| Accordion | `animate-accordion-up/down` (tw-animate-css), chevron rotate-180 200ms |

**Reduced motion contract:** a `useReducedMotion` hook gates ALL choreography — loaders render nothing, entrances skip to final state, quick view crossfades 0.15s linear, pings disabled. Mirror this in the replica.

---

## 16. Implementation Commandments

1. Never introduce a new saturated color. Blue `#1591DC` + the token set above is the entire vocabulary (charts deliberately avoid blue: teal/amber/sienna/rust/olive).
2. Buttons are ALWAYS 9999px pills (except `link` = 4px). Fields/menus 8px. Cards 14px. Feature panels 18–22px. Badges/menu-items/tags 4px.
3. Hairlines everywhere: `--border #e0e8f2` for page-level lines, `--rim #e4e8ee` for component edges; inner section dividers `border-border/70` or `divide-border`.
4. Shadows only on floating things (cards/panels/hover), never on tables, banners, page canvas, or text.
5. Focus is always visible: global `:focus-visible { outline: 2px solid #1591DC; outline-offset: 2px }`; fields instead use border-darken + `0 0 0 3px #1591DC/22%`.
6. Status is never colour-only: tone pill/dot/stepper always ships a label or icon.
7. Numbers get `tabular-nums`. Big numerals get `font-bold tracking-[-0.03em] leading-none`.
8. Micro-labels are `text-[10–11px] font-semibold uppercase tracking-[0.12–0.16em] text-muted-foreground`.
9. Modals clamp to viewport (`max-h-[calc(100vh-2rem)]` global; `85vh`/`92dvh` in the form pattern) and always keep footers visible; mobile bottom actions respect `env(safe-area-inset-bottom)`.
10. Body never scrolls sideways: `overflow-x: clip` on `body`; scroll containers are explicit (`overflow-y-auto` + slim scrollbar).
11. Never use the `.premium` class (dead shim); never apply `rounded-none` expecting sharp corners on card/dialog/input/button/badge — §6 wins.
12. `--info` is teal `#185849` in the live token sheet (a stale comment in `lib/status.ts` says `#0041F0` — ignore the comment; `info` tone solid = Forest Deep).

---

## 17. Excluded by Request

- **System flow:** hash routing, navigation registry, session/auth branching, data fetching, polling cadences, unsaved-draft logic — none documented here.
- **Header smooth-scroll effect:** the public header's condense-on-scroll transition (>40px scroll → padding 1.5→0.5, logo shrink, blur deepen) and its slide-down intro are out of scope. Static header chrome is in §14.4.

---

## Appendix A — Light-mode hex quick reference

| Purpose | Hex |
|---|---|
| Primary blue / hover | `#1591DC` / `#0E7ABF` |
| Gradient partner (dark accent panels, loaders) | `#0e6fae`, Deep Royal `#112E81` |
| Canvas / sidebar / card | `#f3f7fb` / `#f7fafd` / `#ffffff` |
| Washes: secondary / muted / accent | `#eff4f9` / `#ecf2f8` / `#eaf1f8` |
| Hairlines: border / rim / input / input-hover | `#e0e8f2` / `#e4e8ee` / `#cdd3dc` / `#98a1ae` |
| Ink: primary / secondary / muted | `#151515` / `#1a1d23` / `#5c6470` |
| Semantic: success / warning / danger / info | `#3d6b4f` / `#9a6b1f` / `#a8402f` / `#185849` |
| Semantic inks: success / warning / danger / info | `#2f5a40` / `#7a5518` / `#8f3a2b` / `#175247` |
| Parchment (on-color ink) | `#e9ebdf` |
| Accent duo: Forest Deep / Midnight Moss | `#185849` / `#0e352c` |
| Gold / Amber (loader, kicker) | `#7a5518` / `#E8A317` |
| Navy panel / monogram ink | `#0c2236` / `#12324d` |
| Charts 1–5 | `#2e6b5e` `#b98a3e` `#8b5e3c` `#a8402f` `#5d5e54` |

*End of specification — v3.8 light sheet, extracted 1:1 from production source.*
