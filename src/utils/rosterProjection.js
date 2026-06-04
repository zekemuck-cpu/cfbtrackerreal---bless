// Roster projection — age the current roster forward to a future season, or
// read the real roster for a past/current season. Pure + unit-tested.
import { isPlayerOnRoster, getPlayerClassForYear, getPlayersLeaving, getRecruitingCommitments } from '../context/DynastyContext'

// Projected OVR threshold above which a Jr/Sr is considered a likely NFL candidate.
export const NFL_DRAFT_OVR_THRESHOLD = 93

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

// Map an ATH player's archetype to the position group they'd most likely play.
// Order matters: more-specific patterns first.
// "Power Rusher" / "Speed Rusher" are EDGE archetypes in CFB, not HB.
const ATH_ARCHETYPE_MAP = [
  [/scrambler|dual.?threat|pocket|strong.?arm|improviser|field.?general/i, 'QB'],
  [/power.?rush|speed.?rush|pass.?rush|edge.?rush/i, 'EDGE'],
  [/speed.?back|power.?back|north.?south|east.?west|playmaker|elusive|receiving.?back|workhorse/i, 'HB'],
  [/deep.?threat|slot|speedster|gadget|route/i, 'WR'],
  [/vertical|possession|blocking|move.?te/i, 'TE'],
  [/linebacker|thumper|signal.?caller|lurker/i, 'MIKE'],
  [/safety|hybrid|coverage|box/i, 'Safety'],
]
export function resolveAthPosition(player) {
  if (!player) return 'WR'
  // Use archetype first; devTrait values (Normal/Impact/Star/Elite) are not
  // position archetypes so skip them as the fallback to avoid false matches.
  const arch = String(player.archetype || '').toLowerCase()
  if (arch) {
    for (const [rx, pos] of ATH_ARCHETYPE_MAP) {
      if (rx.test(arch)) return pos
    }
  }
  return 'WR'
}

function resolvePosition(player, year) {
  const pos = positionForYear(player, year)
  return pos === 'ATH' ? resolveAthPosition(player) : pos
}
function devForYear(player, year, dynastyCurrentYear) {
  const d = player.devTraitByYear || {}
  const byYear = d[year] ?? d[String(year)]
  // player.devTrait is the canonical current-season value kept in sync by the
  // player editor. When looking at the current year, prefer it so a recent
  // trait upgrade is reflected immediately even if devTraitByYear is stale.
  if (dynastyCurrentYear != null && Number(year) === Number(dynastyCurrentYear)) {
    return player.devTrait || byYear || 'Normal'
  }
  return byYear ?? player.devTrait ?? 'Normal'
}

// ── OVR development model ───────────────────────────────────────────────────
// Per-offseason OVR gain ≈ base(dev trait) × class multiplier × overall-band
// multiplier, rounded, capped at 99. Applied one season at a time so class and
// OVR band update each year. Tuned to reproduce the canonical four-year arcs
// (e.g. Elite 82→87→90→92, Star 78→83→86→88). Playing-time, trait upgrades, and
// early departures are intentionally NOT modeled here — this is the
// contributing-starter baseline.
const DEV_BASE_GAIN = { Normal: 2, Impact: 4, Star: 6, Elite: 8 }
const CLASS_DEV_MULT = { Fr: 1.15, So: 1.05, Jr: 1.0, Sr: 0.9 }

function classDevMult(cls) {
  const c = (cls || '').replace(/^RS\s+/i, '').trim()
  return CLASS_DEV_MULT[c] ?? 1.0
}
function ovrBandMult(ovr) {
  if (ovr < 75) return 1.0
  if (ovr < 80) return 0.75
  if (ovr < 85) return 0.55
  if (ovr < 90) return 0.4
  if (ovr < 94) return 0.25
  if (ovr < 97) return 0.15
  return 0.05
}

// Baseline true-freshman OVR by recruit star rating (generated dynasty recruits,
// average-prestige program). A commit's real rating is unknown — only stars — so
// this seeds a starting OVR that the dev model then ages forward and that the
// chart uses to slot the recruit by quality (the UI still shows stars, not OVR).
const STAR_BASELINE_OVR = { 5: 79, 4: 75, 3: 70, 2: 65, 1: 60 }
export function starBaselineOvr(stars) {
  return STAR_BASELINE_OVR[Number(stars)] ?? null
}

// Project an OVR forward `seasons` offseasons from a starting class. startClass
// is the class of the season just played (the first gain is computed from it).
export function projectOvrForward(startOvr, startClass, devTrait, seasons) {
  if (startOvr == null || !Number.isFinite(Number(startOvr))) return startOvr ?? null
  const base = DEV_BASE_GAIN[devTrait] ?? DEV_BASE_GAIN.Normal
  let ovr = Number(startOvr)
  let cls = startClass
  for (let i = 0; i < seasons; i++) {
    ovr = Math.min(99, ovr + Math.round(base * classDevMult(cls) * ovrBandMult(ovr)))
    cls = advanceClass(cls, 1) || cls
  }
  return ovr
}

