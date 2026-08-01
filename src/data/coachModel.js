// Coach entity model — cid-keyed coaches (head coaches AND coordinators).
//
// Mirrors the player model: a stable `cid` identity + per-season records.
// This is the SINGLE SOURCE OF TRUTH for coach identity + career. A coach
// is decoupled from the user account: `controlledBy` links it to a Firebase
// uid (the user who "plays" it) or is null for an NPC nobody controls.
//
//   - A user's head coach:  controlledBy = their uid, role 'HC'.
//   - An NPC coordinator:   controlledBy = null,      role 'OC' | 'DC'.
//   - One user can control SEVERAL coaches (separate tracked careers) —
//     that's how "running multiple teams" is modelled: one coach per team.
//
// Access control stays uid-keyed on the dynasty doc (userId / editors /
// coCommishes). `dynasty.memberTeams[uid]` is no longer authoritative — it
// survives ONLY as a derived security index (current-year teams of the
// coaches a uid controls) so firestore.rules can gate member game writes
// without traversing the coaches map. Re-derive it via deriveMemberTeamsIndex
// on every controlled-coach team change (use applyControlledCoachTeam).
//
// The legacy name-only coaching staff (teams[tid].byYear[year].coachingStaff
// .{hcName,ocName,dcName}) still mirrors cid coaches via the bridge below so
// existing pages/recaps keep working.
//
// Shape:
//   dynasty.coaches[cid] = {
//     cid, name, photo?, controlledBy: uid|null,
//     archetype?, abilities?: string[], notes?,
//     status: 'active' | 'departed', departedYear?: number|null,
//     byYear: { [year]: { teamTid, role, level, salary, hiredVia } }
//   }
//   role:     'HC' | 'OC' | 'DC'
//   salary:   Dynasty Points earned that season (CFB 27)
//   hiredVia: 'carousel' | 'free_agent' | 'retained' | 'promoted'

export const COACH_ROLES = ['HC', 'OC', 'DC']

export const COACH_ROLE_LABELS = {
  HC: 'Head Coach',
  OC: 'Offensive Coordinator',
  DC: 'Defensive Coordinator',
}

export const HIRED_VIA_OPTIONS = [
  { key: 'carousel', label: 'Coaching Carousel' },
  { key: 'free_agent', label: 'Free Agent' },
  { key: 'retained', label: 'Retained' },
  { key: 'promoted', label: 'Promoted' },
]

// Short, stable coach id. App-runtime only (Math.random is fine here).
export function generateCid() {
  const rand = Math.random().toString(36).slice(2, 8)
  const stamp = Date.now().toString(36).slice(-4)
  return `c_${rand}${stamp}`
}

// ── reads ────────────────────────────────────────────────────────────

export function getCoaches(dynasty) {
  return dynasty?.coaches || {}
}

export function getCoach(dynasty, cid) {
  return dynasty?.coaches?.[cid] || null
}

// Synthesize the OWNER's coach from the durable per-year team record
// (coachTeamByYear) when NO real coach entity is linked to them. This is the
// safety net for two states that otherwise leave the owner with no selectable
// coach — so their Career page AND Trophy Room come up blank:
//   1. Coaching-carousel dynasties, where every generated coach carries
//      controlledBy:null and the owner's own team-HC is fragmented into separate
//      per-year entries (none linked to the user).
//   2. Any save whose owner→coach linkage was lost or never set.
// coachTeamByYear is the authoritative, strictly-tid-based record of the team
// the user coached each season, so the owner's whole career reconstructs from it
// (spanning every year) and every completed-season trophy flows through.
export function synthOwnerCoachFromCoachTeamByYear(dynasty) {
  const ownerUid = dynasty?.userId
  const ctby = dynasty?.coachTeamByYear
  if (!ownerUid || !ctby || typeof ctby !== 'object') return null
  const byYear = {}
  for (const [y, e] of Object.entries(ctby)) {
    if (!Number.isFinite(Number(y))) continue
    const tid = Number(e?.tid ?? e?.teamTid ?? (typeof e === 'number' ? e : NaN))
    if (!Number.isFinite(tid)) continue
    byYear[String(y)] = { teamTid: tid, role: e?.position || 'HC' }
  }
  if (!Object.keys(byYear).length) return null
  return {
    cid: `owner-${ownerUid}`,
    name: dynasty.memberLabels?.[ownerUid] || '',
    controlledBy: ownerUid,
    status: 'active',
    departedYear: null,
    byYear,
    _synthesized: true,
  }
}

