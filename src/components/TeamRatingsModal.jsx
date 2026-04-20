import { useState, useEffect, useMemo } from 'react'
import { getModalColors } from '../utils/colorUtils'
import { useToast } from './ui/Toast'

export default function TeamRatingsModal({ isOpen, onClose, onSave, teamColors, currentRatings }) {
  const { toast } = useToast()
  const [overall, setOverall] = useState('')
  const [offense, setOffense] = useState('')
  const [defense, setDefense] = useState('')

  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])

  // Limit input to 2 digits (40-99)
  const handleRatingChange = (value, setter) => {
    // Remove non-digits and limit to 2 characters
    const digits = value.replace(/\D/g, '').slice(0, 2)
    setter(digits)
  }

  // Clamp value to 40-99 range on blur
  const handleBlur = (value, setter) => {
    if (!value) return
    const num = parseInt(value)
    if (isNaN(num)) return
    if (num < 40) setter('40')
    else if (num > 99) setter('99')
  }

  // Load current ratings when modal opens
  useEffect(() => {
    if (isOpen && currentRatings) {
      setOverall(currentRatings.overall || '')
      setOffense(currentRatings.offense || '')
      setDefense(currentRatings.defense || '')
    }
  }, [isOpen, currentRatings])

  // Prevent body scroll when modal is open
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

  const handleSave = () => {
    if (!overall || !offense || !defense) {
      toast.error('Please enter all three ratings (Overall, Offense, Defense)')
      return
    }

    const overallNum = parseInt(overall)
    const offenseNum = parseInt(offense)
    const defenseNum = parseInt(defense)

    if (isNaN(overallNum) || isNaN(offenseNum) || isNaN(defenseNum)) {
      toast.error('Ratings must be numbers')
      return
    }

    if (overallNum < 40 || overallNum > 99 || offenseNum < 40 || offenseNum > 99 || defenseNum < 40 || defenseNum > 99) {
      toast.error('Ratings must be between 40 and 99')
      return
    }

    onSave({
      overall: overallNum,
      offense: offenseNum,
      defense: defenseNum
    })

    onClose()
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      <div
        className="rounded-xl shadow-xl w-full max-w-md max-h-[calc(100dvh-4rem)] sm:max-h-[90dvh] overflow-y-auto p-4 sm:p-6 border"
        style={{ backgroundColor: modalColors.background, borderColor: modalColors.border }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold" style={{ color: modalColors.text }}>
            Team Ratings
          </h2>
          <button aria-label="Close"
            onClick={onClose}
            className="hover:opacity-70"
            style={{ color: modalColors.text }}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-2" style={{ color: modalColors.textMuted }}>
              Overall Rating (40-99)
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={overall}
              onChange={(e) => handleRatingChange(e.target.value, setOverall)}
              onBlur={() => handleBlur(overall, setOverall)}
              className="w-full px-4 py-2 rounded-lg border text-lg font-semibold text-center"
              style={{
                borderColor: modalColors.inputBorder,
                backgroundColor: modalColors.inputBg,
                color: modalColors.text
              }}
              placeholder="85"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2" style={{ color: modalColors.textMuted }}>
              Offense Rating (40-99)
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={offense}
              onChange={(e) => handleRatingChange(e.target.value, setOffense)}
              onBlur={() => handleBlur(offense, setOffense)}
              className="w-full px-4 py-2 rounded-lg border text-lg font-semibold text-center"
              style={{
                borderColor: modalColors.inputBorder,
                backgroundColor: modalColors.inputBg,
                color: modalColors.text
              }}
              placeholder="87"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2" style={{ color: modalColors.textMuted }}>
              Defense Rating (40-99)
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={defense}
              onChange={(e) => handleRatingChange(e.target.value, setDefense)}
              onBlur={() => handleBlur(defense, setDefense)}
              className="w-full px-4 py-2 rounded-lg border text-lg font-semibold text-center"
              style={{
                borderColor: modalColors.inputBorder,
                backgroundColor: modalColors.inputBg,
                color: modalColors.text
              }}
              placeholder="83"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg font-semibold bg-surface-3 hover:bg-surface-4 text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors text-white"
            style={{
              backgroundColor: modalColors.accent
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
