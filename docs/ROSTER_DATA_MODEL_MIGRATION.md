# Roster Data Model Consolidation Plan

**Goal:** One source of truth per concept. Remove fallback chains. Eliminate the class of bugs where two code paths disagree about the same fact (class, team, movement, departure).

**Scope:** Player lifecycle only — class, team membership, overall, dev trait, movements, players-leaving. Does NOT touch stats, games, schedules, recruiting commitments.

**Non-negotiables:**
- No data loss. Every migration is additive first, destructive only after verification.
- Schema version flag on every player (`_schemaVersion: 2`) so migrations are idempotent and skippable once done.
- Readers go through helpers only. No raw `player.year` / `player.team` / `player.movements` access outside the data layer after Phase 3.

---

## Canonical Schema (v2)

| Concept | Canonical field | Type | Notes |
|---|---|---|---|
| Class per year | `classByYear[year]` | `{ [numYear]: 'FR'\|'SO'\|'JR'\|'SR'\|'RS-FR'\|... }` | Numeric-key only. No string keys. |
| Team per year | `teamsByYear[year]` | `{ [numYear]: tid:number }` | Numeric tid only. No abbr strings. |
| Overall per year | `overallByYear[year]` | `{ [numYear]: number }` | |
| Dev trait per year | `devTraitByYear[year]` | `{ [numYear]: 'Normal'\|'Impact'\|... }` | |
| Lifecycle events | `movementByYear[year]` | `{ [numYear]: MovementEntry }` | One entry per year max. |
| Players leaving (global) | `dynasty.playersLeavingByYear[year]` | `{ [numYear]: Array<{pid, reason}> }` | Team-scoped view is derived. |

**MovementEntry normalized shape:**
```js
{
  type: 'arrival' | 'departure' | 'recommit',
  // arrival subtypes
  arrival?: 'recruit' | 'transfer_in' | 'walk_on',
  fromTid?: number | null,   // for transfer_in
  // departure subtypes
  departure?: 'graduated' | 'pro_draft' | 'transfer_out' | 'medical' | 'dismissed' | 'quit',
  toTid?: number | null,     // for transfer_out (null = unresolved portal)
  reason?: string,           // human label (keep sheet's exact string for display)
}
```

**Deprecated fields (removed in Phase 5):**
- `player.year`, `player.team`, `player.teams[]`
- `player.overall`, `player.devTrait`
- `player.movements[]`
- `player.teamHistory[]`, `player._legacy_teamsByYear`, `player.entryYear`, `player.entryClass`
- `teams[tid].byYear[year].playersLeaving`

---

## Phase 0 — Freeze and baseline (half day)

- Stop shipping features that touch roster lifecycle until Phase 3 done.
- Snapshot current dynasties (export JSON from DangerZone) to a safe location. Non-negotiable before any destructive phase.
- Add `_schemaVersion` read in `selectDynasty`; default to `1` if missing.
- Write one integration-level smoke test harness (even if manual checklist): pick a real dynasty, record current values for 10 random players × their full year range. Re-check after each phase to confirm no silent drift.

## Phase 1 — Data layer: writers + readers (1 day)

New file: `src/data/rosterModel.js`. Exports:

**Readers** (pure, no side effects):
- `getPlayerClass(player, year) → string | null`
- `getPlayerTid(player, year) → number | null`
- `getPlayerOverall(player, year) → number | null`
- `getPlayerDevTrait(player, year) → string | null`
- `getMovement(player, year) → MovementEntry | null`
- `isOnRoster(player, tid, year) → boolean`
- `isLeaving(player, year) → boolean`
- `getRosterYears(player) → number[]` (sorted list of years they were on any roster)

**Writers** (return new player object, never mutate):
- `setPlayerClass(player, year, cls)`
- `setPlayerTid(player, year, tid)`
- `setPlayerOverall(player, year, ovr)`
- `setPlayerDevTrait(player, year, trait)`
- `setMovement(player, year, entry)` — overwrites whole year entry
- `clearMovement(player, year)`

**Invariants enforced by writers:**
- All year keys coerced to `Number`.
- Tids coerced to `Number`; abbrs rejected (throw in dev, log warning and resolve in prod via `resolveTid`).
- Setting `departure` for year Y auto-clears `teamsByYear` for years > Y.
- Setting `arrival` for year Y auto-ensures `teamsByYear[Y]` matches the arrival tid.

