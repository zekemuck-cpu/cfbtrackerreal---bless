/**
 * League sharing model — multiplayer access + roles.
 *
 * Schema on the dynasty doc:
 *   editors:      string[]               — uids with read+write access
 *   coCommishes:  string[]               — subset of editors with extra
 *                                           management rights
 *   memberLabels: { [uid]: string }      — user-friendly display names
 *                                           visible to everyone
 *   memberTeams:  { [uid]: number[] }    — tids each user "controls".
 *                                           Members are capped at 1 (UI
 *                                           gate); commish + co-commish
 *                                           can hold multiple to manage
 *                                           teams for non-premium users.
 *
 * Roles:
 *   - commish:  the dynasty owner (`userId`). Full control: invite,
 *               remove, rename, assign teams, transfer commish,
 *               promote/demote co-commishes.
 *   - cocommish: uid in coCommishes (must also be in editors). Same
 *               powers as commish EXCEPT cannot remove or demote the
 *               commish, cannot promote new co-commishes, and cannot
 *               touch other co-commishes.
 *   - member:   uid in editors but not the commish or a co-commish.
 *               Read+write on dynasty data, no membership management.
 *   - null:     no access.
 *
 * The owner is implicitly an editor — `isEditor()` treats them as such
 * even if their uid isn't in the array.
 */

// ─────────────────────────────────────────────────────────────────────
// Lookups
// ─────────────────────────────────────────────────────────────────────

export function getEditors(dynasty) {
  return Array.isArray(dynasty?.editors) ? dynasty.editors : []
}

export function getCoCommishes(dynasty) {
  return Array.isArray(dynasty?.coCommishes) ? dynasty.coCommishes : []
}

/** True iff this uid is the owner OR appears in editors[]. */
export function isEditor(dynasty, uid) {
  if (!dynasty || !uid) return false
  if (dynasty.userId === uid) return true
  return getEditors(dynasty).includes(uid)
}

/** True iff this uid is the dynasty's owner (commish). */
export function isOwner(dynasty, uid) {
  return !!(dynasty && uid && dynasty.userId === uid)
}

/** True iff this uid is a co-commish (and an editor). */
export function isCoCommish(dynasty, uid) {
  if (!dynasty || !uid) return false
  if (isOwner(dynasty, uid)) return false
  return getCoCommishes(dynasty).includes(uid) && isEditor(dynasty, uid)
}

// ─────────────────────────────────────────────────────────────────────
// Roles
// ─────────────────────────────────────────────────────────────────────

export const ROLE_COMMISH = 'commish'
export const ROLE_COCOMMISH = 'cocommish'
export const ROLE_MEMBER = 'member'

/** Returns 'commish' | 'cocommish' | 'member' | null. */
export function getRole(dynasty, uid) {
  if (!dynasty || !uid) return null
  if (isOwner(dynasty, uid)) return ROLE_COMMISH
  if (!isEditor(dynasty, uid)) return null
  if (getCoCommishes(dynasty).includes(uid)) return ROLE_COCOMMISH
  return ROLE_MEMBER
}

/** Commishes and co-commishes can manage members. */
export function canManageMembers(dynasty, uid) {
  const r = getRole(dynasty, uid)
  return r === ROLE_COMMISH || r === ROLE_COCOMMISH
}

/** Only the commish can transfer their own role. */
export function canTransferCommish(dynasty, uid) {
  return getRole(dynasty, uid) === ROLE_COMMISH
}

/** Only the commish can promote new co-commishes (or demote them). */
export function canManageCoCommishes(dynasty, uid) {
  return getRole(dynasty, uid) === ROLE_COMMISH
}

/**
 * Whether `actorUid` is allowed to remove/edit/manage `targetUid`.
 *   - The commish can act on anyone (except themselves for removal).
 *   - Co-commishes can act only on members — never on the commish or
 *     other co-commishes.
 *   - Members can never act on others.
 */
export function canActOnUser(dynasty, actorUid, targetUid) {
  if (!dynasty || !actorUid || !targetUid) return false
  if (actorUid === targetUid) return false
  const actor = getRole(dynasty, actorUid)
  const target = getRole(dynasty, targetUid)
  if (actor === ROLE_COMMISH) return target !== null && target !== ROLE_COMMISH
  if (actor === ROLE_COCOMMISH) return target === ROLE_MEMBER
  return false
}

/** Members are capped at 1 team; commish + co-commishes are uncapped. */
export function maxTeamsForRole(role) {
  if (role === ROLE_COMMISH || role === ROLE_COCOMMISH) return Infinity
  return 1
}

// ─────────────────────────────────────────────────────────────────────
// Migration — every legacy dynasty gets a clean editors[] on first load.
// ─────────────────────────────────────────────────────────────────────

export function needsEditorsMigration(dynasty) {
  return !!dynasty && !Array.isArray(dynasty.editors)
}

