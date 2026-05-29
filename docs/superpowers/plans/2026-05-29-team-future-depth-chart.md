# Team Future — Projected Depth Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a "Team Future" page — a Madden-style depth chart you can roll forward to future seasons (or back to past ones) to plan recruiting and the transfer portal.

**Architecture:** Two pure, unit-tested modules — a roster **projection engine** (`rosterProjection.js`) that ages the current roster forward (drop grads/draft/transfers/manual-leave-flags, add incoming recruits/transfers) and a **depth-chart builder** (`depthChart.js`) that groups projected players into formation slots with grades/holes/portal-risk — plus a React page (`TeamFuture.jsx`) rendering the Madden card formation with Offense/Defense/ST tabs, a season dropdown, auto-OVR ordering with saved manual ▲▼ overrides, and a manual "likely to leave" flag.

**Tech Stack:** React + react-router (lazy pages with `.preload()`), Tailwind + CSS vars, Firebase/IndexedDB via `DynastyContext`, **vitest** (added here) for the pure modules.

**Spec:** `docs/superpowers/specs/2026-05-29-team-future-depth-chart-design.md`

---

## File Structure

- `src/data/positionGroups.js` — **new.** Canonical position→group map + per-tab formation slot layouts. (Consolidates the inline maps in `TeamYear.jsx` ~2363 and `boxScoreConstants.js` ~220.)
- `src/utils/rosterProjection.js` — **new.** Class helpers + `projectRoster(dynasty, tid, year, opts)`.
- `src/utils/depthChart.js` — **new.** `buildDepthChart`, `gradeForOvr`, `isPortalRisk`.
- `src/utils/__tests__/rosterProjection.test.js` — **new.**
- `src/utils/__tests__/depthChart.test.js` — **new.**
- `src/pages/dynasty/TeamFuture.jsx` — **new.** The page + `PositionCard` subcomponent + interactions.
- `src/routes/lazyPages.js` — **modify.** Add lazy `TeamFuture` + preload entry.
- `src/App.jsx` — **modify.** Import + nested route under `/dynasty/:id`.
- `src/components/Sidebar.jsx` — **modify.** Add "Team Future" nav item.
- `package.json` — **modify.** Add `vitest` devDep + `test` script.

Persistence lives on the main dynasty doc: `dynasty.teamFuture = { depthOrder: { [tid]: { [pos]: [pid…] } }, leaveFlags: { [tid]: [pid…] } }`, written via `updateDynasty` dot-notation.

---

## Task 1: Add vitest test harness

**Files:**
- Modify: `package.json`
- Create: `src/utils/__tests__/sanity.test.js`

- [ ] **Step 1: Install vitest**

Run: `npm install -D vitest`
Expected: `vitest` appears in `package.json` devDependencies, install succeeds.

- [ ] **Step 2: Add the test script**

In `package.json`, add to `"scripts"` (alongside dev/build/preview):

```json
"test": "vitest run"
```

- [ ] **Step 3: Write a sanity test**

Create `src/utils/__tests__/sanity.test.js`:

```js
import { describe, it, expect } from 'vitest'

describe('vitest harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 4: Run it**

Run: `npm test`
Expected: PASS (1 passed). vitest reads `vite.config.js` automatically; pure-Node tests need no jsdom.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/utils/__tests__/sanity.test.js
git commit -m "test: add vitest harness for pure utils"
```

---

## Task 2: Shared position-groups + formations module

**Files:**
- Create: `src/data/positionGroups.js`
- Test: `src/utils/__tests__/positionGroups.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/positionGroups.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { groupForPosition, OFFENSE_FORMATION, DEFENSE_FORMATION, ST_FORMATION } from '../../data/positionGroups'

describe('groupForPosition', () => {
  it('maps OL positions to OL', () => {
    for (const p of ['LT', 'LG', 'C', 'RG', 'RT']) expect(groupForPosition(p)).toBe('OL')
  })
  it('maps edge/interior DL to DL', () => {
    for (const p of ['LEDG', 'REDG', 'DT', 'DE', 'NT']) expect(groupForPosition(p)).toBe('DL')
  })
  it('maps linebackers to LB and dbs to DB', () => {
    expect(groupForPosition('MIKE')).toBe('LB')
    expect(groupForPosition('CB')).toBe('DB')
    expect(groupForPosition('FS')).toBe('DB')
  })
  it('returns null for unknown', () => {
    expect(groupForPosition('XYZ')).toBe(null)
  })
})

describe('formations', () => {
  it('offense has the OL + skill slots', () => {
    const ids = OFFENSE_FORMATION.map(s => s.id)
    expect(ids).toEqual(['LT', 'LG', 'C', 'RG', 'RT', 'TE', 'WR1', 'HB', 'QB', 'FB', 'WR2'])
  })
  it('every slot names a real position pool', () => {
    for (const f of [OFFENSE_FORMATION, DEFENSE_FORMATION, ST_FORMATION]) {
      for (const slot of f) expect(typeof slot.pos).toBe('string')
    }
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- positionGroups`
Expected: FAIL ("Cannot find module '../../data/positionGroups'").

- [ ] **Step 3: Implement the module**

Create `src/data/positionGroups.js`:

