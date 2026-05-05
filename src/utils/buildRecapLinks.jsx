import { Link } from 'react-router-dom'
import { TEAMS, isFCSPlaceholderAbbr } from '../data/teamRegistry'
import { stripMascotFromName } from '../data/teams'

/**
 * Build the link entries consumed by <FormattedRecap playerLinks> so an
 * AI-generated recap auto-links team names and game scores.
 *
 * Two link types, three pattern flavors:
 *
 *   TEAM links →  /team/:tid/:year
 *     - Literal: full mascot ("Alabama Crimson Tide") and school-only ("Alabama")
 *     - Raw regex with optional rank prefix: "#9 Alabama" matches as a single
 *       link to the team page so the rank reads as part of the team mention.
 *
 *   GAME (score) links →  /game/:id
 *     - Literal score "X-Y" — only when uniquely owned by one game in the year.
 *     - Raw regex with team-name lookbehind for shared scores: when 56-35
 *       belongs to TWO games in the year, the bare score is ambiguous; we
 *       instead register lookbehind patterns that match the score ONLY
 *       when a specific team's name appears just before it. The match is
 *       only the score itself, leaving the team name free to be linked
 *       separately by the team-link pattern.
 *
 * Mascot-only patterns ("Tigers", "Bulldogs") are intentionally skipped
 * because too many FBS programs share them.
 */
