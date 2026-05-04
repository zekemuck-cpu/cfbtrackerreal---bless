import { Link } from 'react-router-dom'
import { TEAMS, isFCSPlaceholderAbbr } from '../data/teamRegistry'
import { stripMascotFromName } from '../data/teams'

/**
 * Build the {pattern, render} array consumed by <FormattedRecap playerLinks>
 * so an AI-generated recap auto-links team names and game scores.
 *
 * Two link types:
 *   - Team link: full mascot name, school-only name, common short name —
 *     each renders to the team page for the recap year (/dynasty/:id/team/:tid/:year).
 *   - Game link: a score string like "56-35" matched anywhere in the recap.
 *     We only register score patterns that map UNAMBIGUOUSLY to a single
 *     game in the year — when multiple games share the same final score
 *     we skip auto-linking that score (linking the wrong game is worse
 *     than not linking at all).
 *
 * Patterns registered through this helper share a single regex and the
 * longer patterns win (via FormattedRecap's compile sort), so "Crimson
 * Tide" beats "Tide" cleanly.
 */
export default function buildRecapLinks(dynasty, year, pathPrefix) {
  if (!dynasty || !pathPrefix) return []
  const yearNum = Number(year)
  const teams = dynasty.teams || TEAMS
  const links = []

  // ----- Team links -----
  // For every team referenced by a game in this year, register every form
  // we can think of: full name, school-only, mascot-only. The team page
  // lives at /team/:tid/:year so the year query keeps the user on the same
  // season they're recapping.
  const seenTids = new Set()
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
      const teamHref = `${pathPrefix}/team/${tNum}/${yearNum}`
      const renderTeam = (text, key) => (
        <Link
          key={key}
          to={teamHref}
          className="text-team-primary hover:underline font-normal"
          style={{ color: 'var(--team-primary)' }}
        >
          {text}
        </Link>
      )
      const patterns = new Set()
      patterns.add(fullName)
      const school = stripMascotFromName(fullName)
      if (school && school !== fullName) patterns.add(school)
      // The mascot alone is too ambiguous (multiple "Tigers" / "Bulldogs"
      // in FBS), so we don't register mascot-only patterns. Full name and
      // school-only is the right balance.
      for (const p of patterns) {
        if (!p || p.length < 3) continue
        links.push({ pattern: p, render: renderTeam })
      }
    }
  }

  // ----- Game links -----
  // Group games by their "score string" — when only one game in the year
  // has a given score, that score is unambiguous and we link it.
  const scoreToGames = new Map() // 'X-Y' -> [{ id, year }]
  for (const g of (dynasty.games || [])) {
    if (Number(g?.year) !== yearNum) continue
    if (!g.id) continue
    const s1 = g.team1Score, s2 = g.team2Score
    if (typeof s1 !== 'number' || typeof s2 !== 'number') continue
    // Register both orderings since the AI's prose can phrase a score
    // either way ("Alabama 56-35" or "35-56 Tennessee" are vanishingly
    // rare with the loser-first form, but normalize anyway).
    const hi = Math.max(s1, s2)
    const lo = Math.min(s1, s2)
    const score = `${hi}-${lo}`
    if (!scoreToGames.has(score)) scoreToGames.set(score, [])
    scoreToGames.get(score).push({ id: g.id })
  }
  for (const [score, list] of scoreToGames.entries()) {
    if (list.length !== 1) continue // ambiguous — skip rather than mis-link
    const gameId = list[0].id
    const gameHref = `${pathPrefix}/game/${gameId}`
    const renderGame = (text, key) => (
      <Link
        key={key}
        to={gameHref}
        className="text-team-primary hover:underline font-normal"
        style={{ color: 'var(--team-primary)' }}
      >
        {text}
      </Link>
    )
    links.push({ pattern: score, render: renderGame })
  }

  return links
}