```js
// Canonical position → position-group map and the per-tab formation slot
// layouts the Team Future depth chart renders. Single source of truth
// (previously duplicated inline in TeamYear.jsx and boxScoreConstants.js).

export const GROUP_POSITIONS = {
  QB: ['QB'],
  RB: ['HB', 'FB', 'RB'],
  WR: ['WR'],
  TE: ['TE'],
  OL: ['LT', 'LG', 'C', 'RG', 'RT', 'OL', 'OT', 'OG'],
  DL: ['LEDG', 'REDG', 'DE', 'DT', 'DL', 'NT', 'LE', 'RE', 'EDGE'],
  LB: ['SAM', 'MIKE', 'WILL', 'OLB', 'MLB', 'ILB', 'LB', 'LOLB', 'ROLB'],
  DB: ['CB', 'FS', 'SS', 'S', 'DB'],
  K: ['K'],
  P: ['P'],
}

const _posToGroup = {}
for (const [group, positions] of Object.entries(GROUP_POSITIONS)) {
  for (const p of positions) _posToGroup[p] = group
}

export function groupForPosition(pos) {
  if (!pos) return null
  return _posToGroup[String(pos).toUpperCase()] || null
}

// A formation slot: { id (unique label), label (shown), pos (exact roster
// position the pool is drawn from), group }. Slots sharing a `pos` (WR1/WR2,
// CB1/CB2…) split that position's pool round-robin in the depth-chart builder.
const slot = (id, pos, label = id) => ({ id, label, pos, group: groupForPosition(pos) })

export const OFFENSE_FORMATION = [
  slot('LT', 'LT'), slot('LG', 'LG'), slot('C', 'C'), slot('RG', 'RG'), slot('RT', 'RT'), slot('TE', 'TE'),
  slot('WR1', 'WR', 'WR'), slot('HB', 'HB'), slot('QB', 'QB'), slot('FB', 'FB'), slot('WR2', 'WR', 'WR'),
]

export const DEFENSE_FORMATION = [
  slot('LE', 'LEDG', 'LE'), slot('DT1', 'DT', 'DT'), slot('DT2', 'DT', 'DT'), slot('RE', 'REDG', 'RE'),
  slot('SAM', 'SAM'), slot('MIKE', 'MIKE'), slot('WILL', 'WILL'),
  slot('CB1', 'CB', 'CB'), slot('FS', 'FS'), slot('SS', 'SS'), slot('CB2', 'CB', 'CB'),
]

export const ST_FORMATION = [
  slot('K', 'K'), slot('P', 'P'),
]

export const TAB_FORMATIONS = {
  offense: OFFENSE_FORMATION,
  defense: DEFENSE_FORMATION,
  st: ST_FORMATION,
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- positionGroups`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/positionGroups.js src/utils/__tests__/positionGroups.test.js
git commit -m "feat: shared position-groups + formation layouts for Team Future"
```

---

## Task 3: Class progression helpers

**Files:**
- Create: `src/utils/rosterProjection.js`
- Test: `src/utils/__tests__/rosterProjection.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/rosterProjection.test.js`. The `vi.mock` keeps
the pure util isolated from the heavy React/Firebase `DynastyContext` module
(importing it for real would break a Node test). The mocked helpers mirror the
fake-data shapes used below:

```js
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../context/DynastyContext', () => ({
  isPlayerOnRoster: (p, tid, year) => (p.teamsByYear?.[year] ?? p.teamsByYear?.[String(year)]) === tid,
  getPlayerClassForYear: (p, year) => p.classByYear?.[year] ?? p.classByYear?.[String(year)] ?? p.class ?? null,
  getPlayersLeaving: () => [],
  getRecruitingCommitments: (dynasty, tid, year) => dynasty.recruitingCommitmentsByTeamYear?.[year]?.[String(tid)] || {},
}))

import { advanceClass, yearsLeftAfter } from '../rosterProjection'

describe('advanceClass', () => {
  it('walks the standard track and graduates after Sr', () => {
    expect(advanceClass('Fr', 1)).toBe('So')
    expect(advanceClass('Jr', 1)).toBe('Sr')
    expect(advanceClass('Sr', 1)).toBe(null)      // graduated
    expect(advanceClass('Fr', 3)).toBe('Sr')
    expect(advanceClass('Fr', 4)).toBe(null)
  })
  it('walks the redshirt track', () => {
    expect(advanceClass('RS Fr', 1)).toBe('RS So')
    expect(advanceClass('RS Sr', 1)).toBe(null)
  })
  it('returns the same class for 0 steps and passes through unknowns', () => {
    expect(advanceClass('Jr', 0)).toBe('Jr')
    expect(advanceClass('', 1)).toBe(null)
  })
})