function projectedEntry(player, { position, projectedClass, projectedOvr, devTrait, status, isIncoming = false, stars = null, name = null, isPortal = false, incomingKey = '', linkPid = null, pictureUrl = null }) {
  return {
    key: isIncoming ? `inc:${incomingKey}:${name}:${position}` : `pid:${player.pid}`,
    pid: isIncoming ? null : player.pid,
    // For incoming recruits, pid stays null (so leave/NFL flags that key on pid
    // never apply to them), but linkPid points at the real enrolled player
    // record the app creates on commit — letting the tile link to that player
    // page. Returning/current players link via pid directly.
    linkPid: isIncoming ? (linkPid ?? null) : (player?.pid ?? null),
    player: isIncoming ? null : player,
    // Single source of truth for the tile headshot — the player record's
    // pictureUrl (the enrolled player's, for incoming recruits whose `player`
    // is null here). The depth-chart tile renders this via the wsrv proxy.
    pictureUrl: isIncoming ? (pictureUrl ?? null) : (player?.pictureUrl ?? null),
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
      position: resolvePosition(p, year),
      projectedClass: getPlayerClassForYear(p, year),
      projectedOvr: ovrForYear(p, year),
      devTrait: devForYear(p, year, currentYear),
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
      position: resolvePosition(p, currentYear),
      projectedClass: projCls,
      projectedOvr: projectOvrForward(ovrForYear(p, currentYear), curCls, devForYear(p, currentYear, currentYear), ty - currentYear),
      devTrait: devForYear(p, currentYear, currentYear),
      status: 'returning',
    }))
  }

  // 2) Incoming recruits + portal transfers. Commitments are keyed by the
  //    RECRUITING year and enroll the FOLLOWING year (canonical: enrollment =
  //    recruitingYear + 1). So a class joining in roster-year (ry+1) is read
  //    from recruiting year ry. Iterate recruiting years currentYear..ty-1.
  // When a recruit commits, the app also creates a real player carrying the
  // canonical devTrait (and teamsByYear[joinYear] = tid). The commit RECORD's
  // own devTrait is often stale/missing (old data, partial sheet imports), so
  // the depth chart's incoming tiles showed the wrong trait. Prefer the enrolled
  // player's devTrait, keyed by name+joinYear, falling back to the commit field.
  // Find the real player record the app creates when a recruit commits, keyed
  // by name + join year. Used both for the canonical devTrait and for linking
  // the incoming tile to that player's page.
  const enrolledPlayer = (name, joinYear) => {
    const n = (name || '').trim().toLowerCase()
    if (!n) return null
    return (dynasty.players || []).find(pl =>
      (pl.name || '').trim().toLowerCase() === n && isPlayerOnRoster(pl, tid, joinYear)) || null
  }

  for (let ry = currentYear; ry <= ty - 1; ry++) {
    const joinYear = ry + 1
    let commits = []
    try { commits = flattenCommits(getRecruitingCommitments(dynasty, tid, ry)) } catch { commits = [] }
    // Dedup within this recruiting year: same name+position can appear
    // multiple times when data is stored across multiple commit sub-keys
    // (preseason, regular_1, regular_2…) and the flatten picks them all up.
    const seenThisYear = new Set()
    let idx = 0
    for (const rec of commits) {
      const dedupeKey = `${(rec.name || '').trim().toLowerCase()}:${(rec.position || '').toLowerCase()}`
      if (seenThisYear.has(dedupeKey)) continue
      seenThisYear.add(dedupeKey)
      const startCls = recruitStartClass(rec.class)
      const projCls = advanceClass(startCls, ty - joinYear)
      if (projCls === null) continue // graduated before targetYear
      const rawPos = (rec.position || '').toUpperCase()
      const position = rawPos === 'ATH' ? resolveAthPosition(rec) : rawPos
      const enrolled = enrolledPlayer(rec.name, joinYear)
      const devTrait = (enrolled ? devForYear(enrolled, joinYear, currentYear) : null) || rec.devTrait || 'Normal'
      out.push(projectedEntry(null, {
        name: rec.name,
        position,
        projectedClass: projCls,
        // Star-implied baseline, aged forward — used for slotting/health only;
        // the UI renders stars, not this number.
        projectedOvr: projectOvrForward(starBaselineOvr(rec.stars), startCls, devTrait, ty - joinYear),
        devTrait,
        status: 'incoming',
        isIncoming: true,
        stars: rec.stars ?? null,
        isPortal: !!rec.isPortal,
        incomingKey: `${ry}:${idx++}`,      // unique discriminator for React keys
        linkPid: enrolled?.pid ?? null,     // link to the enrolled player page
        pictureUrl: enrolled?.pictureUrl ?? null, // headshot from the enrolled player record
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

// The outlook's "Likely to depart" list = ONLY players the user has manually
// flagged "likely transfer". Graduating seniors and other natural departures are
// NOT auto-listed — they simply appear on the roster for the years they're
// actually on it, then drop off. Each flagged player is projected to the viewed
// year so it reads consistently with the roster; one who'd have graduated by
// then is omitted (the flag is moot). opts.leaveFlags = Set<pid>.
export function projectDepartures(dynasty, tid, targetYear, opts = {}) {
  const currentYear = Number(dynasty.currentYear)
  const ty = Number(targetYear)
  if (!Number.isFinite(ty) || ty < currentYear) return []
  const leaveFlags = opts.leaveFlags instanceof Set ? opts.leaveFlags : new Set(opts.leaveFlags || [])
  if (leaveFlags.size === 0) return []
  const current = (dynasty.players || []).filter(p => !p.isHonorOnly && isPlayerOnRoster(p, tid, currentYear))
  const step = ty - currentYear
  const out = []
  for (const p of current) {
    if (!leaveFlags.has(p.pid)) continue
    const curCls = getPlayerClassForYear(p, currentYear)
    const projCls = step === 0 ? curCls : (trackFor(curCls) ? advanceClass(curCls, step) : (curCls || '?'))
    if (projCls === null) continue // would have graduated by the viewed year anyway
    out.push({
      pid: p.pid, player: p, name: p.name,
      position: resolvePosition(p, currentYear),
      projectedClass: projCls,
      projectedOvr: projectOvrForward(ovrForYear(p, currentYear), curCls, devForYear(p, currentYear, currentYear), step),
      devTrait: devForYear(p, currentYear, currentYear),
      isFlag: true,
    })
  }
  return out
}

// Auto-detected NFL Draft candidates: players who are eligible to declare
// (have completed at least their Jr year or RS So year) and whose projected
// OVR meets or exceeds NFL_DRAFT_OVR_THRESHOLD. Eligibility is based on the
// class they COMPLETE in the season BEFORE targetYear — a true junior who will
// BE a junior in targetYear hasn't finished that year yet and cannot declare.
export function projectNflCandidates(dynasty, tid, targetYear, opts = {}) {
  const currentYear = Number(dynasty.currentYear)
  const ty = Number(targetYear)
  if (!Number.isFinite(ty) || ty <= currentYear) return []
  const nflDismissFlags = opts.nflDismissFlags instanceof Set ? opts.nflDismissFlags : new Set(opts.nflDismissFlags || [])
  const leaveFlags = opts.leaveFlags instanceof Set ? opts.leaveFlags : new Set(opts.leaveFlags || [])
  const current = (dynasty.players || []).filter(p => !p.isHonorOnly && isPlayerOnRoster(p, tid, currentYear))
  const step = ty - currentYear
  const out = []
  for (const p of current) {
    if (nflDismissFlags.has(p.pid) || leaveFlags.has(p.pid)) continue
    const curCls = getPlayerClassForYear(p, currentYear)
    const projCls = trackFor(curCls) ? advanceClass(curCls, step) : null
    if (projCls === null) continue // graduated before or at target year
    // Draft eligibility: player must have completed at least their Junior year
    // (standard track) or RS So year (redshirt track = 3 years in school) by
    // the end of the season BEFORE targetYear. Check their class at step-1.
    const priorCls = advanceClass(curCls, step - 1)
    if (!priorCls) continue
    const priorIsRS = priorCls.startsWith('RS ')
    const priorBase = priorCls.replace(/^RS\s+/i, '').trim()
    const isEligible = priorIsRS
      ? ['So', 'Jr', 'Sr'].includes(priorBase)  // RS So / RS Jr / RS Sr all eligible
      : ['Jr', 'Sr'].includes(priorBase)          // only Jr+ on standard track
    if (!isEligible) continue
    const currentOvr = ovrForYear(p, currentYear)
    if ((currentOvr ?? 0) < NFL_DRAFT_OVR_THRESHOLD) continue
    const projOvr = projectOvrForward(currentOvr, curCls, devForYear(p, currentYear, currentYear), step)
    out.push({
      pid: p.pid, player: p, name: p.name,
      position: resolvePosition(p, currentYear),
      projectedClass: projCls,
      projectedOvr: projOvr,
      devTrait: devForYear(p, currentYear, currentYear),
      isNflCandidate: true,
    })
  }
  return out
}
