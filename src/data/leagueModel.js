/**
 * League model — the unified members + permissions schema that backs both
 * solo and multiplayer dynasties.
 *
 * CORE PRINCIPLE: every dynasty has a `members[]`. A solo dynasty is a
 * multiplayer-of-1: a single member who is auto-commish and owns all teams.
 * There is no "isMultiplayer" mode flag — N members === N members. The
 * codepath is unified.
 *
 * Schema additions to dynasty:
 *   members:    [Member]   — see Member shape below
 *   memberUids: string[]   — flat array of active member uids; mirrors
 *                            members[].uid for cheap Firestore rule checks
 *                            (`array-contains`) and "leagues I'm in" queries
 *
 * Member shape:
 *   {
 *     uid:        string|null   — null only while invitation is pending
 *                                 (we know the email but not the uid yet)
 *     email:      string        — lowercase, used as the join key for invites
 *     displayName:string|null   — optional, populated from auth on accept
 *     isCommish:  boolean       — exactly one commish per dynasty (today;
 *                                 transfer-commish is a future feature)
 *     teams:      number[]      — tids the member owns (full read+write)
 *     permissions: Permissions  — see ALL_PERMISSIONS below
 *     joinedAt:   Timestamp|Date|number — when they accepted
 *   }
 *
 * Permissions matrix:
 *   leagueSettings: bool   — edit league name, custom conferences, etc.
 *   scheduleEdit:   bool   — edit schedules for any team
 *   confSetup:      bool   — edit conference assignments
 *   pollEntry:      bool   — fill in polls / CFP seeds
 *   yearAdvance:    bool   — advance the season / week
 *   cpuGameTids:    'ALL' | number[]
 *                          — CPU teams the user can save games for. 'ALL'
 *                            means every CPU team (commish default).
 *
 * Phase 1 enforces NO write authority — these flags exist but reads are the
 * only thing gated. Phase 3 will wire them into Firestore rules + UI gates.
 */

// Sentinel value meaning "all CPU teams" (commish default).
export const CPU_GAMES_ALL = 'ALL'

// Default permission grant for a commish — full access to everything.
export const ALL_PERMISSIONS = Object.freeze({
  leagueSettings: true,
  scheduleEdit: true,
  confSetup: true,
  pollEntry: true,
  yearAdvance: true,
  cpuGameTids: CPU_GAMES_ALL,
})

// Default permission grant for a non-commish member — empty until commish
// hands out responsibilities. They can still write to their own teams'
// rosters and games (that's gated by `teams[]`, not by permissions).
export const NO_PERMISSIONS = Object.freeze({
  leagueSettings: false,
  scheduleEdit: false,
  confSetup: false,
  pollEntry: false,
  yearAdvance: false,
  cpuGameTids: [],
})

// Hard cap matching CFB 26's 32-team online dynasty cap.
export const MAX_MEMBERS_PER_LEAGUE = 32

// ─────────────────────────────────────────────────────────────────────
// Constructors
// ─────────────────────────────────────────────────────────────────────

/**
 * Build a member object. Pass `isCommish: true` to grant ALL_PERMISSIONS;
 * non-commish members start with NO_PERMISSIONS and the commish hands out
 * teams + responsibilities later.
 */
export function createMember({
  uid = null,
  email,
  displayName = null,
  isCommish = false,
  teams = [],
  permissions = null,
  joinedAt = null,
} = {}) {
  if (!email) {
    throw new Error('createMember: email is required')
  }
  return {
    uid: uid || null,
    email: String(email).toLowerCase().trim(),
    displayName: displayName || null,
    isCommish: !!isCommish,
    teams: (teams || []).map(Number).filter(Number.isFinite),
    permissions: permissions || (isCommish ? { ...ALL_PERMISSIONS } : { ...NO_PERMISSIONS }),
    joinedAt: joinedAt || new Date(),
  }
}

/**
 * Recompute the cheap-lookup `memberUids` array from members. Excludes
 * pending (uid===null) members — Firestore rules and "find leagues I'm in"
 * queries care only about active members.
 */
export function computeMemberUids(members) {
  if (!Array.isArray(members)) return []
  return members
    .filter(m => m && m.uid)
    .map(m => m.uid)
}

// ─────────────────────────────────────────────────────────────────────
// One-shot migration — every legacy dynasty gets a members[] on first
// load. Idempotent: returns the same dynasty unmodified if already
// migrated. The currentTid stays as the active-team value for now;
// Phase 2 will replace it with a per-user-session active team derived
// from the current member's teams[].
// ─────────────────────────────────────────────────────────────────────

export function needsMembersMigration(dynasty) {
  return !!dynasty
    && (!Array.isArray(dynasty.members) || dynasty.members.length === 0)
}

