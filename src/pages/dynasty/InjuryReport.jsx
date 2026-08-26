import { useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useDynasty, isPlayerOnRoster } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getTeamLogoByTid, getMascotName } from '../../data/teams'
import { getTeamColors } from '../../data/teamColors'
import { getContrastTextColor } from '../../utils/colorUtils'
import { proxyImageUrl } from '../../utils/imageProxy'
import { PageHero, Card, EmptyState, Select } from '../../components/ui'

// Whole-league Injury Report, sourced from CFB27 sync — see
// extractPlayers.cjs's injury fields (InjuryStatus/InjuryType/
// MaxInjuryDuration, verified directly against a real save) and
// cfb27SaveImport.js's mapInjuryType. Team-scoped like the in-game screen
// (a team selector, defaulting to the user's own team), not a flat
// whole-league list.
export default function InjuryReport() {
  const { tid: urlTid } = useParams()
  const navigate = useNavigate()
  const { currentDynasty } = useDynasty()
  const pathPrefix = usePathPrefix()
  const [positionFilter, setPositionFilter] = useState('ALL')

  if (!currentDynasty) return null

  const teamsSource = currentDynasty.teams || {}
  const currentYear = Number(currentDynasty.currentYear)
  const selectedTid = urlTid ? Number(urlTid) : Number(currentDynasty.currentTid)

  const handleTeamChange = (tid) => navigate(`${pathPrefix}/injury-report/${tid}`)

  const teamOptions = useMemo(() => {
    return Object.entries(teamsSource)
      .map(([tid, team]) => ({ tid: Number(tid), name: team?.name || getMascotName(Number(tid), teamsSource) || `Team ${tid}` }))
      .filter((t) => t.name)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [teamsSource])

  const injuredPlayers = useMemo(() => {
    return (currentDynasty.players || [])
      .filter((p) => p.isInjured && isPlayerOnRoster(p, selectedTid, currentYear, currentDynasty))
      .sort((a, b) => (b.overall || 0) - (a.overall || 0))
  }, [currentDynasty, selectedTid, currentYear])

  const positions = useMemo(() => {
    const set = new Set(injuredPlayers.map((p) => p.position).filter(Boolean))
    return [...set].sort()
  }, [injuredPlayers])

  const filteredPlayers = positionFilter === 'ALL'
    ? injuredPlayers
    : injuredPlayers.filter((p) => p.position === positionFilter)

  const mascotName = getMascotName(selectedTid, teamsSource)
  const teamColors = mascotName ? getTeamColors(mascotName, teamsSource) : null
  const primary = teamColors?.primary || '#3a3d47'
  const txt = getContrastTextColor(primary)
  const logo = getTeamLogoByTid(selectedTid, teamsSource)

  return (
    <div className="space-y-6">
      <PageHero
        title="Injury Report"
        right={(
          <div className="flex items-center gap-2">
            <Select value={selectedTid} onChange={(e) => handleTeamChange(e.target.value)} size="sm">
              {teamOptions.map((t) => <option key={t.tid} value={t.tid}>{t.name}</option>)}
            </Select>
            <Select value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)} size="sm">
              <option value="ALL">All Positions</option>
              {positions.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </div>
        )}
      />

      <Card padding="none" className="overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 cfb-texture" style={{ backgroundColor: primary, color: txt }}>
          {logo && (
            <span className="w-8 h-8 rounded-full bg-white p-0.5 flex-shrink-0 flex items-center justify-center">
              <img src={logo} alt="" className="w-full h-full object-contain" />
            </span>
          )}
          <span className="font-display font-black uppercase tracking-wide">{mascotName || 'Team'}</span>
          <span className="ml-auto text-xs font-bold uppercase tracking-wider opacity-80">
            {filteredPlayers.length} {filteredPlayers.length === 1 ? 'Player' : 'Players'} Injured
          </span>
        </div>

        {filteredPlayers.length === 0 ? (
          <EmptyState title="No Injuries" message="This team has no injured players for the selected filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-wider text-txt-tertiary border-b border-surface-4">
                  <th className="text-left px-4 py-2">Name</th>
                  <th className="text-left px-2 py-2">Pos</th>
                  <th className="text-right px-2 py-2">OVR</th>
                  <th className="text-left px-4 py-2">Injury</th>
                  <th className="text-right px-2 py-2">Length</th>
                  <th className="text-left px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlayers.map((p) => (
                  <tr key={p.pid} className="border-b border-surface-4 last:border-0 hover:bg-surface-2 transition-colors">
                    <td className="px-4 py-2">
                      <Link to={`${pathPrefix}/player/${p.pid}`} className="flex items-center gap-2 no-underline">
                        <span className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 bg-surface-3 flex items-center justify-center">
                          {p.pictureUrl
                            ? <img src={proxyImageUrl(p.pictureUrl, 100)} alt="" className="w-full h-full object-cover" />
                            : logo
                              ? <img src={logo} alt="" className="w-full h-full object-contain p-0.5" />
                              : <span className="text-[9px] font-bold text-txt-tertiary">{(p.name || '?').charAt(0)}</span>}
                        </span>
                        <span className="font-semibold text-txt-primary hover:underline">{p.name}</span>
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-txt-secondary font-semibold">{p.position}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-bold text-txt-primary">{p.overall ?? '—'}</td>
                    <td className="px-4 py-2 text-txt-secondary">{p.injuryType || '—'}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-txt-secondary">{p.injuryLength ?? '—'}</td>
                    <td className="px-4 py-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: 'var(--accent-error, #ef4444)' }}>
                        Injured
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