describe('yearsLeftAfter', () => {
  it('counts remaining seasons after the given one', () => {
    expect(yearsLeftAfter('Sr')).toBe(0)
    expect(yearsLeftAfter('Jr')).toBe(1)
    expect(yearsLeftAfter('Fr')).toBe(3)
    expect(yearsLeftAfter('RS So')).toBe(2)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- rosterProjection`
Expected: FAIL ("does not provide an export named 'advanceClass'").

- [ ] **Step 3: Implement the helpers**

Create `src/utils/rosterProjection.js` with (more added in Task 4/5).

> **Before writing:** confirm `isPlayerOnRoster`, `getPlayerClassForYear`,
> `getPlayersLeaving`, and `getRecruitingCommitments` are **named exports** of
> `src/context/DynastyContext.jsx` (`getPlayerClassForYear` and
> `getRecruitingCommitments` already are — imported in `Player.jsx`). If
> `isPlayerOnRoster` / `getPlayersLeaving` are not exported, add `export` to
> them there in this step.

```js
// Roster projection — age the current roster forward to a future season, or
// read the real roster for a past/current season. Pure + unit-tested.
import { isPlayerOnRoster, getPlayerClassForYear, getPlayersLeaving, getRecruitingCommitments } from '../context/DynastyContext'

const STANDARD = ['Fr', 'So', 'Jr', 'Sr']
const REDSHIRT = ['RS Fr', 'RS So', 'RS Jr', 'RS Sr']

function trackFor(cls) {
  const c = (cls || '').trim()
  if (REDSHIRT.includes(c)) return REDSHIRT
  if (STANDARD.includes(c)) return STANDARD
  return null
}

// Advance a class string by `steps` seasons. Returns the new class, or null
// once the player graduates (walks off the end of their track) or the class
// is unrecognized.
export function advanceClass(cls, steps) {
  const track = trackFor(cls)
  if (!track) return null
  const i = track.indexOf((cls || '').trim())
  const j = i + steps
  return j < track.length ? track[j] : null
}

// Seasons of eligibility remaining AFTER the given class year (Sr → 0).
export function yearsLeftAfter(cls) {
  const track = trackFor(cls)
  if (!track) return 0
  return track.length - 1 - track.indexOf((cls || '').trim())
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- rosterProjection`
Expected: PASS (class-helper tests green).

- [ ] **Step 5: Commit**

```bash
git add src/utils/rosterProjection.js src/utils/__tests__/rosterProjection.test.js
git commit -m "feat: class-progression helpers for roster projection"
```

---

## Task 4: `projectRoster` — past & present years

**Files:**
- Modify: `src/utils/rosterProjection.js`
- Test: `src/utils/__tests__/rosterProjection.test.js`

- [ ] **Step 1: Add the failing test**

Append to `src/utils/__tests__/rosterProjection.test.js`:

```js
import { projectRoster } from '../rosterProjection'

// Minimal fake dynasty. isPlayerOnRoster/getPlayerClassForYear read these
// shapes (teamsByYear: { [year]: tid }, classByYear, overallByYear).
function fakeDynasty() {
  return {
    currentYear: 2035,
    currentTid: 10,
    players: [
      { pid: 'a', name: 'Vet Sr', position: 'QB', teamsByYear: { 2034: 10, 2035: 10 },
        classByYear: { 2035: 'Sr' }, overallByYear: { 2034: 84, 2035: 88 }, devTraitByYear: { 2035: 'Star' } },
      { pid: 'b', name: 'Soph', position: 'WR', teamsByYear: { 2035: 10 },
        classByYear: { 2035: 'So' }, overallByYear: { 2035: 79 }, devTraitByYear: { 2035: 'Normal' } },
      { pid: 'z', name: 'Honor', position: 'QB', isHonorOnly: true, teamsByYear: { 2035: 10 }, classByYear: { 2035: 'Sr' } },
    ],
  }
}

describe('projectRoster — present year', () => {
  it('returns on-roster, non-honor players with that year class/ovr', () => {
    const d = fakeDynasty()
    const r = projectRoster(d, 10, 2035)
    const pids = r.map(p => p.pid).sort()
    expect(pids).toEqual(['a', 'b'])           // honor-only excluded
    const a = r.find(p => p.pid === 'a')
    expect(a.projectedClass).toBe('Sr')
    expect(a.projectedOvr).toBe(88)
    expect(a.status).toBe('current')
  })
})

describe('projectRoster — past year', () => {
  it('reads that season roster + OVR', () => {
    const d = fakeDynasty()
    const r = projectRoster(d, 10, 2034)
    expect(r.map(p => p.pid)).toEqual(['a'])
    expect(r[0].projectedOvr).toBe(84)
    expect(r[0].status).toBe('historical')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- rosterProjection`
Expected: FAIL ("does not provide an export named 'projectRoster'").

- [ ] **Step 3: Implement past/present + the dispatcher**

Append to `src/utils/rosterProjection.js`:

```js
function ovrForYear(player, year) {
  const o = player.overallByYear || {}
  return o[year] ?? o[String(year)] ?? player.overall ?? null
}
function positionForYear(player, year) {
  const p = player.positionByYear || {}
  return p[year] ?? p[String(year)] ?? player.position ?? ''
}
function devForYear(player, year) {
  const d = player.devTraitByYear || {}
  return d[year] ?? d[String(year)] ?? player.devTrait ?? 'Normal'
}

function projectedEntry(player, { position, projectedClass, projectedOvr, devTrait, status, isIncoming = false, stars = null, name = null }) {
  return {
    key: isIncoming ? `inc:${name}:${position}:${projectedClass}` : `pid:${player.pid}`,
    pid: isIncoming ? null : player.pid,
    player: isIncoming ? null : player,
    name: name ?? player.name,
    jerseyNumber: isIncoming ? null : (player.jerseyNumber ?? null),
    position,
    projectedClass,
    projectedOvr,
    devTrait,
    status,
    isIncoming,
    stars,
  }
}

function rosterForRealYear(dynasty, tid, year) {
  const currentYear = Number(dynasty.currentYear)
  return (dynasty.players || [])
    .filter(p => !p.isHonorOnly && isPlayerOnRoster(p, tid, year))
    .map(p => projectedEntry(p, {
      position: positionForYear(p, year),
      projectedClass: getPlayerClassForYear(p, year),
      projectedOvr: ovrForYear(p, year),
      devTrait: devForYear(p, year),
      status: year === currentYear ? 'current' : 'historical',
    }))
}

// Public entry point. opts.leaveFlags = Set<pid> of manual "likely to leave".
export function projectRoster(dynasty, tid, targetYear, opts = {}) {
  const currentYear = Number(dynasty.currentYear)
  const ty = Number(targetYear)
  if (ty <= currentYear) return rosterForRealYear(dynasty, tid, ty)
  return projectFutureRoster(dynasty, tid, ty, opts) // Task 5
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- rosterProjection`
Expected: present/past tests PASS. (Future test added next task; `projectFutureRoster` is referenced but not yet called by these tests.)

Note: define a temporary stub so the module imports cleanly:

```js
function projectFutureRoster() { return [] }
```

(Replaced with the real implementation in Task 5 — delete this stub there.)

- [ ] **Step 5: Commit**

```bash
git add src/utils/rosterProjection.js src/utils/__tests__/rosterProjection.test.js
git commit -m "feat: projectRoster for past/present seasons"
```

---

## Task 5: `projectRoster` — future-year simulation

**Files:**
- Modify: `src/utils/rosterProjection.js`
- Test: `src/utils/__tests__/rosterProjection.test.js`

- [ ] **Step 1: Add the failing test**

Append to the test file:

```js
describe('projectRoster — future year', () => {
  function futureDynasty() {
    const d = {
      currentYear: 2035, currentTid: 10,
      players: [
        // Jr in 2035 → Sr in 2036, gone in 2037
        { pid: 'jr', name: 'Junior', position: 'HB', teamsByYear: { 2035: 10 }, classByYear: { 2035: 'Jr' }, overallByYear: { 2035: 80 }, devTraitByYear: { 2035: 'Impact' } },
        // Sr in 2035 → graduated in 2036
        { pid: 'sr', name: 'Senior', position: 'QB', teamsByYear: { 2035: 10 }, classByYear: { 2035: 'Sr' }, overallByYear: { 2035: 90 } },
        // So that we will manually flag as likely-to-leave
        { pid: 'risk', name: 'Flighty', position: 'WR', teamsByYear: { 2035: 10 }, classByYear: { 2035: 'So' }, overallByYear: { 2035: 77 } },
      ],
      // 2036 incoming class for tid 10
      recruitingCommitmentsByTeamYear: { 2036: { '10': { regular_1: [ { name: 'Frosh WR', position: 'WR', class: 'HS', stars: 4, devTrait: 'Star', isPortal: false } ] } } },
    }
    return d
  }

  it('ages returners, drops grads, keeps OVR estimate', () => {
    const d = futureDynasty()
    const r = projectRoster(d, 10, 2036)
    const jr = r.find(p => p.pid === 'jr')
    expect(jr.projectedClass).toBe('Sr')
    expect(jr.projectedOvr).toBe(80)          // last-known OVR carried forward
    expect(jr.status).toBe('returning')
    expect(r.find(p => p.pid === 'sr')).toBeUndefined()   // graduated
  })

  it('adds the incoming class with no OVR', () => {
    const d = futureDynasty()
    const r = projectRoster(d, 10, 2036)
    const frosh = r.find(p => p.isIncoming && p.name === 'Frosh WR')
    expect(frosh).toBeTruthy()
    expect(frosh.projectedOvr).toBe(null)
    expect(frosh.stars).toBe(4)
    expect(frosh.projectedClass).toBe('Fr')
  })

  it('excludes manually flagged "likely to leave" players', () => {
    const d = futureDynasty()
    const r = projectRoster(d, 10, 2036, { leaveFlags: new Set(['risk']) })
    expect(r.find(p => p.pid === 'risk')).toBeUndefined()
  })

  it('drops the Sr-in-2036 returner by 2037', () => {
    const d = futureDynasty()
    const r = projectRoster(d, 10, 2037)
    expect(r.find(p => p.pid === 'jr')).toBeUndefined()   // Sr in 2036 → gone 2037
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- rosterProjection`
Expected: FAIL (future tests fail — stub returns []).

- [ ] **Step 3: Implement the future simulation**

In `src/utils/rosterProjection.js`, **delete the `projectFutureRoster` stub** from Task 4 and add:

```js
// Has this player recorded a departure (grad/draft/transfer) in any season
// from `fromYear`..`throughYear` (inclusive)?
function departedBy(player, fromYear, throughYear) {
  const mv = player.movementByYear || {}
  for (let y = fromYear; y <= throughYear; y++) {
    const m = mv[y] || mv[String(y)]
    if (m && m.type === 'departure') return true
  }
  return false
}

// Map a recruit's stored class to a starting class string.
function recruitStartClass(recruitClass) {
  const c = (recruitClass || '').trim()
  if (!c || c === 'HS' || c.startsWith('JUCO')) return 'Fr'
  return STANDARD.includes(c) || REDSHIRT.includes(c) ? c : 'Fr'
}

function flattenCommits(commitsObj) {
  if (!commitsObj) return []
  return Object.values(commitsObj).flat().filter(Boolean)
}

function projectFutureRoster(dynasty, tid, targetYear, opts = {}) {
  const currentYear = Number(dynasty.currentYear)
  const ty = Number(targetYear)
  const leaveFlags = opts.leaveFlags instanceof Set ? opts.leaveFlags : new Set(opts.leaveFlags || [])
  const out = []

  // 1) Returning players: start from the current roster, age forward, drop
  //    grads / recorded departures / manually flagged.
  const current = (dynasty.players || []).filter(p => !p.isHonorOnly && isPlayerOnRoster(p, tid, currentYear))
  for (const p of current) {
    if (leaveFlags.has(p.pid)) continue
    if (departedBy(p, currentYear + 1, ty)) continue
    const curCls = getPlayerClassForYear(p, currentYear)
    const projCls = advanceClass(curCls, ty - currentYear)
    if (projCls === null) continue // graduated before targetYear
    out.push(projectedEntry(p, {
      position: positionForYear(p, currentYear),
      projectedClass: projCls,
      projectedOvr: ovrForYear(p, currentYear),  // last-known OVR estimate
      devTrait: devForYear(p, currentYear),
      status: 'returning',
    }))
  }

  // 2) Incoming recruits + portal transfers for each class year up to target.
  for (let y = currentYear + 1; y <= ty; y++) {
    let commits = []
    try { commits = flattenCommits(getRecruitingCommitments(dynasty, tid, y)) } catch { commits = [] }
    for (const rec of commits) {
      const startCls = recruitStartClass(rec.class)
      const projCls = advanceClass(startCls, ty - y)
      if (projCls === null) continue
      out.push(projectedEntry(null, {
        name: rec.name,
        position: (rec.position || '').toUpperCase(),
        projectedClass: projCls,
        projectedOvr: null,                 // recruits have no OVR until onboarded
        devTrait: rec.devTrait || 'Normal',
        status: 'incoming',
        isIncoming: true,
        stars: rec.stars ?? null,
      }))
    }
  }

  return out
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- rosterProjection`
Expected: PASS (all projection tests green).

- [ ] **Step 5: Commit**

```bash
git add src/utils/rosterProjection.js src/utils/__tests__/rosterProjection.test.js
git commit -m "feat: future-year roster simulation (age up, drop departures, add recruits)"
```

---

## Task 6: Depth-chart builder (slots, grades, holes, portal-risk)

**Files:**
- Create: `src/utils/depthChart.js`
- Test: `src/utils/__tests__/depthChart.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/depthChart.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { buildDepthChart, gradeForOvr, isPortalRisk } from '../depthChart'
import { OFFENSE_FORMATION } from '../../data/positionGroups'

const mk = (pid, position, ovr, status = 'returning') => ({ key: 'pid:' + pid, pid, name: pid, position, projectedOvr: ovr, status, isIncoming: status === 'incoming', devTrait: 'Normal' })

describe('gradeForOvr', () => {
  it('maps OVR to a letter and returns F for a hole (null starter)', () => {
    expect(gradeForOvr(91)).toBe('A+')
    expect(gradeForOvr(79)).toBe('B')
    expect(gradeForOvr(null)).toBe('F')
  })
})

describe('buildDepthChart', () => {
  it('orders each slot by OVR desc, splits multi-slot positions round-robin', () => {
    const projected = [
      mk('qb1', 'QB', 88), mk('qb2', 'QB', 70),
      mk('wrA', 'WR', 90), mk('wrB', 'WR', 84), mk('wrC', 'WR', 75), mk('wrD', 'WR', 60),
    ]
    const chart = buildDepthChart(projected, { formation: OFFENSE_FORMATION, manualOrder: {} })
    const qb = chart.find(s => s.id === 'QB')
    expect(qb.starter.pid).toBe('qb1')
    expect(qb.backups.map(b => b.pid)).toEqual(['qb2'])
    const wr1 = chart.find(s => s.id === 'WR1')
    const wr2 = chart.find(s => s.id === 'WR2')
    expect(wr1.starter.pid).toBe('wrA')   // round-robin: A→WR1, B→WR2, C→WR1, D→WR2
    expect(wr2.starter.pid).toBe('wrB')
    expect(wr1.backups.map(b => b.pid)).toEqual(['wrC'])
    expect(wr2.backups.map(b => b.pid)).toEqual(['wrD'])
  })

  it('flags a hole when no player fills a slot', () => {
    const chart = buildDepthChart([mk('qb1', 'QB', 88)], { formation: OFFENSE_FORMATION, manualOrder: {} })
    const lt = chart.find(s => s.id === 'LT')
    expect(lt.starter).toBe(null)
    expect(lt.isHole).toBe(true)
    expect(lt.grade).toBe('F')
  })

  it('respects manual order before OVR', () => {
    const projected = [mk('qb1', 'QB', 88), mk('qb2', 'QB', 70)]
    const chart = buildDepthChart(projected, { formation: OFFENSE_FORMATION, manualOrder: { QB: ['qb2', 'qb1'] } })
    expect(chart.find(s => s.id === 'QB').starter.pid).toBe('qb2')
  })
})

describe('isPortalRisk', () => {
  it('flags a returning non-senior with very low snaps', () => {
    const p = { statsByYear: { 2035: { snapsPlayed: 40 } } }
    expect(isPortalRisk(p, 2035, 'So')).toBe(true)
    expect(isPortalRisk(p, 2035, 'Sr')).toBe(false)   // seniors don't transfer down
    expect(isPortalRisk({ statsByYear: { 2035: { snapsPlayed: 600 } } }, 2035, 'So')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- depthChart`
Expected: FAIL ("Cannot find module '../depthChart'").

- [ ] **Step 3: Implement the builder**

Create `src/utils/depthChart.js`:

```js
import { groupForPosition } from '../data/positionGroups'

// OVR → letter grade. Starting bands from the spec (tunable).
export function gradeForOvr(ovr, { depth = 2, topDev = 'Normal' } = {}) {
  if (ovr == null) return 'F'
  const bands = [[90, 'A+'], [87, 'A'], [84, 'A-'], [81, 'B+'], [78, 'B'], [75, 'B-'], [70, 'C'], [0, 'D']]
  let letter = 'D'
  for (const [min, g] of bands) { if (ovr >= min) { letter = g; break } }
  // ±1 step adjustments
  const SCALE = ['F', 'D', 'C', 'B-', 'B', 'B+', 'A-', 'A', 'A+']
  let idx = SCALE.indexOf(letter)
  if (depth <= 1) idx = Math.max(0, idx - 1)
  if (topDev === 'Elite' || topDev === 'Star') idx = Math.min(SCALE.length - 1, idx + 1)
  return SCALE[idx]
}

// A returning, non-senior buried on the depth chart (very low snaps last
// season) is a portal-flight cue. Threshold tunable.
const PORTAL_RISK_SNAP_THRESHOLD = 150
export function isPortalRisk(player, lastYear, projectedClass) {
  if (!player || projectedClass === 'Sr' || projectedClass === 'RS Sr') return false
  const s = player.statsByYear || {}
  const yr = s[lastYear] || s[String(lastYear)]
  const snaps = yr?.snapsPlayed
  if (snaps == null) return false
  return snaps < PORTAL_RISK_SNAP_THRESHOLD
}

// Order a pool: manual pids first (in that order), then the rest by OVR desc
// (nulls last). manualPids is an array of pids for this position.
function orderPool(pool, manualPids = []) {
  const byOvr = [...pool].sort((a, b) => (b.projectedOvr ?? -1) - (a.projectedOvr ?? -1))
  if (!manualPids.length) return byOvr
  const rank = new Map(manualPids.map((pid, i) => [pid, i]))
  return byOvr.sort((a, b) => {
    const ra = rank.has(a.pid) ? rank.get(a.pid) : Infinity
    const rb = rank.has(b.pid) ? rank.get(b.pid) : Infinity
    if (ra !== rb) return ra - rb
    return (b.projectedOvr ?? -1) - (a.projectedOvr ?? -1)
  })
}

// Build the per-slot depth chart for one tab's formation.
// projected: ProjectedPlayer[] (from projectRoster).
// manualOrder: { [posKey]: [pid…] } — posKey is the slot's `pos`.
export function buildDepthChart(projected, { formation, manualOrder = {}, lastYear = null }) {
  // Bucket players by exact position.
  const byPos = {}
  for (const p of projected) {
    const pos = (p.position || '').toUpperCase()
    ;(byPos[pos] ||= []).push(p)
  }
  // Group formation slots that share a `pos` so we can round-robin the pool.
  const slotsByPos = {}
  for (const s of formation) (slotsByPos[s.pos] ||= []).push(s)

  // Assign each position's ordered pool round-robin across its slots.
  const assignment = {} // slotId -> ordered players[]
  for (const [pos, slots] of Object.entries(slotsByPos)) {
    const ordered = orderPool(byPos[pos] || [], manualOrder[pos] || [])
    const buckets = slots.map(() => [])
    ordered.forEach((p, i) => buckets[i % slots.length].push(p))
    slots.forEach((s, i) => { assignment[s.id] = buckets[i] })
  }

  return formation.map(s => {
    const players = assignment[s.id] || []
    const starter = players[0] || null
    const backups = players.slice(1)
    const topDev = starter?.devTrait || 'Normal'
    return {
      id: s.id,
      label: s.label,
      pos: s.pos,
      group: s.group,
      starter,
      backups,
      isHole: !starter,
      grade: gradeForOvr(starter?.projectedOvr ?? null, { depth: players.length, topDev }),
      risk: backups.concat(starter ? [starter] : []).reduce((acc, p) => {
        if (p && !p.isIncoming && p.player && isPortalRisk(p.player, lastYear, p.projectedClass)) acc[p.pid] = true
        return acc
      }, {}),
    }
  })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- depthChart`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/depthChart.js src/utils/__tests__/depthChart.test.js
git commit -m "feat: depth-chart builder (slots, grades, holes, portal-risk)"
```

---

## Task 7: Persistence helpers on DynastyContext

**Files:**
- Modify: `src/context/DynastyContext.jsx` (add two helpers near other dynasty mutators)

Goal: read/write `dynasty.teamFuture.{depthOrder,leaveFlags}` keyed by tid via the existing `updateDynasty` dot-notation path (mirrors `preseasonSetup.*` writes). No new test — exercised via UI; keep functions tiny.

- [ ] **Step 1: Locate `updateDynasty`**

Run: `grep -n "const updateDynasty\|updateDynasty =\|return.*updateDynasty\|value={{" src/context/DynastyContext.jsx | head`
Expected: find the `updateDynasty(id, updates, opts)` definition and the context `value` object that exposes it to `useDynasty`.

- [ ] **Step 2: Add helpers exposed via context value**

Inside the provider, near other small mutators, add:

```js
// Team Future: persist a position's manual depth order for a team.
const saveDepthOrder = (dynastyId, tid, pos, pidOrder) =>
  updateDynasty(dynastyId, { [`teamFuture.depthOrder.${tid}.${pos}`]: pidOrder })

// Team Future: persist the set of "likely to leave" pids for a team.
const saveLeaveFlags = (dynastyId, tid, pids) =>
  updateDynasty(dynastyId, { [`teamFuture.leaveFlags.${tid}`]: pids })
```

Then add `saveDepthOrder` and `saveLeaveFlags` to the context `value={{ … }}` object so `useDynasty()` exposes them.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: builds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/context/DynastyContext.jsx
git commit -m "feat: persistence helpers for Team Future depth order + leave flags"
```

---

## Task 8: The Team Future page

**Files:**
- Create: `src/pages/dynasty/TeamFuture.jsx`

This is a UI task — verified manually in the running app (`npm run dev`), per the spec. Build it in one component file with a `PositionCard` subcomponent.

- [ ] **Step 1: Scaffold the page (controls + data wiring)**

Create `src/pages/dynasty/TeamFuture.jsx`:

```jsx
import { useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { PageHero, Card, EmptyState, Select } from '../../components/ui'
import { proxyImageUrl } from '../../utils/imageProxy'
import { projectRoster } from '../../utils/rosterProjection'
import { buildDepthChart } from '../../utils/depthChart'
import { TAB_FORMATIONS } from '../../data/positionGroups'

const TABS = [
  { key: 'offense', label: 'Offense' },
  { key: 'defense', label: 'Defense' },
  { key: 'st', label: 'Special Teams' },
]
const DEV_BORDER = { Elite: '#f5c518', Star: '#ef4444', Impact: '#3b82f6', Normal: '#5b6472' }
const GRADE_COLOR = (g) => g[0] === 'A' ? '#4ade80' : g[0] === 'B' ? '#86efac' : g[0] === 'C' ? '#fde047' : g[0] === 'D' ? '#fb923c' : '#fca5a5'

export default function TeamFuture() {
  const { id: dynastyId } = useParams()
  const { currentDynasty, isViewOnly, saveDepthOrder, saveLeaveFlags } = useDynasty()
  const tid = currentDynasty?.currentTid
  const currentYear = Number(currentDynasty?.currentYear)

  const [tab, setTab] = useState('offense')
  const [year, setYear] = useState(currentYear)

  // Year options: every tracked season → +4 future.
  const years = useMemo(() => {
    const ys = new Set()
    for (const p of currentDynasty?.players || []) {
      for (const y of Object.keys(p.teamsByYear || {})) ys.add(Number(y))
    }
    const min = ys.size ? Math.min(...ys, currentYear) : currentYear
    const out = []
    for (let y = min; y <= currentYear + 4; y++) out.push(y)
    return out
  }, [currentDynasty, currentYear])

  const leaveFlagList = currentDynasty?.teamFuture?.leaveFlags?.[tid] || []
  const leaveFlags = useMemo(() => new Set(leaveFlagList), [leaveFlagList])
  const manualOrder = currentDynasty?.teamFuture?.depthOrder?.[tid] || {}

  const chart = useMemo(() => {
    if (!currentDynasty || tid == null) return []
    const projected = projectRoster(currentDynasty, tid, year, { leaveFlags })
    return buildDepthChart(projected, { formation: TAB_FORMATIONS[tab], manualOrder, lastYear: currentYear })
  }, [currentDynasty, tid, year, tab, leaveFlags, manualOrder, currentYear])

  if (!currentDynasty) return null
  if (tid == null) {
    return <Card><EmptyState title="No team selected" message="Set your current team to use Team Future." /></Card>
  }

  const yearLabel = year < currentYear ? `${year} (history)` : year === currentYear ? `${year} (now)` : `${year} (+${year - currentYear})`

  return (
    <div className="space-y-6">
      <PageHero eyebrow="Outlook" title="Team Future" meta={<span>{yearLabel}</span>} />

      <div className="flex items-center justify-between gap-3 flex-wrap border-b" style={{ borderColor: 'var(--surface-4)' }}>
        <div className="flex gap-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="px-4 py-2 text-xs font-bold uppercase tracking-wider"
              style={{ color: tab === t.key ? 'var(--text-primary)' : 'var(--text-tertiary)', borderBottom: tab === t.key ? '3px solid #22d3ee' : '3px solid transparent' }}>
              {t.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-txt-tertiary pb-2">Season
          <Select size="sm" value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map(y => <option key={y} value={String(y)}>{y < currentYear ? y : y === currentYear ? `${y} — Now` : `${y} (+${y - currentYear})`}</option>)}
          </Select>
        </label>
      </div>

      {/* Card grid rendered in Step 2 */}
      <CardGrid chart={chart} year={year} currentYear={currentYear} isViewOnly={isViewOnly}
        tid={tid} dynastyId={dynastyId} manualOrder={manualOrder} leaveFlagList={leaveFlagList}
        saveDepthOrder={saveDepthOrder} saveLeaveFlags={saveLeaveFlags} />
    </div>
  )
}
```

Run: `npm run build` → builds (CardGrid/PositionCard added next step will be undefined — add them in Step 2 before building; for now this step is the scaffold).

- [ ] **Step 2: Add `CardGrid` + `PositionCard` with interactions**

Append to `src/pages/dynasty/TeamFuture.jsx` (same file, below the default export):

```jsx
function CardGrid({ chart, year, currentYear, isViewOnly, tid, dynastyId, manualOrder, leaveFlagList, saveDepthOrder, saveLeaveFlags }) {
  const editable = !isViewOnly && year >= currentYear

  // Move a pid up/down within its position's manual order, then save.
  const reorder = (pos, slotPlayers, pid, dir) => {
    const current = (manualOrder[pos] && manualOrder[pos].length)
      ? manualOrder[pos].filter(p => slotPlayers.some(sp => sp.pid === p))
      : slotPlayers.map(p => p.pid).filter(Boolean)
    const i = current.indexOf(pid)
    const j = i + dir
    if (i < 0 || j < 0 || j >= current.length) return
    ;[current[i], current[j]] = [current[j], current[i]]
    saveDepthOrder(dynastyId, tid, pos, current)
  }

  const toggleLeave = (pid) => {
    const next = leaveFlagList.includes(pid) ? leaveFlagList.filter(p => p !== pid) : [...leaveFlagList, pid]
    saveLeaveFlags(dynastyId, tid, next)
  }

  // Group slots into rows: OL+TE / skill for offense; DL / LB / DB for defense; one row for ST.
  return (
    <div className="flex flex-wrap gap-3 justify-center">
      {chart.map(slot => (
        <PositionCard key={slot.id} slot={slot} editable={editable}
          onUp={(pid) => reorder(slot.pos, [slot.starter, ...slot.backups].filter(Boolean), pid, -1)}
          onDown={(pid) => reorder(slot.pos, [slot.starter, ...slot.backups].filter(Boolean), pid, +1)}
          onToggleLeave={toggleLeave} leaveFlagList={leaveFlagList} />
      ))}
    </div>
  )
}

function PositionCard({ slot, editable, onUp, onDown, onToggleLeave, leaveFlagList }) {
  const { starter, backups, grade, isHole } = slot
  const border = starter ? (DEV_BORDER[starter.devTrait] || DEV_BORDER.Normal) : '#dc2626'
  const flagged = starter && leaveFlagList.includes(starter.pid)

  return (
    <div style={{ width: 150 }}>
      <div className="rounded-lg overflow-hidden" style={{ background: '#1b1b1b', border: `1px solid ${flagged ? '#dc2626' : '#333'}`, borderTopWidth: 4, borderTopColor: flagged ? '#dc2626' : border }}>
        <div className="flex items-center justify-between px-2 py-1" style={{ background: '#0f0f0f' }}>
          <span className="text-[10px] font-bold tracking-wide text-txt-tertiary">{slot.label}</span>
          <span className="text-xs font-black tabular-nums">{starter?.projectedOvr ?? '—'}</span>
        </div>
        <div className="h-[64px] flex items-center justify-center" style={{ background: isHole ? '#1a0f10' : 'radial-gradient(circle at 50% 30%,#33405a,#181d28)' }}>
          {starter && !starter.isIncoming && starter.player?.pictureUrl
            ? <img src={proxyImageUrl(starter.player.pictureUrl, 300)} alt="" className="w-12 h-12 rounded-full object-cover" style={{ border: '2px solid #61708a' }} />
            : <div className="w-12 h-12 rounded-full" style={{ background: isHole ? 'transparent' : '#46566f' }} />}
        </div>
        <div className="px-2 py-1 text-center">
          <div className="text-[12px] font-bold truncate" style={{ color: isHole ? '#f87171' : 'var(--text-primary)' }}>
            {isHole ? 'EMPTY' : starter.name}{starter?.isIncoming && starter.stars ? ` ★${starter.stars}` : ''}
          </div>
          <div className="text-[10px] text-txt-tertiary">{isHole ? 'no projected starter' : starter.projectedClass}{flagged ? ' · LIKELY OUT' : ''}</div>
          {editable && starter && !starter.isIncoming && (
            <div className="flex justify-center gap-2 mt-1 text-[10px]">
              <button onClick={() => onUp(starter.pid)} title="Move up">▲</button>
              <button onClick={() => onDown(starter.pid)} title="Move down">▼</button>
              <button onClick={() => onToggleLeave(starter.pid)} title="Flag likely to leave" style={{ color: flagged ? '#dc2626' : '#888' }}>⚑</button>
            </div>
          )}
        </div>
        {backups.map(b => (
          <div key={b.key} className="flex justify-between items-center px-2 py-1 text-[11px]" style={{ borderTop: '1px solid #242424', background: b.isIncoming ? '#10233d' : 'transparent' }}>
            <span className="truncate mr-2" style={{ color: b.isIncoming ? '#7fb0f5' : (slot.risk?.[b.pid] ? '#f87171' : '#bdbdbd') }}>
              {b.name}{b.isIncoming && b.stars ? ` ★${b.stars}` : ''}{slot.risk?.[b.pid] ? ' ⚑' : ''}
            </span>
            <span className="tabular-nums font-bold">{b.projectedOvr ?? '—'}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-2 mt-1 font-black text-sm">
        {slot.label} <span className="font-mono text-[11px] px-1.5 rounded" style={{ background: '#161616', color: GRADE_COLOR(grade) }}>{grade}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: builds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/dynasty/TeamFuture.jsx
git commit -m "feat: Team Future depth-chart page"
```

---

## Task 9: Wire route + lazy import + sidebar nav

**Files:**
- Modify: `src/routes/lazyPages.js`
- Modify: `src/App.jsx`
- Modify: `src/components/Sidebar.jsx`

- [ ] **Step 1: Add the lazy page + preload entry**

In `src/routes/lazyPages.js`, add after the `PromptStudio` export:

```js
export const TeamFuture = lazyWithPreload(() => import('../pages/dynasty/TeamFuture'))
```

And add to the `preloadByNavName` map:

```js
'Team Future': TeamFuture.preload,
```

- [ ] **Step 2: Register the route**

In `src/App.jsx`, add `TeamFuture` to the import from `'./routes/lazyPages'` (line ~24-30), then add a nested route under `/dynasty/:id` (after the `recruiting` routes, ~line 153):

```jsx
<Route path="team-future" element={<TeamFuture />} />
```

- [ ] **Step 3: Add the sidebar nav item**

In `src/components/Sidebar.jsx`, in the `navItems` array (~line 92), add after the Recruiting item:

```js
{ name: 'Team Future', path: `${pathPrefix}/team-future` },
```

- [ ] **Step 4: Build + manual verify navigation**

Run: `npm run build` (expect clean), then `npm run dev` and:
- Click **Team Future** in the sidebar → page loads.
- Confirm Offense/Defense/ST tabs switch, the season dropdown lists past seasons → +4, and cards render with headshots.

- [ ] **Step 5: Commit**

```bash
git add src/routes/lazyPages.js src/App.jsx src/components/Sidebar.jsx
git commit -m "feat: route + sidebar nav for Team Future"
```

---

## Task 10: Manual verification + version stamp

**Files:**
- Modify: `vite.config.js` (bump `MANUAL_BUILD`)

- [ ] **Step 1: Verify behavior in the dev app**

With `npm run dev` running, on your team:
- **Present year**: starters auto-sorted by OVR; grades + dev-trait border colors show.
- **Future year (+1/+2)**: graduating seniors gone; returners aged a class with carried-forward OVR; incoming recruits appear as blue ★ depth; holes show EMPTY red cards.
- **Past year**: that season's real roster, view-only (no ▲▼/flag controls).
- **Reorder**: ▲▼ on a starter moves it and persists across a reload.
- **Leave flag**: ⚑ marks a player; in a future year they disappear from the chart.
- **Portal risk**: a low-snap returner shows the ⚑ risk styling on their row.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all suites PASS.

- [ ] **Step 3: Bump MANUAL_BUILD + build**

In `vite.config.js`, increment `MANUAL_BUILD` by one (per repo policy), then:
Run: `npm run build`
Expected: clean build; `dist/index.html` updated.

- [ ] **Step 4: Commit (do not push unless asked)**

```bash
git add -A src/ vite.config.js && git add -f dist/index.html
git commit -m "feat: Team Future projected depth chart"
```

---

## Notes / future phases (out of scope here)

- **Needs board** (ranked needs table) — deferred per spec; revisit after this ships.
- **Team picker** — v1 is the user's current team only.
- Drag-and-drop reordering (v1 uses ▲▼ buttons, which satisfy "move up/down + save").
