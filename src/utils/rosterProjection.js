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
// once a *recognized* class graduates (walks off the end of its track). For an
// unrecognized class, callers should check trackFor first — advanceClass also
// returns null there, but "graduated" and "unknown" must be handled differently.
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

function projectedEntry(player, { position, projectedClass, projectedOvr, devTrait, status, isIncoming = false, stars = null, name = null, isPortal = false, incomingKey = '' }) {
  return {
    key: isIncoming ? `inc:${incomingKey}:${name}:${position}` : `pid:${player.pid}`,
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
    isPortal,
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

// Departure detection mirrors the canonical sets the rest of the app uses
// (DynastyContext). A movement counts as a departure if its `type` is in the
// type-set OR its `departure` sub-field is in the sub-field set.
const DEPARTURE_TYPES = new Set(['departure', 'entered_portal', 'transferred_out', 'graduated', 'declared_for_draft', 'transfer', 'encouraged_to_transfer'])
const DEPARTURE_SUBFIELDS = new Set(['transfer_out', 'graduated', 'pro_draft'])
const TRANSFER_OUT_MARKERS = new Set(['transferred_out', 'transfer', 'encouraged_to_transfer'])

// Did this player leave (grad/draft/transfer-out) in any season fromYear..throughYear?
// A `transfer_out` whose destination (toTid) is THIS team is actually an
// arrival from our perspective, not a departure — mirror DynastyContext's guard.
function departedBy(player, fromYear, throughYear, tid) {
  const mv = player.movementByYear || {}
  for (let y = fromYear; y <= throughYear; y++) {
    const m = mv[y] || mv[String(y)]
    if (!m) continue
    const isDep = DEPARTURE_TYPES.has(m.type) || DEPARTURE_SUBFIELDS.has(m.departure)
    if (!isDep) continue
    const isTransferOut = m.departure === 'transfer_out' || TRANSFER_OUT_MARKERS.has(m.type)
    if (isTransferOut && m.toTid != null && Number(m.toTid) === Number(tid)) continue // arrival to us
    return true
  }
  return false
}

// Map a recruit's stored class to the class they ENROLL as. HS → Fr; JUCO X → X
// (a JUCO Jr arrives as a Jr); recognized class strings pass through.
function recruitStartClass(recruitClass) {
  const c = (recruitClass || '').trim()
  if (!c || c === 'HS') return 'Fr'
  if (c.startsWith('JUCO ')) {
    const base = c.slice(5).trim()
    return STANDARD.includes(base) || REDSHIRT.includes(base) ? base : 'Fr'
  }
  return STANDARD.includes(c) || REDSHIRT.includes(c) ? c : 'Fr'
}

function flattenCommits(commitsObj) {
  if (!commitsObj) return []
  return Object.values(commitsObj).flat().filter(Boolean)
}

// pids the user has marked "leaving" this offseason (pending — not yet stamped
// into movementByYear). getPlayersLeaving may return ids or {pid} objects.
function pendingLeavingPids(dynasty, tid, currentYear) {
  try {
    const list = getPlayersLeaving(dynasty, tid, currentYear) || []
    return new Set(list.map(x => (x && typeof x === 'object') ? x.pid : x).filter(Boolean))
  } catch {
    return new Set()
  }
}

function projectFutureRoster(dynasty, tid, targetYear, opts = {}) {
  const currentYear = Number(dynasty.currentYear)
  const ty = Number(targetYear)
  const leaveFlags = opts.leaveFlags instanceof Set ? opts.leaveFlags : new Set(opts.leaveFlags || [])
  const leaving = pendingLeavingPids(dynasty, tid, currentYear)
  const out = []

  // 1) Returning players: seed from the current roster, age forward. Drop
  //    grads, recorded departures (from currentYear onward — offseason
  //    departures are stamped on the final on-roster year), pending-leaving,
  //    and manually flagged. Unknown-class returners are KEPT (not dropped).
  const current = (dynasty.players || []).filter(p => !p.isHonorOnly && isPlayerOnRoster(p, tid, currentYear))
  for (const p of current) {
    if (leaveFlags.has(p.pid) || leaving.has(p.pid)) continue
    if (departedBy(p, currentYear, ty, tid)) continue
    const curCls = getPlayerClassForYear(p, currentYear)
    let projCls
    if (trackFor(curCls)) {
      projCls = advanceClass(curCls, ty - currentYear)
      if (projCls === null) continue // graduated
    } else {
      projCls = curCls || '?' // unknown class — carry forward as a returner
    }
    out.push(projectedEntry(p, {
      position: positionForYear(p, currentYear),
      projectedClass: projCls,
      projectedOvr: ovrForYear(p, currentYear),
      devTrait: devForYear(p, currentYear),
      status: 'returning',
    }))
  }

  // 2) Incoming recruits + portal transfers. Commitments are keyed by the
  //    RECRUITING year and enroll the FOLLOWING year (canonical: enrollment =
  //    recruitingYear + 1). So a class joining in roster-year (ry+1) is read
  //    from recruiting year ry. Iterate recruiting years currentYear..ty-1.
  for (let ry = currentYear; ry <= ty - 1; ry++) {
    const joinYear = ry + 1
    let commits = []
    try { commits = flattenCommits(getRecruitingCommitments(dynasty, tid, ry)) } catch { commits = [] }
    let idx = 0
    for (const rec of commits) {
      const startCls = recruitStartClass(rec.class)
      const projCls = advanceClass(startCls, ty - joinYear)
      if (projCls === null) continue // graduated before targetYear
      out.push(projectedEntry(null, {
        name: rec.name,
        position: (rec.position || '').toUpperCase(),
        projectedClass: projCls,
        projectedOvr: null,                 // recruits have no OVR until onboarded
        devTrait: rec.devTrait || 'Normal',
        status: 'incoming',
        isIncoming: true,
        stars: rec.stars ?? null,
        isPortal: !!rec.isPortal,
        incomingKey: `${ry}:${idx++}`,      // unique discriminator for React keys
      }))
    }
  }

  return out
}

// Public entry point. opts.leaveFlags = Set<pid> of manual "likely to leave".
export function projectRoster(dynasty, tid, targetYear, opts = {}) {
  const currentYear = Number(dynasty.currentYear)
  const ty = Number(targetYear)
  if (ty <= currentYear) return rosterForRealYear(dynasty, tid, ty)
  return projectFutureRoster(dynasty, tid, ty, opts)
}

// Human-readable reason a player departs within fromYear..throughYear, or null
// if they don't (mirrors departedBy, but classifies the movement). A
// transfer-out whose destination is THIS team is an arrival, not a departure.
function departureReason(player, fromYear, throughYear, tid) {
  const mv = player.movementByYear || {}
  for (let y = fromYear; y <= throughYear; y++) {
    const m = mv[y] || mv[String(y)]
    if (!m) continue
    const isDep = DEPARTURE_TYPES.has(m.type) || DEPARTURE_SUBFIELDS.has(m.departure)
    if (!isDep) continue
    const isTransferOut = m.departure === 'transfer_out' || TRANSFER_OUT_MARKERS.has(m.type)
    if (isTransferOut && m.toTid != null && Number(m.toTid) === Number(tid)) continue
    if (m.type === 'declared_for_draft' || m.departure === 'pro_draft') return { reason: 'NFL draft', year: y }
    if (m.type === 'graduated' || m.departure === 'graduated') return { reason: 'Graduating', year: y }
    if (isTransferOut || m.type === 'entered_portal') return { reason: 'Transfer / portal', year: y }
    return { reason: 'Departing', year: y }
  }
  return null
}

// Players on the CURRENT roster who are gone by targetYear (the "who you're
// losing" side of the outlook), each with a reason. Empty for past/current
// years. opts.leaveFlags = Set<pid> of manual "likely to leave".
export function projectDepartures(dynasty, tid, targetYear, opts = {}) {
  const currentYear = Number(dynasty.currentYear)
  const ty = Number(targetYear)
  if (ty <= currentYear) return []
  const leaveFlags = opts.leaveFlags instanceof Set ? opts.leaveFlags : new Set(opts.leaveFlags || [])
  const leaving = pendingLeavingPids(dynasty, tid, currentYear)
  const current = (dynasty.players || []).filter(p => !p.isHonorOnly && isPlayerOnRoster(p, tid, currentYear))
  const out = []
  for (const p of current) {
    const curCls = getPlayerClassForYear(p, currentYear)
    const base = {
      pid: p.pid, player: p, name: p.name,
      position: positionForYear(p, currentYear),
      classNow: curCls,
      projectedOvr: ovrForYear(p, currentYear),
      devTrait: devForYear(p, currentYear),
    }
    if (leaveFlags.has(p.pid)) { out.push({ ...base, reason: 'Flagged to leave', leaveYear: currentYear, isFlag: true }); continue }
    if (leaving.has(p.pid)) { out.push({ ...base, reason: 'Leaving (offseason)', leaveYear: currentYear }); continue }
    const dep = departureReason(p, currentYear, ty, tid)
    if (dep) { out.push({ ...base, reason: dep.reason, leaveYear: dep.year }); continue }
    if (trackFor(curCls) && advanceClass(curCls, ty - currentYear) === null) {
      out.push({ ...base, reason: 'Graduating', leaveYear: currentYear + yearsLeftAfter(curCls) })
    }
  }
  return out
}
