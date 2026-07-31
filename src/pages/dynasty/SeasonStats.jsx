import { useState, useMemo, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useDynasty, recalculateStatsFromBoxScores } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getTeamLogoByTid } from '../../data/teams'
import { getAbbrFromTid } from '../../data/teamRegistry'
import { getPlayerTid } from '../../data/rosterModel'
import { groupForPosition } from '../../data/positionGroups'
import { PageHero, Card, EmptyState, Select, Input } from '../../components/ui'
import SortableStatsTable from '../../components/SortableStatsTable'

// Every position group gets its own tab, backed by whichever
// statsByYear category actually carries that group's production —
// mirrors the exact grouping Depth Chart / Team Future already use
// (src/data/positionGroups.js), so a player never lands on a
// different tab here than they would there.
const POSITION_TABS = [
  { key: 'QB', label: 'QB', category: 'passing' },
  { key: 'RB', label: 'HB', category: 'rushing' },
  { key: 'WR', label: 'WR', category: 'receiving' },
  { key: 'TE', label: 'TE', category: 'receiving' },
  { key: 'OL', label: 'OL', category: 'blocking' },
  { key: 'DL', label: 'DL', category: 'defense' },
  { key: 'LB', label: 'LB', category: 'defense' },
  { key: 'DB', label: 'DB', category: 'defense' },
  { key: 'K', label: 'K', category: 'kicking' },
  { key: 'P', label: 'P', category: 'punting' },
]
const TAB_BY_KEY = Object.fromEntries(POSITION_TABS.map((t) => [t.key, t]))

// Default sort per tab — every tab defaults to its headline counting stat.
const DEFAULT_SORT = {
  QB: 'yds', RB: 'yds', WR: 'yds', TE: 'yds', OL: 'pancakes',
  DL: 'sacks', LB: 'totalTkl', DB: 'int', K: 'fgm', P: 'yds',
}

// "Does this player actually have production in this category" — copied
// verbatim from TeamYear.jsx's own playerStats useMemo filters, so a
// player shows up here exactly when they'd also show up on their own
// team's Stats tab (no zero-stat stub rows).
const HAS_STATS = {
  passing: (s) => num(s.att || s.cmp) > 0,
  rushing: (s) => num(s.car) > 0,
  receiving: (s) => num(s.rec) > 0,
  blocking: (s) => num(s.pancakes) > 0 || num(s.sacksAllowed) > 0,
  defense: (s) => num(s.soloTkl || s.astTkl || s.sacks || s.int) > 0,
  kicking: (s) => num(s.fga || s.xpa) > 0,
  punting: (s) => num(s.punts) > 0,
}

function num(v) {
  return Number(v) || 0
}
function rate(n, d) {
  return d > 0 ? n / d : 0
}
function pct(n, d) {
  return d > 0 ? (n / d) * 100 : 0
}
// Standard NCAA passer-efficiency formula — same one DynastyRecords.jsx
// uses for its Passing leaderboard's Passer Rating column. There is no
// ESPN-style QBR tracked anywhere in this app.
function passerRating(cmp, att, yds, td, int) {
  if (att <= 0) return 0
  const a = Math.max(0, Math.min(((cmp / att) - 0.3) * 20, 2.375))
  const b = Math.max(0, Math.min(((yds / att) - 3) * 0.25, 2.375))
  const c = Math.max(0, Math.min((td / att) * 20, 2.375))
  const d = Math.max(0, 2.375 - ((int / att) * 25))
  return ((a + b + c + d) / 6) * 100
}