// Every coach with a record on a given team in a given year, as
// { coach, record }. Useful for a team's staff list.
export function getStaffForTeamYear(dynasty, tid, year) {
  const coaches = getCoaches(dynasty)
  const tidNum = Number(tid)
  const yearKey = String(year)
  const out = []
  for (const coach of Object.values(coaches)) {
    const record = coach?.byYear?.[yearKey]
    if (record && Number(record.teamTid) === tidNum) out.push({ coach, record })
  }
  // Stable role order: HC, OC, DC, then anything else.
  return out.sort((a, b) => COACH_ROLES.indexOf(a.record.role) - COACH_ROLES.indexOf(b.record.role))
}

// The coach filling a specific role on a team in a year (first match).
export function getCoachByRole(dynasty, tid, year, role) {
  return getStaffForTeamYear(dynasty, tid, year).find((s) => s.record.role === role) || null
}

// Career roll-up derived from byYear — no stored duplication.
export function getCoachCareer(coach) {
  const byYear = coach?.byYear || {}
  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b)
  const totalSalary = years.reduce((sum, y) => sum + (Number(byYear[String(y)].salary) || 0), 0)
  const teams = [...new Set(years.map((y) => byYear[String(y)].teamTid))]
  const current = years.length ? byYear[String(years[years.length - 1])] : null
  return { years, seasons: years.length, totalSalary, teams, current }
}

// ── writes (pure: produce the next object, caller persists) ──────────

export function upsertCoach(coaches, coach) {
  return { ...(coaches || {}), [coach.cid]: coach }
}

export function deleteCoach(coaches, cid) {
  const next = { ...(coaches || {}) }
  delete next[cid]
  return next
}

// Merge a single season's fields into a coach's byYear map.
export function setCoachSeason(coach, year, record) {
  const yearKey = String(year)
  return {
    ...coach,
    byYear: {
      ...(coach.byYear || {}),
      [yearKey]: { ...(coach.byYear?.[yearKey] || {}), ...record },
    },
  }
}

export function removeCoachSeason(coach, year) {
  const yearKey = String(year)
  const nextByYear = { ...(coach.byYear || {}) }
  delete nextByYear[yearKey]
  return { ...coach, byYear: nextByYear }
}

// ── control + derived security index ─────────────────────────────────
//
// `controlledBy` links a coach to the user (uid) who plays it, or null.
// `dynasty.memberTeams[uid]` is a DERIVED index — the current-year teams
// of the coaches a uid controls — kept only so firestore.rules can gate
// member game writes. Re-derive it on every controlled-coach team change.

/** True iff `cid` looks like a coach-entity id (not a uid / lc_ id). */
export function isCoachId(id) {
  return typeof id === 'string' && id.startsWith('c_')
}

/** All coaches a given uid controls (controlledBy === uid). */
export function getCoachesControlledBy(dynasty, uid) {
  if (!uid) return []
  return Object.values(getCoaches(dynasty)).filter((c) => c && c.controlledBy === uid)
}

/** The coach `uid` controls whose team in `year` is `tid` (first match). */
export function getActiveCoachForTeam(dynasty, uid, tid, year) {
  if (!uid || tid == null) return null
  const tidNum = Number(tid)
  const yearKey = String(year)
  return (
    getCoachesControlledBy(dynasty, uid).find(
      (c) => Number(c.byYear?.[yearKey]?.teamTid) === tidNum,
    ) || null
  )
}

/**
 * The team a coach controls "right now". Prefers next year's record when it
 * exists — that's the carousel case: a coach who accepted a new job in the
 * postseason already has byYear[currentYear+1] = newTeam while byYear[current
 * Year] still holds the team they just finished the season with. Otherwise
 * the current year's team. Returns null for a departed coach with neither
 * (so they drop out of the "currently controls" set).
 */
