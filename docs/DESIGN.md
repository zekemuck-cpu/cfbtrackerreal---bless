# Dynasty Tracker — Design Language

The north star. Every component, every page, every color decision checks against this doc.

## Personality

**Broadcast scorebug × sports almanac.** Confident live-TV graphics meet reference-book typography. Data is the hero. Team color is flavor, not wallpaper.

We are NOT a generic SaaS dashboard. We are not a landing page. We are a data-dense tool for someone who loves college football enough to track a fictional dynasty season-by-season for years.

## The three rules

1. **Team color is an accent, never a fill.** Never cover more than ~5% of the viewport with pure team color. Use it as: stripes (2–6px), left-border rails, underlines, chip borders, button fills on CTAs. Never as a giant header bar or hero background.
2. **Typography carries the visual weight.** Big tabular numerals for stats. Tracked all-caps for labels. Outfit 900 for display, DM Sans for body. If you're tempted to add a border/shadow/gradient to create hierarchy — try changing font size/weight first.
3. **Density where data lives, generosity where a hero lives.** Tables: tight rows, no zebra, no extra padding. Heroes: editorial spacing, one big number, breathing room.

## Typography scale

| Token | Usage | Spec |
|---|---|---|
| `display-xl` | Team name in hero | Outfit 900, 3.5–4rem, tracking -0.03em |
| `display-lg` | Page titles | Outfit 800, 2.5rem, tracking -0.02em |
| `display-md` | Section titles | Outfit 700, 1.75rem, tracking -0.02em |
| `stat-hero` | The single biggest number on a page (OVR, final score) | Outfit 900, 4.5rem, tabular-nums, tracking -0.04em |
| `stat-lg` | Card stat values | Outfit 800, 2.5rem, tabular-nums |
| `stat-md` | Table stat cells | Outfit 600, 1rem, tabular-nums |
| `body` | Paragraph text | DM Sans 400, 0.875rem, line-height 1.6 |
| `label-sm` | Section labels | Outfit 600, 0.75rem, uppercase, tracking 0.05em |
| `label-xs` | Tiny labels (stat tile captions) | Outfit 600, 0.625rem, uppercase, tracking 0.1em |

**Rule:** any number that appears next to another number uses `font-variant-numeric: tabular-nums`. No exceptions — the columns must align.

## Color system

### Surface palette (dark, slightly warm)

| Token | Hex | Usage |
|---|---|---|
| `surface-0` | `#09090d` | Page background (deepest) |
| `surface-1` | `#0f1013` | Chrome: header, sidebar |
| `surface-2` | `#16171c` | Card backgrounds |
| `surface-3` | `#1e1f25` | Elevated / hover |
| `surface-4` | `#2a2b32` | Inputs, subtle borders |
| `surface-5` | `#3a3b44` | Strong borders, dividers |

Slight blue-black undertone (≈230° hue) so we escape pure neutral zinc — the AI default. Adjustment is ~2–5% saturation, invisible in isolation but present across the whole page.

### Text

| Token | Hex | Usage |
|---|---|---|
| `text-primary` | `#f5f5f7` | Headings, hero numerals |
| `text-secondary` | `#a8a8b0` | Body, secondary info |
| `text-tertiary` | `#6e6e78` | Meta, labels |
| `text-muted` | `#4a4a52` | Disabled, placeholders |

### Team color

- `--team-primary` — defined per team. Used for: accent stripes, active nav left-border, primary CTA button fill, focus rings, chip borders.
- `--team-primary-faded` — `color-mix(in srgb, var(--team-primary) 15%, var(--surface-2))`. For subtle accent backgrounds (e.g. active table row highlight).
- `--team-primary-muted` — `color-mix(in srgb, var(--team-primary) 40%, var(--surface-2))`. For medium-emphasis accent chips.
- `--team-secondary` — rare direct use. Reserved for two-tone chips (conference badges, "secondary" helmet styling).

**Scoping:** team-color vars are set on a page-wrapper `data-team-theme` element, NOT `:root`. Prevents cross-contamination when two team contexts render (e.g. cross-dynasty player view inside a dynasty page).

### Semantic colors (non-team)

| Token | Hex | Usage |
|---|---|---|
| `success` | `#22c55e` | Win result, positive delta, successful save |
| `danger` | `#ef4444` | Loss result, negative delta, destructive action |
| `warning` | `#f59e0b` | Pending state, validation warning |
| `info` | `#3b82f6` | Neutral informational accent (rare) |

## Hero treatment spec

Replaces the current solid team-color banner. Every dynasty page uses this.

```
┌─┬────────────────────────────────────────────────────┐
│ │ KENTUCKY WILDCATS                    OVR  OFF  DEF │
│ │ 3-6 (2-5)  ·  SEC                     84   84   86 │
│ │                                                    │
└─┴────────────────────────────────────────────────────┘
 ▲
 └─ 6px team-primary vertical stripe (left rail)
```

- Background: `surface-2`
- Left stripe: 6px solid `--team-primary`
- Team name: `display-xl`, `text-primary`
- Meta row: `label-sm` `text-tertiary`
- Stats inline right: each is `<Stat size="lg">`
- Optional: team-logo watermark at 3–5% opacity behind the stats, no more
- Height: content-driven, NOT fixed. No more 240px-tall wasted banners.

