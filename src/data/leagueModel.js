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
 *                                           can hold multiple to shepherd
 *                                           teams without an assigned
 *                                           coach yet, or to cover for an
 *                                           absent member.
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

/**
 * Can `uid` write to the data attached to team `tid` in this dynasty?
 *   - Commish + co-commishes: yes for any team (they shepherd extras).
 *   - Members: yes only if tid is in their `memberTeams[uid]` list.
 *   - Non-editors: no.
 *
 * The Firestore security rules should mirror this same gate. Until
 * those land server-side this is a UI-only protection — but it still
 * stops the common-case "wrong-team edit by accident" bug.
 */
export function canWriteTeam(dynasty, uid, tid) {
  if (!dynasty || !uid || tid == null) return false
  const role = getRole(dynasty, uid)
  if (!role) return false
  if (role === ROLE_COMMISH || role === ROLE_COCOMMISH) return true
  const tidNum = Number(tid)
  if (!Number.isFinite(tidNum)) return false
  const teams = getMemberTeams(dynasty, uid)
  return teams.includes(tidNum)
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

/**
 * The display name for a uid in this dynasty. Single source of truth so
 * every surface (Layout, Coach Career, Coaches leaderboard, awards
 * matching, Sheets creation, staff injection) shows the same string.
 *
 * Resolution chain:
 *   1. memberLabels[uid] — canonical, editable in Members page
 *   2. dynasty.coachName — legacy field; only present on dynasties
 *      created before createDynasty stopped writing it. Read-only
 *      fallback so pre-migration dynasties keep working until their
 *      owner edits their name (which writes memberLabels).
 *   3. 'Commish' / 'Co-Commish' / 'Member' role placeholder
 *
 * Pass `fallback` to override the role placeholder for a specific
 * surface (e.g. 'Coach' on the Coach Career page).
 */
export function getCoachNameForUid(dynasty, uid, fallback = null) {
  if (!dynasty || !uid) return fallback || ''
  const label = dynasty.memberLabels?.[uid]
  if (label) return label
  // Legacy fallback — pre-migration owner-only field. Stays for read
  // compatibility; nothing in the app writes it as of this commit.
  if (uid === dynasty.userId && dynasty.coachName) return dynasty.coachName
  if (fallback) return fallback
  const role = getRole(dynasty, uid)
  if (role === ROLE_COMMISH) return 'Commish'
  if (role === ROLE_COCOMMISH) return 'Co-Commish'
  if (role === ROLE_MEMBER) return 'Member'
  return ''
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
// commishes are uncapped so they can shepherd teams without an assigned
// coach yet, or cover for an absent member.
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
 *
 * **Non-overwriting**: if a uid already has a snapshot for `year`, it's
 * left alone. This matters for the new-job flow — the moment a job
 * goes into effect (postseason → offseason) we stamp the just-ended
 * year with the OLD team before swapping `memberTeams` to the new
 * team. The later year-flip snapshot shouldn't undo that work just
 * because `memberTeams` has since changed.
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
    const userMap = history[uid] || {}
    if (userMap[yNum] != null || userMap[String(yNum)] != null) continue
    history = stampHistoryForYear(history, uid, yNum, teams)
  }
  return history
}

// ─────────────────────────────────────────────────────────────────────
// Timeline editing — retroactively claim/release a team for a given year.
//
// Use case: a user joins the dynasty mid-stream (didn't have premium
// the first two seasons; commish was managing their team). After they
// upgrade and join, they claim seasons 1-2 from the commish's history
// onto theirs so Coach Career shows the right narrative.
// ─────────────────────────────────────────────────────────────────────

/**
 * Set this uid's tids for the given year, replacing whatever was there.
 * Pass an empty array (or null) to clear. Returns the new history map.
 */
export function setMemberTeamsForYear(history, uid, year, tids) {
  return stampHistoryForYear(history, uid, year, tids || [])
}

/**
 * Claim `tid` for `uid` in `year`. Adds it to this uid's history AND
 * removes it from any OTHER uid that had it stamped for the same year
 * (a team has at most one coach per season). Returns the new history.
 */
export function claimTeamForYear(history, uid, year, tid) {
  if (!uid) return history || {}
  const yNum = Number(year)
  const tNum = Number(tid)
  if (!Number.isFinite(yNum) || !Number.isFinite(tNum)) return history || {}
  let next = { ...(history || {}) }
  // Strip the tid from every OTHER uid's same-year list.
  for (const otherUid of Object.keys(next)) {
    if (otherUid === uid) continue
    const otherUserMap = next[otherUid]
    if (!otherUserMap) continue
    const stamped =
      otherUserMap[yNum] ?? otherUserMap[String(yNum)]
    if (!Array.isArray(stamped)) continue
    const filtered = stamped.map(Number).filter(t => t !== tNum)
    if (filtered.length === stamped.length) continue
    next = stampHistoryForYear(next, otherUid, yNum, filtered)
  }
  // Add tid to this uid's list (no duplicates).
  const myMap = next[uid] || {}
  const mine = myMap[yNum] ?? myMap[String(yNum)]
  const myList = Array.isArray(mine) ? mine.map(Number) : []
  if (!myList.includes(tNum)) myList.push(tNum)
  next = stampHistoryForYear(next, uid, yNum, myList)
  return next
}

/**
 * Remove `tid` from this uid's history for `year`. No-op if it wasn't
 * stamped. Returns the new history.
 */