export default function buildRecapLinks(dynasty, year, pathPrefix) {
  if (!dynasty || !pathPrefix) return []
  const yearNum = Number(year)
  const teams = dynasty.teams || TEAMS
  const links = []

  // Helper: regex-escape a literal so it can be embedded inside a raw regex.
  const escForRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // ----- Team links -----
  // First pass: collect every team that played in this year, plus a count
  // of games played. We need games-played to disambiguate stripped school
  // names — e.g. "Miami" is shared by Miami Hurricanes (FL) and Miami
  // Redhawks (OH); the team with more games this year is the more likely
  // subject of any "Miami" mention in the recap.
  const teamEntries = new Map() // tNum -> { fullName, school, gamesPlayed }
  for (const g of (dynasty.games || [])) {
    if (Number(g?.year) !== yearNum) continue
    for (const tid of [g.team1Tid, g.team2Tid]) {
      if (tid == null) continue
      const tNum = Number(tid)
      if (!teamEntries.has(tNum)) {
        const t = teams[tNum]
        const fallbackAbbr = (g.team1Tid === tid ? g.team1 : g.team2) || null
        const abbr = t?.abbr || fallbackAbbr
        if (abbr && isFCSPlaceholderAbbr(abbr)) continue
        const fullName = t?.name || t?.fullName
        if (!fullName) continue
        const school = stripMascotFromName(fullName)
        teamEntries.set(tNum, {
          fullName,
          school: school && school !== fullName ? school : null,
          gamesPlayed: 0,
        })
      }
      const entry = teamEntries.get(tNum)
      if (entry) entry.gamesPlayed += 1
    }
  }

  // Resolve ambiguous school-only names: when 2+ teams share the same
  // stripped school name (e.g. "Miami"), only the team with the most
  // games played in this year claims it. Ties drop the school pattern
  // for everyone — readers must use the full mascot name to disambiguate.
  const schoolClaims = new Map() // school -> { tNum, gamesPlayed, tied }
  for (const [tNum, entry] of teamEntries) {
    if (!entry.school) continue
    const existing = schoolClaims.get(entry.school)
    if (!existing) {
      schoolClaims.set(entry.school, { tNum, gamesPlayed: entry.gamesPlayed, tied: false })
    } else if (entry.gamesPlayed > existing.gamesPlayed) {
      schoolClaims.set(entry.school, { tNum, gamesPlayed: entry.gamesPlayed, tied: false })
    } else if (entry.gamesPlayed === existing.gamesPlayed) {
      existing.tied = true
    }
  }

  for (const [tNum, entry] of teamEntries) {
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

    const namePatterns = new Set()
    namePatterns.add(entry.fullName)
    if (entry.school) {
      const claim = schoolClaims.get(entry.school)
      // Only register the bare school name if this team is the unambiguous
      // (or majority-games) claimant. Otherwise, "Miami" linking to the
      // wrong Miami is worse than no link at all — readers can still
      // click the full name.
      if (claim && !claim.tied && claim.tNum === tNum) {
        namePatterns.add(entry.school)
      }
    }

    for (const p of namePatterns) {
      if (!p || p.length < 3) continue
      // Rank-prefixed form: "#9 Alabama" links as a single block to the
      // team page. Raw regex so the leading "#" + digits + space is part
      // of the match. The non-word lookbehind keeps "blah#9 Alabama"
      // from matching, and the trailing \b prevents the shorter pattern
      // ("#9 Alabama") from clipping into a longer team name match
      // ("#9 Alabama Crimson Tide") — the longer raw pattern is tried
      // first by FormattedRecap's compile sort, so the trailing \b only
      // matters when no longer pattern applies.
      links.push({
        regex: `(?<![A-Za-z0-9_])#\\d{1,2}\\s+${escForRegex(p)}\\b`,
        render: renderTeam,
      })
      // Plain literal — fallback when no rank prefix appears in prose.
      links.push({ pattern: p, render: renderTeam })
    }
  }

  // ----- Game (score) links -----
  // Build per-game inventory: { id, hi, lo, score, team1Names, team2Names }.
  const yearGames = []
  for (const g of (dynasty.games || [])) {
    if (Number(g?.year) !== yearNum) continue
    if (!g.id) continue
    const s1 = g.team1Score, s2 = g.team2Score
    if (typeof s1 !== 'number' || typeof s2 !== 'number') continue
    const hi = Math.max(s1, s2)
    const lo = Math.min(s1, s2)
    const score = `${hi}-${lo}`
    const namesFor = (tid, fallback) => {
      const t = tid != null ? teams[Number(tid)] : null
      const full = t?.name || t?.fullName || fallback
      if (!full) return []
      const set = new Set([full])
      const school = stripMascotFromName(full)
      if (school && school !== full) set.add(school)
      return [...set].filter(n => n && n.length >= 3)
    }
    yearGames.push({
      id: g.id,
      score,
      team1Names: namesFor(g.team1Tid, g.team1),
      team2Names: namesFor(g.team2Tid, g.team2),
    })
  }

  // Group by score so we can detect ambiguity (two+ games with same score).
  const scoreGroups = new Map()
  for (const yg of yearGames) {
    if (!scoreGroups.has(yg.score)) scoreGroups.set(yg.score, [])
    scoreGroups.get(yg.score).push(yg)
  }

  const renderGameFor = (gameHref) => (text, key) => (
    <Link
      key={key}
      to={gameHref}
      className="hover:underline underline-offset-2 decoration-zinc-500"
    >
      {text}
    </Link>
  )

  for (const [score, group] of scoreGroups.entries()) {
    if (group.length === 1) {
      // Score is unique — register a plain literal pattern. Bare "X-Y"
      // anywhere in the recap text links to the one game with that score.
      const gameHref = `${pathPrefix}/game/${group[0].id}`
      links.push({ pattern: score, render: renderGameFor(gameHref) })
      continue
    }
    // Score is shared by 2+ games. Register lookbehind patterns per team
    // so the bare score still becomes a link, but only when the prose has
    // disambiguated which game by mentioning a team right before. The
    // match itself is JUST the score — the team name is left in the
    // surrounding text for the team-link pattern to pick up separately.
    const escScore = escForRegex(score)
    for (const yg of group) {
      const gameHref = `${pathPrefix}/game/${yg.id}`
      const allTeamNames = [...yg.team1Names, ...yg.team2Names]
      for (const name of allTeamNames) {
        // Lookbehind: assert team name + whitespace appears before the score.
        // \b after the name keeps "Tennessee" from matching inside "TennesseeX".
        // [^\\n]{0,4} accommodates punctuation/markup like "Tennessee, 56-35"
        // without straying so far it picks up the wrong team in long prose.
        links.push({
          regex: `(?<=${escForRegex(name)}\\b[^\\n]{0,4})${escScore}`,
          render: renderGameFor(gameHref),
        })
      }
    }
  }

  return links
}
