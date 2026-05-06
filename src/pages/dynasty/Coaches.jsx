/**
 * Coaches — leaderboard of every member's lifetime career in this
 * dynasty. Reads exclusively from memberTeamHistory[uid] + games[],
 * so it stays in sync with the timeline editor and Coach Career page.
 *
 * Click a row to open that coach's full Career page.
 */

import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { PageHero, Card, EmptyState, TeamLogo, Badge } from '../../components/ui'
import { getRole, ROLE_COMMISH, ROLE_COCOMMISH } from '../../data/leagueModel'
import { getAllCoachSummaries, getCoachStints } from '../../data/coachStats'

const SORT_OPTIONS = [
  { key: 'wins',     label: 'Wins' },
  { key: 'winPct',   label: 'Win %' },
  { key: 'national', label: 'NCs' },
  { key: 'conf',     label: 'Conf' },
  { key: 'bowl',     label: 'Bowls' },
  { key: 'years',    label: 'Years' },
  { key: 'name',     label: 'Name' },
]

const ROLE_BADGE_VARIANT = {
  [ROLE_COMMISH]: 'warning',
  [ROLE_COCOMMISH]: 'primary',
}
const ROLE_LABEL = {
  [ROLE_COMMISH]: 'Commish',
  [ROLE_COCOMMISH]: 'Co-Commish',
}

