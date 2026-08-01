import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { generateShareCode } from '../services/dynastyService'
import { useToast } from './ui/Toast'

// Neutral, team-agnostic modal palette. This dialog is a generic "view-only
// link" utility, so it intentionally does NOT theme to the user's team color.
const modalColors = {
  background: '#1a1a2e',
  headerBg: '#232338',
  text: '#ffffff',
  textMuted: '#9ca3af',
  accent: '#3b82f6',
  border: 'rgba(255,255,255,0.12)',
  inputBg: 'rgba(0,0,0,0.25)',
}

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

  // Share links resolve against Firestore, so only cloud-stored dynasties
  // can be shared. A local (IndexedDB) dynasty would happily accept the
  // isPublic/shareCode toggle — updateDynasty routes it to IndexedDB —
  // and hand out a /view/<code> link that always shows "Dynasty Not
  // Available" for everyone else. Gate on storageType, not premium.
  const isCloudDynasty = dynasty?.storageType === 'cloud'

  useEffect(() => {
    if (dynasty) {
      setIsPublic(dynasty.isPublic || false)
      setShareCode(dynasty.shareCode || '')
    }
  }, [dynasty])

  const handleToggleSharing = async () => {
    if (!dynasty) return

    if (!isCloudDynasty) {
      toast.info('Switch this dynasty to Cloud storage before sharing it.')
      return
    }

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

  // Regenerate the view-only link. Mints a fresh share code and (re)asserts
  // isPublic so a stale/broken link — e.g. one shared before sharing was
  // actually enabled, or a code that never got persisted to Firestore — can
  // be replaced without hunting through settings. This ONLY writes the two
  // sharing fields (isPublic, shareCode); it never touches players, games,
  // rosters, or any other dynasty data, so the actual save file is untouched.
  // The old code stops resolving immediately (anyone holding it gets the
  // "Dynasty Not Available" page), which is the intended "reset the link"
  // behavior.
  const handleRegenerateLink = async () => {
    if (!dynasty) return

    if (!isCloudDynasty) {
      toast.info('Switch this dynasty to Cloud storage before sharing it.')
      return
    }

    if (!isPremium) {
      toast.info('Sharing dynasties is a Premium feature.')
      return
    }

    setLoading(true)
    try {
      const newShareCode = generateShareCode()

      // Only the sharing fields — no players/games/seasonal payload, so
      // updateDynasty writes just these keys to the main doc and leaves
      // every subcollection alone.
      await updateDynasty(dynasty.id, {
        isPublic: true,
        shareCode: newShareCode
      })

      setIsPublic(true)
      setShareCode(newShareCode)
      setCopied(false)
      toast.success('New view-only link generated')
    } catch (error) {
      console.error('Error regenerating share link:', error)
      toast.error('Failed to regenerate link')
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

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] p-4"
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
          {/* Local dynasties can't be shared — the link would resolve against
              Firestore and come back "Dynasty Not Available" for every viewer.
              Explain how to move to the cloud instead of offering a dead toggle. */}
          {!isCloudDynasty && (
            <div className="p-4 rounded-lg mb-6" style={{ backgroundColor: modalColors.inputBg }}>
              <div className="font-semibold mb-1" style={{ color: modalColors.text }}>
                Cloud Storage Required
              </div>
              <div className="text-sm" style={{ color: modalColors.textMuted }}>
                This dynasty is stored locally on this device, so a share link
                wouldn't work for anyone else. To share it, go to the Home page,
                tap the &quot;Local&quot; badge on this dynasty's card, and switch it to
                Cloud storage. Then come back here to turn on sharing.
              </div>
            </div>
          )}

          {/* Toggle */}
          {isCloudDynasty && (
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
          )}

          {/* Share Link */}
          {isCloudDynasty && isPublic && shareCode && (
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

              {/* Regenerate — replaces a stale/broken link with a fresh code.
                  Only rewrites the sharing fields, never the dynasty save. */}
              <div className="pt-1">
                <button
                  onClick={handleRegenerateLink}
                  disabled={loading}
                  className={`text-sm font-medium underline transition-opacity ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80'}`}
                  style={{ color: modalColors.accent }}
                >
                  {loading ? 'Regenerating…' : 'Regenerate link'}
                </button>
                <p className="text-xs mt-1" style={{ color: modalColors.textMuted }}>
                  Not working for viewers? Generate a fresh link. The old link
                  will stop working. This only changes the view-only link — your
                  dynasty data is untouched.
                </p>
              </div>
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
