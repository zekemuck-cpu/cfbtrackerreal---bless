import { useState, useCallback, useEffect } from 'react'
import { useDynasty, getRecruitingCommitments } from '../context/DynastyContext'
import { getCurrentTeamTid, TEAMS } from '../data/teamRegistry'
import { getPlayerStatsForTid } from '../utils/boxScoreHelpers'

const CACHE_PREFIX = 'podcast_article_v3_'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function pct(n, d) { return d > 0 ? ((n / d) * 100).toFixed(0) : '0' }
function avg(total, games) { return games > 0 ? (total / games).toFixed(1) : null }

function getSlot(g) {
  if (!g) return 0
  if (g.isCFPChampionship || g.gameType === 'cfp_championship') return 19
  if (g.isCFPSemifinal   || g.gameType === 'cfp_semifinal')    return 18
  if (g.isCFPQuarterfinal|| g.gameType === 'cfp_quarterfinal') return 17
  if (g.isCFPFirstRound  || g.gameType === 'cfp_first_round')  return 16
  if (g.isBowlGame       || g.gameType === 'bowl')             return 16
  if (g.isConferenceChampionship || g.gameType === 'conference_championship') return 15
  const w = Number(g.week)
  return Number.isFinite(w) ? w : 0
}

function isPlayed(g) {
  return typeof g?.team1Score === 'number' &&
    typeof g?.team2Score === 'number' &&
    (g.isPlayed || g.team1Score > 0 || g.team2Score > 0)
}

// ─── Data extraction ──────────────────────────────────────────────────────────

