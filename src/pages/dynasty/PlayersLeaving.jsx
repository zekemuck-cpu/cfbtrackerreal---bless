import { useParams, useNavigate, Link } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getUserTeamTid } from '../../data/teamRegistry'
import { PageHero, Card, EmptyState, TitleWithYear, Badge } from '../../components/ui'

// Every departure reason a movementByYear entry can carry (see
// MOVEMENT_TYPES, src/context/DynastyContext.jsx) mapped to a short,
// human label for this list — anything unrecognized falls back to
// "Departed" rather than showing a raw enum string.
const REASON_LABEL = {
  transfer: 'Transferred',
  portal_in: 'Transferred',
  graduate: 'Graduated',
  draft: 'NFL Draft',
  departure: 'Departed',
  removed: 'Removed',
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
      return {
        pid: p.pid,
        name: p.name,
        position: p.position,
        reasonLabel: REASON_LABEL[reasonKey] || 'Departed',
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