export function getCurrentTeamTidForCoach(coach, currentYear) {
  const cy = Number(currentYear)
  if (!Number.isFinite(cy)) {
    // No reference year — fall back to the latest season on record.
    const years = Object.keys(coach?.byYear || {}).map(Number).filter(Number.isFinite)
    if (!years.length) return null
    const tid = Number(coach.byYear[String(Math.max(...years))]?.teamTid)
    return Number.isFinite(tid) ? tid : null
  }
  const next = Number(coach?.byYear?.[String(cy + 1)]?.teamTid)
  if (Number.isFinite(next)) return next
  const cur = Number(coach?.byYear?.[String(cy)]?.teamTid)
  return Number.isFinite(cur) ? cur : null
}

/** Unique tids every coach `uid` controls right now (current/next-year teams). */
export function getCurrentTeamsForControlledCoaches(dynasty, uid) {
  const out = []
  for (const c of getCoachesControlledBy(dynasty, uid)) {
    const tid = getCurrentTeamTidForCoach(c, dynasty?.currentYear)
    if (tid != null && !out.includes(tid)) out.push(tid)
  }
  return out
}

/**
 * Rebuild the full `{ [uid]: number[] }` security index from the coaches map:
 * every controlled coach contributes the team it controls right now to its
 * controller's list. Pure — caller persists. Mirrors firestore.rules' member
 * game-write gate, which reads this index.
 */
export function deriveMemberTeamsIndex(dynasty) {
  const out = {}
  for (const c of Object.values(getCoaches(dynasty))) {
    if (!c || c.controlledBy == null) continue
    const tid = getCurrentTeamTidForCoach(c, dynasty?.currentYear)
    if (tid == null) continue
    const list = out[c.controlledBy] || (out[c.controlledBy] = [])
    if (!list.includes(tid)) list.push(tid)
  }
  return out
}

/** Pure setter for a coach's controller. */
export function setCoachControlledBy(coaches, cid, uid) {
  const coach = coaches?.[cid]
  if (!coach) return coaches || {}
  return { ...coaches, [cid]: { ...coach, controlledBy: uid ?? null } }
}

/**
 * THE chokepoint for assigning a controlled coach to a team in a year.
 * Enforces one-controlled-coach-per-team-per-year (strips the tid from any
 * OTHER controlled coach that held it that year, so a reassignment can't
 * double-attribute the team's games) and re-derives the current-year
 * security index. Returns `{ coaches, memberTeams }`; caller persists both.
 *
 * NPC coaches (controlledBy null — coordinators) are never stripped: a team
 * legitimately has an HC plus an OC/DC the same year.
 */
export function applyControlledCoachTeam(dynasty, cid, year, tid) {
  const coaches = { ...getCoaches(dynasty) }
  const target = coaches[cid]
  if (!target) return { coaches: getCoaches(dynasty), memberTeams: dynasty?.memberTeams || {} }
  const yearKey = String(year)
  const tidNum = Number(tid)
  // Strip the tid from other CONTROLLED coaches that held it this year.
  for (const [otherCid, c] of Object.entries(coaches)) {
    if (otherCid === cid || !c || c.controlledBy == null) continue
    if (Number(c.byYear?.[yearKey]?.teamTid) === tidNum) {
      coaches[otherCid] = removeCoachSeason(c, year)
    }
  }
  // Set the target coach's season (preserve an existing role, default HC).
  const existingRole = target.byYear?.[yearKey]?.role
  coaches[cid] = setCoachSeason(target, year, {
    teamTid: Number.isFinite(tidNum) ? tidNum : null,
    role: existingRole || 'HC',
  })
  const memberTeams = deriveMemberTeamsIndex({ ...dynasty, coaches })
  return { coaches, memberTeams }
}

/**
 * Carry every active controlled coach forward into `newYear` (the season
 * being entered) by copying their most-recent prior season's team — UNLESS
 * they already have a record for newYear (e.g. they accepted a new job,
 * which already stamped it). Non-overwriting, mirroring snapshotAllMembers-
 * ForYear's contract. Returns the next coaches map (caller persists).
 */
