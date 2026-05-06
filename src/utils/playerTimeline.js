// Single source of truth for a player's timeline derivation.
//
// Every surface that shows timeline events (the full Timeline tab, the
// Overview sidebar, summary chips, etc.) should call `buildTimelineEvents`
// and render from the returned list. Rules live here, in one place — so
// a recommit labeled correctly in the sidebar is also labeled correctly in
// the full timeline, the editor summary, anywhere else.
//
// Input:
//   player       — raw player object (player.teamsByYear, movementByYear,
//                  movements[], isPortal, previousTeam, recruitYear)
//   resolveTid   — function to resolve a tid or team ref to a numeric tid
//                  (required so we can compare team identity robustly)
//
// Output:
//   {
//     years,              // sorted numeric season years present in teamsByYear
//     firstYear,          // years[0]
//     teamsByYear,        // normalized { year → tid }
//     events,             // canonical event list (see below)
//     showRecruitmentNode // whether the "Committed" pre-season node is valid
//   }
//
// Each event:
//   {
//     year,               // the season year this event sits against
//     placement,          // 'before' (top of year) | 'after' (bottom of year)
//     kind,               // 'committed' | 'recommit' | 'transfer' | 'portal_exit'
//                         //  | 'juco_in' | 'encouraged' | 'graduated'
//                         //  | 'departure'
//     fromTid, toTid,
//     reason,             // optional free text
//   }
//
// Placement rules (so every view renders identically):
//
//   - 'committed'    → AT earliest year (placement 'before')
//   - 'recommit'     → BEFORE the year the player returned (i.e., year+1
//                      relative to the portal-entry year). Means "left end
//                      of Y and came back to the same school for Y+1".
//   - 'transfer'     → BEFORE the destination year. Means "left end of Y,
//                      plays for a different school in Y+1".
//   - 'portal_exit'  → AFTER the final year with a team (player left and
//                      never returned in teamsByYear).
//   - 'juco_in'      → BEFORE earliest year (placement 'before').
//   - 'encouraged'   → BEFORE year+1 (end-of-season event).
//   - 'graduated'    → AFTER the final year (placement 'after').
//   - 'departure'    → AFTER the relevant year.
//
// The crucial invariant: transition events ALWAYS attach to a season row,
// never float between rows. `placement` tells the renderer whether to show
// it above or below that row. Views never guess.

