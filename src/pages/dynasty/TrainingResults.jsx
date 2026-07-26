import { useParams, useNavigate, Link } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getUserTeamTid } from '../../data/teamRegistry'
import { PageHero, Card, EmptyState, TitleWithYear } from '../../components/ui'

// Roster-wide overall-progression view — CFB27 sync already fills in
// overallByYear for every year (see cfb27SaveSync.js), so unlike the manual
// Training Results modal (per-player OCR entry), this just reads and diffs
// data that's already there. Modeled on OverallProgressionModal.jsx's
// per-player year-over-year diff, applied across the whole roster instead
// of one player at a time.
export default function TrainingResults() {
  const { year: urlYear } = useParams()
  const navigate = useNavigate()
  const { currentDynasty } = useDynasty()
  const pathPrefix = usePathPrefix()

  if (!currentDynasty) return null

  const startYear = currentDynasty.startYear || currentDynasty.currentYear
  const availableYears = []
  for (let y = currentDynasty.currentYear; y >= startYear + 1; y--) availableYears.push(y)
  const displayYear = urlYear ? parseInt(urlYear, 10) : currentDynasty.currentYear
  const handleYearChange = (y) => navigate(`${pathPrefix}/training-results/${y}`)

  const userTid = getUserTeamTid(currentDynasty)
  const prevYear = displayYear - 1

  const progressions = (currentDynasty.players || [])
    .filter((p) => Number(p.teamsByYear?.[displayYear]) === Number(userTid))
    .map((p) => {
      const prevOvr = p.overallByYear?.[prevYear]
      const curOvr = p.overallByYear?.[displayYear]
      if (prevOvr == null || curOvr == null) return null
      return {
        pid: p.pid,
        name: p.name,
        position: p.position,
        prevOvr,
        curOvr,
        delta: curOvr - prevOvr,
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.delta - a.delta)

  return (
    <div className="space-y-6">
      <PageHero
        title={<TitleWithYear year={displayYear} years={availableYears} onChange={handleYearChange} label="Training Results" />}
      />

      {progressions.length === 0 ? (
        <Card>
          <EmptyState title="No Training Data Yet" subtitle={`Overall ratings for both ${prevYear} and ${displayYear} haven't synced for this roster yet.`} />
        </Card>
      ) : (
        <Card padding="none">
          <div className="hidden md:flex items-center gap-3 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-txt-tertiary" style={{ borderBottom: '1px solid var(--surface-4)' }}>
            <span className="flex-1">Player</span>
            <span className="w-12 text-right">{prevYear}</span>
            <span className="w-12 text-right">{displayYear}</span>
            <span className="w-16 text-right">Change</span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--surface-4)' }}>
            {progressions.map((p) => (
              <div key={p.pid} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <Link to={`${pathPrefix}/player/${p.pid}`} className="font-semibold text-txt-primary hover:underline">
                    {p.name || 'Unknown'}
                  </Link>
                  <span className="ml-2 text-xs text-txt-tertiary uppercase">{p.position}</span>
                </div>
                <span className="w-12 text-right tabular-nums text-txt-tertiary">{p.prevOvr}</span>
                <span className="w-12 text-right tabular-nums text-txt-primary font-semibold">{p.curOvr}</span>
                <span
                  className="w-16 text-right tabular-nums font-bold"
                  style={{ color: p.delta > 0 ? 'var(--accent-success)' : p.delta < 0 ? 'var(--accent-error)' : 'var(--text-tertiary)' }}
                >
                  {p.delta > 0 ? '+' : ''}{p.delta}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
