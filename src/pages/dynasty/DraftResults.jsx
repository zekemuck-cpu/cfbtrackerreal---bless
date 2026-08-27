import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getUserTeamTid, getAbbrFromTid } from '../../data/teamRegistry'
import { getTeamLogoByTid, getMascotName } from '../../data/teams'
import { getNflTeamName, getNflTeamLogo, NFL_TEAM_NAMES } from '../../data/nflTeams'
import { PageHero, Card, EmptyState, TitleWithYear, Badge, Select, Button, Input } from '../../components/ui'

const ROUNDS = [1, 2, 3, 4, 5, 6, 7]

const NFL_TEAM_OPTIONS = Object.entries(NFL_TEAM_NAMES)
  .map(([abbr, name]) => ({ abbr, name }))
  .sort((a, b) => a.name.localeCompare(b.name))

// Real draft-pick order (overallPick), not overall rating — a mock draft
// board is read in the order players actually came off the board. A
// player with no overallPick yet (a leaver added after their year's mock
// picks were already frozen — see mergeSimulatedDraftPicks) sorts after
// every player who has one, falling back to round then overall among
// themselves.
function comparePickOrder(a, b) {
  if (a.overallPick != null && b.overallPick != null) return a.overallPick - b.overallPick
  if (a.overallPick != null) return -1
  if (b.overallPick != null) return 1
  return a.round - b.round || (b.overall || 0) - (a.overall || 0)
}

// One row's layout, shared by team view, Full Draft Results, and player
// search. The college logo alone identifies the school — no name text
// needed alongside it.
function DraftRow({ r, teams }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
      <img src={getTeamLogoByTid(r.tid, teams)} alt="" className="w-6 h-6 flex-shrink-0 object-contain" />
      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-txt-primary">{r.playerName || 'Unknown'}</span>
        <span className="text-xs text-txt-tertiary uppercase">{r.position}</span>
        <span className="text-xs text-txt-tertiary">{r.classYear}</span>
        <span className="text-sm font-bold text-txt-primary tabular-nums">{r.overall ?? '--'}</span>
      </div>
      <Badge variant="outline">{r.draftRound}</Badge>
      {r.team && (
        <div className="flex items-center gap-2 pl-3 ml-1 border-l" style={{ borderColor: 'var(--surface-4)' }}>
          <img src={getNflTeamLogo(r.team)} alt="" className="w-5 h-5 flex-shrink-0 object-contain" />
          <span className="text-xs text-txt-tertiary whitespace-nowrap">
            {getNflTeamName(r.team)}{r.overallPick ? ` — Pick ${r.overallPick}` : ''}
          </span>
        </div>
      )}
    </div>
  )
}