function extractContext(dynasty, year, week) {
  const yr = Number(year)
  const wk = Number(week)
  const userTid = Number(getCurrentTeamTid(dynasty))
  const teams = dynasty.teams || {}
  const allGames = dynasty.games || []

  const teamLabel = (tid) => {
    if (!tid) return 'Unknown'
    const t = teams[Number(tid)] ?? teams[String(tid)] ?? TEAMS[Number(tid)]
    return t?.name || t?.abbr || `Team ${tid}`
  }

  const teamName = teamLabel(userTid)
  const td = teams[userTid] ?? teams[String(userTid)] ?? {}
  const byYear = td.byYear?.[yr] ?? td.byYear?.[String(yr)] ?? {}
  const rbw = byYear.rankByWeek ?? {}
  const rank = rbw[wk] ?? rbw[String(wk)] ?? null
  const prevRank = rbw[wk - 1] ?? rbw[String(wk - 1)] ?? null
  const classRank = byYear.recruitingClassRank ?? null
  const teamRatings = byYear.teamRatings ?? {}

  const userGames = allGames.filter(g =>
    g && Number(g.year) === yr &&
    (Number(g.team1Tid) === userTid || Number(g.team2Tid) === userTid)
  )

  const playedSorted = userGames.filter(isPlayed).sort((a, b) => getSlot(a) - getSlot(b))
  const completed = playedSorted.filter(g => getSlot(g) <= wk)
  const remaining = userGames.filter(g => !isPlayed(g) || getSlot(g) > wk)
    .sort((a, b) => getSlot(a) - getSlot(b))

  // Season record and scoring
  let wins = 0, losses = 0, totalFor = 0, totalAgainst = 0
  let biggestWinMargin = 0, biggestWin = null, worstLossMargin = 0, worstLoss = null
  let rankedWins = 0, homeWins = 0, homeLosses = 0, awayWins = 0, awayLosses = 0
  let winStreak = 0, lossStreak = 0, currentStreak = 0, currentStreakType = null

  for (const g of completed) {
    const t1 = Number(g.team1Tid) === userTid
    const mine   = t1 ? g.team1Score : g.team2Score
    const theirs = t1 ? g.team2Score : g.team1Score
    const margin = mine - theirs
    const won    = margin > 0
    const neutral = g.homeTeamTid == null
    const home   = !neutral && Number(g.homeTeamTid) === userTid
    const oppR   = (t1 ? g.team2Rank : g.team1Rank) ?? null

    totalFor     += mine
    totalAgainst += theirs

    if (won) {
      wins++
      if (!neutral) home ? homeWins++ : awayWins++
      if (margin > biggestWinMargin) { biggestWinMargin = margin; biggestWin = g }
      if (oppR) rankedWins++
    } else {
      losses++
      if (!neutral) home ? homeLosses++ : awayLosses++
      if (-margin > worstLossMargin) { worstLossMargin = -margin; worstLoss = g }
    }
  }

  // Current streak
  for (let i = completed.length - 1; i >= 0; i--) {
    const g = completed[i]
    const t1 = Number(g.team1Tid) === userTid
    const won = (t1 ? g.team1Score : g.team2Score) > (t1 ? g.team2Score : g.team1Score)
    if (i === completed.length - 1) { currentStreakType = won ? 'W' : 'L'; currentStreak = 1 }
    else if ((won && currentStreakType === 'W') || (!won && currentStreakType === 'L')) currentStreak++
    else break
  }

  const ppg  = avg(totalFor, completed.length)
  const papg = avg(totalAgainst, completed.length)
  const scoreDiff = completed.length > 0
    ? ((totalFor - totalAgainst) / completed.length).toFixed(1)
    : null

  // Last game details
  const lastGame = completed.at(-1) ?? null
  let lastGameInfo = null
  if (lastGame) {
    const t1     = Number(lastGame.team1Tid) === userTid
    const mine   = t1 ? lastGame.team1Score : lastGame.team2Score
    const theirs = t1 ? lastGame.team2Score : lastGame.team1Score
    const oppTid = t1 ? lastGame.team2Tid : lastGame.team1Tid
    const margin = mine - theirs
    const won    = margin > 0
    const neutral = lastGame.homeTeamTid == null
    const home   = !neutral && Number(lastGame.homeTeamTid) === userTid
    const myR    = (t1 ? lastGame.team1Rank : lastGame.team2Rank) ?? null
    const oppR   = (t1 ? lastGame.team2Rank : lastGame.team1Rank) ?? null

    let keyPlayers = []
    try {
      const bsp = getPlayerStatsForTid(lastGame, userTid)
      if (bsp) {
        for (const [name, cats] of Object.entries(bsp)) {
          if (cats.passing) {
            const att = cats.passing.attempts ?? cats.passing.att ?? 0
            const comp = cats.passing.completions ?? cats.passing.comp ?? 0
            const yds = cats.passing.yards ?? cats.passing.yds ?? 0
            const tds = cats.passing.tD ?? cats.passing.td ?? 0
            const ints = cats.passing.iNT ?? cats.passing.int ?? 0
            if (att > 0 || yds > 50) keyPlayers.push({
              name, type: 'passing', yds,
              compPct: att > 0 ? pct(comp, att) : null,
              line: `${comp > 0 ? `${comp}-of-${att} for ` : ''}${yds} yards${tds > 0 ? `, ${tds} touchdown${tds > 1 ? 's' : ''}` : ''}${ints > 0 ? ` and ${ints} interception${ints > 1 ? 's' : ''}` : ''}`
            })
          }
          if (cats.rushing) {
            const car = cats.rushing.carries ?? cats.rushing.car ?? 0
            const yds = cats.rushing.yards ?? cats.rushing.yds ?? 0
            const tds = cats.rushing.tD ?? cats.rushing.td ?? 0
            const ypc = car > 0 ? (yds / car).toFixed(1) : null
            if (yds > 30 || tds > 0) keyPlayers.push({
              name, type: 'rushing', yds,
              line: `${car} carries for ${yds} yards${ypc ? ` (${ypc} per carry)` : ''}${tds > 0 ? ` and ${tds} score${tds > 1 ? 's' : ''}` : ''}`
            })
          }
          if (cats.receiving) {
            const rec = cats.receiving.receptions ?? cats.receiving.rec ?? 0
            const tgt = cats.receiving.targets ?? cats.receiving.tgt ?? 0
            const yds = cats.receiving.yards ?? cats.receiving.yds ?? 0
            const tds = cats.receiving.tD ?? cats.receiving.td ?? 0
            if (yds > 30 || tds > 0) keyPlayers.push({
              name, type: 'receiving', yds,
              line: `${rec}${tgt > 0 ? `/${tgt}` : ''} receiving for ${yds} yards${tds > 0 ? ` and ${tds} touchdown${tds > 1 ? 's' : ''}` : ''}`
            })
          }
          if (cats.defense) {
            const solo = cats.defense.soloTkl ?? 0
            const ast  = cats.defense.astTkl ?? 0
            const sacks = cats.defense.sacks ?? 0
            if (solo + ast >= 6 || sacks >= 1.5) keyPlayers.push({
              name, type: 'defense', yds: solo + ast + sacks * 10,
              line: `${solo + ast} total tackles${sacks > 0 ? ` and ${sacks} sack${sacks > 1 ? 's' : ''}` : ''}`
            })
          }
        }
        keyPlayers.sort((a, b) => b.yds - a.yds)
      }
    } catch { /* no box score */ }

    lastGameInfo = {
      won, mine, theirs, margin: Math.abs(margin),
      oppTid, oppName: teamLabel(oppTid), oppRank: oppR, myRank: myR,
      home, neutral,
      venue: neutral ? 'at a neutral site' : home ? 'at home' : 'on the road',
      blowout: Math.abs(margin) > 21,
      comfortable: Math.abs(margin) > 10 && Math.abs(margin) <= 21,
      close: Math.abs(margin) <= 7,
      keyPlayers,
    }
  }

  // Next game details
  let nextGameInfo = null
  const nextGame = remaining[0] ?? null
  if (nextGame) {
    const t1     = Number(nextGame.team1Tid) === userTid
    const oppTid = t1 ? nextGame.team2Tid : nextGame.team1Tid
    const neutral = nextGame.homeTeamTid == null
    const home   = !neutral && Number(nextGame.homeTeamTid) === userTid
    const ns     = getSlot(nextGame)
    const od     = teams[Number(oppTid)] ?? teams[String(oppTid)] ?? {}
    const orbw   = od.byYear?.[yr]?.rankByWeek ?? od.byYear?.[String(yr)]?.rankByWeek ?? {}
    const oppR   = orbw[ns] ?? orbw[String(ns)] ?? null

    let oppW = 0, oppL = 0, oppFor = 0, oppAgainst = 0
    for (const g of allGames) {
      if (!g || Number(g.year) !== yr || !isPlayed(g) || getSlot(g) > wk) continue
      const t1g = Number(g.team1Tid) === Number(oppTid)
      const t2g = Number(g.team2Tid) === Number(oppTid)
      if (!t1g && !t2g) continue
      const oppScore  = t1g ? g.team1Score : g.team2Score
      const theirScore = t1g ? g.team2Score : g.team1Score
      oppFor     += oppScore
      oppAgainst += theirScore
      if (oppScore > theirScore) oppW++
      else if (theirScore > oppScore) oppL++
    }
    const oppPpg  = avg(oppFor, oppW + oppL)
    const oppPapg = avg(oppAgainst, oppW + oppL)

    nextGameInfo = {
      oppTid, oppName: teamLabel(oppTid), oppRank: oppR,
      oppW, oppL, oppPpg, oppPapg,
      home, neutral,
      venue: neutral ? 'at a neutral site' : home ? 'at home' : 'on the road',
      isBig: !!oppR || (oppW > oppL && oppW >= 4),
    }
  }

  // Roster and season-long player leaders
  const players = dynasty.players ?? []
  const roster = players.filter(p => {
    const ty = p.teamsByYear?.[yr] ?? p.teamsByYear?.[String(yr)]
    if (ty != null) return Number(ty) === userTid
    const tyEntries = Object.entries(p.teamsByYear || {})
      .map(([y, t]) => [Number(y), Number(t)])
      .filter(([, t]) => t != null)
      .sort(([a], [b]) => b - a)
    const [, recentTid] = tyEntries.find(([y]) => y <= yr) ?? []
    if (recentTid != null && Number(recentTid) !== userTid) return false
    const hasActiveStintElsewhere = (p.teamHistory ?? []).some(s =>
      Number(s.teamTid) !== userTid && Number(s.fromYear) <= yr && (s.toYear == null || Number(s.toYear) >= yr)
    )
    if (hasActiveStintElsewhere) return false
    return (p.teamHistory ?? []).some(s =>
      Number(s.teamTid) === userTid && Number(s.fromYear) <= yr && (s.toYear == null || Number(s.toYear) >= yr)
    )
  })

  // Season stat leaders
  const seasonLeaders = { passing: null, rushing: null, receiving: null, defense: null }
  for (const p of roster) {
    const s   = p.statsByYear?.[yr] ?? p.statsByYear?.[String(yr)] ?? {}
    const ovr = p.overallByYear?.[yr] ?? p.overallByYear?.[String(yr)] ?? p.overall ?? 0
    if (s.passing?.yds > (seasonLeaders.passing?.yds ?? 0))
      seasonLeaders.passing = { name: p.name, pos: p.position, ovr, ...s.passing }
    if (s.rushing?.yds > (seasonLeaders.rushing?.yds ?? 0))
      seasonLeaders.rushing = { name: p.name, pos: p.position, ovr, ...s.rushing }
    if (s.receiving?.yds > (seasonLeaders.receiving?.yds ?? 0))
      seasonLeaders.receiving = { name: p.name, pos: p.position, ovr, ...s.receiving }
    if ((s.defense?.soloTkl ?? 0) + (s.defense?.astTkl ?? 0) > (seasonLeaders.defense?.totalTkl ?? 0))
      seasonLeaders.defense = { name: p.name, pos: p.position, ovr, totalTkl: (s.defense?.soloTkl ?? 0) + (s.defense?.astTkl ?? 0), sacks: s.defense?.sacks ?? 0 }
  }

  const topOvrPlayers = roster
    .map(p => ({ name: p.name, pos: p.position, ovr: p.overallByYear?.[yr] ?? p.overallByYear?.[String(yr)] ?? p.overall ?? 0 }))
    .filter(p => p.name && p.ovr > 0)
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, 5)

  let recruits = []
  try {
    const commits = getRecruitingCommitments(dynasty, userTid, yr)
    if (Array.isArray(commits)) recruits = commits.slice(0, 6)
  } catch { /* not available */ }

  const recentResults = completed.slice(-5).map(g => {
    const t1 = Number(g.team1Tid) === userTid
    const mine = t1 ? g.team1Score : g.team2Score
    const theirs = t1 ? g.team2Score : g.team1Score
    return { result: mine > theirs ? 'W' : 'L', mine, theirs, opp: teamLabel(t1 ? g.team2Tid : g.team1Tid) }
  })

  return {
    teamName, yr, wk, wins, losses, rank, prevRank,
    ppg, papg, scoreDiff,
    rankedWins, classRank, teamRatings,
    homeWins, homeLosses, awayWins, awayLosses,
    currentStreak, currentStreakType,
    biggestWinMargin, worstLossMargin,
    lastGameInfo, nextGameInfo,
    seasonLeaders, topOvrPlayers, recruits, recentResults,
    gamesPlayed: completed.length,
    remainingCount: remaining.length,
  }
}

