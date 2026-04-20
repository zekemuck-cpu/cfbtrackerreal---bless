import { useDynasty } from '../../context/DynastyContext'
import { Card, EmptyState, PageHero } from '../../components/ui'

export default function AllTimeLineup() {
  const { currentDynasty } = useDynasty()

  if (!currentDynasty) return null

  return (
    <div className="space-y-6">
      <PageHero eyebrow="Career" title="All-Time Lineup" />
      <Card>
        <EmptyState
          title="All-Time Lineup Coming Soon"
          message="See the best players at each position across your entire coaching career."
        />
      </Card>
    </div>
  )
}
