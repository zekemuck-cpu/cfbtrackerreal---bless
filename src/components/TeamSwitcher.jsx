/**
 * TeamSwitcher — fixed bottom-right floating switcher for users who run
 * MULTIPLE coaches in the current dynasty (each coach controls one team).
 *
 * It switches the active COACH: the chip shows the active coach's NAME with
 * their current team's logo, and the dropdown lists each coach the user
 * controls (by name). Selecting one re-points `setActiveTeam` to that coach's
 * current team, so every consumer (currentTid override, team pages) follows.
 *
 * Hidden when the user controls fewer than 2 coaches with a current team
 * (nothing to switch).
 */

import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { getTeamLogoByTid } from '../data/teams'
import { getCoachesControlledBy, getCurrentTeamTidForCoach } from '../data/coachModel'

export default function TeamSwitcher() {
  const { currentDynasty, activeUserTid, setActiveTeam } = useDynasty()
  const { user } = useAuth()
  if (!currentDynasty || !user?.uid) return null

  const teamsSource = currentDynasty.teams || {}

  // The coaches this user controls that have a team this season, paired with
  // that team's tid. One coach per team, so tid → coach is unambiguous.
  const seen = new Set()
  const coaches = getCoachesControlledBy(currentDynasty, user.uid)
    .map(coach => ({ coach, tid: getCurrentTeamTidForCoach(coach, currentDynasty.currentYear) }))
    .filter(({ tid }) => {
      if (tid == null || seen.has(Number(tid))) return false
      seen.add(Number(tid))
      return true
    })

  if (coaches.length < 2) return null

  const active = coaches.find(c => Number(c.tid) === Number(activeUserTid)) || coaches[0]
  const activeLogo = active?.tid != null ? getTeamLogoByTid(active.tid, teamsSource) : null
  const activeName = active?.coach?.name || 'Coach'

  return (
    <div
      className="fixed z-40 select-none"
      style={{
        right: '1rem',
        // Sit above the news ticker (~48px tall + safe-area).
        bottom: 'calc(56px + env(safe-area-inset-bottom, 0px) + 0.5rem)',
      }}
    >
      <label className="relative flex items-center gap-2 pl-2 pr-1 py-1.5 rounded-lg bg-surface-2 border border-surface-4 shadow-lg hover:bg-surface-3 transition-colors cursor-pointer">
        {activeLogo && (
          <img src={activeLogo} alt="" className="w-5 h-5 object-contain flex-shrink-0" />
        )}
        <span className="text-xs font-semibold text-txt-primary truncate max-w-[160px]">
          {activeName}
        </span>
        <svg className="w-4 h-4 text-txt-tertiary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        {/* The native select overlays the whole chip invisibly — it still
            opens the dropdown on tap, but doesn't render its selected
            option text (so the coach name above isn't shown twice). */}
        <select
          value={active?.coach?.cid ?? ''}
          onChange={e => {
            const pick = coaches.find(c => c.coach.cid === e.target.value)
            const tid = Number(pick?.tid)
            if (Number.isFinite(tid)) setActiveTeam(tid)
          }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          aria-label="Switch active coach"
        >
          {coaches.map(({ coach }) => (
            <option key={coach.cid} value={coach.cid}>
              {coach.name || 'Coach'}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
