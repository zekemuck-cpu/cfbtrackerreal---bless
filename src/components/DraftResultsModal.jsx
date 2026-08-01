import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty, isPlayerOnRoster } from '../context/DynastyContext'
import { getCurrentTeamTid } from '../data/teamRegistry'
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
  createDraftResultsSheet,
  readDraftResultsFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl,
  sheetExists
} from '../services/sheetsService'
import { getModalColors } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'
import LocalDataEntry from './ui/LocalDataEntry'
import { splitTsv } from '../utils/tsvParse'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function DraftResultsModal({ isOpen, onClose, onSave, currentYear, teamColors }) {
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
  const auth = useAuthErrorHandler()
  const [isMobile, setIsMobile] = useState(false)
  // Local paste is the DEFAULT; the Google Sheet flow is the opt-in fallback.
  const [useLocal, setUseLocal] = useState(true)

  const [useEmbedded, setUseEmbedded] = useState(() => {
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [noDraftDeclarees, setNoDraftDeclarees] = useState(false)

  const userRoster = useMemo(() => {
    // Teambuilder-safe: filter by TID + pass dynasty for abbr fallback
    const teamTid = getCurrentTeamTid(currentDynasty)
    const teamAbbrForRoster =
      currentDynasty?.teams?.[currentDynasty?.currentTid]?.abbr ||
      currentDynasty?.teamName
    const all = currentDynasty?.players || []
    return all
      .filter(p => isPlayerOnRoster(p, teamTid ?? teamAbbrForRoster, currentYear, currentDynasty))
      .map(p => ({ name: p.name, jerseyNumber: p.jerseyNumber, position: p.position }))
  }, [currentDynasty?.players, currentDynasty?.teams, currentDynasty?.currentTid, currentDynasty?.teamName, currentYear, currentDynasty])

  // Pre-fill the local grid with THIS team's already-saved draft results for
  // the year so the modal opens ready to edit. The parser reads
  // row[0]=Player, row[1]=Draft Round and requires BOTH non-blank, so we emit
  // only entries that have both a name and a round — round-trip safe.
  const initialText = useMemo(() => {
    const tid = getCurrentTeamTid(currentDynasty)
    const teamAbbr =
      currentDynasty?.teams?.[currentDynasty?.currentTid]?.abbr ||
      currentDynasty?.teamName
    const fromTid = tid != null
      ? currentDynasty?.teams?.[tid]?.byYear?.[currentYear]?.draftResults
      : null
    const legacy = currentDynasty?.draftResultsByTeamYear
    const fromLegacy =
      (tid != null ? legacy?.[tid]?.[currentYear] : null) ??
      (teamAbbr ? legacy?.[teamAbbr]?.[currentYear] : null)
    const results = fromTid ?? fromLegacy ?? []
    return results
      .filter(r => r?.playerName && r?.draftRound)
      .map(r => `${r.playerName}\t${r.draftRound}`)
      .join('\n')
  }, [currentDynasty?.teams, currentDynasty?.currentTid, currentDynasty?.teamName, currentDynasty?.draftResultsByTeamYear, currentYear])

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Draft Results`,
    roster: userRoster,
    structure: `This sheet has ONE tab: "Draft Results".
Row 1 (header) is PRE-FILLED. You output TWO columns per drafted player: the Player Name in column A and the Draft Round in column B.

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output TWO tab-separated values per line: Player Name then Draft Round.
2. Read BOTH the player name AND their draft round directly from the screenshots.
3. OMIT any player whose draft round is not visible — never guess. Only include players you can clearly see in the screenshots.
4. Column B is a STRICT DROPDOWN. Use EXACTLY one of the 8 literal values listed below — case-sensitive, with the space between number and "Round".
5. No header row, no totals, no commentary INSIDE the data block.

═══════════════════════════════════════════════════════════
SECTION: "Draft Results"
═══════════════════════════════════════════════════════════

Col | Header (protected)  | Your output                              | Format
----+---------------------+------------------------------------------+-------------------
 A  | Player              | Player name exactly as shown             | text
 B  | Draft Round         | EXACT dropdown string, one of the 8 below| strict dropdown

═══════════════════════════════════════════════════════════
ENUMERATED DROPDOWN VALUES for column B (use EXACTLY — case-sensitive, with the space)
═══════════════════════════════════════════════════════════
  1st Round
  2nd Round
  3rd Round
  4th Round
  5th Round
  6th Round
  7th Round
  Undrafted

NOT allowed: "Round 1", "R1", "1st round", "1", "1st", "1st-round", "first round".

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== DRAFT RESULTS ===
<Player Name>\t<Draft Round>
<Player Name>\t<Draft Round>
...
(one line per drafted player visible in screenshots; tab-separated; omit unknowns entirely)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Each line has exactly TWO tab-separated values: player name and draft round
[ ] Every draft round value is EXACTLY one of: 1st Round, 2nd Round, 3rd Round, 4th Round, 5th Round, 6th Round, 7th Round, Undrafted
[ ] Exact capitalization: "1st Round" (capital R), "Undrafted" (capital U)
[ ] Only players clearly visible in the screenshots — did not invent or guess any entries
[ ] NO tabs within names, NO extra text, NO commentary INSIDE the data block`,
    includeTeamMap: false,
  }), [currentYear, userRoster])

  // Ref to prevent concurrent sheet creation (state updates are async, refs are immediate)
  const creatingSheetRef = useRef(false)
  const creationAttemptedRef = useRef(false)
  const lastRetryCountRef = useRef(auth.retryCount)

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

  // Create draft results sheet when modal opens
  useEffect(() => {
    if (auth.retryCount !== lastRetryCountRef.current) {
      lastRetryCountRef.current = auth.retryCount
      creationAttemptedRef.current = false
    }

    const createSheet = async () => {
      // Don't create a Google Sheet while the local paste path is active.
      if (isOpen && !useLocal && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote && !noDraftDeclarees && !creationAttemptedRef.current) {
        creationAttemptedRef.current = true
        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          // Check if we have an existing sheet for this year
          const existingSheetId = currentDynasty?.draftResultsSheetId
          if (existingSheetId) {
            const stillExists = await sheetExists(existingSheetId)
            if (stillExists) {
              setSheetId(existingSheetId)
              return
            }
            await updateDynasty(currentDynasty.id, { draftResultsSheetId: null })
            // stale sheet (trashed in Drive); fall through to regenerate
          }

          // The sheet lists the FULL roster so the user can record a draft round
          // for any player without first flagging them "Pro Draft". Entering a
          // round flips that player to a Pro Draft departure on save.
          const playersLeavingThisYear = currentDynasty?.playersLeavingByYear?.[currentYear] || []
          const sheetInfo = await createDraftResultsSheet(
            currentDynasty?.teamName || 'Dynasty',
            currentYear,
            playersLeavingThisYear,
            currentDynasty?.players || [],
            userRoster
          )
          setSheetId(sheetInfo.spreadsheetId)

          // Save sheet ID to dynasty
          await updateDynasty(currentDynasty.id, {
            draftResultsSheetId: sheetInfo.spreadsheetId
          })
        } catch (error) {
          console.error('Failed to create draft results sheet:', error)
          auth.handleError(error)
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    createSheet()
  }, [isOpen, useLocal, user, sheetId, currentDynasty?.id, auth.retryCount, showDeletedNote, noDraftDeclarees, currentYear])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowDeletedNote(false)
      setNoDraftDeclarees(false)
      creatingSheetRef.current = false
      creationAttemptedRef.current = false
      setUseLocal(true)
    }
  }, [isOpen])

  // Local paste import: the AI emits Player<TAB>DraftRound rows, exactly the two
  // columns the parser reads as row[0]/row[1] — no pre-filled columns, so the
  // pasted rows map straight through with no normalization.
  const handleLocalImport = async (text) => {
    const draftResults = await readDraftResultsFromSheet(null, (currentDynasty?.teams || currentDynasty?.customTeams), { rows: splitTsv(text) })
    await onSave(draftResults)
    onClose()
  }

  const handleSyncFromSheet = async () => {
    if (!sheetId) return

    setSyncing(true)
    try {
      const draftResults = await readDraftResultsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(draftResults)
      onClose()
    } catch (error) {
      console.error(error)
      if (!auth.handleError(error)) {
        toast.error('Failed to sync from Google Sheets. Make sure data is properly formatted.')
      }
    } finally {
      setSyncing(false)
    }
  }

  const handleSyncAndDelete = async () => {
    if (!sheetId) return

    setDeletingSheet(true)
    try {
      const draftResults = await readDraftResultsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(draftResults)

      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { draftResultsSheetId: null })

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
      await updateDynasty(currentDynasty.id, { draftResultsSheetId: null })
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
      title: 'Delete this draft results sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty draft results stay as-is.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { draftResultsSheetId: null })
      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => onClose(), 1800)
    } catch (error) {
      console.error('Failed to delete sheet:', error)
      if (!auth.handleError(error)) {
        toast.error('Failed to delete the sheet. Try again.')
      }
    } finally {
      setDeletingSheet(false)
    }
  }

  const handleClose = () => {
    onClose()
  }

  const handleSkip = async () => {
    // No draft declarees, just save empty results and close
    await onSave([])
    onClose()
  }

  if (!isOpen) return null

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'Draft Results') : null
  const isLoading = creatingSheet

  // Get count of draft declarees for display
  const playersLeavingThisYear = currentDynasty?.playersLeavingByYear?.[currentYear] || []
  const draftDeclareesCount = playersLeavingThisYear.filter(p => p.reason === 'Pro Draft').length

  return createPortal(
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
        <SheetModalHeader eyebrow="Offseason" title={`${currentYear} Draft Results`} onClose={handleClose} />

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
        {noDraftDeclarees ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 text-center max-w-sm">
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">
                No Draft Declarees
              </p>
              <p className="text-sm mb-6 text-txt-secondary">
                No players declared for the Pro Draft this year.
              </p>
              <button
                onClick={handleSkip}
                className="px-6 py-3 rounded-lg font-semibold hover:opacity-90"
                style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
              >
                Continue
              </button>
            </div>
          </div>
        ) : useLocal && !showDeletedNote ? (
          <LocalDataEntry
            aiPrompt={aiPrompt}
            onImport={handleLocalImport}
            onUseGoogle={() => setUseLocal(false)}
            onCancel={handleClose}
            importLabel="Import Draft Results"
            columns={['Player', 'Draft Round']}
            initialText={initialText}
          />
        ) : isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div
                className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4"
                style={{
                  borderColor: 'var(--text-primary)',
                  borderTopColor: 'transparent'
                }}
              />
              <p className="text-lg font-semibold text-txt-primary">
                Creating Draft Results Sheet...
              </p>
              <p className="text-sm mt-2 text-txt-secondary">
                Pre-filling {draftDeclareesCount} draft declaree{draftDeclareesCount !== 1 ? 's' : ''}
              </p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 text-center max-w-sm">
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
              <p className="text-sm text-txt-secondary">Draft results saved to your dynasty.</p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            <SheetModalAIHero
              tagline="Skip the typing. Let AI fill the draft results."
              buttons={[{ label: 'Copy AI Prompt', prompt: aiPrompt }]}
            />
            {isMobile || !useEmbedded ? (
              <SheetManualEntry sheetId={sheetId} />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                <iframe
                  src={embedUrl}
                  className="w-full h-full"
                  title="Draft Results Sheet"
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
            <p className="text-txt-primary">Failed to create sheet. Please try again.</p>
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
    </div>,
    document.body,
  )
}