// PC-only page — this dynasty's own team's results, any other team's, or
// the whole league grouped round by round. Every entry comes straight from
// dynasty.leagueDraftResultsByYear, written by the CFB27 sync (see
// cfb27SaveSync.js's leagueDraftResultsUpdate) from the save's own
// LeavingPlayer projections — verified against a real save's Draft Results
// screen (exact round-for-round match for a real 9-player draft class).
export default function DraftResults() {
  const { year: urlYear } = useParams()
  const navigate = useNavigate()
  const { currentDynasty } = useDynasty()
  const pathPrefix = usePathPrefix()

  const userTid = getUserTeamTid(currentDynasty)
  const [selectedTid, setSelectedTid] = useState(userTid)
  const [showFullDraft, setShowFullDraft] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedNflTeam, setSelectedNflTeam] = useState('')
  const [selectedRound, setSelectedRound] = useState(1)

  if (!currentDynasty) return null

  const startYear = currentDynasty.startYear || currentDynasty.currentYear
  const availableYears = []
  for (let y = currentDynasty.currentYear; y >= startYear; y--) availableYears.push(y)
  const displayYear = urlYear ? parseInt(urlYear, 10) : currentDynasty.currentYear
  const handleYearChange = (y) => navigate(`${pathPrefix}/draft-results/${y}`)

  const results = currentDynasty.leagueDraftResultsByYear?.[displayYear] || []

  const teamOptions = useMemo(() => {
    const teams = currentDynasty.teams || {}
    return Object.entries(teams)
      .filter(([, t]) => !t.isFCS && t.name)
      .map(([tid, t]) => ({ tid: Number(tid), name: t.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [currentDynasty.teams])

  const teamResults = results
    .filter((r) => r.tid === selectedTid)
    .sort(comparePickOrder)

  const byRound = useMemo(() => {
    const grouped = {}
    for (const r of results) {
      (grouped[r.round] ||= []).push(r)
    }
    for (const round of Object.keys(grouped)) {
      grouped[round].sort(comparePickOrder)
    }
    return grouped
  }, [results])

  const selectedTeamName = getMascotName(selectedTid, currentDynasty.teams) || getAbbrFromTid(currentDynasty.teams, selectedTid)

  const topSchools = useMemo(() => {
    const counts = new Map()
    for (const r of results) {
      counts.set(r.tid, (counts.get(r.tid) || 0) + 1)
    }
    return [...counts.entries()]
      .map(([tid, count]) => ({ tid: Number(tid), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }, [results])

  const searchQuery = search.trim().toLowerCase()
  const searchResults = searchQuery
    ? results.filter((r) => r.playerName?.toLowerCase().includes(searchQuery)).sort(comparePickOrder)
    : []

  const nflTeamPicks = selectedNflTeam
    ? results
        .filter((r) => r.team === selectedNflTeam)
        .sort(comparePickOrder)
    : []

  return (
    <div className="space-y-6">
      <PageHero
        title={<TitleWithYear year={displayYear} years={availableYears} onChange={handleYearChange} label="Draft Results" />}
      />

      <Input
        type="text"
        placeholder="Search for a player..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

      {searchQuery ? (
        <Card padding="none">
          {searchResults.length === 0 ? (
            <EmptyState title="No Match" subtitle={`No drafted player in ${displayYear} matches "${search.trim()}".`} />
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--surface-4)' }}>
              {searchResults.map((r, i) => (
                <DraftRow key={i} r={r} teams={currentDynasty.teams} />
              ))}
            </div>
          )}
        </Card>
      ) : (
        <>
          {!showFullDraft && (
            <div className="flex items-center gap-3 flex-wrap">
              <Select
                value={selectedTid ?? ''}
                onChange={(e) => setSelectedTid(Number(e.target.value))}
                className="max-w-xs"
              >
                {teamOptions.map((t) => (
                  <option key={t.tid} value={t.tid}>{t.name}</option>
                ))}
              </Select>
              <Button variant="outline" size="sm" onClick={() => setShowFullDraft(true)}>
                Full Draft Results
              </Button>
            </div>
          )}

          {showFullDraft && (
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-txt-primary m-0">Full Draft Results — {displayYear}</h2>
              <Button variant="outline" size="sm" onClick={() => setShowFullDraft(false)}>
                Back to Team View
              </Button>
            </div>
          )}

          {!showFullDraft && (
            teamResults.length === 0 ? (
              <Card>
                <EmptyState title="No Draft Results" subtitle={`No ${selectedTeamName || 'team'} players were drafted in ${displayYear}.`} />
              </Card>
            ) : (
              <Card padding="none">
                <div className="divide-y" style={{ borderColor: 'var(--surface-4)' }}>
                  {teamResults.map((r, i) => (
                    <DraftRow key={i} r={r} teams={currentDynasty.teams} />
                  ))}
                </div>
              </Card>
            )
          )}

          {showFullDraft && (
            results.length === 0 ? (
              <Card>
                <EmptyState title="No Draft Results Yet" subtitle={`Nobody has been drafted in ${displayYear} yet.`} />
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
                <div className="space-y-6">
                  {topSchools.length > 0 && (
                    <Card>
                      <h3 className="font-display font-bold uppercase text-txt-primary mb-3" style={{ fontSize: '1.05rem', letterSpacing: '0.03em' }}>
                        Most Players Drafted
                      </h3>
                      <div className="flex flex-wrap gap-3">
                        {topSchools.map((s, i) => (
                          <div key={s.tid} className="flex items-center gap-2 px-3 py-1.5 rounded-md" style={{ background: 'var(--surface-2)' }}>
                            <span className="text-xs text-txt-tertiary tabular-nums w-4">{i + 1}</span>
                            <img src={getTeamLogoByTid(s.tid, currentDynasty.teams)} alt="" className="w-5 h-5 flex-shrink-0 object-contain" />
                            <span className="text-sm font-semibold text-txt-primary">{getMascotName(s.tid, currentDynasty.teams)}</span>
                            <span className="text-sm text-txt-tertiary tabular-nums">{s.count}</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="font-display font-bold uppercase text-txt-primary m-0" style={{ fontSize: '1.05rem', letterSpacing: '0.03em' }}>
                        Round
                      </h3>
                      <Select
                        value={selectedRound}
                        onChange={(e) => setSelectedRound(Number(e.target.value))}
                        className="max-w-[10rem]"
                      >
                        {ROUNDS.map((round) => (
                          <option key={round} value={round}>Round {round}</option>
                        ))}
                      </Select>
                    </div>
                    {!byRound[selectedRound]?.length ? (
                      <Card>
                        <EmptyState title="No Picks" subtitle={`Nobody was drafted in Round ${selectedRound} of ${displayYear}.`} />
                      </Card>
                    ) : (
                      <Card padding="none">
                        <div className="divide-y" style={{ borderColor: 'var(--surface-4)' }}>
                          {byRound[selectedRound].map((r, i) => (
                            <DraftRow key={i} r={r} teams={currentDynasty.teams} />
                          ))}
                        </div>
                      </Card>
                    )}
                  </div>
                </div>

                <div className="lg:sticky lg:top-4">
                  <Card>
                    <h3 className="font-display font-bold uppercase text-txt-primary mb-3" style={{ fontSize: '1.05rem', letterSpacing: '0.03em' }}>
                      NFL Team Board
                    </h3>
                    <Select
                      value={selectedNflTeam}
                      onChange={(e) => setSelectedNflTeam(e.target.value)}
                      className="w-full mb-3"
                    >
                      <option value="">Select an NFL team...</option>
                      {NFL_TEAM_OPTIONS.map((t) => (
                        <option key={t.abbr} value={t.abbr}>{t.name}</option>
                      ))}
                    </Select>
                    {selectedNflTeam && (
                      nflTeamPicks.length === 0 ? (
                        <p className="text-sm text-txt-tertiary m-0">No picks yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {nflTeamPicks.map((r, i) => (
                            <div key={i} className="flex items-center gap-2 py-1.5" style={{ borderTop: i > 0 ? '1px solid var(--surface-4)' : 'none' }}>
                              <img src={getTeamLogoByTid(r.tid, currentDynasty.teams)} alt="" className="w-5 h-5 flex-shrink-0 object-contain" />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-txt-primary truncate">{r.playerName}</div>
                                <div className="text-xs text-txt-tertiary">
                                  {r.position} · {r.overall ?? '--'} OVR · {r.draftRound}
                                  {r.overallPick ? ` — Pick ${r.overallPick}` : ` — ${r.pickLabel || ''}`}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    )}
                  </Card>
                </div>
              </div>
            )
          )}
        </>
      )}
    </div>
  )
}
