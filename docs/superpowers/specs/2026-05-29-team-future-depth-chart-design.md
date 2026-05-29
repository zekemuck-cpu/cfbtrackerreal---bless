# Team Future — Projected Depth Chart (Design)

**Date:** 2026-05-29
**Status:** Approved for planning
**Author:** Alex + Claude (brainstorm session)

## Motivation

Requested by beta user Ezekiel Muck: a Madden-style depth-chart page that lets
you roll the roster forward to future seasons to plan recruiting and the
transfer portal — see who's leaving, who's returning, who's coming in, and
where the depth holes are. v1 delivers the **depth chart**. A richer "Needs"
breakdown board is explicitly **deferred** to a later phase.

## Goals (v1)

- A new top-level page, **"Team Future"**, for the user's **current team**.
- **Offense / Defense / Special Teams** tabs.
- A **season dropdown**: every tracked past season → current → **+4 future
  years**. Past = view-only history, present = live roster, future = projection.
- **Madden-style formation** of position cards: starter on top (headshot, OVR
  ring, dev-trait accent, dev/OVR-change arrow), backups as rows inside the card
  (name + OVR), position label + **letter grade** below.
- **Auto-sort by OVR**, with **manual ▲▼ / drag reordering per position that
  persists**.
- Projection signals on the chart:
  - **Hole**: position with no projected starter → dashed-red EMPTY card.
  - **Incoming**: recruits / portal transfers slotted as depth → blue, ★ stars.
  - **Dev-trait border color**: Elite = gold, Star = red, Impact = blue,
    Normal = gray.
  - **Auto portal-risk ⚑**: a returning player with very low snaps last season.
  - **Manual "likely to leave" flag**: user-set; severe red, and treated as
    gone in future-year projections.

## Non-goals (deferred)

- The standalone **"Needs" board** (ranked needs table) — revisit after v1 ships.
- **Team picker** — v1 is the user's current team only.
- **Projecting OVR growth** from dev traits — future returners carry their
  last-known OVR forward as an estimate (see Decisions).

## Key decisions (confirmed)

1. **Future OVR**: returning players' future ratings are unknown, so we carry
   their **last-known OVR forward** as a projected estimate (subtly marked).
   This keeps sorting / grades / depth meaningful. Incoming recruits show
   **"—"** until the user enters a rating.
2. **Scope of team**: user's **current team** (`dynasty.currentTid`) only.
3. **Manual order + leave-flags persist**; everything else is computed on the fly.

## Architecture

Three units, each independently testable:

### A. Projection engine — `src/utils/rosterProjection.js` (pure)

`projectRoster(dynasty, tid, targetYear)` → array of projected player entries
`{ pid, player, position, projectedClass, projectedOvr, devTrait, status }`
where `status ∈ { 'returning', 'incoming', 'current', 'historical' }`.

- **Past/present `targetYear`** (≤ currentYear): use real data — players where
  `isPlayerOnRoster(player, tid, targetYear)` is true; class via
  `getPlayerClassForYear`; OVR via `overallByYear[targetYear]`; position via
  `positionByYear[targetYear] || position`. Exclude `isHonorOnly`.
- **Future `targetYear`** (> currentYear): simulate **year-by-year** from the
  current roster:
  1. Advance each surviving player's class one step (`CLASS_PROGRESSION`,
     DynastyContext.jsx ~4064).
  2. **Remove** anyone who, in the year being stepped into, graduates
     (Sr / RS Sr), was drafted or transferred out
     (`player.movementByYear[year].type === 'departure'`; also pending
     `getPlayersLeaving`), or is **manually flagged "likely to leave."**
  3. **Add** that year's incoming recruits + portal transfers via
     `getRecruitingCommitments(dynasty, tid, year)` (recruit objects carry
     name/position/stars/devTrait/isPortal; **no OVR** — projectedOvr = null).
  4. Carry forward last-known OVR for returners as `projectedOvr`.

Helpers: `advanceClass(cls)`, `yearsOfEligibilityLeft(player, fromYear)`,
`isGraduating(cls)`.

### B. Depth-chart builder — `src/utils/depthChart.js` (pure)

`buildDepthChart(projectedPlayers, { tab, manualOrder })` → for each position
in the tab's formation: an ordered list of players (starter + backups).