**Keep v1 readers alive as shims** during Phase 2/3 rollout. Shims log (dev only) when called, so we can find stragglers.

## Phase 2 — Migration: "Normalize to v2" (1 day)

New DangerZone button: **Normalize Roster Data to v2**.

Replaces/supersedes: Stint Data Cleanup, Roster System Migration, Fix Player Classes, Fix Departure Reasons. Those remain as individual tools but Normalize runs the superset.

**Algorithm** (per player, deterministic, idempotent):

1. **teamsByYear** — merge priority (existing wins, gap-fill from lower priority):
   1. `teamsByYear` (normalize keys to Number, values to tid via `resolveTid`)
   2. `_legacy_teamsByYear`
   3. `teamHistory[]` stints expanded year-by-year
   4. `movements[]` arrivals/departures inference
   5. `statsByYear` / `classByYear` years as evidence of presence
   6. `player.team` for current year only
2. **classByYear** — keys coerced to Number; fill gaps using `entryYear`/`entryClass`/tenure logic (existing `handleFixClassData` rules).
3. **overallByYear / devTraitByYear** — coerce keys to Number; trim entries past departure year; do NOT backfill with `player.overall`/`player.devTrait` (only current year gets that value).
4. **movementByYear** — translate each `movements[]` entry into normalized MovementEntry keyed by year. Conflict rule: if two events same year, departure wins for end-of-year, arrival for start-of-year (log the collision). Map legacy types:
   - `recruited` → `{ type:'arrival', arrival:'recruit' }`
   - `transfer` / `portal_in` / `added` → `{ type:'arrival', arrival:'transfer_in', fromTid }`
   - `recommit` / `recommitted` → `{ type:'recommit' }`
   - `departure` + reason='Graduating' → `{ type:'departure', departure:'graduated' }`
   - `departure` + reason='Pro Draft' → `{ type:'departure', departure:'pro_draft' }`
   - `departure` + any other reason → `{ type:'departure', departure:'transfer_out', toTid, reason }`
   - `entered_portal` alone (no resolution) → `{ type:'departure', departure:'transfer_out', toTid:null, reason:'Entered Transfer Portal' }`
   - `graduated` / `declared_for_draft` / `transferred_out` / `encouraged_to_transfer` — as above
5. **Stamp** `_schemaVersion: 2`, `_normalizedAt: <ISO>`.
6. **DO NOT delete legacy fields yet.** Keep them for Phase 3 side-by-side verification.

**Report output:** counts of each merge source used, collisions, unresolved tids, unrecognized movement types. Save the report so we can inspect before Phase 4.

**Acceptance:** Run twice in a row → second run reports zero changes.

## Phase 3 — Switch readers to v2 (1–2 days)

- Flip helpers (`isPlayerOnRoster`, `getPlayerClassForYear`, `getPlayersLeaving`, etc.) to read v2 canonical fields only. Fallback path removed.
- Grep for raw field access and replace with helper calls:
  - `player.year` → `getPlayerClass(p, currentYear)`
  - `player.team` → `getPlayerTid(p, currentYear)`
  - `player.overall` → `getPlayerOverall(p, currentYear)`
  - `player.devTrait` → `getPlayerDevTrait(p, currentYear)`
  - `player.movements` iteration → `getMovement(p, year)` per year loop, or `getAllMovements(p)` helper
  - `player.teamsByYear[y] || player.team` → `getPlayerTid(p, y)`
- Writers (PlayerEdit, PlayersLeavingModal, advanceWeek, encourageTransfer, recommit flows) go through `setMovement` / `setPlayerTid`. No direct `.push` on `movements[]` anywhere.
- `advanceWeek` stops writing top-level `player.year` / `player.overall` / `player.devTrait`. It only writes the canonical per-year fields.
- `playersLeavingByTeamYear` becomes a derived memo — compute from movements on read, do not store.

**Verification gate before Phase 4:** walk a dynasty through a full year cycle (advance, enter stats, process portal, commit transfers, advance year). Spot-check 20 players against the Phase 0 baseline. Any discrepancy → fix before continuing.

## Phase 4 — Remove legacy fields (half day)

