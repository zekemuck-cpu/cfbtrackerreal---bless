import { useState, useEffect, useRef, useMemo } from 'react'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import AuthErrorModal from './AuthErrorModal'
import AIPromptModal from './AIPromptModal'
import {
  createFringeCaseClassSheet,
  readFringeCaseClassFromSheet,
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

export default function FringeCaseClassModal({ isOpen, onClose, onSave, currentYear, teamColors, fringeCasePlayers }) {
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

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Fringe Case Class Assignment`,
    structure: `This sheet has ONE tab: "Fringe Cases". It has 5 columns total: A = Player, B = Position, C = "${currentYear} Recruitment Class", D = Games, E = "Updated ${currentYear + 1} Class". Row 1 is the protected header row. Columns A, B, C, D are PRE-FILLED from dynasty data and PROTECTED — do NOT output them. Column E is the only editable column, and its allowed dropdown values are PER-ROW (they depend on that row's Column C value).

These are "fringe case" players who played between 5 and 9 games in ${currentYear}. Depending on the game's redshirt logic, each player can either be progressed to the next class OR kept at the current class with the RS prefix applied (i.e. a redshirt was used). Your job is to pick one of the two allowed values for each row.

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output ONLY column E. NEVER output columns A, B, C, D, or the header row.
2. Output format is a SINGLE column of values — one value per line — NO tabs, NO extra columns.
3. Row order must match the pre-filled player rows EXACTLY from top to bottom as shown in the screenshot. If the sheet shows N pre-filled players, output EXACTLY N lines (blank lines only when the current class is "RS Sr" which has no progression).
4. Each row's allowed dropdown values are STRICTLY determined by that row's Column C value (the player's ${currentYear} class). You MUST pick one of the allowed values for that row — any other value is rejected by the dropdown.
5. Use the EXACT literal strings shown below. "RS Fr" with ONE space. No "Fr (RS)", no "RSFr", no "Rs Fr", no "RS-Fr", no "Fr*".
6. No header row, no commentary, no totals, no explanation.
7. NEVER output a class that isn't in that row's allowed set.

═══════════════════════════════════════════════════════════
TAB: "Fringe Cases" — paste at cell E2 of the "Fringe Cases" tab
═══════════════════════════════════════════════════════════

Column layout:

Col | Header (row 1, protected)               | Pre-filled / protected?           | Your value
----+-----------------------------------------+-----------------------------------+-----------------------------------
 A  | Player                                  | Pre-filled — PROTECTED            | DO NOT OUTPUT
 B  | Position                                | Pre-filled — PROTECTED            | DO NOT OUTPUT
 C  | ${currentYear} Recruitment Class                    | Pre-filled — PROTECTED            | DO NOT OUTPUT
 D  | Games                                   | Pre-filled — PROTECTED            | DO NOT OUTPUT
 E  | Updated ${currentYear + 1} Class                        | Empty — EDITABLE dropdown (per-row) | Exactly one allowed value, or BLANK only for "RS Sr"

───────────────────────────────────────────────────────────
COLUMN E — Per-row allowed values (depends on the row's Column C "${currentYear} Recruitment Class"):

If Column C = "Fr"     → allowed values: "So" | "RS Fr"
If Column C = "So"     → allowed values: "Jr" | "RS So"
If Column C = "Jr"     → allowed values: "Sr" | "RS Jr"
If Column C = "Sr"     → allowed value:  "RS Sr"                  (only one option)
If Column C = "RS Fr"  → allowed value:  "RS So"                  (only one option)
If Column C = "RS So"  → allowed value:  "RS Jr"                  (only one option)
If Column C = "RS Jr"  → allowed value:  "RS Sr"                  (only one option)
If Column C = "RS Sr"  → NO OPTIONS — leave the line blank (player graduates; no progression possible)

Selection guidance (when two options exist):
- Pick the NON-RS progressed class (e.g. "So", "Jr", "Sr") if the player did NOT use a redshirt in ${currentYear} — i.e. the screenshot indicates a normal year of eligibility was used. The fringe-case range is 5–9 games, so progression without redshirt is common.
- Pick the "RS <CurrentClass>" value (e.g. "RS Fr", "RS So", "RS Jr") if the player used a redshirt in ${currentYear} — the screenshot / context indicates a redshirt was applied (e.g. the player participated in fewer meaningful games, or redshirt status is explicit).
- When only one option is allowed (Sr, RS Fr, RS So, RS Jr), output that single value.
- LITERAL case matters: all of "Fr", "So", "Jr", "Sr", "RS Fr", "RS So", "RS Jr", "RS Sr" use Title Case with "RS" uppercase and exactly one space before the class letters.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== FRINGE CASES — paste at cell E2 of "Fringe Cases" tab ===
<allowed value or blank>
<allowed value or blank>
<allowed value or blank>
…one line per pre-filled player, in the EXACT order shown in the screenshots

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Exactly N lines, where N = number of pre-filled player rows visible in the screenshots
[ ] Every non-blank line is one of that row's allowed values based on Column C (per the table above)
[ ] No "Fr (RS)" / "So (RS)" / "Jr (RS)" — use the "RS Fr" / "RS So" / "RS Jr" forms only
[ ] Exact casing: "Fr", "So", "Jr", "Sr", "RS Fr", "RS So", "RS Jr", "RS Sr" (single space, "RS" uppercase)
[ ] No tabs, no extra columns, no commentary
[ ] Blank line ONLY for rows where Column C = "RS Sr" (no progression)
[ ] No header row, no totals`,
    includeTeamMap: true,
    notes: `The "Games" column (protected) reflects regular-season games played in ${currentYear}. In the fringe-case context, the game decides whether a redshirt was applied (typically ≤ 4 games used a redshirt; 5–9 games is the fringe case where either progression or redshirt may apply). Use the screenshot's Games and context to pick the correct allowed value for each row.`
  }), [currentYear])

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

  // Create fringe case class sheet when modal opens
  useEffect(() => {
    const createSheet = async () => {
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
        // Check if we have an existing sheet for this year
        const existingSheetId = currentDynasty?.fringeCaseClassSheetId
        if (existingSheetId) {
          const stillExists = await sheetExists(existingSheetId)
          if (stillExists) {
            setSheetId(existingSheetId)
            return
          }
          await updateDynasty(currentDynasty.id, { fringeCaseClassSheetId: null })
          // stale sheet (trashed in Drive); fall through to regenerate
        }

        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          const sheetInfo = await createFringeCaseClassSheet(
            currentDynasty?.teamName || 'Dynasty',
            currentYear,
            fringeCasePlayers || []
          )
          setSheetId(sheetInfo.spreadsheetId)

          // Save sheet ID to dynasty
          await updateDynasty(currentDynasty.id, {
            fringeCaseClassSheetId: sheetInfo.spreadsheetId
          })
        } catch (error) {
          console.error('Failed to create fringe case class sheet:', error)
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
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, retryCount, showDeletedNote, fringeCasePlayers, currentYear])

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
      const classSelections = await readFringeCaseClassFromSheet(sheetId)
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
      const classSelections = await readFringeCaseClassFromSheet(sheetId)
      await onSave(classSelections)

      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { fringeCaseClassSheetId: null })

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
      await updateDynasty(currentDynasty.id, { fringeCaseClassSheetId: null })
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

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'Fringe Cases') : null
  const isLoading = creatingSheet

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={handleClose}
    >
      <div
        className="rounded-xl shadow-xl w-full sm:w-[95vw] max-h-[calc(100dvh-4rem)] sm:h-[95dvh] flex flex-col p-4 sm:p-6 border"
        style={{ backgroundColor: modalColors.background, borderColor: modalColors.border }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold" style={{ color: modalColors.text }}>
            Fringe Case Class Assignment
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
                Creating Fringe Case Class Sheet...
              </p>
              <p className="text-sm mt-2" style={{ color: modalColors.textMuted }}>
                Players with 5-9 games who might have redshirted
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
                Fringe case classes have been assigned.
              </p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Explanation for embedded view */}
            {!isMobile && useEmbedded && (
              <div className="mb-3 p-3 rounded-lg" style={{ backgroundColor: `${modalColors.accent}15` }}>
                <p className="text-sm" style={{ color: modalColors.text }}>
                  <strong>Why is this needed?</strong> Players with 5-9 total games might have used a redshirt if they played 4 or fewer <em>regular season</em> games (bowl/CFP games don't count against redshirt eligibility). Review each player and select the redshirt version if applicable.
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
                      color: modalColors.accent
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

            {/* Toggle between embedded and new tab */}
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
                    borderColor: modalColors.accent,
                    color: modalColors.accent,
                    backgroundColor: 'transparent'
                  }}
                >
                  {useEmbedded ? '<- Back to default view' : 'Try embedded view (beta)'}
                </button>
              </div>
            )}

            {isMobile || !useEmbedded ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{ backgroundColor: modalColors.accent }}>
                  <svg className="w-10 h-10" fill="none" stroke={modalColors.background} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold mb-3" style={{ color: modalColors.text }}>Resolve Fringe Case Classes</h3>
                <div className="text-left mb-6 max-w-md">
                  <div className="p-3 rounded-lg mb-4" style={{ backgroundColor: `${modalColors.accent}15` }}>
                    <p className="text-sm" style={{ color: modalColors.text }}>
                      <strong>Why is this needed?</strong> Players with 5-9 total games might have used a redshirt if they played 4 or fewer <em>regular season</em> games (bowl/CFP games don't count against redshirt eligibility). Review each player and select the redshirt version if applicable.
                    </p>
                  </div>
                  <p className="text-sm font-semibold mb-2" style={{ color: modalColors.text }}>Instructions:</p>
                  <ol className="text-sm space-y-1.5" style={{ color: modalColors.textMuted }}>
                    <li className="flex gap-2"><span className="font-bold">1.</span><span>Tap the button below to open Google Sheets</span></li>
                    <li className="flex gap-2"><span className="font-bold">2.</span><span>Review each player's game count and assumed class</span></li>
                    <li className="flex gap-2"><span className="font-bold">3.</span><span>Select redshirt version if they used a redshirt</span></li>
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

                {/* Centered Save Buttons */}
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
                      color: modalColors.accent
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
              /* Embedded iframe view */
              <div className="flex-1 rounded-lg overflow-hidden border-2" style={{ borderColor: modalColors.accent }}>
                <iframe
                  src={embedUrl}
                  className="w-full h-full"
                  title="Fringe Case Class Sheet"
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
        title={`${currentYear} Fringe Case Class Assignment`}
        prompt={aiPrompt}
      />
    </div>
  )
}