// ─── Article generator ────────────────────────────────────────────────────────

function buildArticle(ctx, weekLabel) {
  const {
    teamName, yr, wins, losses, rank, prevRank,
    ppg, papg, scoreDiff,
    rankedWins, classRank,
    homeWins, homeLosses, awayWins, awayLosses,
    currentStreak, currentStreakType,
    lastGameInfo: lg, nextGameInfo: ng,
    seasonLeaders, topOvrPlayers, recruits, recentResults,
    gamesPlayed, remainingCount,
  } = ctx

  const rankStr   = rank ? `#${rank} ` : ''
  const record    = `${wins}-${losses}`
  const parts     = []

  // ── Headline ──────────────────────────────────────────────────────────────
  let headline
  if (lg) {
    const oppRStr = lg.oppRank ? `#${lg.oppRank} ` : ''
    if (lg.won && lg.blowout) {
      headline = pick([
        `${rankStr}${teamName} Makes a Statement, Dismantles ${oppRStr}${lg.oppName} ${lg.mine}-${lg.theirs}`,
        `No Contest: ${teamName} Pours It On Against ${lg.oppName}`,
        `The Margin Tells You Everything — ${teamName} ${lg.mine}, ${lg.oppName} ${lg.theirs}`,
        `Dominant. Decisive. ${teamName} Leaves No Doubt Against ${oppRStr}${lg.oppName}`,
      ])
    } else if (lg.won && lg.close) {
      headline = pick([
        `${teamName} Finds a Way — That's What Good Teams Do`,
        `Clutch When It Mattered: ${teamName} Edges ${oppRStr}${lg.oppName} ${lg.mine}-${lg.theirs}`,
        `${teamName} Passes the Toughness Test Against ${lg.oppName}`,
        `Don't Overlook This — ${teamName}'s ${lg.mine}-${lg.theirs} Win Is More Than It Looks`,
      ])
    } else if (lg.won) {
      headline = pick([
        `${teamName} Handles Business, Stays the Course at ${record}`,
        `${rankStr}${teamName} Wins Again — Here's What That Actually Means`,
        `${wins} and ${losses}. ${teamName} Is Exactly Where It Wants to Be.`,
        `Not Pretty, But It Counts — ${teamName} Tops ${oppRStr}${lg.oppName}`,
      ])
    } else if (!lg.won && lg.blowout) {
      headline = pick([
        `${teamName} Gets Exposed — ${lg.oppName} Delivers a Wake-Up Call`,
        `Reality Check: What ${lg.theirs}-${lg.mine} Loss to ${oppRStr}${lg.oppName} Reveals`,
        `Hard Truths After ${teamName}'s Worst Loss of the Season`,
        `This Hurts — And ${teamName} Needs to Let It`,
      ])
    } else if (!lg.won && lg.close) {
      headline = pick([
        `The Margins That Kill You: ${teamName} Falls Short Against ${oppRStr}${lg.oppName}`,
        `Heartbreak in ${weekLabel}: ${teamName} Loses a Game It Could Have Won`,
        `Close Isn't Good Enough — ${teamName} Drops a Tight One to ${lg.oppName}`,
        `The Missed Moments That Decided ${teamName}'s ${lg.theirs}-${lg.mine} Loss`,
      ])
    } else {
      headline = pick([
        `${teamName} Falls to ${record} — Time for an Honest Evaluation`,
        `${oppRStr}${lg.oppName} Was Better on Saturday. What Does ${teamName} Do Now?`,
        `${teamName} Loses to ${lg.oppName} — The Questions This Raises`,
      ])
    }
  } else {
    headline = pick([
      `${rankStr}${teamName} at ${record}: A Full Breakdown of Where This Program Stands`,
      `The ${teamName} Report — ${weekLabel} Edition`,
      `Everything You Need to Know About ${teamName} Heading Into ${weekLabel}`,
    ])
  }
  parts.push(headline)
  parts.push('')

  // ── Opening lede ──────────────────────────────────────────────────────────
  if (lg) {
    const oppRStr = lg.oppRank ? `#${lg.oppRank} ` : ''
    const rankingNote = rank
      ? (prevRank && prevRank > rank ? ` — a performance that should push them up in the polls` : prevRank && prevRank < rank ? `, which cost them spots in the rankings` : ``)
      : ''

    if (lg.won && lg.blowout) {
      parts.push(pick([
        `There are wins that move the needle, and then there are wins that flip it entirely. What ${rankStr}${teamName} did to ${oppRStr}${lg.oppName} on ${lg.venue === 'at home' ? 'its home field' : lg.venue} — a ${lg.mine}-${lg.theirs} final that was never in question — falls squarely in the second category${rankingNote}. This wasn't a team scraping by. This was a team playing with genuine conviction, and the margin was honest.`,
        `A ${lg.margin}-point win over ${oppRStr}${lg.oppName}. Let that sit for a moment. In a sport where the difference between a good team and a great one often comes down to inches and inches of margin, ${rankStr}${teamName} went out and manufactured a blowout${rankingNote}. That doesn't happen by accident. It happens when talent, preparation, and execution converge on the same afternoon.`,
        `You want to know what a team looks like when it's hitting its ceiling? Watch the film from ${teamName}'s ${lg.mine}-${lg.theirs} performance against ${oppRStr}${lg.oppName} ${lg.venue}. That is a program operating without apology${rankingNote}. The scoreboard tells the story, and the story is convincing.`,
      ]))
    } else if (lg.won && lg.close) {
      parts.push(pick([
        `The final was ${lg.mine}-${lg.theirs}. The game felt closer than that. And yet, ${rankStr}${teamName} found a way — which is precisely the kind of thing you need to see from a team that has aspirations beyond a decent record. Winning ugly on the road against ${oppRStr}${lg.oppName}${rankingNote} isn't a red flag; it's a resume line. Comfortable teams don't survive those games.`,
        `There's a version of Saturday where ${teamName} comes home empty-handed. The ${lg.oppName} matchup was the kind of game that exposes programs not ready for the moment. Instead, ${rankStr}${teamName} made enough plays when it mattered, finished with a ${lg.mine}-${lg.theirs} win${rankingNote}, and added another chapter to what is becoming a genuinely interesting season.`,
        `Championship-caliber teams don't just win the easy games — they survive the hard ones. ${rankStr}${teamName}'s ${lg.mine}-${lg.theirs} decision over ${oppRStr}${lg.oppName} ${lg.venue} wasn't perfect${rankingNote}. But survival rarely is. The final stands, and right now, that's what matters most.`,
      ]))
    } else if (lg.won) {
      parts.push(pick([
        `${wins} wins${rank ? `, a top-${rank <= 10 ? 'ten' : rank <= 25 ? 'twenty-five' : 'forty'} ranking` : ''}, and a program that is building something with quiet consistency. ${rankStr}${teamName}'s ${lg.mine}-${lg.theirs} handling of ${oppRStr}${lg.oppName} ${lg.venue} won't make every highlight reel, but it reinforced something important: this team does what it's supposed to do${rankingNote}. In a sport full of traps and upsets, that matters enormously.`,
        `Not every win needs to announce itself. ${teamName}'s ${lg.mine}-${lg.theirs} victory over ${lg.oppName} ${lg.venue} was efficient, controlled, and exactly what ${record} looks like when a program understands its identity${rankingNote}. There's a reason coaches talk about process over product. Saturday was the process at work.`,
      ]))
    } else if (!lg.won && lg.blowout) {
      parts.push(pick([
        `Sometimes a score is just a score. A ${lg.theirs}-${lg.mine} loss to ${oppRStr}${lg.oppName} ${lg.venue} — that's not a score. That's a statement about the gap between where ${teamName} is and where it needs to be. The honest reaction isn't panic. It's clarity. This loss revealed real problems, and burying them in optimism would be a disservice to a fanbase that deserves the truth.`,
        `${oppRStr}${lg.oppName} was better on Saturday. Not a little better — a lot better. The ${lg.theirs}-${lg.mine} final was a reflection of a talent and execution gap that ${teamName} needs to acknowledge honestly. Getting blown out hurts precisely because it doesn't allow for easy explanations. Everything was exposed. Now comes the real test of this program's character.`,
        `A ${lg.margin}-point loss isn't something you paper over with talking points about improvement and process. It demands accountability, and the coaching staff at ${teamName} knows that. What happened against ${oppRStr}${lg.oppName} ${lg.venue} on Saturday exposed vulnerabilities on both sides of the ball that cannot be ignored going forward.`,
      ]))
    } else if (!lg.won && lg.close) {
      parts.push(pick([
        `${lg.theirs}-${lg.mine}. The last thing ${teamName} wanted to see on that scoreboard, and perhaps the most painful result of the season precisely because it wasn't inevitable. Games like this — winnable games, games that slip away in the fourth quarter or in a critical possession — are the ones that define where a program actually is. Close losses to ${oppRStr}${lg.oppName} don't show up on your final record any differently than blowouts, but they hurt differently.`,
        `The most frustrating losses in college football aren't the blowouts — they're the ones you almost won. ${teamName}'s ${lg.theirs}-${lg.mine} defeat at the hands of ${oppRStr}${lg.oppName} ${lg.venue} fits that description exactly. A program drops a game like this and has to sit with it, study it, and figure out exactly why close wasn't close enough when the lights were brightest.`,
        `Margin of defeat: ${lg.margin} points. Margin of opportunity: much narrower than that. ${teamName} had ${lg.oppName} right where it needed them at points on Saturday, and the inability to finish the job in a ${lg.theirs}-${lg.mine} loss is the kind of thing that echoes through the rest of a season if it isn't addressed directly.`,
      ]))
    } else {
      parts.push(pick([
        `${teamName} sits at ${record} after Saturday's ${lg.theirs}-${lg.mine} result against ${oppRStr}${lg.oppName} ${lg.venue}. The honest assessment: ${lg.oppName} was the better team in this game, and the margin is fair. There's still runway to make something meaningful out of this season — ${remainingCount} games remain — but the direction has to change, and it needs to change now.`,
        `Losses sting. That's by design. The ${lg.theirs}-${lg.mine} final in ${lg.venue === 'at home' ? 'what should have been a friendly environment' : 'a hostile environment'} against ${oppRStr}${lg.oppName} drops ${teamName} to ${record} and raises legitimate questions about the consistency of this program's performance over a full sixty minutes of football.`,
      ]))
    }
  } else {
    // No game yet — season preview mode
    parts.push(pick([
      `${rankStr}${teamName} enters ${weekLabel} at ${record}, and the story of this season is still very much being written. The sample size is ${gamesPlayed > 0 ? `${gamesPlayed} game${gamesPlayed > 1 ? 's' : ''}` : 'small'} — enough to draw some early conclusions, not enough to declare anything definitive. Here's what we know, what we're watching, and what this program needs to do over the rest of the year.`,
      `There's a fine line between a team that's where it expected to be and a team that's hiding behind optimism. ${rankStr}${teamName} at ${record} in ${weekLabel} is neither in crisis nor coasting. The ceiling of this program depends on execution, depth, and the ability to win games they shouldn't. Let's break down the full picture.`,
    ]))
  }
  parts.push('')

  // ── Game breakdown / player spotlight ─────────────────────────────────────
  const gamePlayer = lg?.keyPlayers?.[0] ?? null
  const seasonQB = seasonLeaders.passing
  const seasonRB = seasonLeaders.rushing
  const spotlight = gamePlayer ?? (seasonQB ? { name: seasonQB.name, type: 'passing', line: `${seasonQB.yds ?? 0} yards and ${seasonQB.td ?? 0} touchdowns on the season` } : topOvrPlayers[0] ? { name: topOvrPlayers[0].name, type: 'overall', line: `a ${topOvrPlayers[0].ovr} overall rating at ${topOvrPlayers[0].pos}` } : null)

  if (lg && spotlight) {
    if (lg.won) {
      parts.push(pick([
        `The player who deserves the spotlight out of this one is ${spotlight.name}. ${spotlight.line.charAt(0).toUpperCase() + spotlight.line.slice(1)} — numbers that don't exist without intent and preparation. What separates a good performance from a statement one is whether a player elevates the people around them, and ${spotlight.name} did exactly that on Saturday. When this offense needs a play, that's who this team turns to, and right now that player is delivering.${lg.keyPlayers?.length > 1 ? ` Give credit to ${lg.keyPlayers[1].name} as well — ${lg.keyPlayers[1].line} in a supporting role that shouldn't go unnoticed.` : ''}`,
        `Individual performances build team narratives, and ${spotlight.name}'s ${spotlight.line} against ${lg.oppName} was the kind of output that shifts expectations. Not just for what happened Saturday, but for what it suggests about what this offense can become. The efficiency matters as much as the totals. ${teamName} needs ${spotlight.name} playing at this level consistently — and there are real signs that's exactly what's happening.`,
        `Let's talk about ${spotlight.name}. ${spotlight.line} in a win that needed every one of those contributions. The best players in college football don't just produce — they produce when the margin for error is smallest. Watch the film from Saturday, and you'll see a player who understood the assignment and executed it completely.`,
      ]))
    } else {
      parts.push(pick([
        `In a loss, it can be easy to overlook individual effort. Don't. ${spotlight.name} showed up — ${spotlight.line} against a ${lg.oppName} defense that made things difficult for everyone else. Effort like that matters even in defeat, because it gives you something concrete to build from when you go back to the film room. The team let ${spotlight.name} down in this game. Not the other way around.`,
        `The honest recap: ${teamName} was outplayed in this one, but ${spotlight.name} wasn't the problem. ${spotlight.line} — that's a player competing. The surrounding performance needed to be better, and that's a coaching and roster-depth conversation as much as it is a talent conversation. When your best player is doing their job and you still lose by ${lg.margin}, the answers aren't easy ones.`,
      ]))
    }
  } else if (!lg && spotlight) {
    const isSeasonStat = !gamePlayer
    parts.push(pick([
      `The player this offense runs through is ${spotlight.name}. ${spotlight.line}. Everything the ${teamName} offense wants to accomplish this season gets filtered through what ${spotlight.name} is able to do — and what that player has shown so far suggests the ceiling is legitimate. When ${teamName} is at its best, ${spotlight.name} is in rhythm, the offense is operating efficiently, and the scoreboard reflects it.`,
      `If you want to understand how ${teamName} wins football games, start with ${spotlight.name}. ${isSeasonStat ? `Season totals of ${spotlight.line} don't happen by accident — they happen because a player is operating at a high level, week in and week out.` : `${spotlight.line.charAt(0).toUpperCase() + spotlight.line.slice(1)} is the kind of production that defines a season and sometimes a career.`} The rest of this season runs through how well that player performs in the biggest moments.`,
    ]))
  }

  // Add scoring context if available
  if (ppg && papg && gamesPlayed >= 2) {
    const offDesc = parseFloat(ppg) >= 35 ? 'explosive' : parseFloat(ppg) >= 28 ? 'productive' : parseFloat(ppg) >= 21 ? 'functional' : 'inconsistent'
    const defDesc = parseFloat(papg) <= 17 ? 'suffocating' : parseFloat(papg) <= 24 ? 'stout' : parseFloat(papg) <= 31 ? 'adequate' : 'vulnerable'
    parts.push(`Zoom out to the season-long numbers and the picture comes into focus. ${teamName} is averaging ${ppg} points per game — ${offDesc} by any measure — while surrendering ${papg} per contest, a ${defDesc} rate on the defensive side. The point differential of ${scoreDiff} per game tells you where this program sits in the pecking order of the conference, and right now that number is${parseFloat(scoreDiff) > 0 ? ' in the right direction' : ' something that needs to move'}.`)
    parts.push('')
  }
  parts.push('')

  // ── Next game preview ─────────────────────────────────────────────────────
  if (ng) {
    const oppRStr = ng.oppRank ? `#${ng.oppRank} ` : ''
    const oppRecord = `${ng.oppW}-${ng.oppL}`
    const oppWinPct = ng.oppW + ng.oppL > 0 ? ng.oppW / (ng.oppW + ng.oppL) : 0.5
    const oppDesc = oppWinPct >= 0.8 ? 'one of the better teams on this side of the schedule'
      : oppWinPct >= 0.6 ? 'a respectable opponent that earns everything it gets'
      : oppWinPct >= 0.4 ? 'a team capable of making things difficult on any given Saturday'
      : 'an opponent that hasn\'t found its footing yet this season'

    if (ng.oppRank) {
      parts.push(pick([
        `Now the schedule delivers its most significant test yet: ${oppRStr}${ng.oppName} at ${oppRecord}, ${ng.venue}. This is the kind of game that makes and breaks seasons. A win here doesn't just add to the win column — it reshapes how the country views ${teamName} and what this program is capable of producing. The opponent is real. The moment is real. What ${teamName} does with it will tell us everything we need to know about where this team's ceiling actually sits.${ng.oppPpg ? ` Be aware: ${ng.oppName} is scoring ${ng.oppPpg} per game on offense. That's a unit that needs to be accounted for.` : ''}`,
        `The challenge in front of ${teamName} is a steep one: a road trip${ng.home ? ' (home game, but don\'t sleep on the magnitude)' : ''} to face ${oppRStr}${ng.oppName}, sitting at ${oppRecord} and playing with the kind of confidence that comes with a ranking and a winning record. ${ng.oppPpg ? `They're putting up ${ng.oppPpg} points per game. ` : ''}If ${teamName} is going to prove it belongs in the conversation for something special this season, this is the game where that proof gets filed. Or doesn't.`,
        `Here's the deal about ${oppRStr}${ng.oppName}: at ${oppRecord}, they are not a trap game. They are a genuine test. The ${ng.venue} setting matters. The preparation matters. The ability of ${teamName}'s key players to perform on the biggest stage available to them matters. Win this one, and the ceiling of this season rises considerably. Lose it, and the margin for error disappears.`,
      ]))
    } else if (ng.isBig) {
      parts.push(pick([
        `The next game — ${ng.oppName} at ${oppRecord}, ${ng.venue} — looks manageable on paper. Don't be fooled. ${ng.oppName} is ${oppDesc}, and college football has proven repeatedly that comfortable results require uncomfortable effort. ${teamName} needs to bring the same focus that defines a good week's preparation, not the complacency that comes from looking past a winnable game to the marquee matchups down the schedule.`,
        `${ng.oppName} comes in at ${oppRecord} — ${ng.venue} — and represents exactly the kind of game ${teamName} should control. The word "should" is doing a lot of work in that sentence. Focus, execution, and avoiding the mental letdown after a tough week are the real opponents here. Handle them, and this one goes in the win column.`,
      ]))
    } else {
      parts.push(pick([
        `${ng.oppName} at ${oppRecord} is next on the calendar, and the expectation — stated plainly — is a ${teamName} win. Anything less constitutes a genuine program-level disappointment. These are the games that separate teams with real standards from teams that only rise to the occasion when the spotlight demands it. The best version of ${teamName} handles ${ng.oppName} and moves on. Let's see if that version shows up.`,
        `The next test is ${ng.oppName} (${oppRecord}) ${ng.venue}. On paper, this is a ${teamName} game to win. The reality of college football is that no game is genuinely guaranteed — but this is as close as the schedule gets. ${teamName} needs to come out focused, execute the game plan, and take care of business the way any program worth its salt should when the matchup lines up favorably.`,
      ]))
    }
  } else {
    parts.push(pick([
      `The regular season is complete. ${teamName} at ${record} has done everything it can do in sixty minutes of football, and now the program waits for the postseason picture to crystallize. The results will speak for themselves. This team's fate is in the hands of the selection process — and based on the body of work, there's a reasonable argument for a meaningful postseason destination.`,
      `No more games on the regular season calendar. What ${teamName} built over the course of this year — ${record}, the performances that defined this group — now gets evaluated against every other resume in the country. Whatever comes next in the postseason, this program gave itself every opportunity to earn something worth remembering.`,
    ]))
  }
  parts.push('')

  // ── Big picture / ranking and season arc ──────────────────────────────────
  const hotStreak    = currentStreakType === 'W' && currentStreak >= 3
  const coldStreak   = currentStreakType === 'L' && currentStreak >= 3
  const winningBig   = wins > losses && wins >= 5 && rankedWins >= 1
  const awayRecord   = `${awayWins}-${awayLosses}`
  const homeRecord   = `${homeWins}-${homeLosses}`
  const rankGained   = rank && prevRank && prevRank > rank
  const rankLost     = rank && prevRank && prevRank < rank
  const rankDebut    = rank && !prevRank

  if (rank) {
    parts.push(pick([
      `Let's put the ranking in context. ${teamName} at #${rank}${rankGained ? `, moving up from #${prevRank} a week ago,` : rankLost ? `, sliding from #${prevRank} after last week's result,` : rankDebut ? `, making their first appearance in the polls this season,` : ''} is a program that has earned its position through results. The poll is a mirror, not a prediction. Right now that mirror is reflecting a team that has taken care of its obligations and positioned itself for a real run. ${rankedWins > 0 ? `The ${rankedWins} win${rankedWins > 1 ? 's' : ''} over ranked opponents on the resume give the ranking legitimacy beyond just a favorable schedule.` : `The next step is adding a signature win over a ranked opponent — without that, the ranking will always carry an asterisk.`}`,
      `A #${rank} ranking at this point in the season represents earned currency. ${teamName} built it game by game, and the ${record} record${rankedWins > 0 ? ` with ${rankedWins} win${rankedWins > 1 ? 's' : ''} over ranked competition` : ''} gives the number substance. The question every ranked team faces isn't how you got here — it's whether you can sustain it when the schedule pushes back hardest. ${remainingCount > 0 ? `${remainingCount} game${remainingCount > 1 ? 's' : ''} remain to answer that question.` : 'The answer is in the books.'}`,
    ]))
  } else if (hotStreak) {
    parts.push(pick([
      `${currentStreak} straight wins. The conversation around ${teamName} is changing, and it should be. This is what sustained momentum looks like — not a one-week blip, but a genuine run of form that's building something. The question isn't whether this team is playing well. It's whether the program can maintain the standard when the schedule delivers its toughest remaining tests.${wins > losses ? ` At ${record}, the postseason case is being constructed with real evidence.` : ''}`,
      `Three or more wins in a row is a streak. It's also a signal. ${teamName} at ${record} is finding its identity at the right time of the year, and the energy inside that program right now is different than it was a month ago. Sustained winning reshapes how opponents prepare for you. It reshapes recruiting conversations. It reshapes everything — and ${teamName} is in the middle of exactly that process.`,
    ]))
  } else if (coldStreak) {
    parts.push(pick([
      `Three straight losses is a skid. Call it what it is. ${teamName} at ${record} is in a difficult stretch, and the uncomfortable truth is that the causes of this run — whether execution, game-planning, or talent gaps — don't fix themselves between Saturday afternoons. This program needs to identify the specific breakdowns, address them with urgency, and reverse the trajectory before the season slips away entirely.`,
      `The record says ${record}. The trend says something else. ${currentStreak} losses in a row for ${teamName} raises legitimate structural questions about whether the issues being exposed are correctable within the framework of this season or indicative of something deeper. The right answer is probably both. Fix what you can. Acknowledge what you can't. And compete fiercely in every remaining game regardless.`,
    ]))
  } else if (winningBig) {
    parts.push(pick([
      `At ${record}${rankedWins > 0 ? ` with ${rankedWins} ranked scalp${rankedWins > 1 ? 's' : ''} on the wall` : ''}, ${teamName} is building a resume worth taking seriously. The combination of consistent winning and a quality win or two is the formula for postseason relevance, and this program is executing it. The road record of ${awayRecord} matters — away wins are the strongest currency in college football and ${awayWins > 0 ? `${teamName} has been cashing them in` : `that's an area where more contributions are needed`}.`,
      `The case for ${teamName} as a team with real destination potential: ${record}, ${rankedWins > 0 ? `wins over ranked opponents, ` : ''}a scoring margin of${scoreDiff && parseFloat(scoreDiff) > 5 ? ` plus-${scoreDiff} per game` : ` close to even`}, and the kind of résumé that demands attention when selection committees convene. This isn't projection. It's just math.`,
    ]))
  } else {
    const outlook = wins > losses ? 'in a decent position with room to grow' : wins === losses ? 'at the fulcrum of a season that can go either direction' : 'facing real pressure to salvage something meaningful'
    parts.push(pick([
      `${teamName} at ${record} is ${outlook}. The honest evaluation: the talent is here, the moments of quality are real, and the question is consistency. College football rewards programs that eliminate the bad losses and win the games in their weight class. ${teamName} has shown it can do the former. The latter is what will determine the final verdict on this season.`,
      `Every season has a defining stretch. For ${teamName}, ${remainingCount > 0 ? `these final ${remainingCount} game${remainingCount > 1 ? 's' : ''} represent that moment` : 'the season as played is that document'}. The ${record} record sits between promise and regret right now — and the finishing kick is what separates one from the other in the annals of this program.`,
    ]))
  }
  parts.push('')

  // ── Recruiting / roster depth ─────────────────────────────────────────────
  if (recruits.length > 0) {
    const top = recruits[0]
    const stars = top.stars ? `${top.stars}-star` : null
    const topLine = [stars, top.position, top.name, top.state ? `out of ${top.state}` : null].filter(Boolean).join(' ')
    const classSize = recruits.length

    if (classRank) {
      parts.push(pick([
        `The future of this program is also worth examining. A #${classRank} recruiting class — currently ${classSize} commitments deep, led by ${topLine} — isn't an accident. It's the result of on-field performance creating a brand, and that brand driving prospect interest. The best programs recruit into their winning, and right now ${teamName} is doing exactly that. What this class ultimately becomes will depend on development, but the raw material entering this program is not something to gloss over.`,
        `Recruiting context matters. A #${classRank} class nationally tells you something about the long-term trajectory of this program — specifically, that the pipeline is healthy. ${topLine} leads a group of ${classSize} commitments that will push this roster forward. Programs that recruit in the top ${classRank <= 15 ? 'fifteen' : classRank <= 25 ? 'twenty-five' : 'forty'} nationally don't stay average for long. The on-field product right now is proof of that investment.`,
      ]))
    } else {
      parts.push(pick([
        `The recruiting front deserves attention. ${classSize} commitment${classSize > 1 ? 's' : ''} in the current class, paced by ${topLine}. The best programs never stop building, even in the middle of a season where the present demands everything you have. The way ${teamName} is building for the future — the caliber of prospects being brought in — speaks to a program that understands sustainability, not just this year's results.`,
        `Future-proofing matters in this sport. ${classSize} commitment${classSize > 1 ? 's' : ''} and counting in ${teamName}'s current class, with ${topLine} leading the group. Recruiting wins don't show up in the standings, but they show up eventually — in depth, in talent, in the ability to replace what you lose to graduation and the transfer portal. This program is attending to that work.`,
      ]))
    }
  } else if (topOvrPlayers.length >= 2) {
    const p1 = topOvrPlayers[0]
    const p2 = topOvrPlayers[1]
    parts.push(pick([
      `The backbone of this roster is worth acknowledging: ${p1.name} (${p1.pos}, ${p1.ovr} OVR) and ${p2.name} (${p2.pos}, ${p2.ovr} OVR) represent the foundation that every decision this season gets built around. Programs rise and fall with the players at the top of their depth charts. When those players perform, good things happen. ${teamName}'s identity is inextricably tied to how those two individuals perform over the remainder of this season.`,
      `Depth and talent are two different things. ${teamName} has talent — ${p1.name} at ${p1.pos} and ${p2.name} at ${p2.pos} are legitimate, difference-making players on this roster. The question is whether the depth behind them is capable of bridging the gap in weeks when those players are asked to carry more than their share. That's the roster management conversation worth having as the schedule enters its most demanding stretch.`,
    ]))
  }
  parts.push('')

  // ── Closing take ──────────────────────────────────────────────────────────
  if (ng) {
    const oppRStr = ng.oppRank ? `#${ng.oppRank} ` : ''
    if (lg?.won) {
      parts.push(pick([
        `${teamName} is a team that is finding out what it's made of — one week at a time, one win at a time. The game against ${oppRStr}${ng.oppName} is next. When it's over, we'll know something new about this program that we don't know right now. That's the beauty of this sport, and it's exactly why Saturday can't get here fast enough.`,
        `The bottom line on ${rankStr}${teamName}: this program is for real, and the people who haven't taken it seriously are running out of time to adjust their assessment. ${oppRStr}${ng.oppName} is next in line to find that out. Let's see how it goes.`,
        `${rankStr}${teamName} is a team with belief, with production, and with a schedule that still has something left to offer. The ${oppRStr}${ng.oppName} game isn't just about this week's box score — it's about building the kind of resume that earns something at the end of the year. That work continues now.`,
      ]))
    } else {
      parts.push(pick([
        `${teamName} has a choice after a loss like this: fold into the narrative that the worst is confirmed, or push back against it with results. The ${oppRStr}${ng.oppName} game is where that choice gets made public. If there's character in this locker room — and there is, there always is — it will show up on the field. That's all that matters now.`,
        `Losing the right way means being honest about it, learning from it, and refusing to let it define you before the season is over. ${teamName} has time. ${rankStr ? 'The ranking took a hit. ' : ''}The program hasn't. ${oppRStr}${ng.oppName} is next, and that's where the response begins.`,
        `Here's the truth about ${teamName} right now: the potential that existed in August still exists. The record, the ranking, the mistakes — those are all fixable in the weeks ahead. What's not fixable is deciding not to compete. Based on everything I've seen from this program, that's not a decision they're going to make. ${oppRStr}${ng.oppName} is next. Prove it.`,
      ]))
    }
  } else {
    parts.push(pick([
      `${teamName} built a ${record} season, and in this sport, that means you gave yourself a chance. Whatever comes next — whatever postseason opportunity materializes — this group earned it. The players, the coaches, the program. It wasn't perfect. It rarely is. But it was real, and real effort in a sport this hard deserves respect.`,
      `This is what ${teamName} produced this year: a ${record} record, ${rankedWins > 0 ? `${rankedWins} win${rankedWins > 1 ? 's' : ''} over ranked opponents, ` : ''}and a season with more chapters left to write in the postseason. Judge the program by what it does when the stakes are highest — and the stakes are about to get as high as they've been all year.`,
    ]))
  }

  return parts.join('\n')
}

