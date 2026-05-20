import { useState, useEffect, useRef, useMemo } from 'react'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import SheetModalHeader from './ui/SheetModalHeader'
import SheetModalAIHero from './ui/SheetModalAIHero'
import SheetManualEntry from './ui/SheetManualEntry'
import SheetModalFooter from './ui/SheetModalFooter'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
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
  const [createAttempts, setCreateAttempts] = useState(0)
  const [authErrorOccurred, setAuthErrorOccurred] = useState(false)
  const MAX_CREATE_ATTEMPTS = 2
  const auth = useAuthErrorHandler()
  const [isMobile, setIsMobile] = useState(false)

  const [useEmbedded, setUseEmbedded] = useState(() => {
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const aiPrompt = useMemo(() => {
    // Must match the sort order used in createPortalTransferClassSheet so the
    // row numbers in this prompt align with the actual sheet rows.
    const POSITION_ORDER = [
      'QB','HB','FB','WR','TE',
      'LT','LG','C','RG','RT','OT','OG',
      'LE','RE','LEDG','REDG','EDGE','DT',
      'LOLB','MLB','ROLB','SAM','MIKE','WILL','OLB','LB',
      'CB','FS','SS','S','K','P',
    ]
    const sortedTransfers = [...(portalTransfers || [])].sort((a, b) => {
      const ai = POSITION_ORDER.indexOf(a.position)
      const bi = POSITION_ORDER.indexOf(b.position)
      const posA = ai !== -1 ? ai : 999
      const posB = bi !== -1 ? bi : 999
      if (posA !== posB) return posA - posB
      return (a.name || '').localeCompare(b.name || '')
    })

    const playerRows = sortedTransfers.length === 0
      ? '  (no portal transfers)'
      : sortedTransfers.map((t, i) =>
          `  Row ${i + 2}: ${t.name} ${t.position}`
        ).join('\n')

    const n = sortedTransfers.length

    return buildAIPrompt({
      title: `${currentYear} Portal Transfer Class Assignment`,
      structure: `This sheet has ONE tab: "Portal Transfers". It has 5 columns: A = Player, B = Position, C = "${currentYear} Recruitment Class", D = "Updated ${currentYear + 1} Class", E = "Jersey #". Row 1 is the protected header row. Columns A, B, C are PRE-FILLED and PROTECTED — do NOT output them. Columns D and E are user-editable.

═══════════════════════════════════════════════════════════
YOUR JOB: TWO VALUES PER PLAYER — YEAR + JERSEY
═══════════════════════════════════════════════════════════
For each player listed below, find their name in the roster screenshots and read TWO things:

  1) The YEAR column value — translate using this mapping for column D:

       Game shows → Output
       FR         → Fr
       FR(RS)     → RS Fr
       SO         → So
       SO(RS)     → RS So
       JR         → Jr
       JR(RS)     → RS Jr
       SR         → Sr
       SR(RS)     → RS Sr

  2) The JERSEY # (the number on their jersey / next to their name in
     the roster screenshot) — output as an integer 0-99 for column E.

BLANK if you can't see it for that player — do NOT guess. Either field
can be blank independently (e.g. you see the year but not the number, or
vice versa). The line still has the tab separator either way.

No other logic. No redshirt calculations. Just read what's on screen.

═══════════════════════════════════════════════════════════
THE EXACT PLAYERS IN THE SHEET — in sheet row order
═══════════════════════════════════════════════════════════
${playerRows}

═══════════════════════════════════════════════════════════
CRITICAL OUTPUT RULES
═══════════════════════════════════════════════════════════
1. Output ONLY columns D and E — one player per line, TWO values per line separated by a SINGLE TAB.
2. Output EXACTLY ${n} line${n !== 1 ? 's' : ''} in the order above. Do not add or remove lines.
3. Exact casing for D: "Fr", "So", "Jr", "Sr", "RS Fr", "RS So", "RS Jr", "RS Sr" — one space between "RS" and the class. NOT "RSFr", NOT "Rs Fr".
4. Jersey # in E is an INTEGER 0-99 — no decimals, no "#", no commas.
5. Blank values are fine — if you don't see one (or both) for a player, leave it/them blank. A line with both blank is still output as a lone tab character.
6. No header row, no commentary INSIDE the data.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== PORTAL TRANSFERS — paste at cell D2 of "Portal Transfers" tab ===
<class for Row 2 player>\\t<jersey # for Row 2 player>
<class for Row 3 player>\\t<jersey # for Row 3 player>
…exactly ${n} line${n !== 1 ? 's' : ''}

(Each \\t above represents a LITERAL TAB character — use actual tab characters in your output, not the text "\\t".)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Exactly ${n} line${n !== 1 ? 's' : ''} — one per player listed above
[ ] Each line has EXACTLY ONE tab character (separating class and jersey)
[ ] Every non-blank class is a direct translation of the YEAR column from the screenshots
[ ] Jersey #s are integers 0-99 or blank — no decimals, no "#", no commas
[ ] Exact casing: "RS Fr" not "RSFr" or "Rs Fr"
[ ] No extra columns beyond D and E, no commentary INSIDE the data`,
    })
  }, [currentYear, portalTransfers])

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

  // Year-specific sheet key (like recruiting sheets) for proper persistence
  const sheetKey = `portalTransferClassSheetId_${currentYear}`

  // Create portal transfer class sheet when modal opens
  useEffect(() => {
    const createSheet = async () => {
      if (authErrorOccurred || createAttempts >= MAX_CREATE_ATTEMPTS) return
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
          setCreateAttempts(prev => prev + 1)
          if (auth.handleError(error)) {
            setAuthErrorOccurred(true)
          }
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    createSheet()
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, auth.retryCount, showDeletedNote, portalTransfers, currentYear, sheetKey, authErrorOccurred, createAttempts])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowDeletedNote(false)
      setCreateAttempts(0)
      setAuthErrorOccurred(false)
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
      if (!auth.handleError(error)) {
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
      if (!auth.handleError(error)) {
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
      auth.retry()
    } catch (error) {
      console.error('Failed to regenerate sheet:', error)
      if (!auth.handleError(error)) {
        toast.error('Failed to regenerate sheet. Please try again.')
      }
    } finally {
      setRegenerating(false)
    }
  }

  const handleDeleteSheetOnly = async () => {
    if (!sheetId || !currentDynasty) return
    const ok = await confirm({
      title: 'Delete this portal transfer class sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty portal transfer class assignments stay as-is.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { [sheetKey]: null })
      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => onClose(), 1800)
    } catch (error) {
      console.error('Failed to delete sheet:', error)
      if (!auth.handleError(error)) {
        toast.error('Failed to delete the sheet — try again.')
      }
    } finally {
      setDeletingSheet(false)
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
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={handleClose}
    >
      <div
        className={`card-elevated w-full max-h-[calc(100dvh-4rem)] flex flex-col overflow-hidden ${
          useEmbedded
            ? 'sm:w-[95vw] sm:h-[95dvh]'
            : 'sm:max-w-[680px] sm:h-auto'
        }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <SheetModalHeader eyebrow="Transfer Portal" title="Portal Transfer Class" onClose={handleClose} />
        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div
                className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4"
                style={{
                  borderColor: 'var(--text-primary)',
                  borderTopColor: 'transparent'
                }}
              />
              <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Creating Portal Transfer Class Sheet...
              </p>
              <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
                Pre-filling portal transfers with class options
              </p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center p-8 rounded-lg" style={{ backgroundColor: 'var(--text-primary)' }}>
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
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            <SheetModalAIHero
              tagline="Skip the typing. Let AI fill the transfer portal class."
              buttons={[{ label: 'Copy AI Prompt', prompt: aiPrompt }]}
            />
            {isMobile || !useEmbedded ? (
              <SheetManualEntry sheetId={sheetId} />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                <iframe
                  src={embedUrl}
                  className="w-full h-full"
                  title="Portal Transfer Class Sheet"
                />
              </div>
            )}
            <SheetModalFooter
              syncing={syncing}
              deletingSheet={deletingSheet}
              regenerating={regenerating}
              highlightSave={highlightSave}
              onSaveAndDelete={handleSyncAndDelete}
              onSaveAndKeep={handleSyncFromSheet}
              onDeleteSheetOnly={handleDeleteSheetOnly}
              onRegenerate={handleRegenerateSheet}
              showEmbeddedToggle={!isMobile}
              useEmbedded={useEmbedded}
              onToggleEmbedded={() => { const newValue = !useEmbedded; setUseEmbedded(newValue); localStorage.setItem('sheetEmbedPreference', newValue.toString()); }}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p style={{ color: 'var(--text-primary)' }}>Failed to create sheet. Please try again.</p>
          </div>
        )}
        </div>
      </div>

      {/* Auth Error Modal */}
      <AuthErrorModal
        isOpen={auth.showAuthError}
        onClose={auth.closeAuthError}
        onRefresh={auth.retry}
        teamColors={teamColors}
      />
    </div>
  )
}
