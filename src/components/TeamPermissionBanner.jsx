/**
 * TeamPermissionBanner — soft warning when the user is on an edit
 * surface for a team they don't manage in this dynasty.
 *
 * Multi-coach dynasties have one coach per team. If a member with
 * Alabama opens the GameEdit page for an Auburn vs LSU matchup, they
 * shouldn't be saving — that's not their data. Commish + co-commishes
 * bypass the warning since they shepherd extras for non-premium users.
 *
 * Soft, not blocking: this is a UI affordance only. The Firestore
 * rules don't gate per-team writes server-side yet (deferred), so we
 * surface the situation visually rather than silently blocking — the
 * commish use-case (managing other teams) needs to keep working.
 *
 * Pass `tids` as an array of every tid involved (e.g. team1Tid +
 * team2Tid for a game). The banner fires if NONE of them are in the
 * user's memberTeams[uid] list AND the user isn't a commish/co-commish.
 */

import { useAuth } from '../context/AuthContext'
import { useDynasty } from '../context/DynastyContext'
import { canWriteTeam, getRole, ROLE_COMMISH, ROLE_COCOMMISH, getCoachNameForUid, getCoachesForTeamYear } from '../data/leagueModel'

export default function TeamPermissionBanner({ tids = [], message = null }) {
  const { user } = useAuth()
  const { currentDynasty } = useDynasty()

  if (!user || !currentDynasty) return null
  const cleaned = (Array.isArray(tids) ? tids : [tids]).map(Number).filter(Number.isFinite)
  if (cleaned.length === 0) return null

  const role = getRole(currentDynasty, user.uid)
  // Commish + co-commishes can write any team — they're shepherds.
  if (role === ROLE_COMMISH || role === ROLE_COCOMMISH) return null
  // Non-editors don't get a warning (they can't write anything anyway).
  if (!role) return null
  // If ANY of the involved tids is one the user controls, no warning.
  if (cleaned.some(t => canWriteTeam(currentDynasty, user.uid, t))) return null

  // Identify the actual coach(es) for these tids in the current year so
  // the banner is concrete: "this is X's team" rather than "you don't manage this".
  const year = currentDynasty.currentYear
  const coachUids = new Set()
  for (const tid of cleaned) {
    for (const u of getCoachesForTeamYear(currentDynasty, tid, year)) coachUids.add(u)
  }
  const coachNames = Array.from(coachUids)
    .filter(u => u !== user.uid)
    .map(u => getCoachNameForUid(currentDynasty, u, 'another coach'))
    .filter(Boolean)

  const defaultMessage = coachNames.length > 0
    ? `Heads up — these teams belong to ${coachNames.join(', ')}. Saving here will overwrite their data.`
    : "Heads up — you don't manage these teams. Saving will write to a coach who isn't you."

  return (
    <div
      className="mb-3 px-3 py-2.5 rounded-md flex items-start gap-2 text-xs"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--accent-warning, #f59e0b) 12%, var(--surface-2))',
        border: '1px solid color-mix(in srgb, var(--accent-warning, #f59e0b) 40%, transparent)',
        color: 'var(--text-primary)',
      }}
    >
      <svg className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--accent-warning, #f59e0b)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.5 0l-7.1 12.25A2 2 0 005 19z" />
      </svg>
      <div className="leading-snug">
        {message || defaultMessage}
      </div>
    </div>
  )
}
