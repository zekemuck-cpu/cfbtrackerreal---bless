import { useState, useEffect, useMemo } from 'react'
import { useDynasty } from '../context/DynastyContext'
import { getModalColors } from '../utils/colorUtils'
import { useToast } from './ui/Toast'

export default function CoachingStaffModal({ isOpen, onClose, onSave, teamColors, currentStaff }) {
  const { currentDynasty } = useDynasty()
  const { toast } = useToast()
  const userPosition = currentDynasty?.coachPosition || 'HC'
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])

  const showHC = userPosition !== 'HC'
  const showOC = userPosition !== 'OC'
  const showDC = userPosition !== 'DC'

  const [hcName, setHcName] = useState('')
  const [ocName, setOcName] = useState('')
  const [dcName, setDcName] = useState('')

  useEffect(() => {
    if (isOpen && currentStaff) {
      setHcName(currentStaff.hcName || '')
      setOcName(currentStaff.ocName || '')
      setDcName(currentStaff.dcName || '')
    }
  }, [isOpen, currentStaff])

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
    if (showHC && !hcName.trim()) {
      toast.error('Please enter the Head Coach name')
      return
    }
    if (showOC && !ocName.trim()) {
      toast.error('Please enter the Offensive Coordinator name')
      return
    }
    if (showDC && !dcName.trim()) {
      toast.error('Please enter the Defensive Coordinator name')
      return
    }

    onSave({
      hcName: showHC ? hcName.trim() : null,
      ocName: showOC ? ocName.trim() : null,
      dcName: showDC ? dcName.trim() : null
    })

    onClose()
  }

  if (!isOpen) return null

  const getPositionLabel = () => {
    switch (userPosition) {
      case 'HC':
        return 'As the Head Coach, enter your coordinators:'
      case 'OC':
        return 'As the Offensive Coordinator, enter your colleagues:'
      case 'DC':
        return 'As the Defensive Coordinator, enter your colleagues:'
      default:
        return 'Enter your coaching staff:'
    }
  }

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      <div
        className="rounded-xl border shadow-xl w-full max-w-md max-h-[calc(100dvh-4rem)] sm:max-h-[90dvh] overflow-y-auto p-4 sm:p-6"
        style={{ backgroundColor: modalColors.background, borderColor: modalColors.border }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold" style={{ color: modalColors.text }}>
            Coaching Staff
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

        <p className="text-sm mb-6" style={{ color: modalColors.textMuted }}>
          {getPositionLabel()}
        </p>

        <div className="space-y-4">
          {showHC && (
            <div>
              <label className="block text-sm font-semibold mb-2" style={{ color: modalColors.text }}>
                Head Coach (HC)
              </label>
              <input
                type="text"
                value={hcName}
                onChange={(e) => setHcName(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border-2 text-lg"
                style={{
                  borderColor: modalColors.inputBorder,
                  backgroundColor: modalColors.inputBg,
                  color: modalColors.text
                }}
                placeholder="Coach Name"
              />
            </div>
          )}

          {showOC && (
            <div>
              <label className="block text-sm font-semibold mb-2" style={{ color: modalColors.text }}>
                Offensive Coordinator (OC)
              </label>
              <input
                type="text"
                value={ocName}
                onChange={(e) => setOcName(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border-2 text-lg"
                style={{
                  borderColor: modalColors.inputBorder,
                  backgroundColor: modalColors.inputBg,
                  color: modalColors.text
                }}
                placeholder="Coach Name"
              />
            </div>
          )}

          {showDC && (
            <div>
              <label className="block text-sm font-semibold mb-2" style={{ color: modalColors.text }}>
                Defensive Coordinator (DC)
              </label>
              <input
                type="text"
                value={dcName}
                onChange={(e) => setDcName(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border-2 text-lg"
                style={{
                  borderColor: modalColors.inputBorder,
                  backgroundColor: modalColors.inputBg,
                  color: modalColors.text
                }}
                placeholder="Coach Name"
              />
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg font-semibold border-2 hover:opacity-90 transition-colors"
            style={{
              borderColor: modalColors.inputBorder,
              color: modalColors.text,
              backgroundColor: modalColors.inputBg
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors"
            style={{
              backgroundColor: modalColors.accent,
              color: modalColors.text
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
