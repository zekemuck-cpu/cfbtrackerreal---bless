# Outlook Tab Overhaul — Depth-Chart Tile Planner

**Date:** 2026-05-31
**Status:** Approved for build
**Owner:** alex.guess1999 (request from user "Blessmurphy" / Murphy)

## Problem

The Outlook tab is a read-mostly summary of position groups (cards listing returning
players, incoming recruits, likely-NFL, manual transfer flags). Power users like Murphy
do their real offseason roster planning on **paper**: a formation depth chart where they
stack players under each position, move guys around (including across positions), and
decide where incoming recruits and portal additions fit. The tab can't replace that paper.

## Goal

Rebuild the Outlook tab from scratch into a **depth-chart board with free-moving player
tiles** that fully replaces the paper workflow, and that works **flawlessly on both phone
and desktop**.

## Decisions (from brainstorming)

- **Interaction model:** tap-to-pick-up / tap-to-place (identical on touch and mouse),
  with native click-drag as a desktop enhancement. No drag-only flows.
- **Layout:** labeled position **columns with stacked tiles**, grouped into rows
  (OL row, skill row, front-seven, secondary). Not a literal field diagram — columns
  match the paper and survive a phone screen.
- **Three sub-views:** Offense / Defense / Special Teams.
- **Year selector:** view/plan any upcoming season (currentYear+1 … +4). Each year shows
  that year's projected roster.
- **Holding pen:** that year's incoming commits (HS recruits AND portal commits — both
  enter only once they've actually committed; no hypothetical/typed tiles). Each one is
  placed into a slot by the user.
- **Cascade forward:** a placement sticks. Place a 2026 freshman at WR and he's a
  returning sophomore WR on the 2027 board automatically.
- **Formation slots:**
  - Offense: QB · HB · WR · SLOT · WR · TE · LT · LG · C · RG · RT  (+ optional FB, off by default)
  - Defense: LE · DT · DT · RE · SAM · MIKE · WILL · CB · SLOT(nickel) · CB · FS · SS
  - Special Teams: K · P · KR · PR
- **Legacy cleanup:** the unused `buildDepthChart` engine, the old `*_FORMATION` /
  `TAB_FORMATIONS` / `POSITION_ALIASES` / `candidateSlots` exports, and their tests are
  removed. The tested helpers `gradeForOvr` and `isPortalRisk` are kept.

## Architecture

### Key idea — placement lives on the player, not the year

A player's planned slot is stored once, keyed by a **stable tile id**, and shared across
all years. The year selector only changes the *projection lens* (who is eligible and their
aged class/OVR). Cascade therefore falls out for free — there is no per-year copy step that
can drift out of sync, which is what keeps the multi-year board reliable.

**Stable tile id:** the projection's `entry.key`.
- Returning/established players: `pid:<pid>`.
- Incoming recruits/portal commits: `inc:<recruitYear>:<idx>:<name>:<position>` — stable
  across board years for the same commit (recruitYear + idx don't depend on the viewed year).

### Data model — `dynasty.teamFuture[tid]`

Persisted via the existing `saveTeamFuture(dynastyId, tid, dataForTid)` (which replaces the
whole per-tid object, so writes must spread the prior value):

```js
teamFuture[tid] = {
  placements:      { [tileId]: slotId },   // a player's planned slot (cascades by id)
  order:           { [slotId]: [tileId…] },// depth order within a slot
  notes:           { [tileId]: string },   // optional tile annotations
  stRoles:         { KR: [tileId…], PR: [tileId…] }, // return roles (a WR can also be KR)
  leaveFlags:      [pid…],                  // "marked leaving" (kept; pid-based)
  nflDismissFlags: [pid…],                  // dismissed NFL badges (kept; pid-based)
  fbEnabled:       false,                   // show the optional FB slot
}
```

### Pure board builder — `src/utils/outlookBoard.js`

`buildBoard(allProjectedPlayers, side, opts) -> { slots, rows, pen, summary }`

- **Formations** are defined here per side. Each slot: `{ id, label, group, accepts:[exactPos], multi }`.
  Rows (for layout grouping) are exported alongside.
- **Side membership:** `sideOf(position)` via `finePositionGroup` → group → side
  (offense: QB/RB/WR/TE/OT/OG/C; defense: DT/EDGE/OLB/MIKE/CB/Safety; st: K/P).
- **Placement:**
  1. A player with `placements[tileId]` belonging to this side's formation → that slot.
  2. An **established** player with no placement → auto-seeded into a candidate slot
     (exact `accepts` match first; else any slot whose `group` matches; multi-slots like
     WR/DT/CB distributed by filling the least-occupied slot, OVR desc).
  3. An **incoming** player with no placement → the **holding pen** (never auto-seeded).
- **Special teams:** K/P auto-seed from kicker/punter players; **KR/PR are filled only
  from `stRoles`** and may reference any player (offense/defense), so placing a WR at KR
  doesn't remove him from WR.
- **Within-slot order:** `order[slotId]` first, then OVR desc. Tile 0 = starter.
- **Markers (passed in via opts, applied here for testability):**
  `nflPids` (set) → NFL badge; portal-risk computed via `isPortalRisk`; `notes[tileId]`.
- **Holes:** a slot with zero tiles. **Summary:** starters' average OVR, hole count,
  `toPlace` (= pen length).

### Component — `src/components/TeamOutlook.jsx` (full rewrite, same export/props `{ tid }`)

- Controls: side toggle (pill Tabs: Offense/Defense/Special Teams), Season `<Select>`,
  and small toggles for **grades** (off by default) and **FB slot** (offense only).
- Data: `projectRoster(dynasty, tid, year, { leaveFlags })` for the player list,
  `projectNflCandidates(…)` → `nflPids`, `projectDepartures(…)` for the "marked leaving"
  footer. Board via `buildBoard`.
- Render: rows of **SlotColumn**s; each column = header (label, count, hole tint) + stacked
  **PlayerTile**s. A **HoldingPen** panel shows incoming-to-place. A **SummaryStrip** shows
  unit OVR / holes / "X to place".
- **Interaction:** `selectedTileId` state.
  - Tap a tile → select (tap again → deselect). When selected, every slot + pen highlight.
  - Tap a slot → `placements[tileId] = slotId`, append to `order[slotId]`.
  - Tap the pen → remove the placement (incoming returns to pen).
  - Within-slot **▲▼** reorder updates `order[slotId]`.
  - Desktop: tiles are `draggable`; slots/pen handle `onDragOver`/`onDrop` for the same moves.
  - Per-tile actions: **Out** (toggle `leaveFlags`), **note** (inline input → `notes`),
    NFL **dismiss** (toggle `nflDismissFlags`), and on ST, add/remove **KR/PR** role.
- View-only mode (`isViewOnly`) disables all edits.

## Out of scope (YAGNI)

- Hypothetical/typed portal targets (only committed players appear).
- Literal field-diagram rendering.
- Editing incoming recruits' ratings here.
- Customizable formations beyond the FB toggle.

## Testing

- `outlookBoard.test.js`: auto-seed by position, multi-slot distribution, explicit
  placement override, incoming → pen, incoming-with-placement → slot (cascade), hole
  detection, within-slot order, ST KR/PR from `stRoles`, summary counts.
- Keep `gradeForOvr` / `isPortalRisk` tests; drop `buildDepthChart` tests.
- `npm run build` must pass.

## Rollout

Build on the local `feat/default-rosters` branch and **do not push** — the user tests on
local dev (`npm run dev`) before it ships to production.
