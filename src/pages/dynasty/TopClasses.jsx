import { useState, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useDynasty, getCustomConferencesForYear, getTeamRanking } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getTeamLogoByTid, getMascotName, stripMascotFromName } from '../../data/teams'
import { getTeamConference } from '../../data/conferenceTeams'
import { getAbbrFromTid } from '../../data/teamRegistry'
import { formatRecruitingClassScore } from '../../utils/recruitingScore'
import { PageHero, Card, EmptyState, TitleWithYear } from '../../components/ui'

const STAR_COLS = [
  { key: 'fiveStars', label: '5★' },
  { key: 'fourStars', label: '4★' },
  { key: 'threeStars', label: '3★' },
  { key: 'twoStars', label: '2★' },
  { key: 'oneStars', label: '1★' },
]

// The actual leaderboard — no page chrome (hero/year-selector), so it can be
// embedded inline (Recruiting.jsx's Commitments tab toggles this in place)
// as well as used as the standalone page below. Sourced from CFB27 sync —
// see cfb27SaveSync.js's mapTeamRecruitingClass / extractPlayers.cjs's
// buildLeagueRecruitingClasses. Rank comes straight from the save's own
// precomputed Team.TopClassRank (verified exact match to the in-game
// screen); the class score reuses calculateRecruitingClassScore
// (src/utils/recruitingScore.js), the SAME formula the app already uses
// for the user's own class — not a new one.
export function TopClassesBody({ dynasty, year, pathPrefix }) {
  const [scope, setScope] = useState('national')
  const teamsSource = dynasty?.teams || {}
  const customConferences = getCustomConferencesForYear(dynasty, year)

  const rows = useMemo(() => {
    const out = []
    for (const [tidStr, team] of Object.entries(teamsSource)) {
      const yearData = team?.byYear?.[year]
      const stats = yearData?.recruitingClassStats
      if (!stats) continue
      const tid = Number(tidStr)
      const mascotName = team?.name || getMascotName(tid, teamsSource)
      const abbr = team?.abbr || getAbbrFromTid(teamsSource, tid)
      const conference = abbr ? getTeamConference(abbr, customConferences) : null
      out.push({
        tid,
        name: stripMascotFromName(mascotName) || mascotName || abbr || `Team ${tid}`,
        logo: getTeamLogoByTid(tid, teamsSource),
        rank: yearData.recruitingClassRank ?? null,
        confRank: yearData.recruitingClassConferenceRank ?? null,
        // Current AP/media Top 25 rank — shown as a small prefix before the
        // team name, matching the in-game Top Classes screen (e.g. "22
        // Florida"). Not the recruiting-class rank (that's the leaderboard
        // position itself, already shown on the left).
        teamRank: getTeamRanking(dynasty, tid, year)?.rank ?? null,
        conference,
        stats,
      })
    }
    return out
  }, [dynasty, teamsSource, year, customConferences])

  const isUserTeam = (tid) => Number(dynasty?.currentTid) === Number(tid)

  const Row = ({ r, rank }) => (
    <Link
      to={`${pathPrefix}/team/${r.tid}/${year}?tab=recruiting`}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-2 transition-colors no-underline"
      style={isUserTeam(r.tid) ? { boxShadow: 'inset 0 0 0 1px var(--accent-warning)' } : undefined}
    >
      <span className="w-7 text-center font-display font-black tabular-nums text-txt-tertiary flex-shrink-0" style={{ fontSize: '1.1rem' }}>
        {rank}
      </span>
      <span className="w-8 h-8 rounded-full bg-white p-0.5 flex-shrink-0 flex items-center justify-center">
        {r.logo ? <img src={r.logo} alt="" className="w-full h-full object-contain" /> : null}
      </span>
      <span className="flex-1 min-w-0 flex items-baseline gap-1.5 truncate">
        {r.teamRank != null && (
          <span className="text-xs font-semibold text-txt-tertiary flex-shrink-0">{r.teamRank}</span>
        )}
        <span className="font-semibold text-sm text-txt-primary truncate">{r.name}</span>
      </span>
      <span className="w-10 text-center text-sm font-bold tabular-nums text-txt-secondary flex-shrink-0">{r.stats.total}</span>
      {STAR_COLS.map((c) => (
        <span key={c.key} className="w-9 text-center text-xs tabular-nums text-txt-tertiary flex-shrink-0 hidden sm:inline">
          {r.stats[c.key] || 0}
        </span>
      ))}
      <span className="w-16 text-right font-display font-black tabular-nums text-txt-primary flex-shrink-0" style={{ fontSize: '1.1rem' }}>
        {formatRecruitingClassScore(r.stats.score)}
      </span>
    </Link>
  )

  const HeaderRow = () => (
    <div className="flex items-center gap-3 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-txt-tertiary">
      <span className="w-7 text-center flex-shrink-0">Rank</span>
      <span className="w-8 flex-shrink-0" />
      <span className="flex-1">Team</span>
      <span className="w-10 text-center flex-shrink-0">Total</span>
      {STAR_COLS.map((c) => (
        <span key={c.key} className="w-9 text-center flex-shrink-0 hidden sm:inline">{c.label}</span>
      ))}
      <span className="w-16 text-right flex-shrink-0">Score</span>
    </div>
  )

  const hasData = rows.length > 0
  const tabs = (
    <div className="flex gap-1 mb-3">
      {[{ key: 'national', label: 'National' }, { key: 'conference', label: 'Conference' }].map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => setScope(t.key)}
          className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide transition-colors ${scope === t.key ? 'text-txt-primary' : 'text-txt-tertiary hover:text-txt-secondary'}`}
          style={scope === t.key ? { backgroundColor: 'var(--surface-3)' } : undefined}
        >
          {t.label}
        </button>
      ))}
    </div>
  )

  if (!hasData) {
    return (
      <div>
        {tabs}
        <Card>
          <EmptyState title="No Recruiting Classes Yet" message="Sync from your CFB27 save to populate the national recruiting-class leaderboard." />
        </Card>
      </div>
    )
  }

  if (scope === 'national') {
    const sorted = [...rows].sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
    return (
      <div>
        {tabs}
        <Card padding="sm">
          <HeaderRow />
          <div className="divide-y divide-surface-4">
            {sorted.map((r) => <Row key={r.tid} r={r} rank={r.rank ?? '—'} />)}
          </div>
        </Card>
      </div>
    )
  }

  const byConf = new Map()
  for (const r of rows) {
    const key = r.conference || 'Independent'
    if (!byConf.has(key)) byConf.set(key, [])
    byConf.get(key).push(r)
  }
  const confNames = [...byConf.keys()].sort()
  return (
    <div>
      {tabs}
      <div className="space-y-4">
        {confNames.map((conf) => {
          const list = [...byConf.get(conf)].sort((a, b) => (a.confRank ?? 9999) - (b.confRank ?? 9999))
          return (
            <Card key={conf} padding="sm">
              <div className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-txt-secondary">{conf}</div>
              <HeaderRow />
              <div className="divide-y divide-surface-4">
                {/* Sorted by conference rank (top-to-bottom within this
                    conference), but the displayed number is each team's real
                    NATIONAL rank, not a re-numbered 1..N per conference —
                    matches the in-game screen, which never shows a
                    conference-local rank number. */}
                {list.map((r) => <Row key={r.tid} r={r} rank={r.rank ?? '—'} />)}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// Standalone page — kept for direct links / anyone with the old URL bookmarked.
export default function TopClasses() {
  const { year: urlYear } = useParams()
  const navigate = useNavigate()
  const { currentDynasty } = useDynasty()
  const pathPrefix = usePathPrefix()

  if (!currentDynasty) return null

  const startYear = currentDynasty.startYear || currentDynasty.currentYear
  const availableYears = []
  for (let y = currentDynasty.currentYear; y >= startYear; y--) availableYears.push(y)
  const displayYear = urlYear ? parseInt(urlYear, 10) : currentDynasty.currentYear
  const handleYearChange = (y) => navigate(`${pathPrefix}/topclasses/${y}`)

  return (
    <div className="space-y-6">
      <PageHero
        title={<TitleWithYear year={displayYear} years={availableYears} onChange={handleYearChange} label="Top Classes" />}
      />
      <TopClassesBody dynasty={currentDynasty} year={displayYear} pathPrefix={pathPrefix} />
    </div>
  )
}
