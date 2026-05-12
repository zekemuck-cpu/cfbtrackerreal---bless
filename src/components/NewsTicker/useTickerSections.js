import { useMemo } from 'react'
import { teamAbbreviations } from '../../data/teamAbbreviations'
import { getCurrentSchedule, getUserGamePerspective, getTeamRecord } from '../../context/DynastyContext'
import { TEAMS, resolveTid, getGameTeamInfo, getAbbrFromTeamName, getCurrentTeamTid, getTidFromAbbr } from '../../data/teamRegistry'
import { getPlayerStatsForTid } from '../../utils/boxScoreHelpers'
import { isSameWeek, isSameYear } from '../../utils/compareUtils'
import { formatScoreHighLow } from '../../utils/scoreFormat'

// Get abbreviation - handles both full names and abbreviations
function getTeamAbbr(teamIdentifier, dynastyTeams = null) {
  if (!teamIdentifier) return null
  if (teamAbbreviations[teamIdentifier]) return teamIdentifier
  return getAbbrFromTeamName(teamIdentifier, dynastyTeams) || teamIdentifier
}

// Get game order for sorting
function getGameOrder(g) {
  if (g.gameType === 'conference_championship') return 100
  if (g.gameType === 'cfp_first_round') return 101
  if (g.gameType === 'cfp_quarterfinal') return 102
  if (g.gameType === 'cfp_semifinal') return 103
  if (g.gameType === 'cfp_championship') return 104
  if (g.gameType === 'bowl') return 150 + (g.week || 0)
  return g.week || 0
}

// Check if a game has been played (has scores entered)
function isGamePlayed(g) {
  if (g.isPlayed) return true
  // Check if either team has a score > 0
  const team1Score = g.team1Score ?? g.teamScore ?? 0
  const team2Score = g.team2Score ?? g.opponentScore ?? 0
  return team1Score > 0 || team2Score > 0
}

/**
 * Simplified ticker sections - returns array of sections with guaranteed valid data
 */
