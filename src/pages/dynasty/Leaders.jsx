import { useDynasty } from '../../context/DynastyContext'
import { Card, EmptyState, PageHero } from '../../components/ui'

export default function Leaders() {
  const { currentDynasty } = useDynasty()

  if (!currentDynasty) return null

  return (
    <div className="space-y-6">
      <PageHero eyebrow="Leaderboard" title="Leaders" />
      <Card>
        <EmptyState
          title="Coming Soon"
          message="Statistical leaders and analytics are being developed."
        />
      </Card>
    </div>
  )
}