export function carryForwardControlledCoaches(coaches, newYear) {
  const ny = Number(newYear)
  if (!Number.isFinite(ny)) return coaches || {}
  const next = { ...(coaches || {}) }
  for (const [cid, c] of Object.entries(next)) {
    if (!c || c.controlledBy == null || c.status === 'departed') continue
    if (c.byYear?.[String(ny)] != null) continue
    const priorYears = Object.keys(c.byYear || {}).map(Number).filter(y => Number.isFinite(y) && y < ny)
    if (!priorYears.length) continue
    const prev = c.byYear[String(Math.max(...priorYears))]
    const tid = Number(prev?.teamTid)
    if (!Number.isFinite(tid)) continue
    next[cid] = setCoachSeason(c, ny, { teamTid: tid, role: prev.role || 'HC' })
  }
  return next
}

// ── legacy name bridge ───────────────────────────────────────────────
//
// The team header popup + Dashboard read legacy name-only fields
// (teams[tid].byYear[year].coachingStaff.{hcName,ocName,dcName}). These
// helpers keep those names in sync with the cid coaches so the tracked
// coordinators surface everywhere the old names do.

const ROLE_TO_NAME_FIELD = { HC: 'hcName', OC: 'ocName', DC: 'dcName' }

// Derive the legacy {hcName,ocName,dcName} for a team-year from cid coaches.
// Only roles that have a cid coach are included — so existing manually-typed
// names for other roles are left untouched. Pass clearRoles to explicitly
// null out a role that no longer has any cid coach (used on removal).
export function deriveCoachingStaffNames(coaches, tid, year, { clearRoles = [] } = {}) {
  const yearKey = String(year)
  const tidNum = Number(tid)
  const names = {}
  for (const coach of Object.values(coaches || {})) {
    const rec = coach?.byYear?.[yearKey]
    if (!rec || Number(rec.teamTid) !== tidNum) continue
    const field = ROLE_TO_NAME_FIELD[rec.role]
    if (field && !(field in names)) names[field] = coach.name || null
  }
  for (const role of clearRoles) {
    const field = ROLE_TO_NAME_FIELD[role]
    if (field && !(field in names)) names[field] = null
  }
  return names
}

// Merge derived names into a teams object's coachingStaff for a team-year,
// returning the next teams object (non-destructive on untouched fields).
export function applyCoachingStaffNames(teams, tid, year, names) {
  const yearKey = String(year)
  const team = teams?.[tid] || {}
  const byYear = team.byYear || {}
  const yearData = byYear[yearKey] || {}
  return {
    ...(teams || {}),
    [tid]: {
      ...team,
      byYear: {
        ...byYear,
        [yearKey]: {
          ...yearData,
          coachingStaff: { ...(yearData.coachingStaff || {}), ...names },
        },
      },
    },
  }
}

const normName = (n) => (n || '').trim().toLowerCase()

// Forward-sync the OC/DC names a user just entered on a team-year's coaching
// staff into cid coach entities (NPC coordinators, controlledBy = null), so a
// freshly recorded coordinator becomes a real, linkable coach IMMEDIATELY —
// the same end state migrateLegacyCoachesToCids produces, but scoped to this
// one team-year and run at SAVE time instead of only via the admin migration.
// Without this, saveCoachingStaff wrote the names into coachingStaff but never
// minted the cid coaches, so coordinators stayed unlinkable until an admin ran
// the migration. HC is intentionally excluded: on the user's team the head
// coach is the user (a controlled uid coach), never an NPC cid.
// Pure — returns the next coaches map; the caller persists it.
export function syncCoordinatorCoachesForTeamYear(coaches, tid, year, staff) {
  if (tid == null) return coaches || {}
  const next = { ...(coaches || {}) }
  const tidNum = Number(tid)
  const yearKey = String(year)
  const byName = new Map()
  for (const c of Object.values(next)) {
    if (c?.name) byName.set(normName(c.name), c.cid)
  }
  const roleFields = [['OC', 'ocName'], ['DC', 'dcName']]
  for (const [role, field] of roleFields) {
    const name = (staff?.[field] || '').trim()
    // The cid coach (if any) currently filling this role on this team-year.
    const existing = Object.values(next).find((c) => {
      const r = c?.byYear?.[yearKey]
      return r && Number(r.teamTid) === tidNum && r.role === role
    })

    // Drop the old coach's record for this team-year (used on both a cleared
    // coordinator and a replacement). Deletes the entity if that empties it —
    // but never a controlled coach.
    const vacateExisting = () => {
      if (!existing) return
      const trimmed = removeCoachSeason(existing, year)
      next[existing.cid] = trimmed
      if (existing.controlledBy == null && Object.keys(trimmed.byYear || {}).length === 0) {
        delete next[existing.cid]
      }
    }

    if (!name) {
      // Coordinator cleared — vacate the slot.
      vacateExisting()
      continue
    }
    if (existing && normName(existing.name) === normName(name)) {
      continue // Already tracked under the same name — nothing to do.
    }
    if (existing) {
      // A DIFFERENT name now fills the slot: treat as a replacement, not a
      // rename (a rename would rewrite the old coordinator's whole career).
      vacateExisting()
    }

    // Reuse an existing coach entity with this name (a coordinator who moved
    // here), else mint a new NPC coach.
    const reuseCid = byName.get(normName(name))
    if (reuseCid && next[reuseCid]) {
      next[reuseCid] = setCoachSeason(next[reuseCid], year, { teamTid: tidNum, role, level: null, salary: null })
    } else {
      const coach = makeCoach({ name, year, teamTid: tidNum, role, level: null, salary: null })
      next[coach.cid] = coach
      byName.set(normName(name), coach.cid)
    }
  }
  return next
}