export function useTickerSections(dynasty) {
  return useMemo(() => {
    if (!dynasty) return []

    const sections = []
    const teams = dynasty?.teams || TEAMS
    const currentTeamTid = getCurrentTeamTid(dynasty)
    const teamAbbr = currentTeamTid ? (teams[currentTeamTid]?.abbr || getTeamAbbr(dynasty.teamName, teams)) : getTeamAbbr(dynasty.teamName, teams)
    const currentYear = dynasty.currentYear

    // Helper to get game info using perspective
    const getGameInfo = (g) => {
      if (!g.perspective) return null
      const userTeamInfo = g.perspective.userTid
        ? getGameTeamInfo(teams, g.perspective.userTid)
        : null
      const opponentInfo = g.perspective.opponentTid
        ? getGameTeamInfo(teams, g.perspective.opponentTid)
        : null
      return {
        userTeamAbbr: userTeamInfo?.abbr || g.userTeam,
        opponentAbbr: opponentInfo?.abbr || g.opponent,
        userScore: g.perspective.userScore ?? g.teamScore,
        opponentScore: g.perspective.opponentScore ?? g.opponentScore,
        isWin: g.perspective.userWon,
        location: g.perspective.isHome ? 'home' : (g.perspective.isAway ? 'away' : 'neutral')
      }
    }

    // Get current team's games with perspective attached (only played games)
    const currentTeamGames = (dynasty.games || [])
      .map(g => {
        const perspective = getUserGamePerspective(g, dynasty)
        return perspective ? { ...g, perspective } : null
      })
      .filter(g => {
        if (!g) return false
        const info = getGameInfo(g)
        // Check if this game is for the current team, has a result, and has been played
        return info?.userTeamAbbr === teamAbbr && g.perspective && isGamePlayed(g)
      })
      .sort((a, b) => Number(b.year) - Number(a.year))

    // Try current year first, fall back to most recent year with games for this team
    let displayYear = currentYear
    let seasonGames = currentTeamGames.filter(g => Number(g.year) === currentYear)

    if (seasonGames.length === 0 && currentTeamGames.length > 0) {
      displayYear = Number(currentTeamGames[0].year)
      seasonGames = currentTeamGames.filter(g => Number(g.year) === displayYear)
    }

    seasonGames = seasonGames.sort((a, b) => getGameOrder(a) - getGameOrder(b))

    // Use centralized single-source-of-truth record for displayYear (not currentYear)
    // This ensures record matches the displayed games even after advancing to a new season
    const teamRecord = getTeamRecord(dynasty, currentTeamTid, displayYear)
    const wins = teamRecord?.wins || 0
    const losses = teamRecord?.losses || 0
    const record = `${wins}-${losses}`

    // === 1. SEASON OVERVIEW ===
    if (seasonGames.length > 0) {
      const totalPF = seasonGames.reduce((sum, g) => {
        const info = getGameInfo(g)
        return sum + (Number(info?.userScore) || 0)
      }, 0)
      const totalPA = seasonGames.reduce((sum, g) => {
        const info = getGameInfo(g)
        return sum + (Number(info?.opponentScore) || 0)
      }, 0)
      const diff = totalPF - totalPA

      // Calculate current streak (W3, L2, etc.)
      let streak = ''
      if (seasonGames.length > 0) {
        const sortedGames = [...seasonGames].sort((a, b) => getGameOrder(b) - getGameOrder(a))
        const lastResult = sortedGames[0]?.perspective?.userWon
        if (lastResult !== undefined) {
          let count = 0
          for (const g of sortedGames) {
            if (g.perspective?.userWon === lastResult) count++
            else break
          }
          streak = lastResult ? `W${count}` : `L${count}`
        }
      }

      const items = [
        { id: 'record', label: 'Record', text: record }
      ]
      if (streak) {
        items.push({ id: 'streak', label: 'Streak', text: streak, labelColor: streak.startsWith('W') ? '#22c55e' : '#ef4444' })
      }
      items.push(
        { id: 'pf', label: 'PF', text: String(totalPF) },
        { id: 'pa', label: 'PA', text: String(totalPA) },
        { id: 'diff', label: 'Diff', text: diff >= 0 ? `+${diff}` : String(diff) }
      )

      sections.push({
        type: 'season',
        label: `${displayYear} SEASON`,
        teamLogo: teamAbbr,
        teamRecord: record,
        items
      })
    }

    // === 2. UPCOMING GAME (only if in regular season with upcoming game) ===
    const schedule = getCurrentSchedule(dynasty)
    const upcoming = schedule?.find(g => isSameWeek(g.week, dynasty.currentWeek))

    if (upcoming && dynasty.currentPhase === 'regular_season') {
      // Check if it's a BYE week
      if (upcoming.isBye || upcoming.opponent === 'BYE') {
        sections.push({
          type: 'upcoming',
          label: `WEEK ${dynasty.currentWeek}`,
          teamLogo: teamAbbr,
          teamRecord: record,
          items: [{ id: 'bye', label: 'BYE', labelColor: '#9ca3af', text: 'No game this week' }]
        })
      } else if (upcoming.opponent) {
        // Check if game has already been played (has a linked game with scores)
        const linkedGame = upcoming.gameId ? (dynasty.games || []).find(g => g.id === upcoming.gameId) : null
        const hasResult = linkedGame && (linkedGame.team1Score !== undefined || linkedGame.teamScore !== undefined)

        if (!hasResult) {
          // Get opponent abbreviation - prefer opponentTid, fall back to opponent string
          const oppAbbr = upcoming.opponentTid
            ? (teams[upcoming.opponentTid]?.abbr || getTeamAbbr(upcoming.opponent, teams))
            : getTeamAbbr(upcoming.opponent, teams)
          const loc = upcoming.location === 'away' ? '@' : 'vs'
          sections.push({
            type: 'upcoming',
            label: `WEEK ${dynasty.currentWeek}`,
            teamLogo: teamAbbr,
            teamRecord: record,
            opponentLogo: oppAbbr,
            items: [{ id: 'next', label: 'NEXT', labelColor: '#fcd34d', text: `${loc} ${oppAbbr}` }]
          })
        }
      }
    }

    // === 3. GAME LOG ===
    if (seasonGames.length > 0) {
      const items = seasonGames.map((g, i) => {
        const info = getGameInfo(g)
        const opp = info?.opponentAbbr || getTeamAbbr(g.opponent, teams)
        const loc = info?.location === 'away' ? '@' : 'vs'
        const isWin = info?.isWin ?? (g.result === 'win')
        return {
          id: `g${i}`,
          team: opp,
          label: isWin ? 'W' : 'L',
          labelColor: isWin ? '#22c55e' : '#ef4444',
          text: `${loc} ${formatScoreHighLow(info?.userScore ?? g.teamScore, info?.opponentScore ?? g.opponentScore)}`,
          link: g.id ? `/game/${g.id}` : null
        }
      })
      sections.push({
        type: 'games',
        label: 'GAME LOG',
        teamLogo: teamAbbr,
        teamRecord: record,
        items
      })
    }

    // === 4. PER-GAME RECAPS (one section per game with box-score stats) ===
    // ESPN-style: every played game with box score data gets its own section
    // showing the final score + top QB/RB/WR/defender/kicker.
    const findPlayerPidByName = (playerName) => {
      if (!playerName || !dynasty.players) return null
      const player = dynasty.players.find(p => p.name === playerName)
      return player?.pid || null
    }

    const buildGameRecapSection = (game, ownTeamAbbr) => {
      const info = getGameInfo(game)
      const opp = info?.opponentAbbr || getTeamAbbr(game.opponent, teams)
      const isWin = info?.isWin ?? (game.result === 'win')
      const loc = info?.location || game.location
      const ownTid = ownTeamAbbr ? getTidFromAbbr(ownTeamAbbr, teams) : null
      const stats = ownTid != null ? getPlayerStatsForTid(game, ownTid, teams) : null

      const hasStats = (stats?.passing?.length > 0)
        || (stats?.rushing?.length > 0)
        || (stats?.receiving?.length > 0)
        || (stats?.defense?.length > 0)
        || (stats?.kicking?.length > 0)
      if (!hasStats) return null

      const userScore = info?.userScore ?? game.teamScore
      const oppScore = info?.opponentScore ?? game.opponentScore
      const gameLink = game.id ? `/game/${game.id}` : null

      const items = [{
        id: 'score',
        label: isWin ? 'W' : 'L',
        text: `${userScore}-${oppScore}`,
        link: gameLink
      }]

      const passer = stats?.passing?.slice().sort((a, b) => (b.yds || 0) - (a.yds || 0))[0]
      if (passer?.yds > 0) {
        items.push({
          id: 'qb',
          label: passer.playerName || 'QB',
          text: `${passer.cmp || 0}/${passer.att || 0}, ${passer.yds} yds, ${passer.td || 0} TD`,
          link: findPlayerPidByName(passer.playerName)
            ? `/player/${findPlayerPidByName(passer.playerName)}`
            : gameLink
        })
      }

      const rusher = stats?.rushing?.slice().sort((a, b) => (b.yds || 0) - (a.yds || 0))[0]
      if (rusher?.yds > 0) {
        items.push({
          id: 'rb',
          label: rusher.playerName || 'RB',
          text: `${rusher.car || 0} car, ${rusher.yds} yds${rusher.td > 0 ? `, ${rusher.td} TD` : ''}`,
          link: findPlayerPidByName(rusher.playerName)
            ? `/player/${findPlayerPidByName(rusher.playerName)}`
            : gameLink
        })
      }

      const receiver = stats?.receiving?.slice().sort((a, b) => (b.yds || 0) - (a.yds || 0))[0]
      if (receiver?.yds > 0) {
        items.push({
          id: 'wr',
          label: receiver.playerName || 'WR',
          text: `${receiver.rec || 0} rec, ${receiver.yds} yds${receiver.td > 0 ? `, ${receiver.td} TD` : ''}`,
          link: findPlayerPidByName(receiver.playerName)
            ? `/player/${findPlayerPidByName(receiver.playerName)}`
            : gameLink
        })
      }

      // Top defender by combined impact: sacks + INTs + tackles
      const defender = stats?.defense?.slice().sort((a, b) => {
        const impactA = (a.sacks || 0) * 3 + (a.int || 0) * 3 + ((a.soloTkl || 0) + (a.astTkl || 0)) * 0.5
        const impactB = (b.sacks || 0) * 3 + (b.int || 0) * 3 + ((b.soloTkl || 0) + (b.astTkl || 0)) * 0.5
        return impactB - impactA
      })[0]
      if (defender) {
        const tackles = (defender.soloTkl || 0) + (defender.astTkl || 0)
        const parts = []
        if (tackles > 0) parts.push(`${tackles} tkl`)
        if (defender.sacks > 0) parts.push(`${defender.sacks} sack${defender.sacks > 1 ? 's' : ''}`)
        if (defender.int > 0) parts.push(`${defender.int} INT`)
        if (parts.length > 0) {
          items.push({
            id: 'def',
            label: defender.playerName || 'DEF',
            text: parts.join(', '),
            link: findPlayerPidByName(defender.playerName)
              ? `/player/${findPlayerPidByName(defender.playerName)}`
              : gameLink
          })
        }
      }

      // Only emit if we got at least one player line beyond the score
      if (items.length < 2) return null

      return {
        type: 'gamerecap',
        label: `WK ${game.week || '?'}`,
        teamLogo: ownTeamAbbr,
        opponentLogo: opp,
        items
      }
    }

    // Build recaps for current season — most recent first.
    const currentSeasonRecaps = [...seasonGames]
      .sort((a, b) => getGameOrder(b) - getGameOrder(a))
      .map(g => buildGameRecapSection(g, teamAbbr))
      .filter(Boolean)

    currentSeasonRecaps.forEach(s => sections.push(s))

    // === 5. SEASON LEADERS ===
    if (dynasty.players?.length > 0) {
      // Filter players on current team for display year
      // teamsByYear can have either tid (number) or abbr (string) depending on migration status
      const teamPlayers = dynasty.players.filter(p => {
        const playerTeamVal = p.teamsByYear?.[displayYear]
        if (!playerTeamVal || !p.statsByYear?.[displayYear]) return false
        // Tid match wins. For string values, also try resolving the
        // string as an abbr → tid against the current registry, so a
        // teambuilder team renamed mid-dynasty still matches its
        // (now stale) old abbr stored on the player.
        if (typeof playerTeamVal === 'number') return playerTeamVal === currentTeamTid
        if (playerTeamVal === teamAbbr) return true
        const resolvedTid = getTidFromAbbr(playerTeamVal, dynasty)
        return resolvedTid != null && Number(resolvedTid) === Number(currentTeamTid)
      })
      const items = []

      // Helper to get top player for a stat (no minimum threshold)
      const getLeader = (statPath, minValue = 1) => {
        return teamPlayers
          .map(p => {
            const keys = statPath.split('.')
            let val = p.statsByYear[displayYear]
            for (const k of keys) val = val?.[k]
            return { player: p, value: val || 0 }
          })
          .filter(x => x.value >= minValue)
          .sort((a, b) => b.value - a.value)[0]?.player
      }

      // Passing leader (yards)
      const passLeader = getLeader('passing.yds')
      if (passLeader) {
        const s = passLeader.statsByYear[displayYear].passing
        items.push({ id: 'pass', label: passLeader.name, text: `${s.yds.toLocaleString()} yds, ${s.td || 0} TD`, link: `/player/${passLeader.pid}` })
      }

      // Rushing leader (yards)
      const rushLeader = getLeader('rushing.yds')
      if (rushLeader) {
        const s = rushLeader.statsByYear[displayYear].rushing
        items.push({ id: 'rush', label: rushLeader.name, text: `${s.yds.toLocaleString()} yds, ${s.td || 0} TD`, link: `/player/${rushLeader.pid}` })
      }

      // Receiving leader (yards)
      const recLeader = getLeader('receiving.yds')
      if (recLeader) {
        const s = recLeader.statsByYear[displayYear].receiving
        items.push({ id: 'rec', label: recLeader.name, text: `${s.rec || 0} rec, ${s.yds.toLocaleString()} yds, ${s.td || 0} TD`, link: `/player/${recLeader.pid}` })
      }

      // Total TDs leader (passing + rushing + receiving TDs combined)
      const tdLeader = teamPlayers
        .map(p => {
          const stats = p.statsByYear[displayYear]
          const totalTDs = (stats?.passing?.td || 0) + (stats?.rushing?.td || 0) + (stats?.receiving?.td || 0)
          return { player: p, value: totalTDs }
        })
        .filter(x => x.value >= 1)
        .sort((a, b) => b.value - a.value)[0]?.player
      if (tdLeader) {
        const stats = tdLeader.statsByYear[displayYear]
        const totalTDs = (stats?.passing?.td || 0) + (stats?.rushing?.td || 0) + (stats?.receiving?.td || 0)
        items.push({ id: 'tds', label: tdLeader.name, text: `${totalTDs} Total TD`, link: `/player/${tdLeader.pid}` })
      }

      // Sacks leader
      const sackLeader = getLeader('defense.sacks')
      if (sackLeader) {
        const s = sackLeader.statsByYear[displayYear].defense
        items.push({ id: 'sacks', label: sackLeader.name, text: `${s.sacks} Sacks`, link: `/player/${sackLeader.pid}` })
      }

      // Interceptions leader
      const intLeader = getLeader('defense.int')
      if (intLeader) {
        const s = intLeader.statsByYear[displayYear].defense
        items.push({ id: 'ints', label: intLeader.name, text: `${s.int} INT`, link: `/player/${intLeader.pid}` })
      }

      // Tackles leader (solo + assisted)
      const tklLeader = teamPlayers
        .map(p => {
          const def = p.statsByYear[displayYear]?.defense
          const totalTkl = (def?.soloTkl || 0) + (def?.astTkl || 0)
          return { player: p, value: totalTkl }
        })
        .filter(x => x.value >= 1)
        .sort((a, b) => b.value - a.value)[0]?.player
      if (tklLeader) {
        const def = tklLeader.statsByYear[displayYear].defense
        const totalTkl = (def?.soloTkl || 0) + (def?.astTkl || 0)
        items.push({ id: 'tkl', label: tklLeader.name, text: `${totalTkl} Tackles`, link: `/player/${tklLeader.pid}` })
      }

      if (items.length > 0) {
        sections.push({
          type: 'leaders',
          label: `${displayYear} LEADERS`,
          teamLogo: teamAbbr,
          teamRecord: record,
          items
        })
      }
    }

    // === 6. MILESTONE WATCH ===
    // Players approaching season milestones
    if (dynasty.players?.length > 0) {
      const teamPlayers = dynasty.players.filter(p => {
        const playerTeamVal = p.teamsByYear?.[displayYear]
        if (!playerTeamVal || !p.statsByYear?.[displayYear]) return false
        if (typeof playerTeamVal === 'number') return playerTeamVal === currentTeamTid
        if (playerTeamVal === teamAbbr) return true
        const resolvedTid = getTidFromAbbr(playerTeamVal, dynasty)
        return resolvedTid != null && Number(resolvedTid) === Number(currentTeamTid)
      })

      const milestoneItems = []

      // Define milestones: [statPath, threshold, target, label]
      const milestones = [
        ['rushing.yds', 750, 1000, '1K rush'],
        ['receiving.yds', 750, 1000, '1K rec'],
        ['passing.yds', 2500, 3000, '3K pass'],
        ['rushing.td', 15, 20, '20 rush TD'],
        ['receiving.td', 15, 20, '20 rec TD'],
        ['passing.td', 25, 30, '30 pass TD']
      ]

      milestones.forEach(([statPath, threshold, target, label]) => {
        const keys = statPath.split('.')
        const candidates = teamPlayers
          .map(p => {
            let val = p.statsByYear[displayYear]
            for (const k of keys) val = val?.[k]
            return { player: p, value: val || 0 }
          })
          .filter(x => x.value >= threshold && x.value < target)
          .sort((a, b) => b.value - a.value)

        if (candidates.length > 0) {
          const top = candidates[0]
          const remaining = target - top.value
          milestoneItems.push({
            id: `ms-${statPath}`,
            label: top.player.name,
            text: `${remaining} from ${label}`,
            link: `/player/${top.player.pid}`
          })
        }
      })

      if (milestoneItems.length > 0) {
        sections.push({
          type: 'milestones',
          label: 'MILESTONE WATCH',
          teamLogo: teamAbbr,
          teamRecord: record,
          items: milestoneItems
        })
      }
    }

    // === 8. HOT STREAKS (ON FIRE) ===
    // Players with 3+ consecutive games hitting performance thresholds
    if (seasonGames.length >= 3 && dynasty.players?.length > 0) {
      const sortedSeasonGames = [...seasonGames].sort((a, b) => getGameOrder(a) - getGameOrder(b))
      const hotStreakItems = []

      // Build per-game stats for each player from box scores
      const playerGameStats = {}
      sortedSeasonGames.forEach((game, gameIdx) => {
        const info = getGameInfo(game)
        const userTid = game.perspective?.userTid
        const stats = userTid != null ? getPlayerStatsForTid(game, userTid, teams) : null
        if (!stats) return

        // Process each stat category
        const processStats = (statArray, statType) => {
          if (!statArray) return
          statArray.forEach(stat => {
            const name = stat.playerName
            if (!name) return
            if (!playerGameStats[name]) playerGameStats[name] = []
            if (!playerGameStats[name][gameIdx]) playerGameStats[name][gameIdx] = {}
            playerGameStats[name][gameIdx][statType] = stat
          })
        }

        processStats(stats.passing, 'passing')
        processStats(stats.rushing, 'rushing')
        processStats(stats.receiving, 'receiving')
        processStats(stats.defense, 'defense')
      })

      // Find player pid by name
      const findPlayerPid = (name) => {
        const player = dynasty.players?.find(p => p.name === name)
        return player?.pid || null
      }

      // Check for streaks - streak definitions: [checkFn, minStreak, label]
      const streakDefs = [
        [(g) => g?.rushing?.yds >= 100, 3, '100+ rush'],
        [(g) => g?.receiving?.yds >= 100, 3, '100+ rec'],
        [(g) => g?.passing?.yds >= 250, 3, '250+ pass'],
        [(g) => (g?.passing?.td || 0) + (g?.rushing?.td || 0) + (g?.receiving?.td || 0) >= 1, 3, 'TD'],
        [(g) => g?.defense?.sacks >= 1, 3, 'sack'],
        [(g) => g?.defense?.int >= 1, 3, 'INT']
      ]

      Object.entries(playerGameStats).forEach(([playerName, gameStats]) => {
        streakDefs.forEach(([checkFn, minStreak, label]) => {
          // Count consecutive games from most recent going backwards
          let streak = 0
          for (let i = gameStats.length - 1; i >= 0; i--) {
            if (gameStats[i] && checkFn(gameStats[i])) streak++
            else break
          }

          if (streak >= minStreak) {
            const pid = findPlayerPid(playerName)
            // Avoid duplicates
            if (!hotStreakItems.find(x => x.id === `streak-${playerName}-${label}`)) {
              hotStreakItems.push({
                id: `streak-${playerName}-${label}`,
                label: playerName,
                text: `${label} in ${streak} straight`,
                link: pid ? `/player/${pid}` : null
              })
            }
          }
        })
      })

      if (hotStreakItems.length > 0) {
        sections.push({
          type: 'hotstreaks',
          label: 'ON FIRE',
          teamLogo: teamAbbr,
          teamRecord: record,
          items: hotStreakItems.slice(0, 5) // Limit to top 5 streaks
        })
      }
    }

    // === 9. THIS WEEK IN HISTORY ===
    // Show what happened in the same week number in previous years
    if (dynasty.currentPhase === 'regular_season' && dynasty.currentWeek) {
      const currentWeekNum = Number(dynasty.currentWeek)
      const historyItems = []

      // Get games from previous years in the same week — restricted to the
      // current team so switching teams mid-dynasty doesn't leak old games.
      const allUserGamesForHistory = (dynasty.games || [])
        .filter(g => isGamePlayed(g) && Number(g.year) !== currentYear)
        .map(g => {
          const perspective = getUserGamePerspective(g, dynasty)
          return perspective ? { ...g, perspective } : null
        })
        .filter(g => {
          if (!g || !isSameWeek(g.week, currentWeekNum)) return false
          const info = getGameInfo(g)
          return info?.userTeamAbbr === teamAbbr
        })
        .sort((a, b) => Number(b.year) - Number(a.year))
        .slice(0, 5)

      allUserGamesForHistory.forEach((g, i) => {
        const info = getGameInfo(g)
        const oppAbbr = info?.opponentAbbr || getTeamAbbr(g.opponent, teams)
        const isWin = info?.isWin ?? (g.result === 'win')
        const loc = info?.location === 'away' ? '@' : 'vs'
        const userScore = info?.userScore ?? g.teamScore
        const oppScore = info?.opponentScore ?? g.opponentScore

        historyItems.push({
          id: `hist${i}`,
          team: oppAbbr,
          label: `'${String(g.year).slice(-2)}`,
          labelColor: isWin ? '#22c55e' : '#ef4444',
          text: `${isWin ? 'W' : 'L'} ${loc} ${userScore}-${oppScore}`,
          link: g.id ? `/game/${g.id}` : null
        })
      })

      if (historyItems.length > 0) {
        sections.push({
          type: 'history',
          label: `WEEK ${currentWeekNum} HISTORY`,
          teamLogo: teamAbbr,
          items: historyItems
        })
      }
    }

    // === 10. PAST SEASON GAME LOGS (previous 2 seasons, each game as its own score) ===
    // ESPN-style: instead of aggregating, scroll through each game individually.
    if (currentYear && (dynasty.games || []).length > 0) {
      const allUserGamesForRecap = (dynasty.games || [])
        .filter(g => isGamePlayed(g))
        .map(g => {
          const perspective = getUserGamePerspective(g, dynasty)
          return perspective ? { ...g, perspective } : null
        })
        .filter(g => g !== null)

      const pastYears = [currentYear - 1, currentYear - 2].filter(y => y > 0)

      pastYears.forEach(pastYear => {
        const yearGames = allUserGamesForRecap
          .filter(g => Number(g.year) === pastYear)
          .sort((a, b) => getGameOrder(a) - getGameOrder(b))
        if (yearGames.length === 0) return

        const firstInfo = getGameInfo(yearGames[0])
        const pastTeamAbbr = firstInfo?.userTeamAbbr
        if (!pastTeamAbbr) return
        const pastTid = yearGames[0].perspective?.userTid || getTidFromAbbr(pastTeamAbbr, dynasty)

        const pastRecord = getTeamRecord(dynasty, pastTid, pastYear)
        const wins = pastRecord?.wins || 0
        const losses = pastRecord?.losses || 0
        if (wins + losses === 0) return

        // Quick scroll: all results compressed into a single section
        const items = yearGames.map((g, i) => {
          const info = getGameInfo(g)
          const opp = info?.opponentAbbr || getTeamAbbr(g.opponent, teams)
          const loc = info?.location === 'away' ? '@' : 'vs'
          const isWin = info?.isWin ?? (g.result === 'win')
          return {
            id: `g${i}`,
            team: opp,
            label: isWin ? 'W' : 'L',
            text: `${loc} ${formatScoreHighLow(info?.userScore ?? g.teamScore, info?.opponentScore ?? g.opponentScore)}`,
            link: g.id ? `/game/${g.id}` : null
          }
        })

        sections.push({
          type: 'pastseason',
          label: `${pastYear} SEASON`,
          teamLogo: pastTeamAbbr,
          teamRecord: `${wins}-${losses}`,
          headerLink: `/team/${pastTid}/${pastYear}`,
          items
        })

        // Deep dive: top 5 games with box scores from that season get their
        // own full recap section (QB/RB/WR/DEF stat lines).
        const pastGameRecaps = [...yearGames]
          .sort((a, b) => getGameOrder(b) - getGameOrder(a))
          .map(g => buildGameRecapSection(g, pastTeamAbbr))
          .filter(Boolean)
          .slice(0, 5)

        pastGameRecaps.forEach(s => sections.push(s))
      })
    }

    // === 11. DYNASTY ACHIEVEMENTS ===
    // National championships, conference championships, best season
    if ((dynasty.games || []).length > 0) {
      const allUserGamesForAchievements = (dynasty.games || [])
        .filter(g => isGamePlayed(g))
        .map(g => {
          const perspective = getUserGamePerspective(g, dynasty)
          return perspective ? { ...g, perspective } : null
        })
        .filter(g => g !== null)

      const achievementItems = []

      // Count national championships (cfp_championship wins)
      const nattyWins = allUserGamesForAchievements.filter(
        g => g.gameType === 'cfp_championship' && g.perspective?.userWon === true
      ).length
      if (nattyWins > 0) {
        achievementItems.push({
          id: 'natty',
          label: 'NATL CHAMPS',
          labelColor: '#fcd34d',
          text: String(nattyWins)
        })
      }

      // Count conference championships
      const confWins = allUserGamesForAchievements.filter(
        g => g.gameType === 'conference_championship' && g.perspective?.userWon === true
      ).length
      if (confWins > 0) {
        achievementItems.push({
          id: 'conf',
          label: 'CONF TITLES',
          text: String(confWins)
        })
      }

      // Bowl record
      const bowlWins = allUserGamesForAchievements.filter(
        g => g.gameType === 'bowl' && g.perspective?.userWon === true
      ).length
      const bowlLosses = allUserGamesForAchievements.filter(
        g => g.gameType === 'bowl' && g.perspective?.userWon === false
      ).length
      if (bowlWins + bowlLosses > 0) {
        achievementItems.push({
          id: 'bowls',
          label: 'BOWLS',
          text: `${bowlWins}-${bowlLosses}`
        })
      }

      // Best single season record
      const seasonRecords = {}
      allUserGamesForAchievements.forEach(g => {
        const yr = g.year
        if (!seasonRecords[yr]) seasonRecords[yr] = { wins: 0, losses: 0 }
        if (g.perspective?.userWon === true) seasonRecords[yr].wins++
        else if (g.perspective?.userWon === false) seasonRecords[yr].losses++
      })
      const bestSeason = Object.entries(seasonRecords)
        .map(([yr, rec]) => ({ year: yr, wins: rec.wins, losses: rec.losses, winPct: rec.wins / (rec.wins + rec.losses || 1) }))
        .filter(s => s.wins + s.losses >= 5) // Need at least 5 games
        .sort((a, b) => b.winPct - a.winPct || b.wins - a.wins)[0]

      if (bestSeason) {
        achievementItems.push({
          id: 'best',
          label: 'BEST',
          text: `${bestSeason.wins}-${bestSeason.losses} '${String(bestSeason.year).slice(-2)}`
        })
      }

      if (achievementItems.length >= 2) {
        sections.push({
          type: 'achievements',
          label: 'DYNASTY',
          teamLogo: teamAbbr,
          items: achievementItems
        })
      }
    }

    // === 12. ALL-TIME RECORDS ===
    // Best performances ever recorded in the dynasty
    if ((dynasty.games || []).length >= 5) {
      const allUserGamesForRecords = (dynasty.games || [])
        .filter(g => isGamePlayed(g))
        .map(g => {
          const perspective = getUserGamePerspective(g, dynasty)
          return perspective ? { ...g, perspective } : null
        })
        .filter(g => g !== null)

      const recordItems = []

      // Longest win streak ever
      const sortedByDate = [...allUserGamesForRecords].sort((a, b) => {
        const yearDiff = Number(a.year) - Number(b.year)
        if (yearDiff !== 0) return yearDiff
        return getGameOrder(a) - getGameOrder(b)
      })

      let maxStreak = 0
      let currentStreak = 0
      sortedByDate.forEach(g => {
        if (g.perspective?.userWon === true) {
          currentStreak++
          if (currentStreak > maxStreak) maxStreak = currentStreak
        } else {
          currentStreak = 0
        }
      })

      if (maxStreak >= 5) {
        recordItems.push({
          id: 'winstreak',
          label: 'WIN STREAK',
          text: `${maxStreak} games`
        })
      }

      // Most points scored in a game
      let highScore = { score: 0, game: null }
      allUserGamesForRecords.forEach(g => {
        const info = getGameInfo(g)
        const userScore = Number(info?.userScore) || 0
        if (userScore > highScore.score) {
          highScore = { score: userScore, game: g, oppAbbr: info?.opponentAbbr }
        }
      })

      if (highScore.score >= 35) {
        recordItems.push({
          id: 'highscore',
          team: highScore.oppAbbr,
          label: 'HIGH SCORE',
          text: `${highScore.score} pts`,
          link: highScore.game?.id ? `/game/${highScore.game.id}` : null
        })
      }

      // Biggest blowout win
      let biggestBlowout = { margin: 0, game: null, userScore: 0, oppScore: 0 }
      allUserGamesForRecords.forEach(g => {
        const info = getGameInfo(g)
        if (!info?.isWin) return
        const userScore = Number(info?.userScore) || 0
        const oppScore = Number(info?.opponentScore) || 0
        const margin = userScore - oppScore
        if (margin > biggestBlowout.margin) {
          biggestBlowout = { margin, game: g, oppAbbr: info?.opponentAbbr, userScore, oppScore }
        }
      })

      if (biggestBlowout.margin >= 21) {
        recordItems.push({
          id: 'blowout',
          team: biggestBlowout.oppAbbr,
          label: 'BLOWOUT',
          text: `${biggestBlowout.userScore}-${biggestBlowout.oppScore}`,
          link: biggestBlowout.game?.id ? `/game/${biggestBlowout.game.id}` : null
        })
      }

      // Best single-game rushing performance (from box scores)
      let bestRush = { yds: 0, player: null, game: null }
      let bestPass = { yds: 0, player: null, game: null }

      allUserGamesForRecords.forEach(g => {
        const userTid = g.perspective?.userTid
        const stats = userTid != null ? getPlayerStatsForTid(g, userTid, teams) : null
        if (!stats) return

        stats.rushing?.forEach(r => {
          if ((r.yds || 0) > bestRush.yds) {
            bestRush = { yds: r.yds, player: r.playerName, game: g }
          }
        })

        stats.passing?.forEach(p => {
          if ((p.yds || 0) > bestPass.yds) {
            bestPass = { yds: p.yds, player: p.playerName, game: g }
          }
        })
      })

      if (bestRush.yds >= 150) {
        const pid = dynasty.players?.find(p => p.name === bestRush.player)?.pid
        recordItems.push({
          id: 'bestrush',
          label: 'RUSH GAME',
          text: `${bestRush.yds} yds ${bestRush.player ? bestRush.player.split(' ').pop() : ''}`,
          link: pid ? `/player/${pid}` : (bestRush.game?.id ? `/game/${bestRush.game.id}` : null)
        })
      }

      if (bestPass.yds >= 300) {
        const pid = dynasty.players?.find(p => p.name === bestPass.player)?.pid
        recordItems.push({
          id: 'bestpass',
          label: 'PASS GAME',
          text: `${bestPass.yds} yds ${bestPass.player ? bestPass.player.split(' ').pop() : ''}`,
          link: pid ? `/player/${pid}` : (bestPass.game?.id ? `/game/${bestPass.game.id}` : null)
        })
      }

      if (recordItems.length >= 2) {
        sections.push({
          type: 'records',
          label: 'ALL-TIME',
          teamLogo: teamAbbr,
          items: recordItems
        })
      }
    }

    // === 13. POSTSEASON HISTORY (current team's bowls + CFP games with scores) ===
    // Filtered to the current team only — prevents leaks from earlier coaching
    // stints with a different team.
    const postseasonTypes = ['bowl', 'cfp_first_round', 'cfp_quarterfinal', 'cfp_semifinal', 'cfp_championship']
    const postseasonGames = (dynasty.games || [])
      .filter(g => postseasonTypes.includes(g.gameType) && isGamePlayed(g))
      .map(g => {
        const perspective = getUserGamePerspective(g, dynasty)
        return perspective ? { ...g, perspective } : null
      })
      .filter(g => {
        if (!g) return false
        const info = getGameInfo(g)
        return info?.userTeamAbbr === teamAbbr
      })
      .sort((a, b) => Number(b.year) - Number(a.year))
      .slice(0, 8)

    if (postseasonGames.length > 0) {
      const psWins = postseasonGames.filter(g => g.perspective?.userWon === true).length
      const psLosses = postseasonGames.filter(g => g.perspective?.userWon === false).length

      const getGameLabel = (g) => {
        if (g.gameType === 'cfp_championship') return 'NATTY'
        if (g.gameType === 'cfp_semifinal') return 'SF'
        if (g.gameType === 'cfp_quarterfinal') return 'QF'
        if (g.gameType === 'cfp_first_round') return 'RD1'
        return g.bowlName || 'Bowl'
      }

      const items = postseasonGames.map((g, i) => {
        const info = getGameInfo(g)
        const userTeamAbbr = info?.userTeamAbbr || g.userTeam
        const oppAbbr = info?.opponentAbbr || getTeamAbbr(g.opponent, teams)
        const isWin = info?.isWin ?? (g.result === 'win')
        const loc = info?.location || g.location

        // Determine team order based on location
        let t1, t2, s1, s2
        if (loc === 'away') {
          t1 = oppAbbr
          t2 = userTeamAbbr
          s1 = info?.opponentScore ?? g.opponentScore
          s2 = info?.userScore ?? g.teamScore
        } else {
          t1 = userTeamAbbr
          t2 = oppAbbr
          s1 = info?.userScore ?? g.teamScore
          s2 = info?.opponentScore ?? g.opponentScore
        }

        return {
          id: `ps${i}`,
          label: `${getGameLabel(g)} '${String(g.year).slice(-2)}`,
          team: t1,
          team2: t2,
          score1: s1,
          score2: s2,
          winner: isWin ? userTeamAbbr : oppAbbr,
          link: g.id ? `/game/${g.id}` : null
        }
      })

      sections.push({
        type: 'postseason',
        label: `POSTSEASON (${psWins}-${psLosses})`,
        teamLogo: teamAbbr,
        headerLink: '/bowl-history',
        items
      })
    }

    // === 14. CFP BRACKET (previous dynasty year only, capped to avoid ticker domination) ===
    const cfpGameTypes = ['cfp_first_round', 'cfp_quarterfinal', 'cfp_semifinal', 'cfp_championship']
    const allCfpGames = (dynasty.games || []).filter(g => cfpGameTypes.includes(g.gameType) && isGamePlayed(g))
    const previousDynastyYear = currentYear ? currentYear - 1 : null
    const cfpYears = previousDynastyYear != null && allCfpGames.some(g => isSameYear(g.year, previousDynastyYear))
      ? [previousDynastyYear]
      : []

    // Helper to determine winner from scores
    const getCfpWinner = (game) => {
      if (game.winner) return game.winner
      // Check perspective first
      if (game.perspective) {
        const info = getGameInfo(game)
        return game.perspective.userWon ? info?.userTeamAbbr : info?.opponentAbbr
      }
      // For user games
      if (game.result && game.userTeam) {
        return game.result === 'win' ? game.userTeam : getTeamAbbr(game.opponent, teams)
      }
      // For CPU games or unified format
      const s1 = Number(game.team1Score) || 0
      const s2 = Number(game.team2Score) || 0
      if (game.team1Tid && game.team2Tid) {
        const t1Info = getGameTeamInfo(teams, game.team1Tid)
        const t2Info = getGameTeamInfo(teams, game.team2Tid)
        return s1 > s2 ? t1Info?.abbr : t2Info?.abbr
      }
      return s1 > s2 ? game.team1 : game.team2
    }

    // Helper to get teams and scores from a CFP game (handles user, CPU, and unified format)
    const normalizeCfpGame = (g) => {
      let t1, t2, s1, s2

      // Check for unified format with tids
      if (g.team1Tid && g.team2Tid) {
        const t1Info = getGameTeamInfo(teams, g.team1Tid)
        const t2Info = getGameTeamInfo(teams, g.team2Tid)
        t1 = t1Info?.abbr || g.team1
        t2 = t2Info?.abbr || g.team2
        s1 = g.team1Score
        s2 = g.team2Score
      } else if (g.opponent) {
        // User game with opponent format
        const info = getGameInfo(g)
        const userTeamAbbr = info?.userTeamAbbr || g.userTeam
        const oppAbbr = info?.opponentAbbr || getTeamAbbr(g.opponent, teams)
        const loc = info?.location || g.location
        if (loc === 'away') {
          t1 = oppAbbr
          t2 = userTeamAbbr
          s1 = info?.opponentScore ?? g.opponentScore
          s2 = info?.userScore ?? g.teamScore
        } else {
          t1 = userTeamAbbr
          t2 = oppAbbr
          s1 = info?.userScore ?? g.teamScore
          s2 = info?.opponentScore ?? g.opponentScore
        }
      } else {
        // CPU game
        t1 = g.team1
        t2 = g.team2
        s1 = g.team1Score
        s2 = g.team2Score
      }
      return { t1, t2, s1, s2, winner: getCfpWinner(g) }
    }

    const cfpRoundLabel = (gameType) => {
      if (gameType === 'cfp_first_round') return 'RD1'
      if (gameType === 'cfp_quarterfinal') return 'QF'
      if (gameType === 'cfp_semifinal') return 'SF'
      if (gameType === 'cfp_championship') return 'CHAMP'
      return ''
    }

    cfpYears.forEach(cfpYear => {
      const yearGames = allCfpGames
        .filter(g => isSameYear(g.year, cfpYear))
        .filter(g => {
          // Must have teams defined
          if (g.opponent) return true
          if (g.team1 && g.team2) return true
          return false
        })
        .sort((a, b) => {
          // Sort by round order
          const order = { cfp_first_round: 1, cfp_quarterfinal: 2, cfp_semifinal: 3, cfp_championship: 4 }
          return (order[a.gameType] || 0) - (order[b.gameType] || 0)
        })

      if (yearGames.length > 0) {
        const items = yearGames.map((g, i) => {
          const { t1, t2, s1, s2, winner } = normalizeCfpGame(g)
          const isChamp = g.gameType === 'cfp_championship'
          return {
            id: `cfp${i}`,
            label: cfpRoundLabel(g.gameType),
            labelColor: isChamp ? '#fcd34d' : undefined,
            team: t1,
            team2: t2,
            score1: s1,
            score2: s2,
            winner,
            link: g.id ? `/game/${g.id}` : null
          }
        })

        sections.push({
          type: 'cfp',
          label: `${cfpYear} CFP`,
          headerLink: '/cfp-bracket',
          items
        })
      }
    })

    // === 15. LEAGUE BOWL GAMES (most recent year only, capped to avoid ticker domination) ===
    const allBowlGames = (dynasty.games || []).filter(g => g.gameType === 'bowl' && isGamePlayed(g))
    const allBowlYearsSorted = [...new Set(allBowlGames.map(g => g.year))].sort((a, b) => Number(b) - Number(a))
    const bowlYears = allBowlYearsSorted.slice(0, 1)

    bowlYears.forEach(bowlYear => {
      const yearBowls = allBowlGames
        .filter(g => isSameYear(g.year, bowlYear))
        .filter(g => {
          // Unified format has team1Tid/team2Tid, user games have opponent, CPU games have team1/team2
          if (g.team1Tid && g.team2Tid) return true
          if (g.opponent) return true
          if (g.team1 && g.team2) return true
          return false
        })

      if (yearBowls.length > 0) {
        const items = yearBowls.map((g, i) => {
          // Determine team1, team2, and winner
          let t1, t2, s1, s2, winner

          // Check for unified format first
          if (g.team1Tid && g.team2Tid) {
            const t1Info = getGameTeamInfo(teams, g.team1Tid)
            const t2Info = getGameTeamInfo(teams, g.team2Tid)
            t1 = t1Info?.abbr || g.team1
            t2 = t2Info?.abbr || g.team2
            s1 = g.team1Score
            s2 = g.team2Score
            winner = g.winner || (Number(s1) > Number(s2) ? t1 : t2)
          } else if (g.opponent) {
            // User game with perspective
            const perspective = getUserGamePerspective(g, dynasty)
            const info = perspective ? getGameInfo({ ...g, perspective }) : null
            const userTeamAbbr = info?.userTeamAbbr || g.userTeam
            const oppAbbr = info?.opponentAbbr || getTeamAbbr(g.opponent, teams)
            const loc = info?.location || g.location
            if (loc === 'away') {
              t1 = oppAbbr
              t2 = userTeamAbbr
              s1 = info?.opponentScore ?? g.opponentScore
              s2 = info?.userScore ?? g.teamScore
            } else {
              t1 = userTeamAbbr
              t2 = oppAbbr
              s1 = info?.userScore ?? g.teamScore
              s2 = info?.opponentScore ?? g.opponentScore
            }
            const isWin = info?.isWin ?? (g.result === 'win')
            winner = isWin ? userTeamAbbr : oppAbbr
          } else {
            // CPU vs CPU game
            t1 = g.team1
            t2 = g.team2
            s1 = g.team1Score
            s2 = g.team2Score
            winner = g.winner || (Number(s1) > Number(s2) ? t1 : t2)
          }

          return {
            id: `bowl${i}`,
            label: g.bowlName || 'Bowl',
            team: t1,
            team2: t2,
            score1: s1,
            score2: s2,
            winner,
            link: g.id ? `/game/${g.id}` : null
          }
        })

        sections.push({
          type: 'bowls',
          label: `${bowlYear} BOWLS`,
          headerLink: '/bowl-history',
          items
        })
      }
    })

    // === 16. DYNASTY LEADERBOARDS ===
    // Career leaderboards - one stat from each major category
    if (dynasty.players?.length > 0) {
      const rosterPlayers = dynasty.players.filter(p => !p.isHonorOnly)

      // Aggregate career stats for each player
      const careerStats = {}
      rosterPlayers.forEach(player => {
        if (!player.statsByYear) return
        const pid = player.pid

        if (!careerStats[pid]) {
          careerStats[pid] = {
            pid,
            name: player.name,
            team: player.team,
            passing: { yds: 0, td: 0 },
            rushing: { yds: 0, td: 0 },
            receiving: { yds: 0, td: 0 },
            defense: { sacks: 0, int: 0, tkl: 0 },
            kicking: { fgm: 0 }
          }
        }

        Object.values(player.statsByYear).forEach(yearStats => {
          if (yearStats.passing) {
            careerStats[pid].passing.yds += yearStats.passing.yds || 0
            careerStats[pid].passing.td += yearStats.passing.td || 0
          }
          if (yearStats.rushing) {
            careerStats[pid].rushing.yds += yearStats.rushing.yds || 0
            careerStats[pid].rushing.td += yearStats.rushing.td || 0
          }
          if (yearStats.receiving) {
            careerStats[pid].receiving.yds += yearStats.receiving.yds || 0
            careerStats[pid].receiving.td += yearStats.receiving.td || 0
          }
          if (yearStats.defense) {
            careerStats[pid].defense.sacks += yearStats.defense.sacks || 0
            careerStats[pid].defense.int += yearStats.defense.int || 0
            careerStats[pid].defense.tkl += (yearStats.defense.soloTkl || 0) + (yearStats.defense.astTkl || 0)
          }
          if (yearStats.kicking) {
            careerStats[pid].kicking.fgm += yearStats.kicking.fgm || 0
          }
        })
      })

      const allStats = Object.values(careerStats)

      // Leaderboard definitions: [label, getter, minValue, unit]
      const leaderboards = [
        ['PASS YDS', p => p.passing.yds, 500, 'yds'],
        ['PASS TD', p => p.passing.td, 5, 'TD'],
        ['RUSH YDS', p => p.rushing.yds, 200, 'yds'],
        ['RUSH TD', p => p.rushing.td, 3, 'TD'],
        ['REC YDS', p => p.receiving.yds, 200, 'yds'],
        ['REC TD', p => p.receiving.td, 3, 'TD'],
        ['SACKS', p => p.defense.sacks, 1, ''],
        ['DEF INT', p => p.defense.int, 1, ''],
        ['TACKLES', p => p.defense.tkl, 10, ''],
        ['FG MADE', p => p.kicking.fgm, 1, '']
      ]

      // Build all viable leaderboards, then pick ONE that rotates each render.
      // Rotation seed uses currentWeek + currentYear so ticker content varies
      // as the user advances through the dynasty.
      const viableLeaderboards = leaderboards
        .map(([label, getter, minValue, unit]) => {
          const leaders = allStats
            .filter(p => getter(p) >= minValue)
            .sort((a, b) => getter(b) - getter(a))
            .slice(0, 5)
          return leaders.length >= 3 ? { label, getter, unit, leaders } : null
        })
        .filter(Boolean)

      if (viableLeaderboards.length > 0) {
        const rotationSeed = (Number(currentYear) || 0) + (Number(dynasty.currentWeek) || 0)
        const chosen = viableLeaderboards[rotationSeed % viableLeaderboards.length]
        const { label, getter, unit, leaders } = chosen
        sections.push({
          type: 'leaderboard',
          label: `CAREER ${label}`,
          headerLink: '/dynasty-records',
          items: leaders.map((p, i) => ({
            id: `lb${i}`,
            team: p.team,
            label: `#${i + 1}`,
            text: `${p.name} ${getter(p).toLocaleString()}${unit ? ` ${unit}` : ''}`,
            link: `/player/${p.pid}`
          }))
        })
      }
    }

    // === 17. CAREER SUMMARY - Each season individually ===
    // Uses perspective to find all games where user coached (only played games)
    const allUserGames = (dynasty.games || [])
      .filter(g => isGamePlayed(g))
      .map(g => {
        const perspective = getUserGamePerspective(g, dynasty)
        return perspective ? { ...g, perspective } : null
      })
      .filter(g => g !== null)

    if (allUserGames.length > 0) {
      // Group games by year and team
      const seasonMap = {}
      allUserGames.forEach(g => {
        const info = getGameInfo(g)
        const userTeamAbbr = info?.userTeamAbbr || g.userTeam
        const key = `${g.year}-${userTeamAbbr}`
        if (!seasonMap[key]) {
          seasonMap[key] = { year: g.year, team: userTeamAbbr, wins: 0, losses: 0 }
        }
        if (g.perspective?.userWon === true) seasonMap[key].wins++
        else if (g.perspective?.userWon === false) seasonMap[key].losses++
      })

      // Sort by year descending
      const seasons = Object.values(seasonMap).sort((a, b) => Number(b.year) - Number(a.year))

      if (seasons.length > 0) {
        const totalWins = seasons.reduce((sum, s) => sum + s.wins, 0)
        const totalLosses = seasons.reduce((sum, s) => sum + s.losses, 0)

        const items = seasons.map((s, i) => ({
          id: `s${i}`,
          team: s.team,
          label: String(s.year),
          text: `${s.wins}-${s.losses}`,
          link: `/team/${resolveTid(s.team, dynasty?.teams || TEAMS)}/${s.year}`
        }))

        sections.push({
          type: 'career',
          label: `CAREER (${totalWins}-${totalLosses})`,
          headerLink: '/coach-career',
          items
        })
      }
    }

    // === TIER GATING ===
    // ESPN-style: prioritize sections that scroll through actual games.
    // Tier 1 = game-centric sections (always shown — the whole point of the ticker).
    // Tier 2 = current-team aggregate stats (cap to avoid crowding out games).
    // Tier 3 = league/dynasty flavor (one rotating slot, prevents old bowls
    //         and career leaderboards from dominating).
    const TIER_MAP = {
      games: 1, gamerecap: 1, upcoming: 1, history: 1, pastseason: 1, postseason: 1,
      season: 2, leaders: 2, milestones: 2, hotstreaks: 2,
      achievements: 3, records: 3, cfp: 3, bowls: 3, leaderboard: 3, career: 3
    }

    const tier1 = sections.filter(s => TIER_MAP[s.type] === 1)
    const tier2 = sections.filter(s => TIER_MAP[s.type] === 2)
    const tier3 = sections.filter(s => TIER_MAP[s.type] === 3)

    // Cap Tier 2 aggregates — more games present means fewer aggregates needed.
    const tier2Cap = tier1.length >= 4 ? 2 : tier1.length >= 2 ? 3 : tier2.length

    // Always 1 Tier 3 slot — rotating — just enough flavor without dominating.
    const tier3Cap = 1

    // Stable seed so the rotating picks don't flicker every render.
    const seed = (Number(currentYear) || 0) + (Number(dynasty.currentWeek) || 0)

    const rotate = (arr, cap) => {
      if (arr.length <= cap) return arr
      return Array.from({ length: cap }, (_, i) => arr[(seed + i) % arr.length])
    }

    const rotatedTier2 = rotate(tier2, tier2Cap)
    const rotatedTier3 = rotate(tier3, tier3Cap)

    // Interleave: games first, then a sprinkle of stats/flavor between.
    return [...tier1, ...rotatedTier2, ...rotatedTier3]
  }, [
    dynasty?.currentYear,
    dynasty?.currentPhase,
    dynasty?.currentWeek,
    dynasty?.games,
    dynasty?.players,
    dynasty?.teamName,
    dynasty?.cfpResultsByYear
  ])
}

export default useTickerSections
