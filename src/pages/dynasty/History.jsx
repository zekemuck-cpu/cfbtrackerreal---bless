import { useDynasty } from '../../context/DynastyContext'
import { useTeamColors } from '../../hooks/useTeamColors'

export default function History() {
  const { currentDynasty } = useDynasty()
  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.teams || currentDynasty?.customTeams)

  if (!currentDynasty) return null

  return (
    <div className="space-y-6">
      <div
        className="card overflow-hidden"
      >
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-6 text-txt-primary">
            Dynasty History
          </h2>

          <div className="text-center py-12">
            <div className="mb-4 text-txt-tertiary">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium mb-2 text-txt-primary">
              History Coming Soon
            </h3>
            <p className="text-txt-secondary">
              View past seasons, records, and achievements here.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