// ── migration ────────────────────────────────────────────────────────
//
// Turn legacy name-only coordinators (teams[tid].byYear[year].coachingStaff
// .{ocName,dcName}, across every team-season) into cid coaches carrying
// their year-by-year team + role history. HC is intentionally skipped — on
// the user's team that's the user (uid), not an NPC cid. Salaries were never
// recorded historically, so they start null. Idempotent: a role already
// filled by a cid coach for a team-year is left alone, so re-running is safe.

function roleFilledByCid(coaches, tid, year, role) {
  const tidNum = Number(tid)
  const yearKey = String(year)
  return Object.values(coaches).some((c) => {
    const r = c?.byYear?.[yearKey]
    return r && Number(r.teamTid) === tidNum && r.role === role
  })
}

export function migrateLegacyCoachesToCids(dynasty) {
  const teams = dynasty?.teams || {}
  const coaches = { ...(dynasty?.coaches || {}) }
  const byName = new Map()
  for (const c of Object.values(coaches)) {
    if (c?.name) byName.set(normName(c.name), c.cid)
  }
  let created = 0
  let seasonsAdded = 0
  const roleFields = [['OC', 'ocName'], ['DC', 'dcName']]

  for (const [tid, team] of Object.entries(teams)) {
    const byYear = team?.byYear || {}
    for (const [year, yearData] of Object.entries(byYear)) {
      const cs = yearData?.coachingStaff
      if (!cs) continue
      for (const [role, field] of roleFields) {
        const name = (cs[field] || '').trim()
        if (!name) continue
        // Don't clobber a role already tracked via a cid coach.
        if (roleFilledByCid(coaches, tid, year, role)) continue
        let cid = byName.get(normName(name))
        if (!cid) {
          cid = generateCid()
          coaches[cid] = { cid, name, status: 'active', departedYear: null, byYear: {} }
          byName.set(normName(name), cid)
          created++
        }
        if (!coaches[cid].byYear?.[String(year)]) {
          coaches[cid] = setCoachSeason(coaches[cid], year, {
            teamTid: Number(tid),
            role,
            level: null,
            salary: null,
          })
          seasonsAdded++
        }
      }
    }
  }
  return { coaches, created, seasonsAdded }
}

// ── controlled-coach migration (legacy uid-keyed → coach entities) ───
//
// SAFETY CONTRACT (existing saves are years deep — do not corrupt them):
//   • ADDITIVE: only adds `dynasty.coaches` entries + the `_coachesControl-
//     Migrated` flag. NEVER deletes or mutates memberLabels / memberTeams /
//     memberTeamHistory / memberPhotos / memberCoachingStaff / localCoaches /
//     coachTeamByYear — they stay intact for fallback + rollback + re-migration.
//   • FAIL-SAFE: any error returns the dynasty unchanged (no coaches, no flag).
//   • IDEMPOTENT: skips entirely once migrated (flag set OR any controlled
//     coach already exists), so a re-run never resurrects deleted coaches or
//     clobbers the user's edits.
//   • LAZY: computed in-memory on load; persisted only when the user next
//     mutates a coach (the caller does NOT auto-write it to the cloud doc).