export function releaseTeamForYear(history, uid, year, tid) {
  if (!uid) return history || {}
  const yNum = Number(year)
  const tNum = Number(tid)
  if (!Number.isFinite(yNum) || !Number.isFinite(tNum)) return history || {}
  const userMap = (history || {})[uid]
  if (!userMap) return history || {}
  const stamped = userMap[yNum] ?? userMap[String(yNum)]
  if (!Array.isArray(stamped)) return history || {}
  const filtered = stamped.map(Number).filter(t => t !== tNum)
  if (filtered.length === stamped.length) return history || {}
  return stampHistoryForYear(history, uid, yNum, filtered)
}

/**
 * Returns the array of uids that currently have `tid` stamped for
 * `year`. Used to surface conflicts (a tid should belong to at most
 * one uid per year).
 */
export function getCoachesForTeamYear(dynasty, tid, year) {
  if (!dynasty || tid == null) return []
  const yNum = Number(year)
  const tNum = Number(tid)
  if (!Number.isFinite(yNum) || !Number.isFinite(tNum)) return []
  const history = dynasty.memberTeamHistory || {}
  const out = []
  for (const [uid, userMap] of Object.entries(history)) {
    if (!userMap) continue
    const stamped = userMap[yNum] ?? userMap[String(yNum)]
    if (!Array.isArray(stamped)) continue
    if (stamped.map(Number).includes(tNum)) out.push(uid)
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────
// Invite tokens — share a /join/:dynastyId/:token URL instead of
// asking new users to fish their UID out of the Account page.
//
// Storage: token-keyed docs at `dynasties/{id}/invites/{token}`. The
// CRUD lives in services/dynastyService.js (createInviteDoc,
// getInviteDoc, listInviteDocs, deleteInviteDoc, redeemInviteDoc,
// subscribeToInvites). This file owns just the helpers that don't
// hit Firestore — token generation, validity check, URL builder.
//
// Redemption is a two-phase write the client does atomically:
//   1. updateDoc(invites/{token}, { redeemedBy: uid, redeemedAt: now })
//   2. updateDoc(dynasty, { editors: [...], lastRedemption: { uid, token, at } })
// Firestore rules verify both, see firestore.rules.
// ─────────────────────────────────────────────────────────────────────

const INVITE_TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function createInviteToken(length = 16) {
  let out = ''
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint8Array(length)
    crypto.getRandomValues(buf)
    for (let i = 0; i < length; i++) {
      out += INVITE_TOKEN_ALPHABET[buf[i] % INVITE_TOKEN_ALPHABET.length]
    }
  } else {
    for (let i = 0; i < length; i++) {
      out += INVITE_TOKEN_ALPHABET[Math.floor(Math.random() * INVITE_TOKEN_ALPHABET.length)]
    }
  }
  return out
}

/** True iff the invite is usable: exists, unredeemed, unexpired. */
export function isInviteValid(invite) {
  if (!invite || invite.redeemedBy) return false
  if (invite.expiresAt != null && Date.now() > Number(invite.expiresAt)) return false
  return true
}

/**
 * Build the full join URL for a token. Returns an absolute URL using
 * the current location's origin. Use in the Members page Copy button.
 */
export function buildInviteUrl(dynastyId, token) {
  if (typeof window === 'undefined') return `/join/${dynastyId}/${token}`
  return `${window.location.origin}/join/${dynastyId}/${token}`
}

// ─────────────────────────────────────────────────────────────────────
// Per-uid coaching staff overrides.
//
// `dynasty.memberCoachingStaff: { [uid]: { hcName, ocName, dcName } }`
//
// Multi-coach dynasties need each member to record their OWN staff so
// they don't overwrite each other when entering preseason data. Reads
// fall back to the legacy dynasty.coachingStaff (owner-only field) when
// no per-uid override exists.
// ─────────────────────────────────────────────────────────────────────

const EMPTY_STAFF = { hcName: null, ocName: null, dcName: null }

export function getCoachingStaffForUid(dynasty, uid) {
  if (!dynasty || !uid) return { ...EMPTY_STAFF }
  const override = dynasty.memberCoachingStaff?.[uid]
  if (override && (override.hcName || override.ocName || override.dcName)) {
    return { ...EMPTY_STAFF, ...override }
  }
  // Fall back to the dynasty-wide staff for the owner (legacy single-
  // coach surface). For other members with no override, return empty.
  if (uid === dynasty.userId && dynasty.coachingStaff) {
    return { ...EMPTY_STAFF, ...dynasty.coachingStaff }
  }
  return { ...EMPTY_STAFF }
}

/**
 * Returns a new memberCoachingStaff map with `uid`'s staff set. Pass
 * null/empty values to clear individual roles. If every role is empty
 * the uid entry is dropped entirely.
 */
export function setCoachingStaffForUid(dynasty, uid, staff) {
  const next = { ...(dynasty?.memberCoachingStaff || {}) }
  if (!uid) return next
  const cleaned = {
    hcName: (staff?.hcName || '').trim() || null,
    ocName: (staff?.ocName || '').trim() || null,
    dcName: (staff?.dcName || '').trim() || null,
  }
  if (!cleaned.hcName && !cleaned.ocName && !cleaned.dcName) {
    delete next[uid]
  } else {
    next[uid] = cleaned
  }
  return next
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
