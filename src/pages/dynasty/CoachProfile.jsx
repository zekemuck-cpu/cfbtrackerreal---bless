import { Link, useParams, useNavigate } from 'react-router-dom'
import { proxyImageUrl } from '../../utils/imageProxy'
import { useDynasty } from '../../context/DynastyContext'
import { useEdition } from '../../editions/useEdition'
import { Button } from '../../components/ui'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import { getContrastTextColor } from '../../utils/colorUtils'
import { getTeamLogo } from '../../data/teams'
import { getNameFromTid } from '../../data/teamRegistry'
import { getCoach, getCoachCareer, COACH_ROLE_LABELS } from '../../data/coachModel'
import pointsIcon from '../../assets/blueprint/points.png'

const fmt = (n) => (n == null || n === '' || isNaN(n) ? '—' : Number(n).toLocaleString())

// Coach detail page — VIEW ONLY, matching the player page. Editing happens
// on the separate /coach/:cid/edit page (opened via the hero pencil).
export default function CoachProfile() {
  const { id, cid } = useParams()
  const navigate = useNavigate()
  const pathPrefix = usePathPrefix()
  const { currentDynasty, isViewOnly } = useDynasty()
  const { features } = useEdition()

  const coach = getCoach(currentDynasty, cid)

  // Team-color basis: the coach's most recent saved season's team.
  const career = getCoachCareer(coach || { byYear: {} })
  const heroTeamTid = career.current?.teamTid
  const heroTeam = heroTeamTid != null ? currentDynasty?.teams?.[heroTeamTid] : null
  const heroTeamName = heroTeam?.name || (heroTeamTid != null ? getNameFromTid(currentDynasty?.teams, heroTeamTid) : '')
  const teamColors = useTeamColors(heroTeamName, currentDynasty?.teams)

  if (!currentDynasty) return null

  if (!coach) {
    return (
      <div className="max-w-2xl mx-auto py-10 px-4">
        <div className="card p-6">
          <h1 className="display-sm text-txt-primary m-0 mb-2">Coach not found</h1>
          <p className="text-sm text-txt-secondary">This coach record doesn’t exist in this dynasty.</p>
          <div className="mt-4">
            <Link to={pathPrefix} className="btn-refined">Back</Link>
          </div>
        </div>
      </div>
    )
  }

  const teamInfo = heroTeam
    ? {
        backgroundColor: heroTeam.primaryColor || teamColors.primary || '#1f2937',
        textColor: heroTeam.secondaryColor || teamColors.secondary || '#f3f4f6',
      }
    : { backgroundColor: '#3a3d47', textColor: '#f3f4f6' }
  const teamBgText = getContrastTextColor(teamInfo.backgroundColor)
  const heroLogo = heroTeam?.logo || heroTeam?.logoUrl
  const teamLogoUrl = heroTeamName ? getTeamLogo(heroTeamName, currentDynasty?.teams || currentDynasty?.customTeams) : null

  const seasonYears = Object.keys(coach.byYear || {}).map(Number).sort((a, b) => a - b)
  const current = career.current
  const currentSeasonYear = seasonYears.length ? seasonYears[seasonYears.length - 1] : Number(currentDynasty.currentYear)

  return (
    <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto -mt-4 sm:-mt-6 px-4 sm:px-6 lg:px-8 pt-2 sm:pt-3 pb-6">
      {/* Hero — team-color broadcast banner (matches the player page) */}
      <div
        className="card overflow-hidden relative reveal cfb-texture cfb-texture-strong"
        style={{
          backgroundColor: teamInfo.backgroundColor,
          backgroundImage:
            'linear-gradient(120deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 44%), linear-gradient(180deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.44) 100%)',
          ...(heroLogo ? { '--cfb-watermark': `url("${heroLogo}")`, '--cfb-watermark-right': '7rem' } : {}),
        }}
      >
        <div className="relative overflow-hidden p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 cfb-watermark">
          <div className="flex items-start sm:items-center gap-3 sm:gap-4 min-w-0 flex-1">
            {/* Coach photo (like the player headshot); falls back to the team logo. */}
            {coach.pictureUrl ? (
              <img
                src={proxyImageUrl(coach.pictureUrl, 300)}
                alt={coach.name}
                className="flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-xl relative z-[1]"
                style={{ border: `2px solid ${teamBgText}66`, boxShadow: '0 2px 10px rgba(0,0,0,0.35)' }}
                onError={(e) => { e.target.style.display = 'none' }}
              />
            ) : teamLogoUrl ? (
              <div
                className="flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-xl flex items-center justify-center bg-white p-2.5 relative z-[1]"
                style={{ border: `2px solid ${teamBgText}66`, boxShadow: '0 2px 10px rgba(0,0,0,0.35)' }}
              >
                <img src={teamLogoUrl} alt="" className="w-full h-full object-contain" />
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <h1
                  className="font-display font-extrabold uppercase tracking-tight leading-none truncate"
                  style={{ color: teamBgText, fontSize: 'clamp(1.45rem, 3.2vw, 2.5rem)' }}
                >
                  {coach.name || 'Unnamed coach'}
                </h1>
                {!isViewOnly && (
                  <button
                    onClick={() => navigate(`${pathPrefix}/coach/${cid}/edit`)}
                    className="inline-flex items-center justify-center p-1.5 rounded-lg hover:bg-black/20 transition-colors flex-shrink-0 self-center"
                    style={{ color: teamBgText, border: `1px solid ${teamBgText}40` }}
                    title="Edit Coach"
                    aria-label="Edit Coach"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                )}
              </div>

              {current && heroTeamName && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <Link
                    to={`${pathPrefix}/team/${current.teamTid}/${currentSeasonYear}`}
                    className="inline-flex items-center gap-2 font-display font-bold hover:opacity-80 transition-opacity"
                    style={{ color: teamBgText, fontSize: 'clamp(0.95rem, 1.5vw, 1.1rem)' }}
                  >
                    {teamLogoUrl && (
                      <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 bg-white" style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.1)', padding: '3px' }}>
                        <img src={teamLogoUrl} alt="" className="w-full h-full object-contain" />
                      </div>
                    )}
                    <span className="truncate max-w-[200px] sm:max-w-none">{heroTeamName}</span>
                  </Link>
                </div>
              )}

              <div
                className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 font-display font-semibold uppercase tracking-wide"
                style={{ color: teamBgText, fontSize: '0.82rem' }}
              >
                <span>{current ? (COACH_ROLE_LABELS[current.role] || current.role) : 'No seasons recorded'}</span>
                {current?.level != null && (
                  <><span style={{ opacity: 0.4 }}>•</span><span>Level {current.level}</span></>
                )}
              </div>
            </div>
          </div>

          {current?.salary != null && (
            <div className="hidden sm:block sm:self-center flex-shrink-0 text-right">
              <div className="label-xs flex items-center justify-end gap-1" style={{ color: `${teamBgText}cc`, letterSpacing: '1px' }}>
                <span>{currentSeasonYear}</span>
                {features?.dynastyPoints
                  ? <img src={pointsIcon} alt="Dynasty Points" className="w-3.5 h-3.5 object-contain" />
                  : <span>Salary</span>}
              </div>
              <div className="font-display font-black tabular-nums leading-none" style={{ color: teamBgText, fontSize: 'clamp(1.5rem, 3vw, 2.25rem)' }}>
                {fmt(current.salary)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Career by season — read-only */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-3 text-txt-tertiary text-left">
                <th className="py-2.5 px-4 font-semibold uppercase text-[11px] tracking-wide">Season</th>
                <th className="py-2.5 px-3 font-semibold uppercase text-[11px] tracking-wide">Team</th>
                <th className="py-2.5 px-3 font-semibold uppercase text-[11px] tracking-wide">Role</th>
                <th className="py-2.5 px-3 font-semibold uppercase text-[11px] tracking-wide text-right">Level</th>
                <th className="py-2.5 px-3 font-semibold uppercase text-[11px] tracking-wide text-right">Salary</th>
              </tr>
            </thead>
            <tbody>
              {seasonYears.length === 0 && (
                <tr><td colSpan={5} className="py-5 text-center text-txt-tertiary text-sm">No seasons yet.</td></tr>
              )}
              {seasonYears.map((y, idx) => {
                const r = coach.byYear[String(y)]
                return (
                  <tr key={y} style={{ backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--surface-2)', borderTop: '1px solid var(--surface-3)' }}>
                    <td className="py-2.5 px-4 text-txt-primary font-bold tabular-nums">{y}</td>
                    <td className="py-2.5 px-3 text-txt-secondary">{getNameFromTid(currentDynasty.teams, r.teamTid)}</td>
                    <td className="py-2.5 px-3 text-txt-secondary">{COACH_ROLE_LABELS[r.role] || r.role}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-txt-secondary">{r.level == null ? '—' : r.level}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-txt-secondary">{fmt(r.salary)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