const LC_PREFIX = 'lc_'

export function needsCoachesControlMigration(dynasty) {
  if (!dynasty) return false
  if (dynasty._coachesControlMigrated) return false
  const coaches = dynasty.coaches
  if (coaches && typeof coaches === 'object') {
    // A controlled coach already present means migration (or a real edit)
    // happened — never re-derive over it, even if the flag didn't persist.
    for (const c of Object.values(coaches)) {
      if (c && c.controlledBy != null) return false
    }
  }
  return true
}

// { [yearNumber]: number[] } from memberTeamHistory[id], cleaned. The CURRENT
// season is usually absent from history (it's only stamped on season advance),
// so it's merged in from the live memberTeams[id] — otherwise the team the user
// is on RIGHT NOW would be missed and the coach would show "no team".
function buildYearTidsForId(dynasty, id) {
  const out = {}
  const hist = dynasty?.memberTeamHistory?.[id]
  if (hist && typeof hist === 'object') {
    for (const [yStr, tids] of Object.entries(hist)) {
      const y = Number(yStr)
      if (!Number.isFinite(y) || !Array.isArray(tids)) continue
      const cleaned = tids.map(Number).filter(Number.isFinite)
      if (cleaned.length) out[y] = cleaned
    }
  }
  const cy = Number(dynasty?.currentYear)
  if (Number.isFinite(cy) && !out[cy]) {
    const live = dynasty?.memberTeams?.[id]
    if (Array.isArray(live) && live.length) {
      const cleaned = live.map(Number).filter(Number.isFinite)
      if (cleaned.length) out[cy] = cleaned
    }
  }
  return out
}

// Owner with no memberTeamHistory (pre-multiplayer save): rebuild from the
// legacy coachTeamByYear map, else fall back to the current team/year so the
// owner always lands at least one coach.
function buildOwnerFallbackYearTids(dynasty) {
  const out = {}
  const ctby = dynasty?.coachTeamByYear
  if (ctby && typeof ctby === 'object') {
    for (const [yStr, entry] of Object.entries(ctby)) {
      const y = Number(yStr)
      if (!Number.isFinite(y)) continue
      const tid = Number(entry?.tid ?? entry?.team ?? entry)
      if (Number.isFinite(tid)) out[y] = [tid]
    }
  }
  if (Object.keys(out).length === 0) {
    const cur = Number(dynasty?.currentTid)
    const cy = Number(dynasty?.currentYear)
    if (Number.isFinite(cur) && Number.isFinite(cy)) out[cy] = [cur]
  }
  return out
}

// One person's year→tids history → coach entities. The PRIMARY coach takes
// the first tid each year (so a carousel career that changes teams stays ONE
// coach). Extra simultaneous teams (index ≥ 1 — the old "shepherd multiple
// teams" case) each become their OWN coach: that's the separate-careers model.
function buildControlledCoachesForId(yearTids, controllerUid, name, photo) {
  const years = Object.keys(yearTids).map(Number).filter(Number.isFinite).sort((a, b) => a - b)
  if (!years.length) return []
  const primaryByYear = {}
  const overflow = {} // tid -> Set(year)
  for (const y of years) {
    const tids = yearTids[y]
    if (!Array.isArray(tids) || !tids.length) continue
    primaryByYear[String(y)] = { teamTid: tids[0], role: 'HC' }
    for (let i = 1; i < tids.length; i++) {
      const t = tids[i]
      ;(overflow[t] || (overflow[t] = new Set())).add(y)
    }
  }
  const cleanName = (name || '').trim()
  const mk = (byYear) => ({
    cid: generateCid(),
    name: cleanName,
    controlledBy: controllerUid,
    ...(photo ? { photo } : {}),
    status: 'active',
    departedYear: null,
    byYear,
  })
  const out = []
  if (Object.keys(primaryByYear).length) out.push(mk(primaryByYear))
  for (const [tidStr, yearSet] of Object.entries(overflow)) {
    const tid = Number(tidStr)
    const byYear = {}
    for (const y of yearSet) byYear[String(y)] = { teamTid: tid, role: 'HC' }
    out.push(mk(byYear))
  }
  return out
}

