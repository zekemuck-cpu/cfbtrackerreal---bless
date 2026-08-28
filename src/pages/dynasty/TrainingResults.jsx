import { useParams, useNavigate, Link } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getUserTeamTid } from '../../data/teamRegistry'
import { PageHero, Card, EmptyState, TitleWithYear } from '../../components/ui'

// Week-over-week overall progression for the user's own roster, comparing
// each player's overall as of RIGHT BEFORE training camp (National Signing
// Day, offseason week 6) to right after (Training Results, week 7) — NOT a
// year-over-year comparison. overallByYear only ever holds one value per
// YEAR, overwritten by every sync, so the "before" side can't be read back
// out of it once week 7's own sync has run — dynasty.overallBeforeTrainingByYear
// is a snapshot captured once, at the exact sync that first reaches week 7
// (see syncDynastyFromCFB27Save in DynastyContext.jsx), specifically to
// preserve that value.
export default function TrainingResults() {
  const { year: urlYear } = useParams()
  const navigate = useNavigate()
  const { currentDynasty } = useDynasty()
  const pathPrefix = usePathPrefix()

  if (!currentDynasty) return null

  const startYear = currentDynasty.startYear || currentDynasty.currentYear
  const availableYears = []
  for (let y = currentDynasty.currentYear; y >= startYear; y--) availableYears.push(y)
  const displayYear = urlYear ? parseInt(urlYear, 10) : currentDynasty.currentYear
  const handleYearChange = (y) => navigate(`${pathPrefix}/training-results/${y}`)

  const userTid = getUserTeamTid(currentDynasty)
  const beforeSnapshot = currentDynasty.overallBeforeTrainingByYear?.[displayYear] || null

  const progressions = (currentDynasty.players || [])
    .filter((p) => Number(p.teamsByYear?.[displayYear]) === Number(userTid))
    .map((p) => {
      const curOvr = p.overallByYear?.[displayYear]
      const prevOvr = beforeSnapshot?.[p.pid]
      if (curOvr == null || prevOvr == null) return null
      return {
        pid: p.pid,
        name: p.name,
        position: p.position,
        classYear: p.classByYear?.[displayYear] || p.year || '',
        curOvr,
        delta: curOvr - prevOvr,
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.curOvr - a.curOvr)

  return (
    <div className="space-y-6">
      <PageHero
        title={<TitleWithYear year={displayYear} years={availableYears} onChange={handleYearChange} label="Training Results" />}
      />

      {progressions.length === 0 ? (
        <Card>
          <EmptyState title="No Training Data Yet" subtitle={`Training results for ${displayYear} haven't synced for this roster yet.`} />
        </Card>
      ) : (
        <Card padding="none">
          <div className="hidden md:flex items-center gap-3 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-txt-tertiary" style={{ borderBottom: '1px solid var(--surface-4)' }}>
            <span className="flex-1">Player</span>
            <span className="w-12 text-center">Year</span>
            <span className="w-14 text-center">Pos</span>
            <span className="w-24 text-right">Overall</span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--surface-4)' }}>
            {progressions.map((p) => (
              <div key={p.pid} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <Link to={`${pathPrefix}/player/${p.pid}`} className="font-semibold text-txt-primary hover:underline">
                    {p.name || 'Unknown'}
                  </Link>
                </div>
                <span className="w-12 text-center text-xs text-txt-tertiary uppercase">{p.classYear}</span>
                <span className="w-14 text-center text-xs text-txt-tertiary uppercase">{p.position}</span>
                <span className="w-24 text-right tabular-nums font-bold text-txt-primary">
                  {p.curOvr}{p.delta > 0 ? ` (+${p.delta})` : ''}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