export default function Coaches() {
  const { currentDynasty } = useDynasty()
  const { user } = useAuth()
  const pathPrefix = usePathPrefix()
  const navigate = useNavigate()
  const [sortBy, setSortBy] = useState('wins')

  if (!currentDynasty) return null

  const teamsSource = currentDynasty.teams || {}
  const summaries = useMemo(
    () => getAllCoachSummaries(currentDynasty, sortBy),
    [currentDynasty, sortBy],
  )

  const formatPct = (pct) => {
    if (pct == null || Number.isNaN(pct)) return '—'
    return (pct * 100).toFixed(1) + '%'
  }

  const formatRange = (start, end) => {
    if (start == null) return '—'
    if (start === end) return String(start)
    return `${start}–${end}`
  }

  return (
    <div className="space-y-4 page-enter">
      <PageHero
        eyebrow="Members"
        title="Coaches"
        meta={
          <>
            <span className="tabular">{summaries.length}</span>
            <span className="text-txt-tertiary"> coach{summaries.length === 1 ? '' : 'es'}</span>
          </>
        }
      />

      {summaries.length === 0 ? (
        <Card>
          <EmptyState
            title="No coaches yet"
            message="Add members to this dynasty from the Members page to see their careers here."
          />
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          {/* Sort tabs */}
          <div
            className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto"
            style={{ borderBottom: '1px solid var(--surface-4)' }}
          >
            <span
              className="label-xs text-txt-tertiary px-2 flex-shrink-0"
              style={{ letterSpacing: '1.5px', fontSize: '10px' }}
            >
              SORT BY
            </span>
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSortBy(opt.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors flex-shrink-0 ${
                  sortBy === opt.key
                    ? 'bg-surface-3 text-txt-primary'
                    : 'text-txt-tertiary hover:text-txt-primary hover:bg-surface-3/50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Column headers */}
          <div
            className="hidden sm:grid items-center gap-3 px-3 py-2"
            style={{
              borderBottom: '1px solid var(--surface-4)',
              backgroundColor: 'var(--surface-1)',
              gridTemplateColumns: '32px 36px 1fr 80px 60px 50px 50px 60px',
            }}
          >
            <span />
            <span />
            <span className="label-xs text-txt-tertiary" style={{ letterSpacing: '1.5px', fontSize: '9px' }}>COACH</span>
            <span className="label-xs text-txt-tertiary text-right" style={{ letterSpacing: '1.5px', fontSize: '9px' }}>RECORD</span>
            <span className="label-xs text-txt-tertiary text-right" style={{ letterSpacing: '1.5px', fontSize: '9px' }}>WIN %</span>
            <span className="label-xs text-txt-tertiary text-right" style={{ letterSpacing: '1.5px', fontSize: '9px' }}>NC</span>
            <span className="label-xs text-txt-tertiary text-right" style={{ letterSpacing: '1.5px', fontSize: '9px' }}>CONF</span>
            <span className="label-xs text-txt-tertiary text-right" style={{ letterSpacing: '1.5px', fontSize: '9px' }}>BOWLS</span>
          </div>

          {summaries.map((s, idx) => {
            const role = getRole(currentDynasty, s.uid)
            const isYou = user?.uid === s.uid
            const team = s.primaryTeamTid != null ? teamsSource[s.primaryTeamTid] : null
            const teamName = team?.name || (s.primaryTeamTid != null ? `Team ${s.primaryTeamTid}` : '—')
            const careerLink = `${pathPrefix}/coach-career?uid=${encodeURIComponent(s.uid)}`

            // Stint summary — abbreviated team list with year ranges.
            // "Wisconsin (2025-2027) · Kentucky (2028-NOW)" — gives the
            // career arc at a glance without opening Coach Career.
            const stints = getCoachStints(currentDynasty, s.uid)
            const stintLabel = (() => {
              if (stints.length <= 1) return null
              const parts = stints.slice(-3).map(st => {
                const t = teamsSource[st.tid]
                const abbr = t?.abbr || `T${st.tid}`
                const range = st.startYear === st.endYear
                  ? String(st.startYear)
                  : st.endYear >= currentDynasty.currentYear
                    ? `${st.startYear}-NOW`
                    : `${st.startYear}-${st.endYear}`
                return `${abbr} (${range})`
              })
              const prefix = stints.length > 3 ? `+${stints.length - 3} earlier · ` : ''
              return prefix + parts.join(' · ')
            })()

            return (
              <Link
                key={s.uid}
                to={careerLink}
                className="coach-row group block px-3 py-3 transition-colors hover:bg-surface-3 no-underline"
                style={{ borderTop: idx > 0 ? '1px solid var(--surface-4)' : 'none' }}
              >
                <div
                  className="grid items-center gap-3"
                  style={{ gridTemplateColumns: '32px 36px 1fr 80px 60px 50px 50px 60px' }}
                >
                  {/* Rank */}
                  <span
                    className="font-display font-black tabular text-txt-tertiary text-center leading-none"
                    style={{ fontSize: '15px' }}
                  >
                    {idx + 1}
                  </span>

                  {/* Primary team logo */}
                  <div className="flex-shrink-0">
                    {s.primaryTeamTid != null ? (
                      <TeamLogo tid={s.primaryTeamTid} teams={teamsSource} size="sm" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-surface-3" />
                    )}
                  </div>

                  {/* Name + sub-info */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-txt-primary truncate">
                        {s.name || 'Coach'}
                      </span>
                      {role && ROLE_BADGE_VARIANT[role] && (
                        <Badge variant={ROLE_BADGE_VARIANT[role]}>{ROLE_LABEL[role]}</Badge>
                      )}
                      {isYou && <span className="text-[10px] text-txt-tertiary">(you)</span>}
                    </div>
                    <div className="text-[11px] text-txt-tertiary truncate mt-0.5">
                      {teamName} · {formatRange(s.startYear, s.endYear)}{s.yearsActive > 1 ? ` (${s.yearsActive} yrs)` : ''}
                    </div>
                    {stintLabel && (
                      <div className="text-[10px] text-txt-muted truncate mt-0.5 tabular-nums">
                        {stintLabel}
                      </div>
                    )}
                  </div>

                  {/* Record */}
                  <span className="text-right tabular font-display font-black text-sm text-txt-primary">
                    {s.wins}<span className="text-txt-tertiary font-normal">–</span>{s.losses}
                  </span>
                  <span className="text-right tabular text-xs text-txt-secondary">
                    {formatPct(s.winPct)}
                  </span>
                  <span className="text-right tabular text-sm text-txt-primary font-semibold">
                    {s.nationalTitles || <span className="text-txt-muted">—</span>}
                  </span>
                  <span className="text-right tabular text-sm text-txt-primary font-semibold">
                    {s.confTitles || <span className="text-txt-muted">—</span>}
                  </span>
                  <span className="text-right tabular text-xs text-txt-secondary">
                    {s.bowlWins}<span className="text-txt-tertiary">–</span>{s.bowlLosses}
                  </span>
                </div>

                {/* Mobile sub-row: stats stacked since columns are hidden */}
                <div
                  className="sm:hidden mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-txt-tertiary tabular"
                  style={{ paddingLeft: '76px' }}
                >
                  <span>{s.wins}–{s.losses} · {formatPct(s.winPct)}</span>
                  {s.nationalTitles > 0 && <span>{s.nationalTitles} NC</span>}
                  {s.confTitles > 0 && <span>{s.confTitles} Conf</span>}
                  <span>{s.bowlWins}–{s.bowlLosses} bowls</span>
                </div>
              </Link>
            )
          })}
        </Card>
      )}

      <p className="text-xs text-txt-tertiary px-1">
        Records are derived live from games played by each coach's tracked teams. Edit who coached
        which team-year on the <Link to={`${pathPrefix}/league`} className="underline hover:text-txt-primary">Members page</Link>.
      </p>
    </div>
  )
}
