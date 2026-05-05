import { useState, useMemo, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getTeamLogo, getTeamLogoByTid } from '../../data/teams'
import { getTeamName } from '../../data/teamAbbreviations'
import { getAbbrFromTeamName, getAbbrFromTid } from '../../data/teamRegistry'
import {
  PageHero,
  Card,
  Badge,
  EmptyState,
  Tabs,
  Modal,
} from '../../components/ui'
import { computeSeasonAV } from '../../utils/approximateValue'

// Stat category definitions
const STAT_CATEGORIES = {
  // Approximate Value — single cross-position production metric.
  // PFR-AV-inspired; calibrated so a top single-season lands in the
  // 15-22 range and 4-year college careers top out in the 60-90s.
  // No talent ratings (player.overall) feed into this — purely from
  // box-score production. See src/utils/approximateValue.js.
  production: {
    name: 'Production',
    minNote: 'Approximate Value — one cross-position production score (PFR-AV inspired). Higher = more total production. Top single-season around 15-22.',
    stats: [
      { key: 'av', label: 'Approximate Value', abbr: 'AV', calculated: true, format: 'av' },
    ]
  },
  passing: {
    name: 'Passing',
    minNote: 'Min 150 ATT (career) / 50 ATT (season)',
    stats: [
      { key: 'completions', label: 'Completions', abbr: 'CMP', field: 'cmp' },
      { key: 'attempts', label: 'Pass Attempts', abbr: 'ATT', field: 'att' },
      { key: 'compPct', label: 'Completion %', abbr: 'CMP%', calculated: true, minAtt: { career: 150, season: 50 }, format: 'pct' },
      { key: 'yards', label: 'Passing Yards', abbr: 'YDS', field: 'yds' },
      { key: 'ypa', label: 'Yards/Attempt', abbr: 'Y/A', calculated: true, minAtt: { career: 150, season: 50 }, format: 'avg' },
      { key: 'tds', label: 'Passing TDs', abbr: 'TD', field: 'td' },
      // Interceptions THROWN — sorted #1 = most picks (a "leader" by
      // count). Used to be `lowerIsBetter: true` which surfaced the
      // safest QB at #1; that's a "rate" stat (would need ATT-floor),
      // not a leaderboard. Fewest INTs is interesting but doesn't fit
      // the count-style cards here.
      { key: 'ints', label: 'Interceptions', abbr: 'INT', field: 'int' },
      { key: 'sacks', label: 'Sacks Taken', abbr: 'SCK', field: 'sacks' },
      { key: 'longestPass', label: 'Longest Pass', abbr: 'LNG', field: 'lng' },
      { key: 'rating', label: 'Passer Rating', abbr: 'RTG', calculated: true, minAtt: { career: 150, season: 50 }, format: 'rating' },
    ]
  },
  rushing: {
    name: 'Rushing',
    minNote: 'Min 100 ATT (career) / 25 ATT (season)',
    stats: [
      { key: 'attempts', label: 'Rush Attempts', abbr: 'ATT', field: 'car' },
      { key: 'yards', label: 'Rush Yards', abbr: 'YDS', field: 'yds' },
      { key: 'ypc', label: 'Yards/Carry', abbr: 'Y/C', calculated: true, minAtt: { career: 100, season: 25 }, format: 'avg' },
      { key: 'tds', label: 'Rush TDs', abbr: 'TD', field: 'td' },
      { key: 'longestRun', label: 'Longest Run', abbr: 'LNG', field: 'lng' },
      { key: 'fumbles', label: 'Fumbles', abbr: 'FUM', field: 'fum' },
      { key: 'brokenTackles', label: 'Broken Tackles', abbr: 'BT', field: 'bt' },
      { key: 'yac', label: 'Yards After Contact', abbr: 'YAC', field: 'yac' },
      { key: 'twentyPlus', label: '20+ Yard Runs', abbr: '20+', field: 'twentyPlus' },
    ]
  },
  receiving: {
    name: 'Receiving',
    minNote: 'Min 50 REC (career) / 10 REC (season)',
    stats: [
      { key: 'receptions', label: 'Receptions', abbr: 'REC', field: 'rec' },
      { key: 'yards', label: 'Receiving Yards', abbr: 'YDS', field: 'yds' },
      { key: 'ypr', label: 'Yards/Reception', abbr: 'Y/R', calculated: true, minAtt: { career: 50, season: 10 }, format: 'avg' },
      { key: 'tds', label: 'Receiving TDs', abbr: 'TD', field: 'td' },
      { key: 'longestRecep', label: 'Longest Reception', abbr: 'LNG', field: 'lng' },
      { key: 'rac', label: 'Yards After Catch', abbr: 'RAC', field: 'rac' },
      { key: 'drops', label: 'Drops', abbr: 'DROP', field: 'drops' },
    ]
  },
  allPurpose: {
    name: 'All-Purpose',
    stats: [
      { key: 'plays', label: 'All-Purpose Plays', abbr: 'PLY', calculated: true },
      { key: 'yards', label: 'All-Purpose Yards', abbr: 'YDS', calculated: true },
      { key: 'tds', label: 'All-Purpose TDs', abbr: 'TD', calculated: true }
    ]
  },
  defensive: {
    name: 'Defense',
    stats: [
      { key: 'totalTackles', label: 'Total Tackles', abbr: 'TOT', calculated: true },
      { key: 'soloTackles', label: 'Solo Tackles', abbr: 'SOLO', field: 'soloTkl' },
      { key: 'tfl', label: 'Tackles for Loss', abbr: 'TFL', field: 'tfl' },
      { key: 'sacks', label: 'Sacks', abbr: 'SCK', field: 'sacks' },
      { key: 'ints', label: 'Interceptions', abbr: 'INT', field: 'int' },
      { key: 'pdef', label: 'Passes Defensed', abbr: 'PD', field: 'pd' },
      { key: 'ff', label: 'Forced Fumbles', abbr: 'FF', field: 'ff' },
      { key: 'fr', label: 'Fumble Recoveries', abbr: 'FR', field: 'fr' },
      { key: 'defTds', label: 'Defensive TDs', abbr: 'TD', field: 'td' },
    ]
  },
  kicking: {
    name: 'Kicking',
    minNote: 'Min 25 FGA (career) / 5 FGA (season)',
    stats: [
      { key: 'fgm', label: 'FG Made', abbr: 'FGM', field: 'fgm' },
      { key: 'fga', label: 'FG Attempted', abbr: 'FGA', field: 'fga' },
      { key: 'fgPct', label: 'FG %', abbr: 'FG%', calculated: true, minAtt: { career: 25, season: 5 }, format: 'pct' },
      { key: 'longestFg', label: 'Longest FG', abbr: 'LNG', field: 'lng' },
      { key: 'xpm', label: 'XP Made', abbr: 'XPM', field: 'xpm' },
    ]
  },
  punting: {
    name: 'Punting',
    minNote: 'Min 50 punts (career) / 10 punts (season)',
    stats: [
      { key: 'punts', label: 'Punts', abbr: 'P', field: 'punts' },
      { key: 'yards', label: 'Punt Yards', abbr: 'YDS', field: 'yds' },
      { key: 'ypp', label: 'Yards/Punt', abbr: 'Y/P', calculated: true, minAtt: { career: 50, season: 10 }, format: 'avg' },
      { key: 'longestPunt', label: 'Longest Punt', abbr: 'LNG', field: 'lng' },
      { key: 'in20', label: 'Punts Inside 20', abbr: 'IN20', field: 'in20' },
    ]
  },
  kickReturn: {
    name: 'Kick Returns',
    stats: [
      { key: 'returns', label: 'Kick Returns', abbr: 'RET', field: 'ret' },
      { key: 'yards', label: 'KR Yards', abbr: 'YDS', field: 'yds' },
      { key: 'avg', label: 'Yards/Return', abbr: 'AVG', calculated: true, minAtt: { career: 20, season: 5 }, format: 'avg' },
      { key: 'tds', label: 'KR TDs', abbr: 'TD', field: 'td' },
      { key: 'longestKr', label: 'Longest Return', abbr: 'LNG', field: 'lng' },
    ]
  },
  puntReturn: {
    name: 'Punt Returns',
    stats: [
      { key: 'returns', label: 'Punt Returns', abbr: 'RET', field: 'ret' },
      { key: 'yards', label: 'PR Yards', abbr: 'YDS', field: 'yds' },
      { key: 'avg', label: 'Yards/Return', abbr: 'AVG', calculated: true, minAtt: { career: 20, season: 5 }, format: 'avg' },
      { key: 'tds', label: 'PR TDs', abbr: 'TD', field: 'td' },
      { key: 'longestPr', label: 'Longest Return', abbr: 'LNG', field: 'lng' },
    ]
  }
}