export function migrateDynastyToCoaches(dynasty, currentYear) {
  try {
    if (!needsCoachesControlMigration(dynasty)) return dynasty
    const coaches = { ...(dynasty.coaches || {}) }

    // Member ids that should become controlled HC coaches.
    const memberIds = new Set()
    if (dynasty.userId) memberIds.add(dynasty.userId)
    for (const u of Array.isArray(dynasty.editors) ? dynasty.editors : []) memberIds.add(u)
    for (const m of [dynasty.memberLabels, dynasty.memberTeams, dynasty.memberTeamHistory]) {
      if (m && typeof m === 'object') for (const k of Object.keys(m)) memberIds.add(k)
    }

    const cy = Number(dynasty.currentYear)
    for (const id of memberIds) {
      if (typeof id !== 'string' || id.startsWith(LC_PREFIX)) continue // lc_ handled below
      let yearTids = buildYearTidsForId(dynasty, id)
      if (Object.keys(yearTids).length === 0 && id === dynasty.userId) {
        yearTids = buildOwnerFallbackYearTids(dynasty)
      }
      // Last resort for the owner: anchor the current season to currentTid so
      // their coach is auto-placed on the team they're playing right now.
      if (id === dynasty.userId && Number.isFinite(cy) && !yearTids[cy]) {
        const cur = Number(dynasty.currentTid)
        if (Number.isFinite(cur)) yearTids[cy] = [cur]
      }
      if (Object.keys(yearTids).length === 0) continue // member with no career yet
      const name = dynasty.memberLabels?.[id] || ''
      const photo = dynasty.memberPhotos?.[id] || null
      for (const c of buildControlledCoachesForId(yearTids, id, name, photo)) coaches[c.cid] = c
    }

    // Earlier lc_ local-coach seats → coaches controlled by their owner.
    const localCoaches = dynasty.localCoaches && typeof dynasty.localCoaches === 'object' ? dynasty.localCoaches : {}
    for (const [lcId, entry] of Object.entries(localCoaches)) {
      const owner = entry?.owner || null
      if (!owner) continue
      let yearTids = buildYearTidsForId(dynasty, lcId)
      if (Object.keys(yearTids).length === 0) {
        const live = dynasty.memberTeams?.[lcId]
        const cy = Number(dynasty.currentYear)
        if (Array.isArray(live) && live.length && Number.isFinite(cy)) {
          yearTids[cy] = live.map(Number).filter(Number.isFinite)
        }
      }
      const name = dynasty.memberLabels?.[lcId] || ''
      const photo = dynasty.memberPhotos?.[lcId] || null
      const built = buildControlledCoachesForId(yearTids, owner, name, photo)
      if (built.length) {
        for (const c of built) coaches[c.cid] = c
      } else {
        // No career at all — keep the named seat so it still shows up.
        const c = { cid: generateCid(), name: (name || '').trim(), controlledBy: owner, ...(photo ? { photo } : {}), status: 'active', departedYear: null, byYear: {} }
        coaches[c.cid] = c
      }
    }

    return { ...dynasty, coaches, _coachesControlMigrated: true }
  } catch (err) {
    console.error('[migrateDynastyToCoaches] failed — leaving save unchanged:', err)
    return dynasty
  }
}

// ── staff-moves (coaching carousel) import ───────────────────────────
//
// Fold an end-of-season Staff Moves board into the real coach-entity model so
// every coach on the carousel becomes a tracked cid with a page and a tid-by-
// year career. Called during the National Championship phase.
//
// For a board captured after season Y:
//   • Prev School + Prev Pos  → coach.byYear[Y]     (the job they just held).
//   • New School + New Pos     → coach.byYear[Y+1]  (their next job, hiredVia
//                                                    'carousel'), status active.
//   • No new school (Retired / Went to the NFL) → status 'departed', departedYear Y.
//
// Matches board names to existing coaches by normalized name (creating a new
// cid when unseen), and NEVER overwrites a user-controlled coach's tracked
// career — that path is owned by the postseason job-flip carousel. Legacy
// coachingStaff names are bridged for every touched team-year so team pages
// reflect the move. Pure — returns { coaches, teams, memberTeams }; caller persists.