- Group by position using a **shared position-group module** extracted to
  `src/data/positionGroups.js` (currently inline in TeamYear.jsx ~2363 and
  boxScoreConstants.js ~220 — consolidate to one source).
- **Order**: manual order first (pids in `manualOrder[posKey]`, in that order),
  then everyone else by `projectedOvr` desc (nulls last).
- Compute per-position: **grade** (heuristic from starter OVR + depth + dev
  traits; tunable), **hole** (no projected starter), **portal-risk** per player
  (returning + `statsByYear[lastYear].snapsPlayed` below a conservative,
  tunable threshold).

**Starting values (tunable in the plan):**
- **Grade** from starter `projectedOvr`: ≥90 → A+, 87–89 → A, 84–86 → A-,
  81–83 → B+, 78–80 → B, 75–77 → B-/C+, 70–74 → C, <70 → D; −1 step if only
  one body at the position, +1 step if the starter is Elite/Star dev; F if hole.
- **Portal-risk ⚑**: a returning non-senior whose `snapsPlayed` last season was
  under ~150 (buried on the depth chart) — a cue they might hit the portal.

Formation layouts per tab (position slots):
- **Offense**: row 1 — LT, LG, C, RG, RT, TE; row 2 — WR, HB, QB, FB, WR.
- **Defense**: DL/EDGE row (LEDG, DT, DT, REDG), LB row (SAM, MIKE, WILL),
  DB row (CB, FS, SS, CB).
- **Special Teams**: K, P (plus KR / PR if return stats exist).

### C. Page — `src/pages/dynasty/TeamFuture.jsx`

- Lazy-loaded route under `/dynasty/:id/team-future` (+ `.preload()` like peers),
  with a **sidebar nav entry** "Team Future."
- State: active tab, selected year. Reads `currentDynasty`, `currentTid`,
  `currentYear`.
- Renders the formation of cards (look locked in brainstorm mockup v4):
  headshots via `proxyImageUrl(pictureUrl, 300)`.
- Interactions: tab switch, year dropdown, **▲▼ / drag** to reorder (saves),
  toggle a player's **"likely to leave"** flag (saves).

### Persistence (data model)

Stored on the main dynasty doc (small; surgical dot-notation writes via
`updateDynasty`):

```
dynasty.teamFuture = {
  depthOrder: { [tid]: { [posKey]: [pid, ...] } },   // manual ▲▼ order
  leaveFlags: { [tid]: [pid, ...] }                  // manual "likely to leave"
}
```

Manual order/flags are keyed by tid; they apply to present + future projections
(past years stay auto-sorted by that year's OVR). Players no longer on the
roster are simply ignored when applying a saved order.

## Edge cases

- Position changes across years (`positionByYear`).
- Players with no OVR (recruits, partial data) → sort last, grade ignores them.
- `isHonorOnly` / walk-on / fictional-team players excluded from the roster.
- Redshirts: class string carries the "RS " prefix; eligibility walk handles it.
- A manually-flagged player who *also* has a recorded departure → still gone
  (no double-count).
- Year with no recruiting data → no incoming added (not an error).

## Testing

- **Projection engine** is pure → unit tests: Jr→Sr returns; Sr graduates and
  disappears; drafted/transferred player removed; recruit appears in the right
  class year; manually-flagged player excluded from future but red on present;
  multi-year (+3) compounds correctly.
- **Depth-chart builder** unit tests: manual order respected then OVR fallback;
  hole when no starter; portal-risk threshold; grade monotonic with OVR.
- **UI**: manual verification in the running dev app (tabs, year dropdown,
  reorder persistence, flag persistence, headshots).

## Rough component/file plan

- `src/data/positionGroups.js` — extracted shared position-group + formation maps.
- `src/utils/rosterProjection.js` — `projectRoster` + helpers.
- `src/utils/depthChart.js` — `buildDepthChart`, grade/hole/risk helpers.
- `src/pages/dynasty/TeamFuture.jsx` — the page + card UI + interactions.
- Route + lazy import + sidebar nav entry (wherever routes/sidebar live).
- `DynastyContext` persistence helpers for `teamFuture.depthOrder` /
  `teamFuture.leaveFlags` (dot-notation writes).
