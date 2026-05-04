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
          className="hover:underline underline-offset-2 decoration-zinc-500"
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
  // Three pattern flavors per game, in priority order (longer = more
  // specific — FormattedRecap's regex sort tries longer patterns first):
  //
  //   1. "{TeamSchool} {hi}-{lo}" — covers the AI's typical "Alabama beat
  //      Tennessee 56-35" phrasing where the score sits right after the
  //      losing team. We register both teams' school names with the
  //      score so either order (X beat Y, X 56-35, etc.) catches.
  //   2. "{hi}-{lo}" alone — only when no other game in the year shares
  //      the score. Catches bare-score mentions like "**52-51**" in a
  //      headline.
  //
  // Disambiguation: every pattern (whether team+score or bare score) is
  // tested for cross-game uniqueness. If two games would map the same
  // pattern to different game IDs, we drop the pattern rather than
  // mis-link.
  const renderGameFor = (gameHref) => (text, key) => (
    <Link
      key={key}
      to={gameHref}
      className="hover:underline underline-offset-2 decoration-zinc-500"
    >
      {text}
    </Link>
  )

  // patternToGameId — pattern string -> { gameId, count } so we can
  // detect duplicates and drop ambiguous patterns.
  const patternToGameId = new Map()
  const registerCandidate = (pattern, gameId) => {
    if (!pattern || !gameId) return
    const existing = patternToGameId.get(pattern)
    if (existing && existing.gameId !== gameId) {
      patternToGameId.set(pattern, { gameId: null, count: existing.count + 1 })
    } else if (!existing) {
      patternToGameId.set(pattern, { gameId, count: 1 })
    }
  }

  for (const g of (dynasty.games || [])) {
    if (Number(g?.year) !== yearNum) continue
    if (!g.id) continue
    const s1 = g.team1Score, s2 = g.team2Score
    if (typeof s1 !== 'number' || typeof s2 !== 'number') continue
    const hi = Math.max(s1, s2)
    const lo = Math.min(s1, s2)
    const score = `${hi}-${lo}`

    // Team-prefixed forms — for each team in the game, register both
    // full mascot name + score and school-only + score. School-only is
    // what the AI most often uses ("Alabama 56-35", "Tennessee 56-35").
    for (const tid of [g.team1Tid, g.team2Tid]) {
      if (tid == null) continue
      const t = teams[Number(tid)]
      const fullName = t?.name || t?.fullName
      if (!fullName) continue
      const school = stripMascotFromName(fullName) || fullName
      registerCandidate(`${school} ${score}`, g.id)
      if (school !== fullName) registerCandidate(`${fullName} ${score}`, g.id)
    }

    // Bare-score form — registered as a candidate; will be kept only if
    // unique across the season's games.
    registerCandidate(score, g.id)
  }

  for (const [pattern, info] of patternToGameId.entries()) {
    if (!info.gameId) continue // ambiguous — skip rather than mis-link
    const gameHref = `${pathPrefix}/game/${info.gameId}`
    links.push({ pattern, render: renderGameFor(gameHref) })
  }

  return links
}