Second DangerZone button: **Strip v1 Legacy Fields** (guard: requires `_schemaVersion === 2`).

Deletes per player: `year`, `team`, `teams`, `overall`, `devTrait`, `movements`, `teamHistory`, `_legacy_teamsByYear`, `entryYear`, `entryClass`.

Deletes per dynasty: `teams[tid].byYear[year].playersLeaving`, `playersLeavingByTeamYear` (recomputed on read).

Stamp `_schemaVersion: 3`.

## Phase 5 — Delete the shims (half day)

- Remove the v1 reader shims added in Phase 1.
- Remove the legacy merge branches from Normalize migration (now a no-op for v3 players).
- Remove fallback chains from `isPlayerOnRoster` etc. — they should already be gone from Phase 3, but double-check.
- Delete DangerZone tools superseded by Normalize: Stint Data Cleanup, old Roster System Migration, Fix Departure Reasons. Keep Normalize + Strip Legacy as the only lifecycle migrations.

## Phase 6 — Tests around the four danger transitions (1 day)

No test harness exists today. Minimum coverage, even as Vitest unit tests on `rosterModel.js` plus a handful of integration-ish tests on DynastyContext flows:

1. **Players Leaving save** — write list for year Y, assert each named player gets `movementByYear[Y] = departure` with correct reason, assert `teamsByYear` trimmed past Y, assert checklist updates immediately (same tick).
2. **Transfer Destinations save** — resolve a pending portal entry to a new tid, assert movement becomes `transfer_out` with `toTid`, assert player not on old roster for Y+1.
3. **Year flip / class progression** — every on-roster player gets `classByYear[Y+1]` set, redshirt logic respected, departing players don't progress, recommitted players DO progress (this was a bug).
4. **Honors save (Awards / All-American / All-Conference)** — coach awards create zero player records; player-facing honors set `teamsByYear[honorYear]` + `classByYear[honorYear]` only if player exists.

## Rollout order and estimates

| Phase | What | Est |
|---|---|---|
| 0 | Freeze, snapshot, baseline | 0.5d |
| 1 | `rosterModel.js` + shims | 1d |
| 2 | Normalize migration + DangerZone button | 1d |
| 3 | Flip readers/writers, grep sweep | 1–2d |
| 4 | Strip legacy fields | 0.5d |
| 5 | Delete shims | 0.5d |
| 6 | Tests around 4 danger transitions | 1d |

**Total: ~5–6 focused days.** Each phase is individually shippable — we can pause between any two phases without leaving the app broken. Phase 0–2 are non-breaking (additive only). Phase 3 is the risk-bearing phase.

## Risk register

- **Dynasties in production with messy movements arrays** — Normalize must tolerate unknown movement types by logging and skipping, not throwing. Keep a `_migrationLog` on the player for forensic use.
- **Teambuilder tids that no longer resolve** — `resolveTid` falls back to keeping the abbr string; Normalize reports these as unresolved and leaves them v1-shaped. User sees a list and can fix manually.
- **Two-context race (header dynasty A + player page dynasty B)** — unchanged by this work; tracked separately in the visual redesign plan.
- **User runs Strip Legacy before Normalize** — button is hard-gated on `_schemaVersion === 2`, with a modal warning.
- **Sheet modals write v1 shapes** — Phase 3 includes PlayersLeavingModal, TransferDestinationsModal, PlayerEdit, PlayerTimelineEditor, handleHonorPlayers, advanceWeek. Every write site must route through writers from Phase 1.

## What this buys

- One read path per question. `"What team was Player X on in 2031?"` has exactly one answer, produced by exactly one function.
- New features can't accidentally introduce a sixth source of truth — writers enforce the shape.
- The bug class that caused every symptom in the April session (checklist stale, ghost players, missing portal badge, blank passing yards, timeline vs editor drift) becomes impossible to reintroduce without deleting a helper and reinventing the old pattern.

## What this explicitly does NOT fix

- Box-score stat key drift (`passYards` vs `passingYards`). Separate pass, same spirit.
- Modal/Design system work from the visual redesign plan. Independent.
- Cross-team-context CSS var race. Independent.
- Historical data that was entered wrong by the user (e.g. misremembered OVRs). Migration normalizes shape, not truth.