const CATEGORY_ORDER = ['production', 'passing', 'rushing', 'receiving', 'allPurpose', 'defensive', 'kicking', 'punting', 'kickReturn', 'puntReturn']

// Stat fields that are MAX-style (single-best) rather than count-style
// (cumulative). Career aggregation needs Math.max for these instead of
// summing — otherwise a player's "longest pass" career stat becomes the
// sum of their seasonal longs, which is meaningless and produces
// 200-yard "passes" on the leaderboard.
const MAX_FIELDS = new Set([
  'lng',     // longest pass / run / reception / FG / punt / return — every category names it `lng`
  'intLng',  // longest defensive INT return
  'fgLong',  // alt key seen in some box-score paths
])
const isMaxField = (key) => MAX_FIELDS.has(key)

export default function DynastyRecords() {
  const { id: dynastyId, category: categoryParam } = useParams()
  const { currentDynasty } = useDynasty()
  const pathPrefix = usePathPrefix()
  const navigate = useNavigate()

  // Resolve which category tab is active. URL param wins (so a
  // bookmarked /dynasty-records/passing always lands on Passing),
  // falling back to last-visited via localStorage, then to the
  // headline Production tab. Validates against STAT_CATEGORIES so a
  // bad URL slug doesn't blank the page.
  const resolveCategory = (param) => {
    if (param && STAT_CATEGORIES[param]) return param
    const stored = localStorage.getItem('leaderboard-category')
    if (stored && STAT_CATEGORIES[stored]) return stored
    return 'production'
  }

  const [mode, setMode] = useState(() => localStorage.getItem('leaderboard-mode') || 'career')
  const [activeCategory, setActiveCategory] = useState(() => resolveCategory(categoryParam))

  // Keep state in sync with URL — covers back/forward navigation,
  // direct paste, and any external link to a specific tab.
  useEffect(() => {
    const next = resolveCategory(categoryParam)
    if (next !== activeCategory) setActiveCategory(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryParam])
  // Stat key for the "view full leaderboard" modal — null when closed.
  // Replaces the prior `selectedStat` inline expand/collapse state; the
  // inline 4-10 expansion only showed 7 more entries and felt cramped.
  // Modal-based reveal can show the full ranked list with breathing room.
  const [modalStat, setModalStat] = useState(null)
  // Free-text search inside the modal — filters the displayed list by
  // player-name substring while preserving each player's true rank in
  // the leaderboard. Reset on close.
  const [modalSearch, setModalSearch] = useState('')
  // For the Production (AV) modal: which row is expanded to show its
  // per-season breakdown. Key matches the modal row key (pid for career
  // mode, `${pid}-${year}` for season mode). Null = nothing expanded.
  const [expandedRowKey, setExpandedRowKey] = useState(null)

  // Get roster players
  const getRosterPlayers = () => {
    if (!currentDynasty?.players) return []
    return currentDynasty.players.filter(p => !p.isHonorOnly)
  }

  // Get player info. player.team may be a tid (modern format), an abbr
  // (legacy), or a full team name (older legacy). Resolve all three so the
  // leaderboard's team logo / name doesn't break for tid-stored players.
  const getPlayerInfo = (pid) => {
    const player = currentDynasty?.players?.find(p => p.pid === pid)
    const teamsSource = currentDynasty?.teams || currentDynasty?.customTeams
    const playerTeamRaw = player?.team || currentDynasty?.teamName

    // tid-first resolution. Numeric tid → abbr/name/logo via registry.
    let teamAbbr = null
    let teamFullName = null
    let teamLogo = null
    if (typeof playerTeamRaw === 'number' || (typeof playerTeamRaw === 'string' && /^\d+$/.test(playerTeamRaw))) {
      const tid = Number(playerTeamRaw)
      teamAbbr = getAbbrFromTid(teamsSource, tid)
      teamFullName = teamsSource?.[tid]?.name || (teamAbbr ? getTeamName(teamAbbr) : null)
      teamLogo = getTeamLogoByTid(tid, teamsSource)
    }
    // Fall back to abbr / team-name handling for legacy player records.
    if (!teamAbbr) {
      teamAbbr = getAbbrFromTeamName(playerTeamRaw) || playerTeamRaw
    }
    if (!teamFullName) {
      teamFullName = getTeamName(teamAbbr) || playerTeamRaw
    }
    if (!teamLogo) {
      teamLogo = getTeamLogo(teamFullName, teamsSource)
    }

    return {
      name: player?.name || `Player ${pid}`,
      position: player?.position || '',
      team: teamFullName,
      teamAbbr,
      teamLogo,
      pictureUrl: player?.pictureUrl || null
    }
  }

  // Calculate leaderboards
  const leaderboards = useMemo(() => {
    const rosterPlayers = getRosterPlayers()
    if (rosterPlayers.length === 0) return {}

    const allPlayerStats = []

    rosterPlayers.forEach(player => {
      const playerOwnStats = player.statsByYear || {}

      Object.keys(playerOwnStats).forEach(yearStr => {
        const year = parseInt(yearStr)
        const yearStats = playerOwnStats[yearStr] || playerOwnStats[year]
        if (!yearStats) return

        const hasAnyStats = yearStats.gamesPlayed ||
          yearStats.passing || yearStats.rushing || yearStats.receiving ||
          yearStats.defense || yearStats.kicking || yearStats.punting ||
          yearStats.kickReturn || yearStats.puntReturn

        if (!hasAnyStats) return

        allPlayerStats.push({
          pid: player.pid,
          name: player.name,
          year,
          gamesPlayed: yearStats.gamesPlayed || 0,
          passing: yearStats.passing || null,
          rushing: yearStats.rushing || null,
          receiving: yearStats.receiving || null,
          defensive: yearStats.defense || null,
          kicking: yearStats.kicking || null,
          punting: yearStats.punting || null,
          kickReturn: yearStats.kickReturn || null,
          puntReturn: yearStats.puntReturn || null
        })
      })
    })

    if (allPlayerStats.length === 0) return {}

    const aggregateStats = (category) => {
      const playerTotals = {}

      allPlayerStats.forEach(ps => {
        const catStats = ps[category]
        if (!catStats) return

        const playerKey = mode === 'career' ? ps.pid : `${ps.pid}-${ps.year}`

        if (!playerTotals[playerKey]) {
          playerTotals[playerKey] = { pid: ps.pid, year: ps.year, years: [], gamesPlayed: 0 }
        }

        if (!playerTotals[playerKey].years.includes(ps.year)) {
          playerTotals[playerKey].years.push(ps.year)
        }

        if (ps.gamesPlayed) {
          playerTotals[playerKey].gamesPlayed += ps.gamesPlayed
        }

        Object.entries(catStats).forEach(([statKey, value]) => {
          if (typeof value === 'number') {
            if (mode === 'career') {
              // "Long" stats (longest pass / run / reception / FG /
              // punt / return) are MAX fields, not sum fields.
              // Career-summing them gave nonsense like a 245-yard
              // longest pass (sum of 3 seasonal longs). Take the
              // max across seasons instead.
              if (isMaxField(statKey)) {
                playerTotals[playerKey][statKey] = Math.max(
                  playerTotals[playerKey][statKey] || 0,
                  value
                )
              } else {
                playerTotals[playerKey][statKey] = (playerTotals[playerKey][statKey] || 0) + value
              }
            } else {
              playerTotals[playerKey][statKey] = value
            }
          }
        })
      })

      return Object.values(playerTotals)
    }

    const calcAllPurposeStats = () => {
      const playerTotals = {}

      allPlayerStats.forEach(ps => {
        const playerKey = mode === 'career' ? ps.pid : `${ps.pid}-${ps.year}`

        if (!playerTotals[playerKey]) {
          playerTotals[playerKey] = { pid: ps.pid, year: ps.year, years: [], plays: 0, yards: 0, tds: 0 }
        }

        if (!playerTotals[playerKey].years.includes(ps.year)) {
          playerTotals[playerKey].years.push(ps.year)
        }

        if (ps.rushing) {
          playerTotals[playerKey].plays += ps.rushing.car || 0
          playerTotals[playerKey].yards += ps.rushing.yds || 0
          playerTotals[playerKey].tds += ps.rushing.td || 0
        }
        if (ps.receiving) {
          playerTotals[playerKey].plays += ps.receiving.rec || 0
          playerTotals[playerKey].yards += ps.receiving.yds || 0
          playerTotals[playerKey].tds += ps.receiving.td || 0
        }
        if (ps.kickReturn) {
          playerTotals[playerKey].plays += ps.kickReturn.ret || 0
          playerTotals[playerKey].yards += ps.kickReturn.yds || 0
          playerTotals[playerKey].tds += ps.kickReturn.td || 0
        }
        if (ps.puntReturn) {
          playerTotals[playerKey].plays += ps.puntReturn.ret || 0
          playerTotals[playerKey].yards += ps.puntReturn.yds || 0
          playerTotals[playerKey].tds += ps.puntReturn.td || 0
        }
      })

      return Object.values(playerTotals).filter(p => p.plays > 0 || p.yards > 0)
    }

    // Approximate Value — span every category for each player-season,
    // run computeSeasonAV against the player's position for that year,
    // sum across seasons in career mode. This bypasses the
    // per-category aggregation above because AV is a cross-category
    // formula.
    const calcProductionStats = () => {
      const playerTotals = {}
      // Look up each player once so we can pass position into the AV
      // formula. Position can drift across years for the rare position
      // change; positionByYear takes precedence over the current
      // primary position.
      const playerById = {}
      ;(currentDynasty?.players || []).forEach(p => {
        playerById[p.pid] = p
      })

      allPlayerStats.forEach(ps => {
        const player = playerById[ps.pid]
        if (!player) return
        const positionForYear = player.positionByYear?.[ps.year]
          || player.positionByYear?.[String(ps.year)]
          || player.position

        // Re-build the year stats object in the shape computeSeasonAV
        // expects (which mirrors player.statsByYear[year]).
        const yearStats = {
          passing: ps.passing,
          rushing: ps.rushing,
          receiving: ps.receiving,
          // Note: the aggregator above renames `defense` → `defensive`
          // for category-key consistency. The AV utility expects the
          // canonical statsByYear shape (`defense`), so map back.
          defense: ps.defensive,
          // Blocking isn't aggregated above; pull from the original
          // player.statsByYear[year] for OL credit.
          blocking: player.statsByYear?.[ps.year]?.blocking
            || player.statsByYear?.[String(ps.year)]?.blocking
            || null,
          kicking: ps.kicking,
          punting: ps.punting,
          kickReturn: ps.kickReturn,
          puntReturn: ps.puntReturn,
        }

        const seasonAv = computeSeasonAV(yearStats, positionForYear)

        const playerKey = mode === 'career' ? ps.pid : `${ps.pid}-${ps.year}`
        if (!playerTotals[playerKey]) {
          playerTotals[playerKey] = {
            pid: ps.pid,
            year: ps.year,
            years: [],
            gamesPlayed: 0,
            av: 0,
          }
        }
        if (!playerTotals[playerKey].years.includes(ps.year)) {
          playerTotals[playerKey].years.push(ps.year)
        }
        playerTotals[playerKey].gamesPlayed += ps.gamesPlayed || 0

        if (mode === 'career') {
          playerTotals[playerKey].av += seasonAv
        } else {
          playerTotals[playerKey].av = seasonAv
        }
      })

      // Round to 1 decimal at the end so career sums don't accumulate
      // 0.1 + 0.1 + 0.1 = 0.30000000000000004 noise.
      Object.values(playerTotals).forEach(p => {
        p.av = Math.round(p.av * 10) / 10
      })

      // Console-trace top 25 with a per-stat breakdown so the user can
      // verify how the AV math lands. Logs once per memoization (not on
      // every render). Useful for tuning weights.
      try {
        const sorted = Object.values(playerTotals)
          .filter(p => p.av > 0)
          .sort((a, b) => b.av - a.av)
        const trace = sorted.slice(0, 25).map(p => {
          const player = playerById[p.pid]
          // Recompute the breakdown for this player's career or season —
          // mirror the same code path as the value above so the trace
          // matches the leaderboard exactly.
          const seasonsForTrace = mode === 'career'
            ? p.years
            : [p.year]
          let totalAv = 0
          const aggregateParts = {}
          let primaryPos = player?.position || ''
          seasonsForTrace.forEach(yr => {
            const positionForYear = player?.positionByYear?.[yr]
              || player?.positionByYear?.[String(yr)]
              || player?.position
            if (!primaryPos && positionForYear) primaryPos = positionForYear
            const ys = player?.statsByYear?.[yr] || player?.statsByYear?.[String(yr)]
            if (!ys) return
            const { total, parts } = computeSeasonAV(ys, positionForYear, { breakdown: true })
            totalAv += total
            Object.entries(parts).forEach(([k, v]) => {
              aggregateParts[k] = (aggregateParts[k] || 0) + v
            })
          })
          return {
            name: player?.name || `pid ${p.pid}`,
            pos: primaryPos,
            years: mode === 'career' ? `${Math.min(...p.years)}-${Math.max(...p.years)}` : String(p.year),
            games: p.gamesPlayed || 0,
            av: p.av,
            ...Object.fromEntries(Object.entries(aggregateParts).map(([k, v]) => [k, Math.round(v * 10) / 10])),
          }
        })
        const label = mode === 'career'
          ? '[AV] Career leaders — top 25 with per-role breakdown'
          : '[AV] Single-season leaders — top 25 with per-role breakdown'
        // eslint-disable-next-line no-console
        console.groupCollapsed(label)
        // eslint-disable-next-line no-console
        console.table(trace)
        // eslint-disable-next-line no-console
        console.groupEnd()
      } catch (e) {
        // Logging failure must never break the page render.
        // eslint-disable-next-line no-console
        console.warn('[AV] Could not log breakdown:', e?.message || e)
      }

      return Object.values(playerTotals).filter(p => p.av > 0)
    }

    const result = {}

    Object.entries(STAT_CATEGORIES).forEach(([catKey, category]) => {
      let baseStats =
        catKey === 'allPurpose' ? calcAllPurposeStats()
        : catKey === 'production' ? calcProductionStats()
        : aggregateStats(catKey)

      result[catKey] = {}

      category.stats.forEach(stat => {
        let leaderboard = baseStats.map(p => {
          let value

          if (stat.calculated) {
            switch (catKey) {
              case 'passing':
                const att = p.att || 0
                const cmp = p.cmp || 0
                const yds = p.yds || 0
                const tds = p.td || 0
                const ints = p.int || 0

                if (stat.key === 'compPct') value = att > 0 ? (cmp / att * 100) : 0
                else if (stat.key === 'ypa') value = att > 0 ? (yds / att) : 0
                else if (stat.key === 'rating') {
                  if (att > 0) {
                    const a = Math.max(0, Math.min(((cmp / att) - 0.3) * 20, 2.375))
                    const b = Math.max(0, Math.min(((yds / att) - 3) * 0.25, 2.375))
                    const c = Math.max(0, Math.min((tds / att) * 20, 2.375))
                    const d = Math.max(0, 2.375 - ((ints / att) * 25))
                    value = ((a + b + c + d) / 6) * 100
                  } else value = 0
                }

                if (stat.minAtt) {
                  const minReq = mode === 'career' ? stat.minAtt.career : stat.minAtt.season
                  if (att < minReq) value = null
                }
                break

              case 'rushing':
                const rushAtt = p.car || 0
                const rushYds = p.yds || 0
                if (stat.key === 'ypc') {
                  value = rushAtt > 0 ? (rushYds / rushAtt) : 0
                  if (stat.minAtt) {
                    const minReq = mode === 'career' ? stat.minAtt.career : stat.minAtt.season
                    if (rushAtt < minReq) value = null
                  }
                }
                break

              case 'receiving':
                const rec = p.rec || 0
                const recYds = p.yds || 0
                if (stat.key === 'ypr') {
                  value = rec > 0 ? (recYds / rec) : 0
                  if (stat.minAtt) {
                    const minReq = mode === 'career' ? stat.minAtt.career : stat.minAtt.season
                    if (rec < minReq) value = null
                  }
                }
                break

              case 'allPurpose':
                if (stat.key === 'plays') value = p.plays
                else if (stat.key === 'yards') value = p.yards
                else if (stat.key === 'tds') value = p.tds
                break

              case 'production':
                // calcProductionStats() pre-computed `av` per row.
                if (stat.key === 'av') value = p.av
                break

              case 'defensive':
                if (stat.key === 'totalTackles') {
                  value = (p.soloTkl || 0) + (p.astTkl || 0)
                }
                break

              case 'kicking':
                const fga = p.fga || 0
                const fgm = p.fgm || 0
                if (stat.key === 'fgPct') {
                  value = fga > 0 ? (fgm / fga * 100) : 0
                  if (stat.minAtt) {
                    const minReq = mode === 'career' ? stat.minAtt.career : stat.minAtt.season
                    if (fga < minReq) value = null
                  }
                }
                break

              case 'punting':
                const punts = p.punts || 0
                const puntYds = p.yds || 0
                if (stat.key === 'ypp') {
                  value = punts > 0 ? (puntYds / punts) : 0
                  if (stat.minAtt) {
                    const minReq = mode === 'career' ? stat.minAtt.career : stat.minAtt.season
                    if (punts < minReq) value = null
                  }
                }
                break

              case 'kickReturn':
              case 'puntReturn':
                const retAtt = p.ret || 0
                const retYds = p.yds || 0
                if (stat.key === 'avg') {
                  value = retAtt > 0 ? (retYds / retAtt) : 0
                  if (stat.minAtt) {
                    const minReq = mode === 'career' ? stat.minAtt.career : stat.minAtt.season
                    if (retAtt < minReq) value = null
                  }
                }
                break
            }
          } else {
            value = p[stat.field] || 0
          }

          const playerInfo = getPlayerInfo(p.pid)
          return {
            pid: p.pid,
            name: playerInfo.name,
            position: playerInfo.position,
            team: playerInfo.team,
            teamAbbr: playerInfo.teamAbbr,
            teamLogo: playerInfo.teamLogo,
            pictureUrl: playerInfo.pictureUrl,
            value,
            year: p.year,
            years: p.years?.sort((a, b) => a - b) || []
          }
        })

        const isRateStat = stat.format === 'pct' || stat.format === 'avg' || stat.format === 'rating'
        leaderboard = leaderboard
          .filter(p => {
            if (p.value === null || p.value === undefined) return false
            if (!isRateStat && p.value === 0) return false
            return true
          })
          .sort((a, b) => stat.lowerIsBetter ? a.value - b.value : b.value - a.value)
          // No cap. The card displays only the top 3 anyway; the modal
          // shows the full list (with search) so capping at 10 was
          // hiding entries from the modal — the user reported "only
          // loading 10 players".

        result[catKey][stat.key] = leaderboard
      })
    })

    return result
  }, [currentDynasty, mode])

  const handleCategoryChange = (catKey) => {
    setActiveCategory(catKey)
    localStorage.setItem('leaderboard-category', catKey)
    // Push the new category into the URL so the tab is bookmarkable
    // / shareable and the back button does the right thing.
    navigate(`${pathPrefix}/dynasty-records/${catKey}`)
  }

  const handleModeChange = (newMode) => {
    setMode(newMode)
    localStorage.setItem('leaderboard-mode', newMode)
  }

  const formatValue = (value, format) => {
    if (value === null || value === undefined) return '-'
    switch (format) {
      case 'pct': return value.toFixed(1) + '%'
      case 'avg': return value.toFixed(1)
      case 'rating': return value.toFixed(1)
      // AV displays at one decimal (e.g. "18.6"). Keeps the granular
      // distinction between a 17.8 season and a 18.6 season visible.
      case 'av': return value.toFixed(1)
      default: return value.toLocaleString()
    }
  }

  const formatYears = (years) => {
    if (!years || years.length === 0) return '-'
    if (years.length === 1) return years[0].toString()
    return `${years[0]}-${years[years.length - 1]}`
  }

  if (!currentDynasty) return null

  const category = STAT_CATEGORIES[activeCategory]
  const catLeaderboards = leaderboards[activeCategory] || {}
  const hasData = Object.values(catLeaderboards).some(lb => lb && lb.length > 0)

  const modeTabs = (
    <Tabs
      variant="pill"
      value={mode}
      onChange={handleModeChange}
      options={[
        { value: 'career', label: 'Career' },
        { value: 'season', label: 'Season' },
      ]}
    />
  )

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Records"
        title="Dynasty Records"
        meta={
          <span>{mode === 'career' ? 'All-time career leaders' : 'Single season records'}</span>
        }
        actions={modeTabs}
      />

      {/* Category Navigation — editorial tab strip, neutral underline on active */}
      <div className="overflow-x-auto -mx-4 px-4 scrollbar-hide">
        <div
          className="flex gap-6 min-w-max"
          style={{ borderBottom: '1px solid var(--surface-4)' }}
        >
          {CATEGORY_ORDER.map(catKey => {
            const cat = STAT_CATEGORIES[catKey]
            const isActive = activeCategory === catKey
            return (
              <button
                key={catKey}
                onClick={() => handleCategoryChange(catKey)}
                className={`relative py-3 whitespace-nowrap transition-colors text-[11px] font-bold uppercase ${
                  isActive ? 'text-txt-primary' : 'text-txt-tertiary hover:text-txt-secondary'
                }`}
                style={{ letterSpacing: '2px' }}
              >
                {cat.name}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 right-0 -bottom-px h-[2px]"
                    style={{ backgroundColor: 'var(--text-primary)' }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Category Header — editorial banner */}
      <div className="flex items-end justify-between gap-4 border-b pb-3" style={{ borderColor: 'var(--surface-4)' }}>
        <div>
          <div className="text-[10px] font-bold uppercase text-txt-tertiary" style={{ letterSpacing: '2.5px' }}>
            {mode === 'career' ? 'Career' : 'Single Season'}
          </div>
          <h2
            className="font-black leading-none mt-1"
            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(2rem, 4vw, 2.75rem)', letterSpacing: '1px' }}
          >
            {category.name} Leaders
          </h2>
        </div>
        {category.minNote && (
          <p className="text-[11px] text-txt-tertiary shrink-0 hidden sm:block" style={{ letterSpacing: '0.5px' }}>
            {category.minNote}
          </p>
        )}
      </div>

      {/* Stats Grid */}
      {!hasData ? (
        <Card>
          <EmptyState
            title={`No ${category.name.toLowerCase()} records yet`}
            message="Play some games to start tracking records."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 stagger-reveal">
          {category.stats.map(stat => {
            const statLeaderboard = catLeaderboards[stat.key] || []

            return (
              <div
                key={stat.key}
                className="media-card records-card overflow-hidden flex flex-col"
              >
                {/* Card header: stat abbr eyebrow + name. Click anywhere
                    in the header opens the full-leaderboard modal. */}
                <div
                  className="flex items-baseline justify-between px-5 pt-4 pb-3 cursor-pointer select-none"
                  style={{ borderBottom: '1px solid var(--surface-4)' }}
                  onClick={() => statLeaderboard.length > 0 && setModalStat(stat.key)}
                >
                  <div>
                    <div
                      className="text-[10px] font-bold uppercase text-txt-tertiary"
                      style={{ letterSpacing: '2px' }}
                    >
                      {stat.abbr}
                    </div>
                    <h3
                      className="font-black mt-0.5 leading-tight text-txt-primary"
                      style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.35rem', letterSpacing: '1px' }}
                    >
                      {stat.label}
                    </h3>
                  </div>
                </div>

                {/* Top 3 — podium treatment. No side stripes (impeccable
                    BAN 1). #1 gets a subtle full-row tint + larger
                    typography + gold rank numeral. #2 / #3 are smaller
                    rows with silver / bronze rank numerals. */}
                {statLeaderboard.length > 0 ? (
                  <div>
                    {statLeaderboard.slice(0, 3).map((entry, idx) => {
                      const rank = idx + 1
                      const isFirst = rank === 1
                      const rankColor = isFirst
                        ? 'var(--accent-warning)'
                        : rank === 2
                          ? 'rgba(192, 192, 192, 0.95)'
                          : 'rgba(205, 127, 50, 0.95)'

                      return (
                        <div
                          key={mode === 'career' ? entry.pid : `${entry.pid}-${entry.year}`}
                          className="relative flex items-center gap-3 transition-colors"
                          style={{
                            padding: isFirst ? '14px 16px' : '8px 16px',
                            borderTop: idx === 0 ? 'none' : '1px solid var(--surface-4)',
                            backgroundColor: isFirst
                              ? 'color-mix(in srgb, var(--accent-warning) 5%, transparent)'
                              : 'transparent'
                          }}
                        >
                          <div
                            className="text-right tabular flex-shrink-0"
                            style={{
                              fontFamily: "'Bebas Neue', sans-serif",
                              fontSize: isFirst ? '1.5rem' : '1rem',
                              letterSpacing: '0.5px',
                              lineHeight: 1,
                              width: isFirst ? '1.75rem' : '1.25rem',
                              color: rankColor,
                              fontWeight: isFirst ? 700 : 600,
                            }}
                          >
                            {rank}
                          </div>

                          {entry.pictureUrl ? (
                            <img
                              src={entry.pictureUrl}
                              alt=""
                              className={`${isFirst ? 'w-11 h-11' : 'w-8 h-8'} rounded-full object-cover flex-shrink-0 transition-all`}
                              style={{ border: '1px solid var(--surface-4)' }}
                            />
                          ) : entry.teamLogo ? (
                            <img
                              src={entry.teamLogo}
                              alt=""
                              className={`${isFirst ? 'w-10 h-10' : 'w-7 h-7'} object-contain flex-shrink-0`}
                            />
                          ) : (
                            <div className={`${isFirst ? 'w-11 h-11' : 'w-8 h-8'} rounded-full bg-surface-4 flex-shrink-0`} />
                          )}

                          <div className="flex-1 min-w-0">
                            <Link
                              to={`${pathPrefix}/player/${entry.pid}`}
                              onClick={(e) => e.stopPropagation()}
                              className={`${isFirst ? 'text-[15px]' : 'text-sm'} font-semibold text-txt-primary hover:underline truncate block`}
                            >
                              {entry.name}
                            </Link>
                            <p className="text-[11px] text-txt-tertiary truncate">
                              {entry.position && `${entry.position} · `}
                              {mode === 'career' ? formatYears(entry.years) : entry.year}
                            </p>
                          </div>

                          <div
                            className="tabular flex-shrink-0 text-right text-txt-primary"
                            style={{
                              fontFamily: "'Bebas Neue', sans-serif",
                              fontSize: isFirst ? '2.25rem' : rank === 2 ? '1.35rem' : '1.15rem',
                              fontWeight: isFirst ? 900 : 700,
                              letterSpacing: '0.5px',
                              lineHeight: 1,
                              opacity: isFirst ? 1 : rank === 2 ? 0.8 : 0.65
                            }}
                          >
                            {formatValue(entry.value, stat.format)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="px-5 py-5">
                    <p className="text-xs text-txt-tertiary">No qualifying players</p>
                  </div>
                )}

                {/* "View full leaderboard" — opens the modal that shows
                    all entries with breathing room. Footer-weight CTA;
                    not styled like a primary button. */}
                {statLeaderboard.length > 3 && (
                  <button
                    className="mt-auto w-full px-5 py-2.5 text-center text-[10px] font-bold uppercase text-txt-tertiary hover:text-txt-primary hover:bg-surface-3 transition-colors"
                    style={{
                      borderTop: '1px solid var(--surface-4)',
                      letterSpacing: '2.5px',
                    }}
                    onClick={() => setModalStat(stat.key)}
                  >
                    View All {statLeaderboard.length} ↗
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Full-leaderboard modal — opens when the user clicks a card
          header or "View All" button. Shows every ranked entry for that
          stat (1 through N) with consistent row treatment. The modal
          body is the only place where users can see ranks 11+ and is
          the single source of truth for "the entire list". */}
      {modalStat && (() => {
        const stat = category?.stats?.find(s => s.key === modalStat)
        if (!stat) return null
        const fullLeaderboard = catLeaderboards[modalStat] || []
        const modalSubtitle = mode === 'career' ? 'Career leaders' : 'Single-season leaders'

        // Tag every entry with its TRUE rank in the leaderboard before
        // filtering, so a search for "Crawford" still shows him as
        // #6 instead of #1 in the filtered view.
        const ranked = fullLeaderboard.map((entry, idx) => ({ entry, rank: idx + 1 }))
        const q = modalSearch.trim().toLowerCase()
        const filtered = q
          ? ranked.filter(({ entry }) =>
              (entry.name || '').toLowerCase().includes(q)
              || (entry.position || '').toLowerCase().includes(q)
              || (entry.teamAbbr || '').toLowerCase().includes(q)
            )
          : ranked

        const handleClose = () => {
          setModalStat(null)
          setModalSearch('')
          setExpandedRowKey(null)
        }

        // Production-tab analysis: expanding a row shows per-season
        // contributions and the per-role breakdown that fed the total.
        // Lets the user see *why* a player's AV is what it is — which
        // years contributed, and which roles within each year.
        const isAvStat = activeCategory === 'production' && modalStat === 'av'
        const playerById = isAvStat
          ? Object.fromEntries((currentDynasty?.players || []).map(p => [p.pid, p]))
          : {}
        const buildBreakdown = (entry) => {
          const player = playerById[entry.pid]
          if (!player) return null
          const seasons = mode === 'career'
            ? [...(entry.years || [])].sort((a, b) => a - b)
            : [entry.year]
          const rows = []
          let total = 0
          seasons.forEach(yr => {
            const ys = player.statsByYear?.[yr] || player.statsByYear?.[String(yr)]
            if (!ys) return
            const positionForYear = player.positionByYear?.[yr]
              || player.positionByYear?.[String(yr)]
              || player.position
            const { total: seasonAv, parts } = computeSeasonAV(
              ys,
              positionForYear,
              { breakdown: true }
            )
            total += seasonAv
            rows.push({ year: yr, position: positionForYear, av: seasonAv, parts })
          })
          return { rows, total: Math.round(total * 10) / 10 }
        }
        // Pretty labels for the role keys returned by computeSeasonAV.
        const roleLabel = (k) => ({
          qb: 'Passing role',
          rb: 'Rushing role',
          wrTe: 'Receiving role',
          ol: 'Blocking',
          dl: 'Defense (DL)',
          lb: 'Defense (LB)',
          db: 'Defense (DB)',
          k: 'Kicking',
          p: 'Punting',
          returns: 'Returns',
        })[k] || k

        // Top-3 rank colors — gold / silver / bronze. Subtle but
        // catches the eye on a long list.
        const rankColor = (rank) => {
          if (rank === 1) return 'var(--accent-warning)'              // gold
          if (rank === 2) return 'rgba(192, 192, 192, 0.95)'           // silver
          if (rank === 3) return 'rgba(205, 127, 50, 0.95)'            // bronze
          if (rank <= 10) return 'var(--text-primary)'
          return 'var(--text-tertiary)'
        }

        return (
          <Modal
            isOpen={!!modalStat}
            onClose={handleClose}
            title={`${stat.label} · ${modalSubtitle}`}
            size="lg"
          >
            {fullLeaderboard.length === 0 ? (
              <EmptyState
                title="No entries yet"
                message="Stats will appear here once games are saved."
              />
            ) : (
              <div className="-mx-6 -my-5">
                {/* Editorial top section — eyebrow + framing line +
                    note. Mirrors the records-card header treatment so
                    the modal feels like part of the same page rather
                    than a generic dialog. */}
                <div
                  className="px-6 pt-5 pb-4"
                  style={{
                    borderBottom: '1px solid var(--surface-4)',
                    background: 'linear-gradient(180deg, color-mix(in srgb, var(--surface-3) 35%, var(--surface-2)) 0%, var(--surface-2) 100%)',
                  }}
                >
                  <div className="flex items-baseline justify-between gap-4 flex-wrap">
                    <div>
                      <div
                        className="text-[10px] font-bold uppercase text-txt-tertiary"
                        style={{ letterSpacing: '2.5px' }}
                      >
                        {stat.abbr} · {mode === 'career' ? 'Career' : 'Single Season'}
                      </div>
                      <div
                        className="text-txt-primary mt-0.5 leading-tight"
                        style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.5rem', letterSpacing: '1px' }}
                      >
                        {stat.label}
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className="tabular text-txt-primary leading-none"
                        style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.5rem' }}
                      >
                        {fullLeaderboard.length}
                      </div>
                      <div
                        className="text-[10px] font-bold uppercase text-txt-tertiary mt-0.5"
                        style={{ letterSpacing: '2px' }}
                      >
                        {fullLeaderboard.length === 1 ? 'Player' : 'Players'}
                      </div>
                    </div>
                  </div>
                  {category?.minNote && (
                    <p
                      className="text-[12px] text-txt-secondary leading-snug mt-3 italic"
                      style={{ maxWidth: '60ch' }}
                    >
                      {category.minNote}
                    </p>
                  )}
                </div>

                {/* Search bar lives in its own band so it doesn't fight
                    the editorial header above. */}
                <div
                  className="px-6 py-3"
                  style={{
                    backgroundColor: 'var(--surface-1)',
                    borderBottom: '1px solid var(--surface-4)',
                  }}
                >
                  <div className="relative">
                    <input
                      type="text"
                      value={modalSearch}
                      onChange={(e) => setModalSearch(e.target.value)}
                      placeholder={`Search ${fullLeaderboard.length} ${fullLeaderboard.length === 1 ? 'player' : 'players'} by name, position, team…`}
                      className="w-full pl-9 pr-9 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-surface-5 transition-colors"
                      style={{
                        backgroundColor: 'var(--surface-2)',
                        border: '1px solid var(--surface-4)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <svg
                      className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-txt-tertiary pointer-events-none"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
                    </svg>
                    {modalSearch && (
                      <button
                        onClick={() => setModalSearch('')}
                        aria-label="Clear search"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-txt-tertiary hover:text-txt-primary transition-colors p-1"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* List body. Top-3 get the podium treatment matching
                    the records cards: #1 with a gradient bg + a 3px
                    accent rail on the left, #2/#3 with rank colors but
                    a flat row. */}
                {filtered.length === 0 ? (
                  <p className="text-sm text-txt-tertiary text-center py-10">
                    No players match "{modalSearch}".
                  </p>
                ) : (
                  <div>
                    {filtered.map(({ entry, rank }, displayIdx) => {
                      const isTop3 = rank <= 3
                      const isFirst = rank === 1
                      const rowKey = mode === 'career' ? entry.pid : `${entry.pid}-${entry.year}`
                      const isExpanded = isAvStat && expandedRowKey === rowKey
                      const breakdown = isExpanded ? buildBreakdown(entry) : null
                      return (
                        <div key={rowKey}>
                          <div
                            className="relative flex items-center gap-3 px-6 transition-colors"
                            style={{
                              padding: isFirst ? '14px 24px 14px 27px' : (isTop3 ? '10px 24px' : '8px 24px'),
                              borderTop: displayIdx > 0 ? '1px solid var(--surface-4)' : 'none',
                              background: isFirst
                                ? 'linear-gradient(90deg, rgba(234, 179, 8, 0.10) 0%, var(--surface-2) 70%)'
                                : 'transparent',
                            }}
                            onMouseEnter={(e) => { if (!isFirst) e.currentTarget.style.backgroundColor = 'var(--surface-3)' }}
                            onMouseLeave={(e) => { if (!isFirst) e.currentTarget.style.backgroundColor = 'transparent' }}
                          >
                            {/* #1 accent rail */}
                            {isFirst && (
                              <span
                                aria-hidden="true"
                                className="absolute left-0 top-0 bottom-0 w-[3px]"
                                style={{ backgroundColor: 'var(--accent-warning)' }}
                              />
                            )}

                            <div
                              className="text-right tabular flex-shrink-0"
                              style={{
                                fontFamily: "'Bebas Neue', sans-serif",
                                fontSize: isFirst ? '1.5rem' : isTop3 ? '1.2rem' : '0.95rem',
                                fontWeight: isFirst ? 900 : isTop3 ? 800 : 600,
                                letterSpacing: '0.5px',
                                lineHeight: 1,
                                width: isTop3 ? '2.25rem' : '2rem',
                                color: rankColor(rank),
                              }}
                            >
                              {rank}
                            </div>

                            {entry.pictureUrl ? (
                              <img
                                src={entry.pictureUrl}
                                alt=""
                                className={`${isFirst ? 'w-10 h-10' : 'w-8 h-8'} rounded-full object-cover flex-shrink-0`}
                                style={{
                                  border: isFirst
                                    ? '1.5px solid var(--accent-warning)'
                                    : '1px solid var(--surface-4)',
                                }}
                              />
                            ) : entry.teamLogo ? (
                              <img src={entry.teamLogo} alt="" className={`${isFirst ? 'w-9 h-9' : 'w-7 h-7'} object-contain flex-shrink-0`} />
                            ) : (
                              <div className={`${isFirst ? 'w-10 h-10' : 'w-8 h-8'} rounded-full bg-surface-4 flex-shrink-0`} />
                            )}

                            <div className="flex-1 min-w-0">
                              <Link
                                to={`${pathPrefix}/player/${entry.pid}`}
                                onClick={handleClose}
                                className={`${isFirst ? 'text-[15px]' : 'text-sm'} font-semibold text-txt-primary hover:underline truncate block`}
                              >
                                {entry.name}
                              </Link>
                              <p className="text-[11px] text-txt-tertiary truncate">
                                {entry.position && `${entry.position} · `}
                                {mode === 'career' ? formatYears(entry.years) : entry.year}
                              </p>
                            </div>

                            <div
                              className="tabular flex-shrink-0 text-right text-txt-primary"
                              style={{
                                fontFamily: "'Bebas Neue', sans-serif",
                                fontSize: isFirst ? '1.85rem' : isTop3 ? '1.35rem' : '1.05rem',
                                fontWeight: isFirst ? 900 : isTop3 ? 800 : 700,
                                letterSpacing: '0.5px',
                                lineHeight: 1,
                                opacity: isFirst ? 1 : isTop3 ? 0.92 : 0.82,
                              }}
                            >
                              {formatValue(entry.value, stat.format)}
                            </div>

                            {isAvStat && (
                              <button
                                type="button"
                                onClick={() => setExpandedRowKey(isExpanded ? null : rowKey)}
                                className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded transition-colors"
                                style={{
                                  color: isExpanded ? 'var(--text-primary)' : 'var(--text-tertiary)',
                                  backgroundColor: isExpanded ? 'var(--surface-3)' : 'transparent',
                                }}
                                onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.backgroundColor = 'var(--surface-3)' }}
                                onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.backgroundColor = 'transparent' }}
                                aria-expanded={isExpanded}
                                aria-label={isExpanded ? 'Hide breakdown' : 'Show breakdown'}
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  style={{
                                    transition: 'transform 150ms ease',
                                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                  }}
                                >
                                  <polyline points="6 9 12 15 18 9" />
                                </svg>
                              </button>
                            )}
                          </div>

                          {isExpanded && breakdown && (
                            <div
                              className="px-6 py-4"
                              style={{
                                backgroundColor: 'var(--surface-1)',
                                borderTop: '1px solid var(--surface-4)',
                                borderBottom: '1px solid var(--surface-4)',
                              }}
                            >
                              <div
                                className="text-[10px] uppercase font-bold text-txt-tertiary tabular mb-3"
                                style={{ letterSpacing: '2px' }}
                              >
                                {mode === 'career' ? 'Season-by-season build-up' : 'Role contributions'}
                              </div>

                              {breakdown.rows.length === 0 ? (
                                <p className="text-[12px] text-txt-tertiary">
                                  No per-season stats found for this player.
                                </p>
                              ) : (
                                <div className="space-y-3">
                                  {breakdown.rows.map(row => {
                                    const partsList = Object.entries(row.parts || {})
                                      .filter(([, v]) => v > 0)
                                      .sort(([, a], [, b]) => b - a)
                                    return (
                                      <div
                                        key={row.year}
                                        className="rounded px-3 py-2"
                                        style={{
                                          backgroundColor: 'var(--surface-2)',
                                          border: '1px solid var(--surface-4)',
                                        }}
                                      >
                                        <div className="flex items-baseline justify-between gap-3 mb-1.5">
                                          <div className="flex items-baseline gap-2 min-w-0">
                                            <span
                                              className="tabular"
                                              style={{
                                                fontFamily: "'Bebas Neue', sans-serif",
                                                fontSize: '1rem',
                                                fontWeight: 800,
                                                letterSpacing: '0.5px',
                                                color: 'var(--text-primary)',
                                              }}
                                            >
                                              {row.year}
                                            </span>
                                            <span className="text-[11px] text-txt-tertiary tabular" style={{ letterSpacing: '0.5px' }}>
                                              {row.position || '—'}
                                            </span>
                                          </div>
                                          <span
                                            className="tabular"
                                            style={{
                                              fontFamily: "'Bebas Neue', sans-serif",
                                              fontSize: '1rem',
                                              fontWeight: 800,
                                              letterSpacing: '0.5px',
                                              color: 'var(--text-primary)',
                                            }}
                                          >
                                            {row.av.toFixed(1)} AV
                                          </span>
                                        </div>
                                        {partsList.length > 0 ? (
                                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                                            {partsList.map(([k, v]) => (
                                              <span
                                                key={k}
                                                className="text-[11px] text-txt-secondary tabular"
                                              >
                                                {roleLabel(k)}{' '}
                                                <span className="text-txt-primary font-semibold">
                                                  {v.toFixed(1)}
                                                </span>
                                              </span>
                                            ))}
                                          </div>
                                        ) : (
                                          <span className="text-[11px] text-txt-tertiary">
                                            No qualifying stats this season.
                                          </span>
                                        )}
                                      </div>
                                    )
                                  })}
                                  {mode === 'career' && (
                                    <div
                                      className="flex items-baseline justify-between pt-2"
                                      style={{ borderTop: '1px dashed var(--surface-4)' }}
                                    >
                                      <span
                                        className="text-[10px] uppercase font-bold text-txt-tertiary tabular"
                                        style={{ letterSpacing: '2px' }}
                                      >
                                        Career total
                                      </span>
                                      <span
                                        className="tabular"
                                        style={{
                                          fontFamily: "'Bebas Neue', sans-serif",
                                          fontSize: '1.1rem',
                                          fontWeight: 900,
                                          letterSpacing: '0.5px',
                                          color: 'var(--text-primary)',
                                        }}
                                      >
                                        {breakdown.total.toFixed(1)} AV
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Filtered-results indicator */}
                {q && filtered.length > 0 && (
                  <div
                    className="px-6 py-2.5 text-[11px] text-txt-tertiary text-right tabular"
                    style={{
                      borderTop: '1px solid var(--surface-4)',
                      backgroundColor: 'var(--surface-1)',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Showing {filtered.length} of {fullLeaderboard.length}
                  </div>
                )}
              </div>
            )}
          </Modal>
        )
      })()}
    </div>
  )
}