/**
 * Build a default members[] for a legacy solo dynasty. The dynasty owner
 * becomes the auto-commish + auto-owner of currentTid (their team).
 *
 * @param dynasty   - the legacy dynasty
 * @param fallbackEmail - email to use if the dynasty's owner has no
 *                        recorded email (e.g. local IndexedDB dynasty
 *                        created before sign-in). The currently-signed-in
 *                        user's email is the natural fallback when this
 *                        runs at load time.
 */
export function buildDefaultMembers(dynasty, fallbackEmail = '') {
  const ownerUid = dynasty?.userId || null
  const ownerEmail = dynasty?.userEmail || fallbackEmail || ''
  const ownerTid = dynasty?.currentTid != null ? Number(dynasty.currentTid) : null
  const teams = Number.isFinite(ownerTid) ? [ownerTid] : []
  return [
    createMember({
      uid: ownerUid,
      email: ownerEmail,
      isCommish: true,
      teams,
      permissions: { ...ALL_PERMISSIONS },
    }),
  ]
}

/**
 * Apply the members migration to a dynasty. Idempotent — returns the
 * input unchanged when already migrated.
 *
 * Returns a NEW object only when migration runs (so callers can detect
 * "did this need persisting").
 */
export function migrateDynastyToMembers(dynasty, fallbackEmail = '') {
  if (!needsMembersMigration(dynasty)) return dynasty
  const members = buildDefaultMembers(dynasty, fallbackEmail)
  const memberUids = computeMemberUids(members)
  return {
    ...dynasty,
    members,
    memberUids,
  }
}

// ─────────────────────────────────────────────────────────────────────
// Member lookups
// ─────────────────────────────────────────────────────────────────────

export function getMembers(dynasty) {
  return Array.isArray(dynasty?.members) ? dynasty.members : []
}

/** Find a member by uid. Returns null if not found. */
export function getMemberByUid(dynasty, uid) {
  if (!uid) return null
  return getMembers(dynasty).find(m => m && m.uid === uid) || null
}

/** Find a member by lowercased email. Returns null if not found. */
export function getMemberByEmail(dynasty, email) {
  if (!email) return null
  const target = String(email).toLowerCase().trim()
  return getMembers(dynasty).find(m => m && m.email === target) || null
}

/** Returns the commish member (or null). There is exactly one in v1. */
export function getCommishMember(dynasty) {
  return getMembers(dynasty).find(m => m && m.isCommish) || null
}

export function isCommish(dynasty, uid) {
  if (!uid) return false
  const m = getMemberByUid(dynasty, uid)
  return !!(m && m.isCommish)
}

/** True iff this user owns the given tid in this dynasty. */
export function userOwnsTeam(dynasty, uid, tid) {
  if (!uid || tid == null) return false
  const m = getMemberByUid(dynasty, uid)
  if (!m) return false
  const tNum = Number(tid)
  return (m.teams || []).some(t => Number(t) === tNum)
}

/**
 * Returns the array of tids this user owns in this dynasty. For a solo
 * dynasty this is the legacy currentTid. For multiplayer it's whatever
 * the commish has assigned.
 */
export function getOwnedTeams(dynasty, uid) {
  if (!uid) return []
  const m = getMemberByUid(dynasty, uid)
  return m ? (m.teams || []).slice() : []
}

/**
 * Permission check. Commish always returns true. Non-commish: looks up
 * the named permission on their grant. For cpuGameTids, pass an optional
 * tid to check whether they can write that specific CPU team's games.
 *
 * @param permission - one of: leagueSettings, scheduleEdit, confSetup,
 *                     pollEntry, yearAdvance, cpuGames
 * @param tid - only used when permission === 'cpuGames'
 */
export function userHasPermission(dynasty, uid, permission, tid = null) {
  if (!uid || !permission) return false
  const m = getMemberByUid(dynasty, uid)
  if (!m) return false
  if (m.isCommish) return true

  const perms = m.permissions || {}
  if (permission === 'cpuGames') {
    const cpu = perms.cpuGameTids
    if (cpu === CPU_GAMES_ALL) return true
    if (Array.isArray(cpu) && tid != null) {
      const tNum = Number(tid)
      return cpu.some(t => Number(t) === tNum)
    }
    return false
  }
  return !!perms[permission]
}

// ─────────────────────────────────────────────────────────────────────
// "Is this dynasty actually a multiplayer league?" — used for UI hints
// (e.g. show team picker only when meaningful). NOT used for codepath
// branching; everything else treats every dynasty as members[].
// ─────────────────────────────────────────────────────────────────────

/**
 * True iff this dynasty has more than one member, OR a single member who
 * owns multiple teams. Useful for deciding "should we show the team
 * picker UI" — irrelevant for a solo single-team user.
 */
export function isMultiTeamLeague(dynasty) {
  const members = getMembers(dynasty)
  if (members.length > 1) return true
  if (members.length === 1) {
    const teams = members[0]?.teams || []
    return teams.length > 1
  }
  return false
}
