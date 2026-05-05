// Build the set of recap-prose naming rules for a given dynasty year. The
// AI that generates recap prose needs to know exactly what to call each
// team — and the link auto-detector that runs over the recap needs to
// recognize those same names. Without a shared source of truth, the two
// drift and "Miami" in prose links to whichever Miami the link builder
// happened to register first (the original Miami (OH) misroute).
//
// Returned shape per team:
//   {
//     tid,
//     display,       // canonical short name to use in prose (e.g. "Miami" or "Miami (OH)")
//     fullName,      // mascot name (e.g. "Miami Hurricanes")
//     alts,          // additional accepted names for link matching
//   }

import { stripMascotFromName } from '../data/teams'
import { TEAMS, isFCSPlaceholderAbbr } from '../data/teamRegistry'

// Pull a disambiguator from an abbreviation like "M-OH" -> "OH". Used as
// the parenthetical suffix when a stripped school name is shared by 2+
// teams and we have to pick a non-primary form for the secondary teams.
function disambiguatorFromAbbr(abbr) {
  if (typeof abbr !== 'string') return null
  const dash = abbr.indexOf('-')
  if (dash === -1) return null
  const suffix = abbr.slice(dash + 1).trim()
  return suffix.length > 0 ? suffix : null
}

export function buildRecapTeamNames(dynasty, year) {
  if (!dynasty) return []
  const yearNum = Number(year)
  const teams = dynasty.teams || TEAMS

  // Collect every team that played in the year. We mirror the inclusion
  // rule of buildRecapLinks (skip FCS placeholders, require a full name).
  const seenTids = new Set()
  const entries = []
  for (const g of (dynasty.games || [])) {
    if (Number(g?.year) !== yearNum) continue
    for (const tid of [g.team1Tid, g.team2Tid]) {
      if (tid == null) continue
      const tNum = Number(tid)
      if (seenTids.has(tNum)) continue
      seenTids.add(tNum)
      const t = teams[tNum]
      const fallbackAbbr = (g.team1Tid === tid ? g.team1 : g.team2) || null
      const abbr = t?.abbr || fallbackAbbr
      if (abbr && isFCSPlaceholderAbbr(abbr)) continue
      const fullName = t?.name || t?.fullName
      if (!fullName) continue
      const school = stripMascotFromName(fullName)
      entries.push({
        tid: tNum,
        abbr,
        fullName,
        school: school && school !== fullName ? school : null,
      })
    }
  }

  // Group by stripped school name to find ambiguity (e.g. "Miami" → 2 tids).
  const groupsBySchool = new Map()
  for (const e of entries) {
    if (!e.school) continue
    if (!groupsBySchool.has(e.school)) groupsBySchool.set(e.school, [])
    groupsBySchool.get(e.school).push(e)
  }

  // Designate a primary team per ambiguous group. Heuristic: the team
  // whose abbreviation is NOT hyphenated. The hyphen ("M-OH") is the
  // existing in-data signal that this team is the "secondary" one.
  // Fallback when neither/both are hyphenated: lowest tid wins primary.
  const primaryTidBySchool = new Map()
  for (const [school, group] of groupsBySchool) {
    if (group.length < 2) {
      primaryTidBySchool.set(school, group[0].tid)
      continue
    }
    const noDash = group.filter(e => !disambiguatorFromAbbr(e.abbr))
    const candidates = noDash.length > 0 ? noDash : group
    const primary = candidates.reduce((best, cur) => (cur.tid < best.tid ? cur : best), candidates[0])
    primaryTidBySchool.set(school, primary.tid)
  }

  // Build the final rule per team.
  return entries.map(e => {
    let display
    const alts = []
    if (e.school) {
      const primaryTid = primaryTidBySchool.get(e.school)
      const isPrimary = primaryTid === e.tid
      if (isPrimary) {
        display = e.school
        alts.push(e.fullName)
      } else {
        const suffix = disambiguatorFromAbbr(e.abbr)
        if (suffix) {
          display = `${e.school} (${suffix})`
          alts.push(e.fullName)
          // Don't include the bare school name — that goes to the primary.
        } else {
          // No suffix to fall back to; force users to the full mascot name.
          display = e.fullName
        }
      }
    } else {
      // Non-stripable name (e.g. "Charlotte 49ers" if strip returns the
      // full string). Use the full name as display.
      display = e.fullName
    }
    return { tid: e.tid, display, fullName: e.fullName, alts }
  })
}

// Rules that the AI prompt should explicitly state — only for teams whose
// "display" differs from the bare school strip OR who share a stripped
// name with another team. Empty array = nothing to clarify in the prompt.
export function ambiguousNamingRules(dynasty, year) {
  const rules = buildRecapTeamNames(dynasty, year)
  // Group again to find ambiguous schools so we can describe BOTH sides
  // in the prompt (otherwise the AI doesn't know which Miami is "the"
  // Miami).
  const bySchool = new Map()
  for (const r of rules) {
    const school = stripMascotFromName(r.fullName)
    if (!school || school === r.fullName) continue
    if (!bySchool.has(school)) bySchool.set(school, [])
    bySchool.get(school).push(r)
  }
  const out = []
  for (const [school, group] of bySchool) {
    if (group.length < 2) continue
    out.push({
      school,
      teams: group.map(r => ({ tid: r.tid, fullName: r.fullName, display: r.display })),
    })
  }
  return out
}