## Data table spec

The app lives and dies on its data tables. They must feel typeset, not like a spreadsheet.

- Background: inherit from parent (no bg per table)
- Row height: 36px (compact). 44px for larger stat tables.
- No zebra striping.
- Row hover: `surface-3` background, slight left-border in `--team-primary-faded`.
- Header: `label-sm` text, `text-tertiary`, bottom border `1px solid surface-5`, sticky on scroll.
- Numeric cells: `tabular-nums`, right-aligned, `stat-md` token.
- Text cells: `text-primary`, left-aligned.
- Sortable headers: chevron on the right, subtle color change when active sort.
- Empty: full-width `<EmptyState>` in the body, not a single row.

Anti-patterns:
- ❌ Drop shadows on rows
- ❌ Rounded row corners
- ❌ Fill backgrounds per row
- ❌ Giant padding
- ❌ Icon columns that don't carry data

## Score row spec (scorebug-style)

Used for game results in schedules, history, game pages.

```
W1  [T-logo] TENNESSEE            L 41-17   AWAY
W2  [T-logo] BOWLING GREEN        L 20-17   HOME  OT
```

- Left: week/sequence number, `text-tertiary`, fixed-width
- Team logo (`<TeamLogo size="sm">`)
- Team name + rank, `text-primary`
- Right cluster: result chip (W/L/T), score (`stat-md`, tabular), site (HOME/AWAY/NEUTRAL) as label-xs tertiary, overtime marker as label-xs tertiary
- Row separator: `1px solid surface-4` bottom
- Hover: `surface-3` background
- NEVER put the opponent's team color as a row background — this is what the current app does and it screams "AI look"

## Spacing scale

Stick to the existing CSS vars: `--space-xs` (0.25rem) → `--space-2xl` (3rem). Don't invent new ones inline.

Section vertical rhythm: `--space-xl` (2rem) between major sections on a page. `--space-lg` between cards in a grid. `--space-md` inside a card.

## Elevation

Three tiers, period:

1. **Flat** — `surface-2` background, no border. Default content.
2. **Bordered** — `surface-2` + `1px solid surface-4`. Interactive items, cards that group data.
3. **Elevated** — `surface-3` + `1px solid surface-5` + `shadow-dark-lg`. Modals, dropdowns, floating UI.

That's it. No gradients-as-elevation. No glow-as-elevation (except the existing `.animate-glow` for truly live/active elements — a currently-active game, an incoming notification).

## Team-color-on-team-color rules

Edge case: a dynasty is Kentucky, but we're viewing a player who transferred from Alabama.

Rule:
- **Chrome** (header, sidebar) always uses the **dynasty's** team color.
- **Hero** on a player/team page uses the **viewed** team's color.
- **Content** uses the dynasty color by default; only switches when the content is explicitly about the viewed team (e.g., that player's career stats in the viewed-team context).

When both render on the same page, they're differentiated by position (chrome = top/left, hero = content area). Never nest stripes.

## Teambuilder custom teams

Users can upload teams with arbitrary colors. Some will be ugly (neon pink, low-contrast grays).

Our design tolerates this because:
- Accent stripes are narrow — an ugly color in 6px is fine
- Team color never fills a large area
- Text is always on neutral surfaces, not on team-color backgrounds

If a custom color has near-white primary (Texas #BF5700 ish is fine; pure white is not), fall back to the team's secondary for stripes. Implement this check in the primitive.

## Don'ts gallery

The "AI vibe" smoking guns. If you see these in a PR, it's wrong:

- ❌ Solid team-color banner ≥100px tall
- ❌ Three stat cards in a row with equal weight, equal rounded corners, equal padding (the v0 default)
- ❌ Gradient from team-primary to a slightly darker team-primary
- ❌ Generic "No games found" centered-text empty state (use `<EmptyState>`)
- ❌ `alert('Saved!')` (use `<Toast>`)
- ❌ Ad-hoc `<div className="fixed inset-0 bg-black/50">` for modal backdrops (use `<Modal>`)
- ❌ Tables with drop shadows on every row
- ❌ Non-tabular numerals anywhere a column exists
- ❌ `rounded-2xl` everything — use rounded-md as the default, rounded-xl only for major containers
- ❌ Inline `style={{ backgroundColor: teamColors.primary }}` as a fill — use the token/primitive
- ❌ Purple-to-blue gradients. Anywhere. Ever.

## Icons

The project rule in CLAUDE.md: no decorative icons. Reaffirmed here. An icon earns its place only when it is load-bearing information (team logo, conference logo) — never decoration.

## Animation

Use existing utility classes:
- `.shimmer` for loading skeletons
- `.animate-pulse-subtle` for current-week / active indicators
- `.animate-glow` for live events (only if truly live)

No hover scale-up, no hover shadow growth, no rotating icons. Restraint.

---

**Maintenance rule:** when this doc and the code disagree, update one to match the other in the same PR. Drift is how design systems die.
