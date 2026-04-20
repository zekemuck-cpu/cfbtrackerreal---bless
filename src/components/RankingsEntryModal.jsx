import { useState } from 'react'
import { teams } from '../data/teams'
import SearchableSelect from './SearchableSelect'
import { useToast } from './ui/Toast'

export default function RankingsEntryModal({ isOpen, onClose, onSave, currentYear, currentWeek }) {
  const { toast } = useToast()
  const [rankings, setRankings] = useState(
    Array.from({ length: 25 }, (_, i) => ({
      rank: i + 1,
      team: ''
    }))
  )

  const updateRanking = (index, team) => {
    const newRankings = [...rankings]
    newRankings[index].team = team
    setRankings(newRankings)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    // Filter out empty rankings
    const filledRankings = rankings.filter(r => r.team)
    if (filledRankings.length === 0) {
      toast.error('Please add at least one ranked team')
      return
    }
    onSave({
      week: currentWeek,
      year: currentYear,
      rankings: filledRankings
    })
    onClose()
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[calc(100dvh-4rem)] sm:max-h-[90dvh] overflow-y-auto"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-surface-4 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-txt-primary">
              Enter AP Top 25 Rankings
            </h2>
            <p className="text-sm text-txt-tertiary mt-1">
              Optional: Track national rankings throughout the season
            </p>
          </div>
          <button aria-label="Close"
            onClick={onClose}
            className="text-txt-muted hover:text-txt-tertiary"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid md:grid-cols-2 gap-4">
            {rankings.map((ranking, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="w-10 text-center font-bold text-txt-secondary text-sm">
                  #{ranking.rank}
                </div>
                <div className="flex-1">
                  <SearchableSelect
                    options={teams}
                    value={ranking.team}
                    onChange={(value) => updateRanking(index, value)}
                    placeholder="Select team..."
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-6 mt-6 border-t">
            <button
              type="submit"
              className="flex-1 bg-team-primary text-white px-6 py-3 rounded-lg font-semibold hover:bg-team-primary transition-colors"
            >
              Save Rankings
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 border border-surface-4 rounded-lg font-semibold hover:bg-surface-2 transition-colors"
            >
              Skip
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
