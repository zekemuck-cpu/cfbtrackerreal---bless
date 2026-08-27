import { useParams, useNavigate, Link } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getUserTeamTid } from '../../data/teamRegistry'
import { PageHero, Card, EmptyState, TitleWithYear, Badge } from '../../components/ui'

// Every departure reason a movementByYear entry can carry, across BOTH the
// legacy top-level `type` vocabulary (MOVEMENT_TYPES, DynastyContext.jsx)
// and the newer `departure` sub-key vocabulary a v2 entry actually uses
// (see getPlayersNeedingClassConfirmation's v2DepartureTypesYr/
// v2DepartureShapesYr, same file) — this list previously only covered the
// legacy set, so every CFB27-synced departure (which always writes
// `departure: 'transfer_out'|'graduated'|'pro_draft'`, never the legacy
// `type` values) fell through to the generic "Departed" fallback below,
// regardless of the real reason. Anything still unrecognized falls back to
// "Departed" rather than showing a raw enum string.
const REASON_LABEL = {
  // Legacy `type` values
  transfer: 'Transferred',
  portal_in: 'Transferred',
  graduate: 'Graduated',
  draft: 'NFL Draft',
  departure: 'Departed',
  removed: 'Removed',
  // v2 `departure` sub-key values
  transfer_out: 'Transferred',
  entered_portal: 'Transferred',
  transferred_out: 'Transferred',
  graduated: 'Graduated',
  pro_draft: 'NFL Draft',
  declared_for_draft: 'NFL Draft',
}

export default function PlayersLeaving() {
  const { year: urlYear } = useParams()
  const navigate = useNavigate()
  const { currentDynasty } = useDynasty()
  const pathPrefix = usePathPrefix()

  if (!currentDynasty) return null

  const startYear = currentDynasty.startYear || currentDynasty.currentYear
  const availableYears = []
  for (let y = currentDynasty.currentYear; y >= startYear + 1; y--) availableYears.push(y)
  const displayYear = urlYear ? parseInt(urlYear, 10) : currentDynasty.currentYear
  const handleYearChange = (y) => navigate(`${pathPrefix}/players-leaving/${y}`)

  const userTid = getUserTeamTid(currentDynasty)
  const prevYear = displayYear - 1

  // "Left the team" = was on our roster last year, isn't this year — same
  // definition the user asked for, regardless of where they ended up
  // (another team, the draft, graduated, or just cut).
  const leavers = (currentDynasty.players || [])
    .filter((p) => {
      const wasHere = Number(p.teamsByYear?.[prevYear]) === Number(userTid)
      const isHereNow = Number(p.teamsByYear?.[displayYear]) === Number(userTid)
      return wasHere && !isHereNow
    })
    .map((p) => {
      const movement = p.movementByYear?.[displayYear]
      const reasonKey = movement?.departure || movement?.type
      // PC-synced transfers carry the save's own real sub-reason (e.g. "Pro
      // Potential", "Brand Exposure" — see cfb27SaveSync.js's
      // reconcilePlayers/LEAVE_TYPE_MAP) — shown alongside the broad label
      // instead of just "Transferred" when it's available.
      const baseLabel = REASON_LABEL[reasonKey] || 'Departed'
      const reasonLabel = movement?.departureReason ? `${baseLabel} — ${movement.departureReason}` : baseLabel
      return {
        pid: p.pid,
        name: p.name,
        position: p.position,
        reasonLabel,
        newTeamTid: p.teamsByYear?.[displayYear] ?? null,
      }
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  return (
    <div className="space-y-6">
      <PageHero
        title={<TitleWithYear year={displayYear} years={availableYears} onChange={handleYearChange} label="Players Leaving" />}
      />

      {leavers.length === 0 ? (
        <Card>
          <EmptyState title="No Players Leaving" subtitle={`Everyone on the ${prevYear} roster is still on the team.`} />
        </Card>
      ) : (
        <Card padding="none">
          <div className="divide-y" style={{ borderColor: 'var(--surface-4)' }}>
            {leavers.map((p) => (
              <div key={p.pid} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <Link to={`${pathPrefix}/player/${p.pid}`} className="font-semibold text-txt-primary hover:underline">
                    {p.name || 'Unknown'}
                  </Link>
                  <span className="ml-2 text-xs text-txt-tertiary uppercase">{p.position}</span>
                </div>
                <Badge variant="outline">{p.reasonLabel}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
