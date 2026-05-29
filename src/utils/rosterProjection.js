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
    if (projCls === null) continue
    out.push(projectedEntry(p, {
      position: positionForYear(p, currentYear),
      projectedClass: projCls,
      projectedOvr: ovrForYear(p, currentYear),
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
        projectedOvr: null,
        devTrait: rec.devTrait || 'Normal',
        status: 'incoming',
        isIncoming: true,
        stars: rec.stars ?? null,
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
