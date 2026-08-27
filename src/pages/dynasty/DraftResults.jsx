import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getUserTeamTid, getAbbrFromTid } from '../../data/teamRegistry'
import { getTeamLogoByTid, getMascotName } from '../../data/teams'
import { PageHero, Card, EmptyState, TitleWithYear, Badge, Select, Button } from '../../components/ui'

const ROUNDS = [1, 2, 3, 4, 5, 6, 7]

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
    .sort((a, b) => a.round - b.round || (b.overall || 0) - (a.overall || 0))

  const byRound = useMemo(() => {
    const grouped = {}
    for (const r of results) {
      (grouped[r.round] ||= []).push(r)
    }
    for (const round of Object.keys(grouped)) {
      grouped[round].sort((a, b) => (b.overall || 0) - (a.overall || 0))
    }
    return grouped
  }, [results])

  const selectedTeamName = getMascotName(selectedTid, currentDynasty.teams) || getAbbrFromTid(currentDynasty.teams, selectedTid)

  return (
    <div className="space-y-6">
      <PageHero
        title={<TitleWithYear year={displayYear} years={availableYears} onChange={handleYearChange} label="Draft Results" />}
      />

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
            Full Draft
          </Button>
        </div>
      )}

      {showFullDraft && (
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-txt-primary m-0">Full Draft — {displayYear}</h2>
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
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <img
                    src={getTeamLogoByTid(r.tid, currentDynasty.teams)}
                    alt=""
                    className="w-6 h-6 flex-shrink-0 object-contain"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-txt-primary">{r.playerName || 'Unknown'}</span>
                    <span className="ml-2 text-xs text-txt-tertiary uppercase">{r.position}</span>
                    <span className="ml-2 text-xs text-txt-tertiary">{r.classYear}</span>
                  </div>
                  <div className="text-sm font-bold text-txt-primary tabular-nums w-8 text-right">{r.overall ?? '--'}</div>
                  <Badge variant="outline">{r.draftRound}</Badge>
                </div>
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
          <div className="space-y-6">
            {ROUNDS.filter((round) => byRound[round]?.length).map((round) => (
              <div key={round}>
                <h3 className="font-display font-bold uppercase text-txt-primary mb-2" style={{ fontSize: '1.05rem', letterSpacing: '0.03em' }}>
                  Round {round}
                </h3>
                <Card padding="none">
                  <div className="divide-y" style={{ borderColor: 'var(--surface-4)' }}>
                    {byRound[round].map((r, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3">
                        <img
                          src={getTeamLogoByTid(r.tid, currentDynasty.teams)}
                          alt=""
                          className="w-6 h-6 flex-shrink-0 object-contain"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="font-semibold text-txt-primary">{r.playerName || 'Unknown'}</span>
                          <span className="ml-2 text-xs text-txt-tertiary uppercase">{r.position}</span>
                          <span className="ml-2 text-xs text-txt-tertiary">{r.classYear}</span>
                        </div>
                        <span className="text-xs text-txt-tertiary">{getMascotName(r.tid, currentDynasty.teams)}</span>
                        <div className="text-sm font-bold text-txt-primary tabular-nums w-8 text-right">{r.overall ?? '--'}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
