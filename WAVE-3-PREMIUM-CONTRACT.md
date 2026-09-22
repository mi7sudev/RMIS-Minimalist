# WAVE-3 PREMIUM CONTRACT — "Ink & Ember"

Binding for all Wave-3 view agents. This extends (and where it conflicts, **overrides**) UI-REFACTOR-CONTRACT.md.
**Absolute rules (unchanged):** zero changes to handlers, fetch URLs/payloads, state machines, validation strings, copy contracts, navigation, aria labels. Presentation only.

## Foundation shipped (already in globals.css — USE THESE, do not re-invent)

| Primitive | Class | Use |
|---|---|---|
| Elevation | `shadow-e1 e2 e3 e4` (Tailwind) | e1 rows/chips, e2 resting cards, e3 hover/popovers, e4 modals/hero |
| Mesh ambience | automatic (`body::before`) | nothing to do — never paint `bg-fog`/`bg-white` over the full page |
| Card | `.dlg-card` | now has sheen + inner highlight + layered shadow (borders no longer required on it) |
| Hover lift | `.lift` | add to clickable cards (combines with existing hover styles) |
| Glass | `.glass` | sticky translucent surfaces |
| Icon chip | `.chip .chip-amber/emerald/rose/slate/ink/gold/plum` | tinted icon tiles — THE premium signal |
| Monogram | `.monogram` / `.monogram-warm` | gradient avatar tiles |
| Gradient CTA | `.dlg-cta` | now gradient + ember shadow, 600 weight — do not add text color classes |
| Gradient text | `.grad-ink` / `.grad-ember` | hero/display moments ONLY |
| Rail | `.rail` | dark sidebar (done) |
| `<IconChip>` `<Monogram>` | `@/components/ui/shell` | React helpers (IconChip tone prop, Monogram warm prop) |
| KpiCard | upgraded | 34px semibold value, tinted chip, hover lift; new `aside?: ReactNode` slot for sparklines/deltas |

## Tone mapping (semantic, consistent app-wide)

- **amber** → jobs/postings/vacancy/CTA-adjacent accents
- **emerald** → success/shortlisted/open/complete
- **rose** → rejected/destructive/failed
- **gold** → deadlines/warnings/in-review
- **plum** → analytics/insights/neutral info
- **slate** → default/general
- **ink** → brand moments only

## Wave-3 view rules

1. **Icons never float naked on white.** Every section header, KPI, empty state, feature tile gets an `IconChip`/`.chip-*`. Replace bare `bg-fog` icon squares.
2. **Clickable cards lift.** `.lift` + existing `hover:` styles. Tables keep row hover instead.
3. **Numbers shout.** KPI/large values: `text-[32px]~[34px] font-semibold tracking-[-0.02em]` + `.num`.
4. **Charts get gradient fills** (recharts `<defs><linearGradient>` with unique ids), strokeWidth 2, `fillOpacity` fades. Keep existing data/click logic byte-identical.
5. **Hero/landing gets mesh + glow**: wrap hero in a container with `radial-gradient` tints (amber/rose ≤10% opacity), mockup frame gets `shadow-e4` + subtle ember glow behind it, use `.grad-ink` on one display heading line max.
6. **Panels/dialogs**: `shadow-e4`, keep 24px radius. Popovers `shadow-e3`.
7. **Sticky page headers inside views** (if any) → `.glass` + `border-b border-black/[0.06]`.
8. **No new colors** beyond chips/gradient tokens. Orange still ONLY on `.dlg-cta` (and now the sanctioned ember brand/monogram/active-rail elements). Status colors still only in pills/dots/charts.
9. **Keep all existing class hooks** (`status-pill`, `stage-dot`, `num`, `skel`, `focus-ring`, `dlg-*`) — they were restyled centrally; don't rename or duplicate.
10. Mobile top bar is now DARK — any icon/text on the shell top strip must stay white (already handled in shell; only relevant if your view renders into it — none do).

## Verification (each agent)

`bun run lint` clean; `bunx tsc --noEmit` — zero new errors in owned files. Do NOT run the dev server; orchestrator verifies in browser.