// Raw statsByYear[year][category] -> flat numeric row, field names
// verified against DynastyRecords.jsx's STAT_CATEGORIES + the sheet's
// INTERNAL_TO_BOXSCORE map (DetailedStatsEntryModal.jsx) so this reads
// the exact same keys the rest of the app already writes/reads.
function buildStatRow(category, s) {
  switch (category) {
    case 'passing': {
      const cmp = num(s.cmp), att = num(s.att), yds = num(s.yds), td = num(s.td), int = num(s.int)
      return {
        cmp, att, yds, td, int,
        sacks: num(s.sacks), lng: num(s.lng),
        cmpPct: pct(cmp, att), ypa: rate(yds, att),
        rating: passerRating(cmp, att, yds, td, int),
      }
    }
    case 'rushing': {
      const car = num(s.car), yds = num(s.yds)
      return { car, yds, td: num(s.td), lng: num(s.lng), fum: num(s.fum), bt: num(s.bt), yac: num(s.yac), ypc: rate(yds, car) }
    }
    case 'receiving': {
      const rec = num(s.rec), yds = num(s.yds)
      return { rec, yds, td: num(s.td), lng: num(s.lng), rac: num(s.rac), drops: num(s.drops), ypr: rate(yds, rec) }
    }
    case 'blocking':
      return { pancakes: num(s.pancakes), sacksAllowed: num(s.sacksAllowed) }
    case 'defense': {
      const solo = num(s.soloTkl), ast = num(s.astTkl)
      return { solo, ast, totalTkl: solo + ast, tfl: num(s.tfl), sacks: num(s.sacks), int: num(s.int), pd: num(s.pd), ff: num(s.ff), fr: num(s.fr) }
    }
    case 'kicking': {
      const fgm = num(s.fgm), fga = num(s.fga)
      return { fgm, fga, fgPct: pct(fgm, fga), lng: num(s.lng), xpm: num(s.xpm), xpa: num(s.xpa) }
    }
    case 'punting': {
      const punts = num(s.punts), yds = num(s.yds)
      return { punts, yds, ypp: rate(yds, punts), netYds: num(s.netYds), lng: num(s.lng), in20: num(s.in20), tb: num(s.tb) }
    }
    default:
      return {}
  }
}

const fmt1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '0.0')
const fmtPct = (v) => (Number.isFinite(v) ? `${v.toFixed(1)}%` : '0.0%')

function statColumn(key, label, { format } = {}) {
  return {
    key,
    label,
    align: 'center',
    tabular: true,
    sortValue: (r) => r[key] ?? 0,
    render: (r) => {
      const v = r[key] ?? 0
      if (format === 'pct') return fmtPct(v)
      if (format === 'avg') return fmt1(v)
      return Math.round(v).toLocaleString()
    },
  }
}

const CATEGORY_COLUMNS = {
  passing: [
    statColumn('cmp', 'CMP'), statColumn('att', 'ATT'), statColumn('cmpPct', 'CMP%', { format: 'pct' }),
    statColumn('yds', 'YDS'), statColumn('ypa', 'Y/A', { format: 'avg' }), statColumn('td', 'TD'),
    statColumn('int', 'INT'), statColumn('sacks', 'SCK'), statColumn('lng', 'LNG'), statColumn('rating', 'RTG', { format: 'avg' }),
  ],
  rushing: [
    statColumn('car', 'CAR'), statColumn('yds', 'YDS'), statColumn('ypc', 'Y/C', { format: 'avg' }),
    statColumn('td', 'TD'), statColumn('lng', 'LNG'), statColumn('fum', 'FUM'), statColumn('bt', 'BT'), statColumn('yac', 'YAC'),
  ],
  receiving: [
    statColumn('rec', 'REC'), statColumn('yds', 'YDS'), statColumn('ypr', 'Y/R', { format: 'avg' }),
    statColumn('td', 'TD'), statColumn('lng', 'LNG'), statColumn('rac', 'RAC'), statColumn('drops', 'DROP'),
  ],
  blocking: [
    statColumn('pancakes', 'PANCAKES'), statColumn('sacksAllowed', 'SACKS ALLOWED'),
  ],
  defense: [
    statColumn('solo', 'SOLO'), statColumn('ast', 'AST'), statColumn('totalTkl', 'TOT'),
    statColumn('tfl', 'TFL'), statColumn('sacks', 'SCK'), statColumn('int', 'INT'),
    statColumn('pd', 'PD'), statColumn('ff', 'FF'), statColumn('fr', 'FR'),
  ],
  kicking: [
    statColumn('fgm', 'FGM'), statColumn('fga', 'FGA'), statColumn('fgPct', 'FG%', { format: 'pct' }),
    statColumn('lng', 'LNG'), statColumn('xpm', 'XPM'), statColumn('xpa', 'XPA'),
  ],
  punting: [
    statColumn('punts', 'P'), statColumn('yds', 'YDS'), statColumn('ypp', 'Y/P', { format: 'avg' }),
    statColumn('netYds', 'NET'), statColumn('lng', 'LNG'), statColumn('in20', 'IN20'), statColumn('tb', 'TB'),
  ],
}

