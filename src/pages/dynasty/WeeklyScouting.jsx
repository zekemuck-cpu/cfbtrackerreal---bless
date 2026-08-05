import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useDynasty, isPlayerOnRoster, getTeamRatingsForYear } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getUserTeamTid } from '../../data/teamRegistry'
import { getTeamLogoByTid, getMascotName } from '../../data/teams'
import { proxyImageUrl } from '../../utils/imageProxy'
import { computeLeagueTeamStats } from '../../utils/leagueTeamStats'
import { OFFENSE_PLAYBOOKS, DEFENSE_PLAYBOOKS, getOffensePlaybookNote, getDefensePlaybookNote } from '../../data/playbookScoutingNotes'
import OpponentMatchupHero from '../../components/OpponentMatchupHero'
import { Card, EmptyState, SectionHeader, FormField, Select, useToast } from '../../components/ui'

function pct(n, d) {
  return d > 0 ? (n / d) * 100 : 0
}
const fmt1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '0.0')
const fmtPct = (v) => (Number.isFinite(v) ? `${v.toFixed(1)}%` : '0.0%')
const fmtPoss = (v) => {
  const secs = Number.isFinite(v) ? v : 0
  const mm = Math.floor(secs / 60)
  const ss = Math.floor(secs % 60)
  return `${mm}:${String(ss).padStart(2, '0')}`
}

// Builds the same per-game-rate rows TeamStats.jsx computes, restricted to
// the fields this report ranks. Kept local (not extracted) since it's a
// narrower slice of that page's `rows` useMemo, not a general-purpose util.
function buildAnalyticsRows(dynasty, year, teamsSource) {
  const totals = computeLeagueTeamStats(dynasty, year)
  const out = []
  for (const [tid, t] of totals.entries()) {
    const meta = teamsSource[tid]
    if (!meta || !meta.name || meta.isFCS) continue
    if ((t.gamesPlayed || 0) === 0) continue
    const gp = t.gamesPlayed
    const dgp = t.defGames || 0
    out.push({
      tid,
      wins: t.wins || 0,
      losses: t.losses || 0,
      ppg: gp > 0 ? t.pointsFor / gp : 0,
      ydsPerG: gp > 0 ? t.totalOffense / gp : 0,
      passYdsPerG: gp > 0 ? t.passYards / gp : 0,
      rushYdsPerG: gp > 0 ? t.rushYards / gp : 0,
      thirdPct: pct(t.thirdDownConv, t.thirdDownAtt),
      possAvgSec: gp > 0 ? (t.possMinutes * 60 + t.possSeconds) / gp : 0,
      toMargin: (t.oppTurnovers || 0) - (t.turnovers || 0),
      ppgAllowed: gp > 0 ? t.pointsAgainst / gp : 0,
      ydsAllowedPerG: dgp > 0 ? t.oppTotalYards / dgp : 0,
      passYdsAllowedPerG: dgp > 0 ? t.oppPassYards / dgp : 0,
      rushYdsAllowedPerG: dgp > 0 ? t.oppRushYards / dgp : 0,
    })
  }
  return out
}

function rankOf(rows, tid, key, higherIsBetter) {
  const sorted = [...rows].sort((a, b) => higherIsBetter ? b[key] - a[key] : a[key] - b[key])
  const idx = sorted.findIndex((r) => r.tid === tid)
  return idx === -1 ? null : idx + 1
}

function topByStat(players, year, category, statKey, n = 2) {
  return players
    .map((p) => ({ p, val: p.statsByYear?.[year]?.[category]?.[statKey] || 0 }))
    .filter((x) => x.val > 0)
    .sort((a, b) => b.val - a.val)
    .slice(0, n)
}

function AnalyticsRow({ label, value, rank, total }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-4 last:border-0">
      <span className="text-sm text-txt-secondary">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold tabular-nums text-txt-primary">{value}</span>
        {rank != null && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-txt-tertiary tabular-nums whitespace-nowrap">
            #{rank} of {total}
          </span>
        )}
      </div>
    </div>
  )
}