export function buildTimelineEvents(player, { resolveTid } = {}) {
  const resolve = resolveTid || ((v) => (v == null ? null : Number(v)))
  const teamsByYearRaw = player?.teamsByYear || {}
  const teamsByYear = {}
  for (const [y, t] of Object.entries(teamsByYearRaw)) {
    const yr = Number(y)
    if (!Number.isFinite(yr)) continue
    if (t == null || t === '') continue
    teamsByYear[yr] = resolve(t)
  }
  const years = Object.keys(teamsByYear).map(Number).sort((a, b) => a - b)
  const firstYear = years[0]
  const lastYear = years[years.length - 1]

  const sameTeam = (a, b) => {
    if (a == null || b == null) return false
    return Number(a) === Number(b)
  }
  const nextYearAfter = (y) => {
    for (let i = 0; i < years.length; i++) {
      if (years[i] > y) return years[i]
    }
    return null
  }

  const events = []
  const pushEvent = (evt) => {
    // Dedupe — a canonical list is useful only if we don't double-stamp
    // recommit/transfer for the same boundary (can happen when movements[]
    // and movementByYear both carry the same info).
    const exists = events.some(e =>
      e.year === evt.year &&
      e.placement === evt.placement &&
      e.kind === evt.kind
    )
    if (!exists) events.push(evt)
  }

  // ---- Movements / movementByYear → canonical events -----------------------
  const byYearRaw = player?.movementByYear || {}
  const legacy = Array.isArray(player?.movements) ? player.movements : []

  // Combine sources keyed by year → array of movement-type tokens plus the
  // richer raw record for reason/from/to access.
  const rawByYear = new Map()
  const pushRaw = (yr, m) => {
    if (!Number.isFinite(yr) || !m?.type) return
    if (!rawByYear.has(yr)) rawByYear.set(yr, [])
    rawByYear.get(yr).push(m)
  }
  for (const [y, m] of Object.entries(byYearRaw)) pushRaw(Number(y), m)
  for (const m of legacy) pushRaw(Number(m.year), m)

  for (const [yr, movements] of rawByYear.entries()) {
    for (const rawMovement of movements) {
      // Canonical v2 shapes carry the variant in m.arrival / m.departure
      // — translate them up-front to the legacy enum the rest of this
      // function already handles. Keeps the existing event-emission
      // logic intact and avoids dropping canonical movements on the
      // floor (which silenced graduation chips, draft chips, etc.).
      let type = rawMovement.type
      let m = rawMovement
      if (type === 'departure') {
        switch (rawMovement.departure) {
          case 'graduated': type = 'graduated'; break
          case 'pro_draft': type = 'declared_for_draft'; break
          case 'transfer_out':
            type = 'transferred_out'
            m = { ...rawMovement, toTeamTid: rawMovement.toTid ?? rawMovement.toTeamTid ?? null }
            break
          default: type = 'departure'
        }
      } else if (type === 'arrival') {
        switch (rawMovement.arrival) {
          case 'recruit': type = 'recruited'; break
          case 'transfer_in':
            type = 'portal_in'
            m = { ...rawMovement, from: rawMovement.fromTid ?? rawMovement.from ?? null }
            break
          case 'juco': type = 'juco_in'; break
          case 'walk_on': type = 'added'; break
          default: type = 'recruited'
        }
      } else if (type === 'recommit') {
        type = 'recommitted'
      }
      if (type === 'entered_portal' || type === 'transferred_out' || type === 'transfer') {
        // End-of-season portal entry. Placement is determined by what
        // happened NEXT: same school → recommit, different school → transfer,
        // none → portal_exit.
        const nextYr = nextYearAfter(yr)
        if (nextYr != null) {
          const here = teamsByYear[yr]
          const there = teamsByYear[nextYr]
          const kind = sameTeam(here, there) ? 'recommit' : 'transfer'
          pushEvent({
            year: nextYr,
            placement: 'before',
            kind,
            fromTid: here,
            toTid: there,
            reason: m.reason,
          })
        } else {
          // No subsequent season — player exited via portal and didn't
          // re-enroll.
          pushEvent({
            year: yr,
            placement: 'after',
            kind: 'portal_exit',
            fromTid: teamsByYear[yr],
            reason: m.reason,
          })
        }
      } else if (type === 'recommitted' || type === 'recommit') {
        // Legacy explicit recommit — attach to the following year.
        const nextYr = nextYearAfter(yr) ?? yr
        pushEvent({
          year: nextYr,
          placement: 'before',
          kind: 'recommit',
          fromTid: teamsByYear[yr],
          toTid: teamsByYear[nextYr],
          reason: m.reason,
        })
      } else if (type === 'encouraged_to_transfer' || type === 'encouraged_transfer') {
        const nextYr = nextYearAfter(yr) ?? yr
        pushEvent({
          year: nextYr,
          placement: 'before',
          kind: 'encouraged',
          fromTid: teamsByYear[yr],
          reason: m.reason,
        })
      } else if (type === 'graduated') {
        pushEvent({
          year: yr,
          placement: 'after',
          kind: 'graduated',
          fromTid: teamsByYear[yr],
          reason: m.reason,
        })
      } else if (type === 'committed' || type === 'recruited') {
        // Committed events anchor the recruitment node, not a season chip.
        // They're represented via `showRecruitmentNode` below — no entry
        // needed in `events`.
      } else if (type === 'portal_in' || type === 'added' || type === 'juco_in') {
        // Join events are represented by recruitment node / the first
        // season row itself.
        if (type === 'juco_in') {
          pushEvent({
            year: firstYear ?? yr,
            placement: 'before',
            kind: 'juco_in',
            toTid: teamsByYear[firstYear ?? yr],
          })
        }
      } else if (type === 'departure') {
        pushEvent({
          year: yr,
          placement: 'after',
          kind: 'departure',
          fromTid: teamsByYear[yr],
          reason: m.reason,
        })
      }
    }
  }

  // ---- Infer missing transitions from teamsByYear -------------------------
  // If team changed between consecutive seasons but no explicit event was
  // recorded, synthesize a 'transfer' at the destination's 'before' slot so
  // the user can still see the move.
  for (let i = 1; i < years.length; i++) {
    const prevYear = years[i - 1]
    const thisYear = years[i]
    if (!sameTeam(teamsByYear[prevYear], teamsByYear[thisYear])) {
      const alreadyHasBoundary = events.some(
        e => e.year === thisYear && e.placement === 'before' && (e.kind === 'recommit' || e.kind === 'transfer')
      )
      if (!alreadyHasBoundary) {
        pushEvent({
          year: thisYear,
          placement: 'before',
          kind: 'transfer',
          fromTid: teamsByYear[prevYear],
          toTid: teamsByYear[thisYear],
        })
      }
    }
  }

  // ---- Recruitment node validity ------------------------------------------
  // Only show a "Committed" pre-season node when the recorded recruitYear
  // actually precedes (or matches) the first season. A stale recruitYear
  // AFTER the first season means the player was already on the roster
  // before that commitment event — ignore it.
  const recruitYear = Number(player?.recruitYear)
  const showRecruitmentNode = (() => {
    if (!(player?.recruitYear || player?.stars || player?.nationalRank)) return false
    if (!Number.isFinite(recruitYear)) return true
    if (!Number.isFinite(firstYear)) return true
    return recruitYear <= firstYear
  })()

  return {
    years,
    firstYear,
    lastYear,
    teamsByYear,
    events,
    showRecruitmentNode,
  }
}

// Helper: find events for a specific year + placement.
export function eventsForYear(timeline, year, placement) {
  return timeline.events.filter(e => e.year === year && e.placement === placement)
}

// Map a canonical event `kind` to a user-facing short label (single word when
// possible). Kept as a pure function so every view uses the same strings.
export function labelForEventKind(kind) {
  switch (kind) {
    case 'committed':   return 'Committed'
    case 'recommit':    return 'Recommit'
    case 'transfer':    return 'Transfer Portal'
    case 'portal_exit': return 'Transfer Portal'
    case 'juco_in':     return 'JUCO Transfer'
    case 'encouraged':  return 'Encouraged'
    case 'graduated':   return 'Graduated'
    case 'departure':   return 'Departure'
    default:            return null
  }
}
