import { useState, useEffect, useMemo } from 'react'
import { getModalColors } from '../utils/colorUtils'
import { useToast } from './ui/Toast'

export default function RecruitingClassRankModal({
  isOpen,
  onClose,
  onSave,
  currentRank,
  teamColors
}) {
  const { toast } = useToast()
  const [rank, setRank] = useState('')
  const [saving, setSaving] = useState(false)

  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])
  const primaryBgText = 'var(--surface-1)'

  useEffect(() => {
    if (isOpen) {
      setRank(currentRank ? String(currentRank) : '')
    }
  }, [isOpen, currentRank])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSave = async () => {
    const rankNum = parseInt(rank, 10)
    if (!rank || isNaN(rankNum) || rankNum < 1 || rankNum > 134) {
      toast.error('Please enter a valid rank between 1 and 134')
      return
    }

    setSaving(true)
    try {
      await onSave(rankNum)
      onClose()
    } catch (error) {
      console.error('Failed to save recruiting class rank:', error)
      toast.error('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] p-4"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      <div
        className="rounded-xl shadow-xl w-full max-w-md border"
        style={{ backgroundColor: modalColors.background, borderColor: modalColors.border }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="p-4 rounded-t-xl flex justify-between items-center"
          style={{ backgroundColor: modalColors.headerBg }}
        >
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Recruiting Class Rank
          </h2>
          <button
            onClick={onClose}
            className="text-2xl font-bold hover:opacity-70"
            style={{ color: 'var(--text-primary)' }}
          >
            ×
          </button>
        </div>

        <div className="p-6 text-center">
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            Enter where your recruiting class ranked nationally.
          </p>

          <div className="mb-6">
            <label className="block text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
              National Rank
            </label>
            <div className="flex items-center justify-center gap-2">
              <span className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>#</span>
              <input
                type="number"
                min="1"
                max="134"
                value={rank}
                onChange={(e) => setRank(e.target.value)}
                placeholder="1-134"
                className="w-28 px-4 py-3 rounded-lg border-2 text-3xl font-bold text-center focus:outline-none"
                style={{
                  backgroundColor: modalColors.inputBg,
                  borderColor: modalColors.inputBorder,
                  color: 'var(--text-primary)'
                }}
              />
            </div>
          </div>
        </div>

        <div
          className="p-4 rounded-b-xl flex justify-center gap-3"
          style={{ borderTop: `2px solid ${modalColors.border}` }}
        >
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg font-semibold hover:opacity-80"
            style={{ backgroundColor: modalColors.inputBg, color: 'var(--text-primary)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !rank}
            className="px-5 py-2 rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: 'var(--text-primary)', color: primaryBgText }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