// ─── Article renderer ─────────────────────────────────────────────────────────

function ArticleBody({ text }) {
  const lines = text.split('\n')
  const headline = lines[0]
  const body = lines.slice(1).join('\n').trim()
  const paragraphs = body.split(/\n\n+/).filter(Boolean)

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-txt-primary leading-snug">{headline}</h2>
      {paragraphs.map((p, i) => (
        <p key={i} className="text-sm text-txt-secondary leading-relaxed">
          {p.replace(/\n/g, ' ')}
        </p>
      ))}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WeeklyPodcast({ year, week }) {
  const { currentDynasty } = useDynasty()

  const [phase, setPhase]     = useState('idle')
  const [article, setArticle] = useState('')

  const weekLabel = week === 15  ? 'Conference Championship'
    : week === 16 ? 'Bowl Week 1'
    : week === 17 ? 'Bowl Week 2'
    : week === 18 ? 'Bowl Week 3 / CFP Semifinals'
    : week === 19 ? 'National Championship'
    : week === -1 ? 'Preseason'
    : `Week ${week}`

  const cacheKey = currentDynasty ? `${CACHE_PREFIX}${currentDynasty.id}_${year}_${week}` : null

  useEffect(() => {
    if (!currentDynasty || !cacheKey) return
    const cached = localStorage.getItem(cacheKey)
    if (cached) { setArticle(cached); setPhase('ready') }
    else { setArticle(''); setPhase('idle') }
  }, [cacheKey, currentDynasty])

  const doGenerate = useCallback(() => {
    if (!currentDynasty) return
    const ctx  = extractContext(currentDynasty, year, week)
    const text = buildArticle(ctx, weekLabel)
    setArticle(text)
    if (cacheKey) localStorage.setItem(cacheKey, text)
    setPhase('ready')
  }, [currentDynasty, year, week, weekLabel, cacheKey])

  const teamName = currentDynasty
    ? (currentDynasty.teams?.[getCurrentTeamTid(currentDynasty)]?.name || currentDynasty.teamName || 'Your Team')
    : 'Your Team'

  if (!currentDynasty) return null

  return (
    <div className="card-elevated overflow-hidden">
      <div className="px-5 py-4 border-b border-surface-4">
        <div className="label-xs text-txt-tertiary mb-1">The {teamName} Breakdown</div>
        <h3 className="text-lg font-bold text-txt-primary">{weekLabel} — {teamName}</h3>
      </div>

      {phase === 'ready' && article && (
        <div className="px-5 py-5 space-y-5">
          <ArticleBody text={article} />
          <div className="pt-2 border-t border-surface-4">
            <button
              onClick={doGenerate}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary transition-colors"
            >
              Regenerate
            </button>
          </div>
        </div>
      )}

      {phase === 'idle' && (
        <div className="px-5 py-5 space-y-3">
          <p className="text-sm text-txt-secondary leading-relaxed">
            Generate a full breakdown article — last week's result, player spotlight, opponent preview, season outlook, and recruiting — no account or API key required.
          </p>
          <button
            onClick={doGenerate}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
            style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
          >
            Generate this week's breakdown
          </button>
        </div>
      )}
    </div>
  )
}