function isDepartureReasonInternal(reason) {
  const r = (reason || '').toLowerCase()
  return r.includes('nfl') || r.includes('retire')
}

// Does a CONTROLLED coach already hold this team-year-role? If so we leave it
// alone — an NPC board import must never displace the user's tracked career.
function roleHeldByControlled(coaches, tid, year, role) {
  const tidNum = Number(tid)
  const yearKey = String(year)
  return Object.values(coaches).some((c) => {
    if (!c || c.controlledBy == null) return false
    const r = c.byYear?.[yearKey]
    return r && Number(r.teamTid) === tidNum && r.role === role
  })
}

export function applyStaffMovesToCoaches(dynasty, moves, year) {
  const y = Number(year)
  const coaches = { ...(dynasty?.coaches || {}) }
  const byName = new Map()
  for (const c of Object.values(coaches)) {
    if (c?.name) byName.set(normName(c.name), c.cid)
  }
  const touched = new Set() // `${tid}:${year}` team-years to bridge legacy names

  for (const mv of Array.isArray(moves) ? moves : []) {
    const name = (mv?.name || '').trim()
    if (!name) continue
    let cid = byName.get(normName(name))
    if (!cid) {
      cid = generateCid()
      coaches[cid] = { cid, name, controlledBy: null, status: 'active', departedYear: null, byYear: {} }
      byName.set(normName(name), cid)
    }
    let coach = coaches[cid]
    // Never rewrite a user-controlled coach's tracked career from an import.
    if (coach.controlledBy != null) continue

    // Previous season assignment — only fill if empty (don't clobber richer data).
    const prevTid = mv.prevTeamTid
    if (prevTid != null && mv.prevRole && !coach.byYear?.[String(y)] &&
        !roleHeldByControlled(coaches, prevTid, y, mv.prevRole)) {
      coach = setCoachSeason(coach, y, { teamTid: Number(prevTid), role: mv.prevRole })
      touched.add(`${Number(prevTid)}:${y}`)
    }

    // New season assignment (next year) or departure.
    const newTid = mv.newTeamTid
    if (newTid != null && mv.newRole) {
      if (!roleHeldByControlled(coaches, newTid, y + 1, mv.newRole)) {
        coach = setCoachSeason(coach, y + 1, { teamTid: Number(newTid), role: mv.newRole, hiredVia: 'carousel' })
        coach = { ...coach, status: 'active', departedYear: null }
        touched.add(`${Number(newTid)}:${y + 1}`)
      }
    } else if (isDepartureReasonInternal(mv.reason)) {
      coach = { ...coach, status: 'departed', departedYear: y }
    }
    coaches[cid] = coach
  }

  // Bridge legacy coachingStaff names for every touched team-year.
  let teams = dynasty?.teams || {}
  for (const key of touched) {
    const [tidStr, yrStr] = key.split(':')
    const names = deriveCoachingStaffNames(coaches, Number(tidStr), Number(yrStr))
    teams = applyCoachingStaffNames(teams, Number(tidStr), Number(yrStr), names)
  }
  const memberTeams = deriveMemberTeamsIndex({ ...dynasty, coaches })
  return { coaches, teams, memberTeams }
}

// Build a brand-new coach with a first-season record.
export function makeCoach({ name, year, teamTid, role, level, salary, hiredVia, archetype, controlledBy = null, photo = null }) {
  const cid = generateCid()
  return {
    cid,
    name: (name || '').trim(),
    controlledBy: controlledBy ?? null,
    ...(photo ? { photo } : {}),
    ...(archetype ? { archetype } : {}),
    status: 'active',
    departedYear: null,
    byYear: {
      [String(year)]: {
        teamTid: teamTid != null ? Number(teamTid) : null,
        role: role || 'OC',
        level: level != null && level !== '' ? Number(level) : null,
        salary: salary != null && salary !== '' ? Number(salary) : null,
        ...(hiredVia ? { hiredVia } : {}),
      },
    },
  }
}
