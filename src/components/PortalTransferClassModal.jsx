import { useState, useEffect, useRef, useMemo } from 'react'
import { useDynasty, isPlayerOnRoster } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import AuthErrorModal from './AuthErrorModal'
import AIPromptModal from './AIPromptModal'
import {
  createPortalTransferClassSheet,
  readPortalTransferClassFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl,
  sheetExists
} from '../services/sheetsService'
import { getModalColors } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function PortalTransferClassModal({ isOpen, onClose, onSave, currentYear, teamColors, portalTransfers }) {
  const { currentDynasty, updateDynasty } = useDynasty()
  const { user } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const [showAuthError, setShowAuthError] = useState(false)
  const [useEmbedded, setUseEmbedded] = useState(() => {
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [showAIPrompt, setShowAIPrompt] = useState(false)

  const userRoster = useMemo(() => {
    const teamAbbrForRoster =
      currentDynasty?.teams?.[currentDynasty?.currentTid]?.abbr ||
      currentDynasty?.teamName
    const all = currentDynasty?.players || []
    return all
      .filter(p => isPlayerOnRoster(p, teamAbbrForRoster, currentYear))
      .map(p => ({ name: p.name, jerseyNumber: p.jerseyNumber, position: p.position }))
  }, [currentDynasty?.players, currentDynasty?.teams, currentDynasty?.currentTid, currentDynasty?.teamName, currentYear])

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Portal Transfer Class Assignment`,
    roster: userRoster,
    structure: `This sheet has ONE tab: "Portal Transfers". It has 4 columns total: A = Player, B = Position, C = "${currentYear} Recruitment Class", D = "Updated ${currentYear + 1} Class". Row 1 is the protected header row. Columns A, B, C are PRE-FILLED from dynasty data and PROTECTED — do NOT output them. Column D is the only editable column and uses PER-ROW dropdowns whose allowed values depend on each player's current (column C) class.

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output ONLY column D. NEVER output columns A, B, C, or the header row.
2. Output format is a SINGLE column of values — one value per line — NO tabs, NO extra columns.
3. Row order must match the pre-filled player rows EXACTLY from top to bottom as shown in the screenshot. If the sheet shows N pre-filled players, output EXACTLY N lines (blank lines allowed only when unsure).
4. Each row's allowed dropdown values are STRICTLY determined by that row's Column C value (the player's incoming ${currentYear} class). You MUST pick one of the allowed values for that row — values from another row's allowed set will be rejected.
5. Use the EXACT literal strings shown below (case + single space between "RS" and letters). No "RSFr", no "Rs Fr", no "RS-Fr".
6. BLANK LINE if truly unsure for a given player — do NOT guess. A blank line is better than a wrong value that the dropdown rejects.
7. No header row, no commentary, no totals, no explanation.

═══════════════════════════════════════════════════════════
TAB: "Portal Transfers" — paste at cell D2 of the "Portal Transfers" tab
═══════════════════════════════════════════════════════════

Column layout:

Col | Header (row 1, protected)              | Pre-filled / protected?           | Your value
----+----------------------------------------+-----------------------------------+-----------------------------------
 A  | Player                                 | Pre-filled — PROTECTED            | DO NOT OUTPUT
 B  | Position                               | Pre-filled — PROTECTED            | DO NOT OUTPUT
 C  | ${currentYear} Recruitment Class                   | Pre-filled — PROTECTED            | DO NOT OUTPUT
 D  | Updated ${currentYear + 1} Class                       | Empty — EDITABLE dropdown (per-row) | Exactly one allowed value, or BLANK

───────────────────────────────────────────────────────────
COLUMN D — Per-row allowed values (depends on the row's Column C "${currentYear} Recruitment Class"):

If Column C = "Fr"    → allowed values: "RS Fr" | "So" | "RS So"
If Column C = "So"    → allowed values: "RS So" | "Jr" | "RS Jr"
If Column C = "Jr"    → allowed values: "RS Jr" | "Sr" | "RS Sr"
If Column C = "Sr"    → allowed values: "RS Sr"  (only one option — last year of eligibility under redshirt)
If Column C = "RS Fr" → allowed values: "So" | "RS So"
If Column C = "RS So" → allowed values: "Jr" | "RS Jr"
If Column C = "RS Jr" → allowed values: "Sr" | "RS Sr"
If Column C = "RS Sr" → BLANK only (no eligibility left)
(If Column C is anything outside the list above, fall back to the Fr set: "RS Fr" | "So" | "RS So".)

Selection guidance:
- Use the RS (redshirt) variant when the player likely used a redshirt at their previous school (e.g. played 4 or fewer regular-season games, or other redshirt indicators on the screenshot). Example: Fr who redshirted → "RS Fr".
- Use the progressed non-RS class when the player burned their redshirt already. Example: Fr who played a full season → "So".
- Use the progressed RS variant (e.g. "RS So" for an Fr) when the player progressed a year AND used a redshirt — this is rare; only pick it with clear evidence.
- LITERAL case matters: "RS Fr" with one space. NOT "Rs Fr", NOT "RSFr", NOT "Rs. Fr", NOT "RS-Fr".

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== PORTAL TRANSFERS — paste at cell D2 of "Portal Transfers" tab ===
<allowed value or blank>
<allowed value or blank>
<allowed value or blank>
…one line per pre-filled player, in the EXACT order shown in the screenshots

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Exactly N lines, where N = number of pre-filled player rows visible in the screenshots
[ ] Every non-blank line is one of that row's allowed values based on Column C
[ ] Exact casing: "Fr", "So", "Jr", "Sr", "RS Fr", "RS So", "RS Jr", "RS Sr" (single space, "RS" uppercase)
[ ] No tabs, no extra columns, no commentary
[ ] Blank lines used for uncertain rows — nothing guessed
[ ] No header row, no totals`,
    includeTeamMap: true,
  }), [currentYear, userRoster])

  // Ref to prevent concurrent sheet creation (state updates are async, refs are immediate)
  const creatingSheetRef = useRef(false)

  useEffect(() => {
    setIsMobile(isMobileDevice())
    const handleResize = () => setIsMobile(isMobileDevice())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Highlight save button when user returns to the window
  useEffect(() => {
    if (!isOpen || !sheetId || useEmbedded) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setHighlightSave(true)
        setTimeout(() => setHighlightSave(false), 5000)
      }
    }

    const handleFocus = () => {
      setHighlightSave(true)
      setTimeout(() => setHighlightSave(false), 5000)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [isOpen, sheetId, useEmbedded])

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

  // Year-specific sheet key (like recruiting sheets) for proper persistence
  const sheetKey = `portalTransferClassSheetId_${currentYear}`

  // Create portal transfer class sheet when modal opens
  useEffect(() => {
    const createSheet = async () => {
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
        // Check if we have an existing sheet for this year
        const existingSheetId = currentDynasty?.[sheetKey]
        if (existingSheetId) {
          const stillExists = await sheetExists(existingSheetId)
          if (stillExists) {
            setSheetId(existingSheetId)
            return
          }
          await updateDynasty(currentDynasty.id, { [sheetKey]: null })
          // stale sheet (trashed in Drive); fall through to regenerate
        }

        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          const sheetInfo = await createPortalTransferClassSheet(
            currentDynasty?.teamName || 'Dynasty',
            currentYear,
            portalTransfers || []
          )
          setSheetId(sheetInfo.spreadsheetId)

          // Save sheet ID to dynasty with year-specific key
          await updateDynasty(currentDynasty.id, {
            [sheetKey]: sheetInfo.spreadsheetId
          })
        } catch (error) {
          console.error('Failed to create portal transfer class sheet:', error)
          if (error.message?.includes('OAuth') || error.message?.includes('access token')) {
            setShowAuthError(true)
          }
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    createSheet()
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, retryCount, showDeletedNote, portalTransfers, currentYear, sheetKey])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowDeletedNote(false)
      creatingSheetRef.current = false
    }
  }, [isOpen])

  const handleSyncFromSheet = async () => {
    if (!sheetId) return

    setSyncing(true)
    try {
      const classSelections = await readPortalTransferClassFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(classSelections)
      onClose()
    } catch (error) {
      console.error(error)
      if (error.message?.includes('OAuth') || error.message?.includes('access token')) {
        setShowAuthError(true)
      } else {
        toast.error('Failed to sync from Google Sheets. Make sure all players have a class selected.')
      }
    } finally {
      setSyncing(false)
    }
  }

  const handleSyncAndDelete = async () => {
    if (!sheetId) return

    setDeletingSheet(true)
    try {
      const classSelections = await readPortalTransferClassFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(classSelections)

      // Move sheet to trash
      await deleteGoogleSheet(sheetId)

      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => {
        onClose()
      }, 2500)
    } catch (error) {
      console.error('Error in handleSyncAndDelete:', error)
      if (error.message?.includes('OAuth') || error.message?.includes('access token')) {
        setShowAuthError(true)
      } else {
        toast.error(`Failed to sync/delete: ${error.message || 'Unknown error'}`)
      }
    } finally {
      setDeletingSheet(false)
    }
  }

  const handleRegenerateSheet = async () => {
    if (!sheetId) return

    const confirmed = await confirm({
      title: 'Regenerate sheet?',
      message: "This will delete your current sheet and create a fresh one. Any unsaved data will be lost.",
      confirmLabel: 'Regenerate',
      variant: 'danger',
    })
    if (!confirmed) return

    setRegenerating(true)
    try {
      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { [sheetKey]: null })
      setSheetId(null)
      setRetryCount(c => c + 1)
    } catch (error) {
      console.error('Failed to regenerate sheet:', error)
      if (error.message?.includes('OAuth') || error.message?.includes('access token')) {
        setShowAuthError(true)
      } else {
        toast.error('Failed to regenerate sheet. Please try again.')
      }
    } finally {
      setRegenerating(false)
    }
  }

  const handleClose = () => {
    onClose()
  }

  if (!isOpen) return null

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'Portal Transfers') : null
  const isLoading = creatingSheet

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={handleClose}
    >
      <div
        className="rounded-xl border shadow-xl w-full sm:w-[95vw] max-h-[calc(100dvh-4rem)] sm:h-[95dvh] flex flex-col p-4 sm:p-6"
        style={{ backgroundColor: modalColors.background, borderColor: modalColors.border }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold" style={{ color: modalColors.text }}>
            Portal Transfer Class Assignment
          </h2>
          <button aria-label="Close"
            onClick={handleClose}
            className="hover:opacity-70"
            style={{ color: modalColors.text }}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div
                className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4"
                style={{
                  borderColor: modalColors.accent,
                  borderTopColor: 'transparent'
                }}
              />
              <p className="text-lg font-semibold" style={{ color: modalColors.text }}>
                Creating Portal Transfer Class Sheet...
              </p>
              <p className="text-sm mt-2" style={{ color: modalColors.textMuted }}>
                Pre-filling portal transfers with class options
              </p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center p-8 rounded-lg" style={{ backgroundColor: modalColors.accent }}>
              <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke={modalColors.background} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-xl font-bold mb-2" style={{ color: modalColors.background }}>
                Saved & Moved to Trash!
              </p>
              <p className="text-sm" style={{ color: modalColors.background, opacity: 0.9 }}>
                Portal transfer classes have been assigned.
              </p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {!isMobile && useEmbedded && (
              <div className="mb-3 p-3 rounded-lg" style={{ backgroundColor: `${modalColors.accent}15` }}>
                <p className="text-sm" style={{ color: modalColors.text }}>
                  <strong>Why is this needed?</strong> Portal transfers enter with a class (Fr, So, Jr), but the game doesn't show during recruitment whether they used a redshirt at their previous school. Select whether each transfer should be a redshirt (RS) or regular class for the upcoming season.
                </p>
              </div>
            )}

            {/* Action Buttons - only show at top for embedded view */}
            {!isMobile && useEmbedded && (
              <div className="mb-3">
                <div className="flex gap-3 flex-wrap items-center">
                  <button
                    onClick={handleSyncAndDelete}
                    disabled={syncing || deletingSheet}
                    className={`px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-all text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`}
                    style={{
                      backgroundColor: modalColors.accent,
                      color: modalColors.background
                    }}
                  >
                    {deletingSheet ? 'Saving...' : '✓ Save & Move to Trash'}
                  </button>
                  <button
                    onClick={handleSyncFromSheet}
                    disabled={syncing || deletingSheet}
                    className="px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors text-sm border-2"
                    style={{
                      backgroundColor: 'transparent',
                      borderColor: modalColors.accent,
                      color: modalColors.text
                    }}
                  >
                    {syncing ? 'Syncing...' : 'Save & Keep Sheet'}
                  </button>
                  <button onClick={() => setShowAIPrompt(true)} className="px-4 py-2 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent">AI Prompt</button>
                  <button
                    onClick={handleRegenerateSheet}
                    disabled={syncing || deletingSheet || regenerating}
                    className="px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors text-sm border-2 ml-auto"
                    style={{
                      backgroundColor: 'transparent',
                      borderColor: '#EF4444',
                      color: '#EF4444'
                    }}
                  >
                    {regenerating ? 'Regenerating...' : 'Regenerate sheet'}
                  </button>
                </div>
              </div>
            )}

            {!isMobile && (
              <div className="flex items-center justify-end mb-2">
                <button
                  onClick={() => {
                    const newValue = !useEmbedded
                    setUseEmbedded(newValue)
                    localStorage.setItem('sheetEmbedPreference', newValue.toString())
                  }}
                  className="text-xs px-3 py-1 rounded-full border transition-colors"
                  style={{
                    borderColor: modalColors.inputBorder,
                    color: modalColors.textMuted,
                    backgroundColor: 'transparent'
                  }}
                >
                  {useEmbedded ? '← Back to default view' : 'Try embedded view (beta)'}
                </button>
              </div>
            )}

            {isMobile || !useEmbedded ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{ backgroundColor: modalColors.accent }}>
                  <svg className="w-10 h-10" fill="none" stroke={modalColors.background} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold mb-3" style={{ color: modalColors.text }}>Assign Classes to Portal Transfers</h3>
                <div className="text-left mb-6 max-w-md">
                  <div className="p-3 rounded-lg mb-4" style={{ backgroundColor: `${modalColors.accent}15` }}>
                    <p className="text-sm" style={{ color: modalColors.text }}>
                      <strong>Why is this needed?</strong> Portal transfers enter with a class (Fr, So, Jr), but the game doesn't show during recruitment whether they used a redshirt at their previous school. Select whether each transfer should be a redshirt (RS) or regular class for the upcoming season.
                    </p>
                  </div>
                  <p className="text-sm font-semibold mb-2" style={{ color: modalColors.text }}>Instructions:</p>
                  <ol className="text-sm space-y-1.5" style={{ color: modalColors.textMuted }}>
                    <li className="flex gap-2"><span className="font-bold">1.</span><span>Tap the button below to open Google Sheets</span></li>
                    <li className="flex gap-2"><span className="font-bold">2.</span><span>Each transfer has a dropdown with class options</span></li>
                    <li className="flex gap-2"><span className="font-bold">3.</span><span>Select the appropriate class for each player</span></li>
                    <li className="flex gap-2"><span className="font-bold">4.</span><span>Return here and tap "Save" to apply classes</span></li>
                  </ol>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-3 mb-6">
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-3 rounded-lg font-bold text-lg hover:opacity-90 transition-colors flex items-center gap-2"
                    style={{ backgroundColor: '#0F9D58', color: '#FFFFFF' }}
                  >
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
                      <path d="M7 7h2v2H7zm0 4h2v2H7zm0 4h2v2H7zm4-8h6v2h-6zm0 4h6v2h-6zm0 4h6v2h-6z"/>
                    </svg>
                    Open Google Sheets
                  </a>
                  <button
                    onClick={() => setShowAIPrompt(true)}
                    className="px-6 py-3 rounded-lg font-semibold text-base border transition-colors"
                    style={{
                      borderColor: modalColors.inputBorder,
                      color: modalColors.text,
                      backgroundColor: 'transparent'
                    }}
                  >
                    AI Prompt
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 items-center justify-center mb-4">
                  <button
                    onClick={handleSyncAndDelete}
                    disabled={syncing || deletingSheet}
                    className={`px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-all text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`}
                    style={{
                      backgroundColor: modalColors.accent,
                      color: modalColors.background
                    }}
                  >
                    {deletingSheet ? 'Saving...' : '✓ Save & Move to Trash'}
                  </button>
                  <button
                    onClick={handleSyncFromSheet}
                    disabled={syncing || deletingSheet}
                    className="px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-colors text-sm border-2"
                    style={{
                      backgroundColor: 'transparent',
                      borderColor: modalColors.accent,
                      color: modalColors.text
                    }}
                  >
                    {syncing ? 'Syncing...' : 'Save & Keep Sheet'}
                  </button>
                </div>
                <button
                  onClick={handleRegenerateSheet}
                  disabled={syncing || deletingSheet || regenerating}
                  className="px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors text-xs border-2"
                  style={{
                    backgroundColor: 'transparent',
                    borderColor: '#EF4444',
                    color: '#EF4444'
                  }}
                >
                  {regenerating ? 'Regenerating...' : 'Regenerate sheet'}
                </button>
              </div>
            ) : (
              <div className="flex-1 rounded-lg overflow-hidden border-2" style={{ borderColor: modalColors.accent }}>
                <iframe
                  src={embedUrl}
                  className="w-full h-full"
                  title="Portal Transfer Class Sheet"
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p style={{ color: modalColors.text }}>Failed to create sheet. Please try again.</p>
          </div>
        )}
      </div>

      {/* Auth Error Modal */}
      <AuthErrorModal
        isOpen={showAuthError}
        onClose={() => setShowAuthError(false)}
        onRefresh={() => setRetryCount(c => c + 1)}
        teamColors={teamColors}
      />

      <AIPromptModal
        isOpen={showAIPrompt}
        onClose={() => setShowAIPrompt(false)}
        title={`${currentYear} Portal Transfer Class Assignment`}
        prompt={aiPrompt}
        pasteTarget={`Cell D2 of the "Portal Transfers" tab`}
      />
    </div>
  )
}
