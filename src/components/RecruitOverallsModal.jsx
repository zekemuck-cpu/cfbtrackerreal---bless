import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
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
import SheetToolbar from './SheetToolbar'
import {
  createRecruitOverallsSheet,
  readRecruitOverallsFromSheet,
  parseRecruitOverallsLocal,
  deleteGoogleSheet,
  getSheetEmbedUrl,
  sheetExists
} from '../services/sheetsService'
import { buildAIPrompt } from '../utils/aiPrompt'
import { buildAttributesStructure } from '../utils/attributeEntry'
import { arePlayerAttributesEnabled } from '../editions'
import AttributePasteGrid from './AttributePasteGrid'
import LocalDataEntry from './ui/LocalDataEntry'
import { splitTsv } from '../utils/tsvParse'
import SheetLoadingHint from './SheetLoadingHint'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function RecruitOverallsModal({ isOpen, onClose, onSave, onImportAttributes, currentYear, teamColors, recruits }) {
  const { currentDynasty, updateDynasty } = useDynasty()
  // CFB 27: "Full attributes" local-paste mode alongside the Overalls Google
  // sheet. Gated on the edition attributes feature; defaults to Overalls.
  // Full-attribute entry: edition supports it AND ratings aren't hidden via the
  // "Hide all ratings" league preference. When hidden, this flow is Overalls-only.
  const attributesEnabled = arePlayerAttributesEnabled(currentDynasty)
  const [mode, setMode] = useState('overalls') // 'overalls' | 'attributes'
  // Within Overalls mode, local paste is the DEFAULT; Google is the fallback.
  const [useLocal, setUseLocal] = useState(true)
  const { user, signOut } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const auth = useAuthErrorHandler()
  const [isMobile, setIsMobile] = useState(false)

  const [useEmbedded, setUseEmbedded] = useState(() => {
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Signed Recruit Overalls`,
    roster: (recruits || []).map(p => ({
      name: p.name,
      jerseyNumber: p.jerseyNumber,
      position: p.position,
    })),
    rosterLabel: 'YOUR INCOMING RECRUITING CLASS (match abbreviated names like "A. Guess" to full names)',
    structure: `WHERE TO FIND THE DATA IN EA CFB
═══════════════════════════════════════════════════════════
Recruit overalls appear on NATIONAL SIGNING DAY (before Training Results).

The YOUR INCOMING RECRUITING CLASS block below is the definitive list of the
commits you signed this class — the SOURCE OF TRUTH for who to record. Your job
is to find each of those exact players in the screenshots and read their overall
(and jersey #). Do NOT filter by the class/year shown on the depth chart: a
commit can appear as "Fr", "RS Fr", or any other year. Include a player because
their name is in the commit list, not because of the year beside them.

HOW TO FIND EACH COMMIT in the screenshots:
1. Browse the position group depth charts and match each name against the commit
   list below — EA's abbreviated names (e.g. "D.Ware") resolve to a full name there.
2. Walk the commit list itself and locate every player on it somewhere in the
   screenshots; each recruit in the block should have a depth-chart row.

The OVR column shows each recruit's starting overall — a plain integer. The
jersey number may be visible on the depth-chart row. If a commit is nowhere in
the screenshots, leave their overall blank (never guess).

═══════════════════════════════════════════════════════════

This sheet has ONE tab: "Recruit Overalls".
Row 1 (header) and Columns A–D (Name, Position, Class, Stars) are PRE-FILLED and PROTECTED. Recruits are listed in alphabetical order by last name in column A. You output ONLY two values per recruit: Overall (col E) and Jersey # (col F).

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output ONLY columns E and F. NEVER output columns A, B, C, or D. NEVER output the header row.
2. ROW ORDER IS FIXED. Produce exactly one output line per pre-filled recruit, in the SAME ORDER as column A (alphabetical by last name). Do NOT reorder, skip, or add rows.
3. Exactly TWO tab-separated values per line: <Overall>\\t<Jersey #>.
4. NO COMMAS in numbers. Output "85" — never "85.0", "85pts", or "85,".
5. INTEGERS only. No decimals, no quotes, no units.
6. BLANK for unknown values — never guess, never use 0, "-", or "N/A". For a line where Overall is known but Jersey # is not, output: 85\\t (tab then nothing).
7. Overall range: 40–99. Jersey # range: 0–99.
8. No header row, no commentary INSIDE the data. Output ONLY the fenced tsv block, nothing before or after it.

═══════════════════════════════════════════════════════════
SECTION: "Recruit Overalls"
═══════════════════════════════════════════════════════════

Col | Header (protected)  | Your output                                | Format
----+---------------------+--------------------------------------------+---------------------
 A  | Name                | — (pre-filled, do NOT output)              | protected
 B  | Position            | — (pre-filled, do NOT output)              | protected
 C  | Class               | — (pre-filled, do NOT output)              | protected
 D  | Stars               | — (pre-filled, do NOT output)              | protected
 E  | Overall             | Integer 40–99                              | integer, no commas
 F  | Jersey #            | Integer 0–99 (blank if not visible)        | integer, no commas

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== RECRUIT OVERALLS ===
<Overall>\\t<Jersey #>
<Overall>\\t<Jersey #>
...
(one line per recruit, same order as column A — alphabetical by last name)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Line count exactly equals the number of recruits in the YOUR INCOMING RECRUITING CLASS block
[ ] Every line has EXACTLY one tab character (two values: Overall then Jersey #)
[ ] Every Overall is an integer 40–99, or blank
[ ] Every Jersey # is an integer 0–99, or blank
[ ] No commas, no decimals, no quotes, no units
[ ] Row order matches column A alphabetical-by-last-name order exactly
[ ] Blank cells for unknowns — invented nothing`,
    includeTeamMap: false,
  }), [currentYear, recruits])

  // Local-paste prompt — the Google flow emits only cols E/F in a FIXED row
  // order (it leans on the sheet's pre-filled Name column). Local paste has no
  // pre-filled names, so this variant LEADS each row with the recruit's name
  // and matches by name, making paste order irrelevant.
  const localAiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Signed Recruit Overalls`,
    roster: (recruits || []).map(p => ({
      name: p.name,
      jerseyNumber: p.jerseyNumber,
      position: p.position,
    })),
    rosterLabel: 'YOUR INCOMING RECRUITING CLASS (match abbreviated names like "A. Guess" to full names)',
    structure: `WHERE TO FIND THE DATA IN EA CFB
═══════════════════════════════════════════════════════════
Recruit overalls appear on NATIONAL SIGNING DAY (before Training Results).

The YOUR INCOMING RECRUITING CLASS block below is the definitive list of the
commits you signed this class — the SOURCE OF TRUTH for who to record. Find each
of those exact players in the screenshots and read their overall (and jersey #).
Do NOT filter by the class/year shown on the depth chart: a commit can appear as
"Fr", "RS Fr", or any other year. Include a player because their name is in the
commit list, not because of the year beside them. Browse the position group
depth charts and match each name to the block (abbreviated names like "D.Ware"
resolve to a full name there). The OVR column is their initial overall; the
jersey number may be visible on the depth-chart row.

═══════════════════════════════════════════════════════════
OUTPUT — one SELF-DESCRIBING line per recruit (the app matches by NAME, so
row order does NOT matter)
═══════════════════════════════════════════════════════════
1. Each line has EXACTLY 3 tab-separated fields (2 tabs):
   Name<TAB>Overall<TAB>Jersey #
2. Name MUST be the FULL name from the YOUR INCOMING RECRUITING CLASS block —
   never an abbreviation. Only output recruits that appear in that block.
3. Overall: integer 40–99. Jersey #: integer 0–99, or BLANK if not visible
   (output the name and overall, then a trailing tab with nothing after it).
4. NO header row, NO commentary inside the data, NO commas, NO decimals,
   NO units.
5. NEVER guess. Omit a recruit entirely if you cannot see their overall.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== RECRUIT OVERALLS ===
<Name>\\t<Overall>\\t<Jersey #>
<Name>\\t<Overall>\\t<Jersey #>
...

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Every line has exactly 2 tab characters (3 fields)
[ ] Field 1 is a FULL name from the recruiting-class block (no initials)
[ ] Every Overall is an integer 40–99
[ ] Every Jersey # is an integer 0–99, or blank
[ ] No commas, no decimals, no quotes, no units`,
    includeTeamMap: false,
  }), [currentYear, recruits])

  // Pre-fill the local Overalls grid with recruits who already have a saved
  // overall, so re-opening the modal shows existing entries instead of a blank
  // grid. Column order mirrors parseRecruitOverallsLocal: Name, Overall, Jersey.
  // The parser keeps only overalls in 40–99, so only round-trippable rows are
  // emitted here (a not-yet-entered recruit has no valid overall and is skipped).
  const initialText = useMemo(() => {
    return (recruits || [])
      .map(p => {
        const ovr = parseInt(p.overall, 10)
        if (!Number.isFinite(ovr) || ovr < 40 || ovr > 99) return null
        const jersey = p.jerseyNumber != null ? String(p.jerseyNumber).trim() : ''
        return `${p.name || ''}\t${ovr}\t${jersey}`
      })
      .filter(Boolean)
      .join('\n')
  }, [recruits])

  // Full-attributes prompt — the AI emits each recruit's complete rating set in
  // one cell, plus Position + OVR. Used by the local paste grid.
  const attributesPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Signed Recruits — Full Attributes`,
    roster: (recruits || []).map(p => ({ name: p.name, jerseyNumber: p.jerseyNumber, position: p.position })),
    rosterLabel: 'YOUR INCOMING RECRUITING CLASS (match abbreviated names like "A. Guess" to full names)',
    structure: buildAttributesStructure('recruits'),
    includeTeamMap: false,
  }), [currentYear, recruits])

  // Ref to prevent concurrent sheet creation (state updates are async, refs are immediate)
  const creatingSheetRef = useRef(false)
  // Single-attempt guard: a FAILED creation must not silently re-fire (the
  // runaway loop that spam-created sheets). One attempt per modal-open; an
  // explicit retry bumps auth.retryCount and re-arms exactly one more.
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

  // Create recruit overalls sheet when modal opens
  useEffect(() => {
    // An explicit retry re-arms one fresh attempt by bumping auth.retryCount.
    if (auth.retryCount !== lastRetryCountRef.current) {
      lastRetryCountRef.current = auth.retryCount
      creationAttemptedRef.current = false
    }

    const createSheet = async () => {
      // Don't create a Google Sheet while the local paste path is active.
      if (isOpen && !useLocal && user && mode === 'overalls' && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote && !creationAttemptedRef.current) {
        // Mark attempted BEFORE any await so a rejection can't loop back in
        creationAttemptedRef.current = true
        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          // Check if we have an existing sheet
          const existingSheetId = currentDynasty?.recruitOverallsSheetId
          if (existingSheetId) {
            const stillExists = await sheetExists(existingSheetId)
            if (stillExists) {
              setSheetId(existingSheetId)
              return
            }
            await updateDynasty(currentDynasty.id, { recruitOverallsSheetId: null })
            // stale sheet (trashed in Drive); fall through to regenerate
          }

          const sheetInfo = await createRecruitOverallsSheet(
            currentDynasty?.teamName || 'Dynasty',
            currentYear,
            recruits || []
          )
          setSheetId(sheetInfo.spreadsheetId)

          // Save sheet ID to dynasty
          await updateDynasty(currentDynasty.id, {
            recruitOverallsSheetId: sheetInfo.spreadsheetId
          })
        } catch (error) {
          console.error('Failed to create recruit overalls sheet:', error)
          if (!auth.handleError(error)) toast.error(auth.describeError(error, 'create the sheet'))
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    createSheet()
  }, [isOpen, useLocal, user, mode, sheetId, currentDynasty?.id, auth.retryCount, showDeletedNote, recruits, currentYear])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowDeletedNote(false)
      creatingSheetRef.current = false
      creationAttemptedRef.current = false
      setUseLocal(true)
    }
  }, [isOpen])

  // Local paste import: parseRecruitOverallsLocal returns { name, overall,
  // jerseyNumber } — the fields handleRecruitOverallsSave matches on — so the
  // Google reader and the local paste feed onSave the same shape.
  const handleLocalImport = async (text) => {
    const results = parseRecruitOverallsLocal(splitTsv(text))
    await onSave(results)
    onClose()
  }

  const handleSyncFromSheet = async () => {
    if (!sheetId) return

    setSyncing(true)
    try {
      const recruitOveralls = await readRecruitOverallsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(recruitOveralls)
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
      const recruitOveralls = await readRecruitOverallsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(recruitOveralls)

      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { recruitOverallsSheetId: null })

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
      await updateDynasty(currentDynasty.id, { recruitOverallsSheetId: null })
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
      title: 'Delete this recruit overalls sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty recruit overalls stay as-is.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { recruitOverallsSheetId: null })
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

  if (!isOpen) return null

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'Recruit Overalls') : null
  const isLoading = creatingSheet

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
        <SheetModalHeader eyebrow="Recruiting" title="Incoming Freshmen Overalls" onClose={handleClose} />

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
        {attributesEnabled && (
          <div className="mb-3 inline-flex self-start rounded-md border border-surface-5 overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => setMode('overalls')}
              className={`px-3 py-1.5 font-semibold transition-colors ${mode === 'overalls' ? 'bg-surface-3 text-txt-primary' : 'text-txt-secondary hover:bg-surface-2'}`}
            >
              Overalls
            </button>
            <button
              type="button"
              onClick={() => setMode('attributes')}
              className={`px-3 py-1.5 font-semibold transition-colors border-l border-surface-5 ${mode === 'attributes' ? 'bg-surface-3 text-txt-primary' : 'text-txt-secondary hover:bg-surface-2'}`}
            >
              Full Attributes
            </button>
          </div>
        )}
        {mode === 'attributes' ? (
          <AttributePasteGrid
            players={recruits}
            year={currentYear}
            aiPrompt={attributesPrompt}
            onImport={async (entries) => { await onImportAttributes?.(entries) }}
            onClose={handleClose}
            hint="Paste the AI reply: one line per recruit — name, position, OVR, then the ratings cell (AWR 88, SPD 90, …)."
          />
        ) : useLocal && !showDeletedNote ? (
          <LocalDataEntry
            aiPrompt={localAiPrompt}
            onImport={handleLocalImport}
            onUseGoogle={() => setUseLocal(false)}
            onCancel={handleClose}
            importLabel="Import Overalls"
            columns={['Recruit', 'Overall', 'Jersey #']}
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
                Creating Recruiting Class Sheet...
              </p>
              <p className="text-sm mt-2 text-txt-secondary">
                Loading your incoming recruits and transfers
              </p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 text-center max-w-sm">
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">
                Saved & Moved to Trash
              </p>
              <p className="text-sm text-txt-secondary">
                Recruiting class overalls have been saved.
              </p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            <SheetModalAIHero
              tagline="Skip the typing. Let AI fill the recruit overalls."
              buttons={[{ label: 'Copy AI Prompt', prompt: aiPrompt }]}
            />
            {isMobile || !useEmbedded ? (
              <SheetManualEntry sheetId={sheetId} />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                <SheetToolbar sheetId={sheetId} embedUrl={embedUrl} teamColors={teamColors} title="Recruit Overalls" />
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
        ) : null}
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