function harvestLegacyEditors(dynasty) {
  const ownerUid = dynasty?.userId || null
  const out = ownerUid ? [ownerUid] : []
  if (Array.isArray(dynasty?.memberUids)) {
    for (const uid of dynasty.memberUids) {
      if (uid && !out.includes(uid)) out.push(uid)
    }
  }
  if (Array.isArray(dynasty?.members)) {
    for (const m of dynasty.members) {
      if (m?.uid && !out.includes(m.uid)) out.push(m.uid)
    }
  }
  return out
}

export function migrateDynastyToEditors(dynasty) {
  if (!needsEditorsMigration(dynasty)) return dynasty
  return { ...dynasty, editors: harvestLegacyEditors(dynasty) }
}

// ─────────────────────────────────────────────────────────────────────
// Editors[] mutations — pure functions returning a new array.
// ─────────────────────────────────────────────────────────────────────

export function addEditor(dynasty, uid) {
  if (!uid) return getEditors(dynasty)
  if (isOwner(dynasty, uid)) return getEditors(dynasty)
  const existing = getEditors(dynasty)
  if (existing.includes(uid)) return existing
  return [...existing, uid]
}

export function removeEditor(dynasty, uid) {
  if (!uid) return getEditors(dynasty)
  if (isOwner(dynasty, uid)) return getEditors(dynasty)
  return getEditors(dynasty).filter(u => u !== uid)
}

// ─────────────────────────────────────────────────────────────────────
// Co-commish mutations.
// ─────────────────────────────────────────────────────────────────────

/** Promote uid to co-commish. Caller must already have ensured uid is
 *  in editors (i.e. an active member). */
export function addCoCommish(dynasty, uid) {
  if (!uid) return getCoCommishes(dynasty)
  if (isOwner(dynasty, uid)) return getCoCommishes(dynasty)
  const existing = getCoCommishes(dynasty)
  if (existing.includes(uid)) return existing
  return [...existing, uid]
}

/** Demote uid back to a regular member. */
export function removeCoCommish(dynasty, uid) {
  if (!uid) return getCoCommishes(dynasty)
  return getCoCommishes(dynasty).filter(u => u !== uid)
}

// ─────────────────────────────────────────────────────────────────────
// Member metadata: per-uid display label.
// ─────────────────────────────────────────────────────────────────────

export function getMemberLabel(dynasty, uid) {
  if (!dynasty || !uid) return ''
  return dynasty.memberLabels?.[uid] || ''
}

export function setMemberLabelValue(dynasty, uid, label) {
  const map = { ...(dynasty?.memberLabels || {}) }
  const trimmed = (label || '').trim()
  if (!trimmed) delete map[uid]
  else map[uid] = trimmed
  return map
}

// ─────────────────────────────────────────────────────────────────────
// Member team assignments.
//
// Each user can be assigned one or more tids (the teams they "control"
// in the dynasty). Members are capped at 1 by UI gates; commish + co-
// commishes are uncapped so they can shepherd teams whose owners don't
// have premium write access yet.
// ─────────────────────────────────────────────────────────────────────

/** Returns the array of tids assigned to this uid. */
export function getMemberTeams(dynasty, uid) {
  if (!dynasty || !uid) return []
  const arr = dynasty.memberTeams?.[uid]
  if (!Array.isArray(arr)) return []
  return arr.map(Number).filter(Number.isFinite)
}

/** Returns the FIRST tid assigned to this uid (convenience for single-team callers). */
export function getMemberTeam(dynasty, uid) {
  const arr = getMemberTeams(dynasty, uid)
  return arr.length > 0 ? arr[0] : null
}

/** Append `tid` to this uid's team list (no-op if already present). */
export function addMemberTeam(dynasty, uid, tid) {
  const map = { ...(dynasty?.memberTeams || {}) }
  if (!uid) return map
  const tNum = Number(tid)
  if (!Number.isFinite(tNum)) return map
  const existing = Array.isArray(map[uid]) ? map[uid].map(Number) : []
  if (existing.includes(tNum)) return map
  map[uid] = [...existing, tNum]
  return map
}

/** Remove `tid` from this uid's team list. */
export function removeMemberTeam(dynasty, uid, tid) {
  const map = { ...(dynasty?.memberTeams || {}) }
  if (!uid) return map
  const tNum = Number(tid)
  const existing = Array.isArray(map[uid]) ? map[uid].map(Number) : []
  const next = existing.filter(t => t !== tNum)
  if (next.length === 0) delete map[uid]
  else map[uid] = next
  return map
}

/** Replace this uid's team list with exactly `[tid]` (or clear if null). */
export function setMemberTeam(dynasty, uid, tid) {
  const map = { ...(dynasty?.memberTeams || {}) }
  if (!uid) return map
  if (tid == null || tid === '') {
    delete map[uid]
    return map
  }
  const tNum = Number(tid)
  if (!Number.isFinite(tNum)) return map
  map[uid] = [tNum]
  return map
}