function PlayerAvatarLink({ pathPrefix, logo, player }) {
  return (
    <Link to={`${pathPrefix}/player/${player.pid}`} className="flex items-center gap-2 no-underline">
      <span className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 bg-surface-3 flex items-center justify-center">
        {player.pictureUrl
          ? <img src={proxyImageUrl(player.pictureUrl, 100)} alt="" className="w-full h-full object-cover" />
          : logo
            ? <img src={logo} alt="" className="w-full h-full object-contain p-0.5" />
            : <span className="text-[9px] font-bold text-txt-tertiary">{(player.name || '?').charAt(0)}</span>}
      </span>
      <span className="font-semibold text-txt-primary hover:underline">{player.name}</span>
    </Link>
  )
}

function PlaybookNote({ note }) {
  if (!note) return null
  return (
    <div className="text-sm text-txt-secondary bg-surface-2 border border-surface-4 rounded-md p-3 mt-1">
      {note}
    </div>
  )
}

const EMPTY_REPORT = {
  offensivePlaybook: '',
  defensivePlaybook: '',
}

// Scouting Report — PC/CFB27-only opponent scouting report for a single
// matchup. Auto-fills what's derivable from synced save data (team
// analytics/rankings, opponent injuries, key playmakers); scheme/tendency-
// style fields have no equivalent in the save data, so those stay manual
// free-text, persisted onto the game record via patchGameFields.
export default function WeeklyScouting() {
  const { gameId } = useParams()
  const { currentDynasty, patchGameFields, isViewOnly } = useDynasty()
  const pathPrefix = usePathPrefix()
  const { toast } = useToast()

  const game = useMemo(
    () => (currentDynasty?.games || []).find((g) => g.id === gameId),
    [currentDynasty?.games, gameId],
  )

  const [fields, setFields] = useState(() => ({ ...EMPTY_REPORT, ...(game?.scoutingReport || {}) }))
  useEffect(() => {
    setFields({ ...EMPTY_REPORT, ...(game?.scoutingReport || {}) })
  }, [game?.id])

  if (!currentDynasty) return null

  if (!game) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Scouting Report" />
        <Card><EmptyState title="Game Not Found" message="This matchup could not be located." /></Card>
      </div>
    )
  }

  const teamsSource = currentDynasty.teams || {}
  const year = Number(game.year)
  const userTeamTid = getUserTeamTid(currentDynasty)
  const opponentTid = Number(game.team1Tid) === Number(userTeamTid)
    ? Number(game.team2Tid)
    : Number(game.team1Tid)

  const mascotName = getMascotName(opponentTid, teamsSource)
  const logo = getTeamLogoByTid(opponentTid, teamsSource)

  const analyticsRows = buildAnalyticsRows(currentDynasty, year, teamsSource)
  const total = analyticsRows.length
  const oppRow = analyticsRows.find((r) => r.tid === opponentTid)
  const opponentRatings = getTeamRatingsForYear(currentDynasty, opponentTid, year)

  const roster = (currentDynasty.players || []).filter(
    (p) => !p.isHonorOnly && isPlayerOnRoster(p, opponentTid, year, currentDynasty),
  )
  const passLeaders = topByStat(roster, year, 'passing', 'yds', 1)
  const rushLeaders = topByStat(roster, year, 'rushing', 'yds', 2)
  const recLeaders = topByStat(roster, year, 'receiving', 'yds', 2)
  const sackLeaders = topByStat(roster, year, 'defense', 'sacks', 2)
  const intLeaders = topByStat(roster, year, 'defense', 'int', 2)
  const playmakers = [
    ...passLeaders.map(({ p, val }) => ({ p, stat: 'Pass Yds', value: val.toLocaleString() })),
    ...rushLeaders.map(({ p, val }) => ({ p, stat: 'Rush Yds', value: val.toLocaleString() })),
    ...recLeaders.map(({ p, val }) => ({ p, stat: 'Rec Yds', value: val.toLocaleString() })),
    ...sackLeaders.map(({ p, val }) => ({ p, stat: 'Sacks', value: fmt1(val) })),
    ...intLeaders.map(({ p, val }) => ({ p, stat: 'INT', value: val })),
  ]

  const injuredPlayers = roster
    .filter((p) => p.isInjured)
    .sort((a, b) => (b.overall || 0) - (a.overall || 0))

  const persist = async (nextFields) => {
    if (isViewOnly) return
    await patchGameFields(currentDynasty.id, game.id, {
      scoutingReport: { ...nextFields, updatedAt: new Date().toISOString() },
    })
    toast.success('Scouting notes saved.')
  }

  const handleSelectChange = (key, value) => {
    const next = { ...fields, [key]: value }
    setFields(next)
    persist(next)
  }

  return (
    <div className="space-y-6">
      <OpponentMatchupHero
        dynasty={currentDynasty}
        game={game}
        opponentTid={opponentTid}
        pageTitle="Scouting Report"
        record={oppRow}
        ratings={opponentRatings}
        pathPrefix={pathPrefix}
      />

      <div>
        <SectionHeader title="Team Analytics" subtitle="League ranks for the current season" size="sm" />
        {!oppRow ? (
          <Card><EmptyState variant="compact" title="No Data Yet" message="This opponent has no games on record for this season." /></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card padding="none" className="overflow-hidden">
              <div className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-txt-tertiary border-b border-surface-4">Offense</div>
              <AnalyticsRow label="Scoring Offense" value={fmt1(oppRow.ppg)} rank={rankOf(analyticsRows, opponentTid, 'ppg', true)} total={total} />
              <AnalyticsRow label="Total Offense (Yds/G)" value={fmt1(oppRow.ydsPerG)} rank={rankOf(analyticsRows, opponentTid, 'ydsPerG', true)} total={total} />
              <AnalyticsRow label="Passing Offense (Yds/G)" value={fmt1(oppRow.passYdsPerG)} rank={rankOf(analyticsRows, opponentTid, 'passYdsPerG', true)} total={total} />
              <AnalyticsRow label="Rushing Offense (Yds/G)" value={fmt1(oppRow.rushYdsPerG)} rank={rankOf(analyticsRows, opponentTid, 'rushYdsPerG', true)} total={total} />
              <AnalyticsRow label="3rd Down %" value={fmtPct(oppRow.thirdPct)} rank={rankOf(analyticsRows, opponentTid, 'thirdPct', true)} total={total} />
              <AnalyticsRow label="Time of Possession" value={fmtPoss(oppRow.possAvgSec)} rank={rankOf(analyticsRows, opponentTid, 'possAvgSec', true)} total={total} />
            </Card>
            <Card padding="none" className="overflow-hidden">
              <div className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-txt-tertiary border-b border-surface-4">Defense</div>
              <AnalyticsRow label="Scoring Defense" value={fmt1(oppRow.ppgAllowed)} rank={rankOf(analyticsRows, opponentTid, 'ppgAllowed', false)} total={total} />
              <AnalyticsRow label="Total Defense (Yds/G)" value={fmt1(oppRow.ydsAllowedPerG)} rank={rankOf(analyticsRows, opponentTid, 'ydsAllowedPerG', false)} total={total} />
              <AnalyticsRow label="Pass Defense (Yds/G)" value={fmt1(oppRow.passYdsAllowedPerG)} rank={rankOf(analyticsRows, opponentTid, 'passYdsAllowedPerG', false)} total={total} />
              <AnalyticsRow label="Rush Defense (Yds/G)" value={fmt1(oppRow.rushYdsAllowedPerG)} rank={rankOf(analyticsRows, opponentTid, 'rushYdsAllowedPerG', false)} total={total} />
              <AnalyticsRow label="Turnover Margin" value={oppRow.toMargin > 0 ? `+${oppRow.toMargin}` : oppRow.toMargin} rank={rankOf(analyticsRows, opponentTid, 'toMargin', true)} total={total} />
            </Card>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
        <div className="flex flex-col">
          <SectionHeader title="Opponent Offense" size="sm" />
          <Card className="h-full">
            <FormField label="Offensive Playbook">
              <Select
                value={fields.offensivePlaybook || ''}
                onChange={(e) => handleSelectChange('offensivePlaybook', e.target.value)}
                disabled={isViewOnly}
              >
                <option value="">Select playbook...</option>
                {OFFENSE_PLAYBOOKS.map((name) => <option key={name} value={name}>{name}</option>)}
              </Select>
              <PlaybookNote note={getOffensePlaybookNote(fields.offensivePlaybook)} />
            </FormField>
          </Card>
        </div>

        <div className="flex flex-col">
          <SectionHeader title="Opponent Defense" size="sm" />
          <Card className="h-full">
            <FormField label="Defensive Playbook">
              <Select
                value={fields.defensivePlaybook || ''}
                onChange={(e) => handleSelectChange('defensivePlaybook', e.target.value)}
                disabled={isViewOnly}
              >
                <option value="">Select playbook...</option>
                {DEFENSE_PLAYBOOKS.map((name) => <option key={name} value={name}>{name}</option>)}
              </Select>
              <PlaybookNote note={getDefensePlaybookNote(fields.defensivePlaybook)} />
            </FormField>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <SectionHeader title="Key Playmakers" size="sm" />
          <Card padding="none" className="overflow-hidden">
            {playmakers.length === 0 ? (
              <EmptyState variant="compact" title="No Stats Yet" message="This opponent has no recorded stats for this season." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-bold uppercase tracking-wider text-txt-tertiary border-b border-surface-4">
                      <th className="text-left px-4 py-2">Name</th>
                      <th className="text-right px-2 py-2">#</th>
                      <th className="text-left px-2 py-2">Pos</th>
                      <th className="text-right px-2 py-2">OVR</th>
                      <th className="text-left px-4 py-2">Stat</th>
                      <th className="text-right px-2 py-2">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playmakers.map(({ p, stat, value }) => (
                      <tr key={`${p.pid}-${stat}`} className="border-b border-surface-4 last:border-0 hover:bg-surface-2 transition-colors">
                        <td className="px-4 py-2">
                          <PlayerAvatarLink pathPrefix={pathPrefix} logo={logo} player={p} />
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-txt-tertiary">{p.jerseyNumber ?? '—'}</td>
                        <td className="px-2 py-2 text-txt-secondary font-semibold">{p.position}</td>
                        <td className="px-2 py-2 text-right tabular-nums font-bold text-txt-primary">{p.overall ?? '—'}</td>
                        <td className="px-4 py-2 text-txt-secondary">{stat}</td>
                        <td className="px-2 py-2 text-right tabular-nums font-bold text-txt-primary">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div>
          <SectionHeader title="Injuries" size="sm" />
          <Card padding="none" className="overflow-hidden">
            {injuredPlayers.length === 0 ? (
              <EmptyState variant="compact" title="No Injuries" message="This opponent has no injured players on record." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-bold uppercase tracking-wider text-txt-tertiary border-b border-surface-4">
                      <th className="text-left px-4 py-2">Name</th>
                      <th className="text-right px-2 py-2">#</th>
                      <th className="text-left px-2 py-2">Pos</th>
                      <th className="text-right px-2 py-2">OVR</th>
                      <th className="text-left px-4 py-2">Injury</th>
                      <th className="text-right px-2 py-2">Weeks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {injuredPlayers.map((p) => (
                      <tr key={p.pid} className="border-b border-surface-4 last:border-0 hover:bg-surface-2 transition-colors">
                        <td className="px-4 py-2">
                          <PlayerAvatarLink pathPrefix={pathPrefix} logo={logo} player={p} />
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-txt-tertiary">{p.jerseyNumber ?? '—'}</td>
                        <td className="px-2 py-2 text-txt-secondary font-semibold">{p.position}</td>
                        <td className="px-2 py-2 text-right tabular-nums font-bold text-txt-primary">{p.overall ?? '—'}</td>
                        <td className="px-4 py-2 text-txt-secondary">{p.injuryType || '—'}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-txt-secondary">{p.injuryLength ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