// Neutral table accent — matches TeamYear.jsx's own Stats-tab tables
// exactly (SortableStatsTable interpolates this into border-alpha hex
// strings, so it must stay a literal hex value, not a CSS var()).
const ACCENT = '#f5f5f7'
const ACCENT_MUTED = '#a8a8b0'

export default function SeasonStats() {
  const { position: positionParam } = useParams()
  const { currentDynasty } = useDynasty()
  const pathPrefix = usePathPrefix()
  const navigate = useNavigate()

  const resolveTab = (param) => {
    const key = (param || '').toUpperCase()
    if (TAB_BY_KEY[key]) return key
    const stored = localStorage.getItem('season-stats-position')
    if (stored && TAB_BY_KEY[stored]) return stored
    return 'QB'
  }

  const [activeTab, setActiveTab] = useState(() => resolveTab(positionParam))
  const [search, setSearch] = useState('')

  useEffect(() => {
    const next = resolveTab(positionParam)
    if (next !== activeTab) setActiveTab(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionParam])

  const availableYears = useMemo(() => {
    // Derived from games, not player.statsByYear keys — a year whose
    // statsByYear recompute has never run (see below) would otherwise be
    // invisible here even though real box scores exist for it.
    const years = new Set()
    for (const g of currentDynasty?.games || []) {
      const n = parseInt(g.year)
      if (Number.isFinite(n)) years.add(n)
    }
    return Array.from(years).sort((a, b) => b - a)
  }, [currentDynasty?.games])

  const [yearChoice, setYearChoice] = useState(null)
  const effectiveYear = yearChoice ?? (
    currentDynasty?.currentYear != null && availableYears.includes(Number(currentDynasty.currentYear))
      ? Number(currentDynasty.currentYear)
      : (availableYears[0] ?? currentDynasty?.currentYear ?? null)
  )

  const teamsSource = currentDynasty?.teams || currentDynasty?.customTeams

  // player.statsByYear is only recomputed from game.boxScore on a few
  // narrow triggers (revert week, a manual Danger Zone "Sync Stats") — it
  // is NOT refreshed automatically after every CFB27 "Sync from Save", so
  // trusting it directly can show a stale partial-season total (e.g. an
  // OL pancake count frozen from whenever it last ran). Recomputing it
  // live from the actual box scores here — the same pure aggregator the
  // app's own recovery paths use — guarantees this page always matches
  // the real, current game-by-game data instead of a cached snapshot.
  const freshPlayers = useMemo(() => {
    if (!currentDynasty?.players || effectiveYear == null) return currentDynasty?.players || []
    return recalculateStatsFromBoxScores(currentDynasty.players, currentDynasty.games || [], effectiveYear)
  }, [currentDynasty?.players, currentDynasty?.games, effectiveYear])

  const rows = useMemo(() => {
    if (!freshPlayers.length || effectiveYear == null) return []
    const tab = TAB_BY_KEY[activeTab]
    const hasStats = HAS_STATS[tab.category]
    const out = []
    for (const player of freshPlayers) {
      if (player.isHonorOnly) continue
      const yearStats = player.statsByYear?.[effectiveYear] ?? player.statsByYear?.[String(effectiveYear)]
      if (!yearStats) continue
      const catStats = yearStats[tab.category]
      if (!catStats || !hasStats(catStats)) continue

      const position = player.positionByYear?.[effectiveYear]
        ?? player.positionByYear?.[String(effectiveYear)]
        ?? player.position
      if (groupForPosition(position) !== tab.key) continue

      const rawTid = getPlayerTid(player, effectiveYear, { currentYear: currentDynasty.currentYear })
      const tid = rawTid != null && rawTid !== '' && Number.isFinite(Number(rawTid)) ? Number(rawTid) : null
      const teamAbbr = tid != null ? getAbbrFromTid(teamsSource, tid) : null
      const teamLogo = tid != null ? getTeamLogoByTid(tid, teamsSource) : null

      out.push({
        pid: player.pid,
        name: player.name,
        position,
        tid,
        teamAbbr,
        teamLogo,
        ...buildStatRow(tab.category, catStats),
      })
    }
    return out
  }, [freshPlayers, currentDynasty?.currentYear, teamsSource, activeTab, effectiveYear])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      (r.name || '').toLowerCase().includes(q) || (r.teamAbbr || '').toLowerCase().includes(q)
    )
  }, [rows, search])

  const handleTabChange = (key) => {
    setActiveTab(key)
    setSearch('')
    localStorage.setItem('season-stats-position', key)
    navigate(`${pathPrefix}/season-stats/${key.toLowerCase()}`)
  }

  if (!currentDynasty) return null

  const tab = TAB_BY_KEY[activeTab]
  const columns = [
    {
      key: 'player',
      label: 'Player',
      align: 'left',
      sortValue: (r) => r.name || '',
      render: (r) => (
        <Link
          to={`${pathPrefix}/player/${r.pid}`}
          className="flex items-center gap-2 font-medium hover:underline"
          style={{ color: ACCENT }}
        >
          {r.teamLogo && <img src={r.teamLogo} alt="" className="w-5 h-5 object-contain flex-shrink-0" />}
          <span>{r.name}</span>
        </Link>
      ),
    },
    {
      key: 'pos',
      label: 'Pos',
      align: 'center',
      sortValue: (r) => r.position || '',
      render: (r) => r.position || '-',
    },
    {
      key: 'team',
      label: 'Team',
      align: 'left',
      sortValue: (r) => r.teamAbbr || '',
      render: (r) => (r.tid != null
        ? <Link to={`${pathPrefix}/team/${r.tid}/${effectiveYear}`} className="hover:underline" style={{ color: ACCENT_MUTED }}>{r.teamAbbr || '-'}</Link>
        : '-'),
    },
    ...CATEGORY_COLUMNS[tab.category],
  ]

  const heroTabs = POSITION_TABS.map((t) => ({ key: t.key, label: t.label }))

  return (
    <div className="space-y-6 page-enter">
      <PageHero
        title="Season Stats"
        actions={
          <div className="flex items-center gap-2">
            {availableYears.length > 0 && (
              <Select
                size="sm"
                value={String(effectiveYear ?? '')}
                onChange={(e) => setYearChoice(Number(e.target.value))}
                aria-label="Season"
              >
                {availableYears.map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </Select>
            )}
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search players…"
              className="sm:w-56"
            />
          </div>
        }
        tabs={heroTabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

      {filteredRows.length === 0 ? (
        <Card>
          <EmptyState
            title={`No ${tab.label} stats yet${effectiveYear != null ? ` for ${effectiveYear}` : ''}`}
            message="Play some games to start tracking stats."
          />
        </Card>
      ) : (
        <SortableStatsTable
          title={`${tab.label}${effectiveYear != null ? ` — ${effectiveYear}` : ''}`}
          rows={filteredRows}
          columns={columns}
          defaultSortKey={DEFAULT_SORT[tab.key]}
          defaultSortDir="desc"
          accentColor={ACCENT}
          accentColorMuted={ACCENT_MUTED}
          highlightRow={currentDynasty.currentTid != null ? (r) => r.tid === Number(currentDynasty.currentTid) : undefined}
        />
      )}
    </div>
  )
}