/** Drop the metadata + team assignments for a uid (used on Remove). */
export function dropMemberMetadata(dynasty, uid) {
  const labels = { ...(dynasty?.memberLabels || {}) }
  const teams = { ...(dynasty?.memberTeams || {}) }
  delete labels[uid]
  delete teams[uid]
  // memberTeamHistory is intentionally PRESERVED — even after a member
  // is removed, their historical record remains so the Coach Career
  // view can still show their past stints.
  return { memberLabels: labels, memberTeams: teams }
}

// ─────────────────────────────────────────────────────────────────────
// Per-year team history.
//
// `memberTeamHistory: { [uid]: { [year]: number[] } }` records which
// tids each member controlled in each season. Snapshotted on every
// team-assignment write (current-year stamp) and on season advance
// (previous-year carry-forward), so the Coach Career page can rebuild
// each user's record independently.
// ─────────────────────────────────────────────────────────────────────

/** Returns the snapshot of a uid's teams for a specific year (or empty array). */
export function getMemberTeamsForYear(dynasty, uid, year) {
  if (!dynasty || !uid) return []
  const userHistory = dynasty.memberTeamHistory?.[uid]
  if (userHistory) {
    const stamped = userHistory[year] ?? userHistory[String(year)]
    if (Array.isArray(stamped) && stamped.length > 0) {
      return stamped.map(Number).filter(Number.isFinite)
    }
  }
  // Live state covers the current year if no snapshot is recorded yet.
  if (Number(year) === Number(dynasty?.currentYear)) {
    return getMemberTeams(dynasty, uid)
  }
  return []
}

/**
 * Returns a new memberTeamHistory map with `uid`'s teams for `year`
 * set to `teams`. Pass an empty array to clear that year's snapshot.
 */
export function stampHistoryForYear(history, uid, year, teams) {
  if (!uid) return history || {}
  const yNum = Number(year)
  if (!Number.isFinite(yNum)) return history || {}
  const next = { ...(history || {}) }
  const userMap = { ...(next[uid] || {}) }
  const cleaned = (Array.isArray(teams) ? teams : [])
    .map(Number)
    .filter(Number.isFinite)
  if (cleaned.length === 0) {
    delete userMap[yNum]
    delete userMap[String(yNum)]
  } else {
    delete userMap[String(yNum)]
    userMap[yNum] = cleaned
  }
  if (Object.keys(userMap).length === 0) delete next[uid]
  else next[uid] = userMap
  return next
}

/**
 * Snapshot every member's current team list into history under `year`.
 * Used on season advance so the year that just ended has a fixed record
 * even for users whose assignment didn't change during it.
 */
export function snapshotAllMembersForYear(dynasty, year) {
  if (!dynasty) return dynasty?.memberTeamHistory || {}
  const yNum = Number(year)
  if (!Number.isFinite(yNum)) return dynasty?.memberTeamHistory || {}
  const current = dynasty.memberTeams || {}
  let history = { ...(dynasty.memberTeamHistory || {}) }
  for (const uid of Object.keys(current)) {
    const teams = current[uid]
    if (!Array.isArray(teams) || teams.length === 0) continue
    history = stampHistoryForYear(history, uid, yNum, teams)
  }
  return history
}

// ─────────────────────────────────────────────────────────────────────
// Commish role transfer.
// ─────────────────────────────────────────────────────────────────────

/**
 * Transfer the commish role from the current owner to `newCommishUid`.
 * The previous owner becomes a regular member (added to editors[]); the
 * new commish gets the userId slot. Also strips the new commish out of
 * coCommishes (they're commish now). Caller must persist all returned
 * fields with a single updateDynasty call.
 *
 * Returns: { userId, editors, coCommishes }
 * Throws if newCommishUid isn't an editor or is already commish.
 */
export function buildCommishTransfer(dynasty, newCommishUid) {
  if (!dynasty || !newCommishUid) throw new Error('Missing dynasty or new commish uid')
  if (isOwner(dynasty, newCommishUid)) {
    throw new Error('That user is already the commish.')
  }
  if (!getEditors(dynasty).includes(newCommishUid)) {
    throw new Error('Promote a current member only — that uid is not an editor.')
  }
  const prevOwner = dynasty.userId
  const nextEditors = getEditors(dynasty).filter(u => u !== newCommishUid)
  if (prevOwner && !nextEditors.includes(prevOwner)) nextEditors.push(prevOwner)
  const nextCoCommishes = getCoCommishes(dynasty).filter(u => u !== newCommishUid)
  return {
    userId: newCommishUid,
    editors: nextEditors,
    coCommishes: nextCoCommishes,
  }
}
