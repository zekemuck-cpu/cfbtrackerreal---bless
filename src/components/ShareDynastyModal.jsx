import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { generateShareCode } from '../services/dynastyService'
import { getModalColors } from '../utils/colorUtils'
import { useToast } from './ui/Toast'

export default function ShareDynastyModal({ isOpen, onClose, teamColors, dynasty: dynastyProp }) {
  const { currentDynasty: contextDynasty, updateDynasty } = useDynasty()
  const { toast } = useToast()
  const { isPremium } = useAuth()
  // Use prop dynasty if provided (from Home page), otherwise use context dynasty (from Sidebar)
  const dynasty = dynastyProp || contextDynasty
  const [isPublic, setIsPublic] = useState(false)
  const [shareCode, setShareCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)

  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])

  useEffect(() => {
    if (dynasty) {
      setIsPublic(dynasty.isPublic || false)
      setShareCode(dynasty.shareCode || '')
    }
  }, [dynasty])

  const handleToggleSharing = async () => {
    if (!dynasty) return

    // Belt-and-suspenders gate: the Sidebar entry already blocks non-
    // premium users from opening the modal, but we re-check here so
    // any other entry point (deep link, programmatic open) can't bypass.
    // Server-side, Firestore rules require premium to update isPublic
    // on cloud dynasties anyway.
    if (!isPremium && !isPublic) {
      toast.info('Sharing dynasties is a Premium feature.')
      return
    }

    setLoading(true)
    try {
      const newIsPublic = !isPublic

      // If enabling sharing for the first time, generate a share code
      let newShareCode = shareCode
      if (newIsPublic && !shareCode) {
        newShareCode = generateShareCode()
      }

      await updateDynasty(dynasty.id, {
        isPublic: newIsPublic,
        shareCode: newShareCode
      })

      setIsPublic(newIsPublic)
      setShareCode(newShareCode)
    } catch (error) {
      console.error('Error toggling sharing:', error)
      toast.error('Failed to update sharing settings')
    } finally {
      setLoading(false)
    }
  }

  const shareUrl = shareCode ? `${window.location.origin}/view/${shareCode}` : ''

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useBodyScrollLock(isOpen)
  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] p-4"
      style={{ margin: 0 }}
      onClick={onClose}
    >
      <div
        className="rounded-xl shadow-2xl w-full max-w-md overflow-hidden border"
        style={{ backgroundColor: modalColors.background, borderColor: modalColors.border }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ backgroundColor: modalColors.headerBg }}
        >
          <h2 className="text-xl font-bold" style={{ color: modalColors.text }}>
            Share Dynasty
          </h2>
          <button aria-label="Close"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10"
            style={{ color: modalColors.text }}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="mb-6" style={{ color: modalColors.textMuted }}>
            Share your dynasty with viewers! They'll be able to see your schedule, roster, stats, and more in read-only mode.
          </p>

          {/* Toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg mb-6" style={{ backgroundColor: modalColors.inputBg }}>
            <div>
              <div className="font-semibold" style={{ color: modalColors.text }}>
                Public Sharing
              </div>
              <div className="text-sm" style={{ color: modalColors.textMuted }}>
                {isPublic ? 'Anyone with the link can view' : 'Only you can access this dynasty'}
              </div>
            </div>
            <button
              onClick={handleToggleSharing}
              disabled={loading}
              className={`relative w-14 h-8 rounded-full transition-colors ${
                loading ? 'opacity-50' : ''
              }`}
              style={{
                backgroundColor: isPublic ? modalColors.accent : '#374151'
              }}
            >
              <div
                className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                  isPublic ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Share Link */}
          {isPublic && shareCode && (
            <div className="space-y-3">
              <label className="block text-sm font-medium" style={{ color: modalColors.text }}>
                Share Link
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={shareUrl}
                  readOnly
                  className="flex-1 px-4 py-3 rounded-lg text-sm font-mono"
                  style={{ backgroundColor: modalColors.inputBg, color: modalColors.text }}
                />
                <button
                  onClick={handleCopyLink}
                  className="px-4 py-3 rounded-lg font-semibold transition-all text-white"
                  style={{
                    backgroundColor: copied ? '#22c55e' : modalColors.accent
                  }}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-sm" style={{ color: modalColors.textMuted }}>
                Viewers will see your dynasty data but cannot make any changes.
              </p>
            </div>
          )}

          {/* Info for YouTubers */}
          <div className="mt-6 p-4 rounded-lg border-2 border-dashed" style={{ borderColor: modalColors.accent }}>
            <div className="flex items-start gap-3">
              <span className="text-2xl">🎥</span>
              <div>
                <div className="font-semibold mb-1" style={{ color: modalColors.text }}>
                  Perfect for Content Creators
                </div>
                <div className="text-sm" style={{ color: modalColors.textMuted }}>
                  Put this link in your video descriptions so viewers can follow along with your dynasty series!
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  ,
  document.body
  )
}
