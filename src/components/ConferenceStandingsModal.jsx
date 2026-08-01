import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import SheetModalHeader from './ui/SheetModalHeader'
import SheetModalAIHero from './ui/SheetModalAIHero'
import SheetModalFooter from './ui/SheetModalFooter'
import SheetManualEntry from './ui/SheetManualEntry'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
import SheetToolbar from './SheetToolbar'
import {
  createConferenceStandingsSheet,
  readConferenceStandingsFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl
} from '../services/sheetsService'
import { getModalColors } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'
import LocalDataEntry from './ui/LocalDataEntry'
import { splitTsv } from '../utils/tsvParse'
import { getTeamNameOptions, getTeamNameLabel, getTidFromAbbr, getTeamNameAliases } from '../data/teamRegistry'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function ConferenceStandingsModal({ isOpen, onClose, onSave, currentYear, teamColors }) {
  const { currentDynasty } = useDynasty()
  const teamAbbrs = useMemo(() => getTeamNameOptions(currentDynasty?.teams, { includeFCS: false }), [currentDynasty?.teams])
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])
  const { user, signOut } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const auth = useAuthErrorHandler()
  const [isMobile, setIsMobile] = useState(false)
  // Conference Standings opens on the Google Sheet by default — the grid reads
  // better for standings. This is the intentional exception; every other modal
  // defaults to local paste. (The local-paste code path is kept but not the
  // default here.)
  const [useLocal, setUseLocal] = useState(false)

  const [useEmbedded, setUseEmbedded] = useState(() => {
    // Load preference from localStorage
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Conference Standings`,
    structure: `This sheet has ONE tab named "Standings". Single vertical table, 7 columns, 11 conference blocks of 20 rows each with 1 spacer row between blocks.

Columns A (Conference name) and B (Conf. Rank 1-20) are PRE-FILLED in every team row. Column A text is the conference name; column B is the integer rank 1-20.
You fill columns C, D, E, F, G only (Team, Wins, Losses, Points For, Points Against).

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output ONLY columns C, D, E, F, G (Team, Wins, Losses, Points For, Points Against). Never output Conference name, Rank, header row, or spacer rows.
2. ONE labeled TSV block per conference — 11 total blocks. Each block has UP TO 20 lines (one per ranked team). Leave extra slots blank if a conference has fewer than 20 teams.
3. Row order within each block = rank 1 first → rank 20 last. Best record first.
4. Each line has EXACTLY 5 tab-separated fields: Team, Wins, Losses, Points For, Points Against.
5. NO COMMAS in numbers: "1234" not "1,234". No thousands separators.
6. Integers only — no decimal points in Wins/Losses/Points For/Points Against.
7. Fewer than 20 lines is allowed if a conference has fewer teams. Do NOT pad with fake entries. Do NOT guess — leave the remaining lines out rather than inventing teams.
8. Team values (col C) must be team names from the list at the bottom — NEVER an abbreviation, nickname, or mascot. Must be a member of the conference for that block.
9. Spacer rows between conferences in the sheet are NOT part of your output — each block starts fresh at the rank-1 cell of its conference.

═══════════════════════════════════════════════════════════
LAYOUT — 11 conferences in this EXACT order
═══════════════════════════════════════════════════════════
  1. ACC
  2. American
  3. Big 12
  4. Big Ten
  5. C-USA
  6. Independent
  7. MAC
  8. MWC
  9. Pac-12
 10. SEC
 11. Sun Belt

(Each conference occupies exactly 20 team rows starting at its rank-1 row, followed by 1 blank spacer row, then the next conference's rank-1 row.)

Independent is small (typically just ND, CONN, MASS) — output only 1-3 lines, not 20.

═══════════════════════════════════════════════════════════
PER-LINE OUTPUT (5 tab-separated fields)
═══════════════════════════════════════════════════════════
<Team Abbr>\\t<Wins>\\t<Losses>\\t<Points For>\\t<Points Against>

Field formats:
- Team Abbr (strict dropdown) — team name from the list at the bottom (e.g. Alabama, Ohio State, Georgia). Must be a team in THIS block's conference. NEVER an abbreviation, nickname, or mascot.
- Wins — integer, no decimals, no commas (e.g. "12" not "12.0" or "12,0").
- Losses — integer, same rules.
- Points For — season total integer, no commas (e.g. "487" not "4,870").
- Points Against — season total integer, same rules.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== ACC ===
<rank-1 team line>
<rank-2 team line>
...
<rank-N team line>

=== American ===
<up to 20 team lines in rank order>

=== Big 12 ===
<up to 20 team lines in rank order>

=== Big Ten ===
<up to 20 team lines in rank order>

=== C-USA ===
<up to 20 team lines in rank order>

=== Independent ===
<up to 20 team lines in rank order (usually 1-3)>

=== MAC ===
<up to 20 team lines in rank order>

=== MWC ===
<up to 20 team lines in rank order>

=== Pac-12 ===
<up to 20 team lines in rank order>

=== SEC ===
<up to 20 team lines in rank order>

=== Sun Belt ===
<up to 20 team lines in rank order>

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Exactly 11 labeled blocks, in the order: ACC, American, Big 12, Big Ten, C-USA, Independent, MAC, MWC, Pac-12, SEC, Sun Belt
[ ] Every line has exactly 5 tab-separated fields (4 tabs)
[ ] No commas in any number
[ ] No decimals (all values are integers)
[ ] All team values are uppercase names from the list — no full names
[ ] Every team is a valid member of its block's conference
[ ] Teams within a block are in rank order (rank 1 first)
[ ] Did not invent teams to fill to 20 — shorter blocks allowed
[ ] No Conference column, no Rank column, no header row, no commentary INSIDE the data. The only non-data lines are the === <SECTION> === labels above each fence.`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [currentYear, currentDynasty?.teams])

  // LOCAL-PASTE prompt: self-describing rows. Each line LEADS with the
  // conference name and the team's conference rank, so there is NO pre-filled
  // column to align against and NO spacer rows. The save keys by conference +
  // team, and re-sorts each conference by the rank field, so line order does
  // not matter and omitting unknown teams simply leaves them out.
  const localAiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Conference Standings`,
    structure: `Output ONE line per team's conference standing you can see. Each line is SELF-DESCRIBING — it LEADS with the conference name and the team's conference rank — so there is NO grid, NO spacer rows, and NO fixed block order.

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Each line has EXACTLY 7 tab-separated fields (6 tabs):
   Conference<TAB>Rank<TAB>Team<TAB>Wins<TAB>Losses<TAB>PointsFor<TAB>PointsAgainst
2. NO header row. NO blank lines. NO spacer rows. NO commentary, totals, or labels INSIDE the data.
3. OMIT any team you cannot see — do NOT pad, do NOT guess, do NOT invent teams. A team with no line is simply not recorded.
4. Line order does not matter (each line self-identifies with its conference + rank). Output a line for every team in every conference you can see.

═══════════════════════════════════════════════════════════
FIELD FORMATS
═══════════════════════════════════════════════════════════
- Conference — the EXACT conference this team plays in (e.g. "ACC", "SEC", "Big Ten", "Big 12", "Pac-12", "American", "Conference USA", "Mountain West", "MAC", "Sun Belt", "Independent"). Copy the conference name as shown in your screenshots. The Team MUST be a member of this conference.
- Rank — the team's place WITHIN its conference standings (integer, 1 = first place). If the screenshot lists teams top-to-bottom, the top team is 1, next is 2, and so on.
- Team — team name from the list at the bottom (e.g. Alabama, Ohio State, Georgia). NEVER an abbreviation, nickname, or mascot. Must be a member of that line's Conference.
- Wins — integer, no decimals, no commas (e.g. "12" not "12.0").
- Losses — integer, same rules.
- PointsFor — season total points scored, integer, no commas (e.g. "487" not "4,870").
- PointsAgainst — season total points allowed, integer, no commas.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== CONFERENCE STANDINGS ===
<Conference>\\t<Rank>\\t<Team>\\t<Wins>\\t<Losses>\\t<PointsFor>\\t<PointsAgainst>
…one line per team across all conferences; omit unknowns entirely

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Every line has exactly 7 tab-separated fields (six tabs)
[ ] The 1st field is a conference name and the 3rd field (Team) is a member of that conference
[ ] Rank is an integer (1 = conference leader) reflecting the team's place within its conference
[ ] Team values are uppercase names from the list — no full names
[ ] Wins/Losses/PointsFor/PointsAgainst are integers with no commas or decimals
[ ] No blank lines, no spacer rows, no header row, no commentary INSIDE the data — only teams you can actually see`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [currentYear, currentDynasty?.teams])

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

  useEffect(() => {
    if (auth.retryCount !== lastRetryCountRef.current) {
      lastRetryCountRef.current = auth.retryCount
      creationAttemptedRef.current = false
    }

    const createSheet = async () => {
      // Don't create a Google Sheet while the local paste path is active.
      if (isOpen && !useLocal && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote && !creationAttemptedRef.current) {
        // Set ref immediately to prevent concurrent calls (state updates are async)
        creationAttemptedRef.current = true
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          // Get existing data for pre-filling (if any)
          const existingStandings = currentDynasty?.conferenceStandingsByYear?.[currentYear] || {}
          const sheetInfo = await createConferenceStandingsSheet(currentYear, existingStandings, currentDynasty?.teams || currentDynasty?.customTeams)
          setSheetId(sheetInfo.sheetId)
        } catch (error) {
          console.error('Failed to create conference standings sheet:', error)
          if (!auth.handleError(error)) {
            toast.error('Failed to create the conference standings sheet. Try again or contact support.')
          }
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }
    createSheet()
  }, [isOpen, useLocal, user, sheetId, currentDynasty?.id, auth.retryCount, showDeletedNote])

  useEffect(() => {
    if (!isOpen) {
      setShowDeletedNote(false)
      creatingSheetRef.current = false
      creationAttemptedRef.current = false
      setSheetId(null)
      setUseLocal(true)
    }
  }, [isOpen])

  // Local paste import: the AI emits Conference<TAB>Rank<TAB>Team<TAB>Wins<TAB>
  // Losses<TAB>PointsFor<TAB>PointsAgainst rows — exactly the columns the reader
  // reads as row[0..6]. The reader groups by the per-row conference (row[0]) and
  // sorts each conference by rank, so the split rows flow straight through the
  // same path the Google sync uses. onSave keys by conference + team.
  const handleLocalImport = async (text) => {
    const dynastyTeams = currentDynasty?.teams || currentDynasty?.customTeams || null
    const standings = await readConferenceStandingsFromSheet(null, dynastyTeams, { rows: splitTsv(text) })
    await onSave(standings)
    onClose()
  }

  // Pre-fill the local grid with this year's saved conference standings.
  // readConferenceStandingsFromSheet reads self-describing rows in the column
  // order: Conference, Rank, Team, Wins, Losses, Points For, Points Against
  //   (row[0..6]). It groups by row[0] and re-sorts each conference by rank,
  //   so line order is irrelevant. Saved data lives in
  //   conferenceStandingsByYear[year] = { conf: [{ rank, team, wins, losses,
  //   pointsFor, pointsAgainst }] } — emitting one line per team round-trips.
  const initialText = useMemo(() => {
    const byConf = currentDynasty?.conferenceStandingsByYear?.[currentYear]
      || currentDynasty?.conferenceStandingsByYear?.[String(currentYear)]
      || {}
    const lines = []
    for (const [conference, teams] of Object.entries(byConf)) {
      if (!conference || !Array.isArray(teams)) continue
      for (const t of teams) {
        if (!t || !t.team) continue
        lines.push([
          conference,
          t.rank ?? '',
          getTeamNameLabel(currentDynasty?.teams, t.tid ?? getTidFromAbbr(t.team, currentDynasty)) || String(t.team),
          t.wins ?? 0,
          t.losses ?? 0,
          t.pointsFor ?? 0,
          t.pointsAgainst ?? 0,
        ].join('\t'))
      }
    }
    return lines.join('\n')
  }, [currentDynasty?.conferenceStandingsByYear, currentYear])

  const handleSyncFromSheet = async () => {
    if (!sheetId) return
    setSyncing(true)
    try {
      const standings = await readConferenceStandingsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(standings)
      onClose()
    } catch (error) {
      console.error(error)
      if (!auth.handleError(error)) {
        toast.error('Failed to sync from Google Sheets.')
      }
    } finally {
      setSyncing(false)
    }
  }

  const handleSyncAndDelete = async () => {
    if (!sheetId) return
    setDeletingSheet(true)
    try {
      const standings = await readConferenceStandingsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(standings)
      // Move sheet to trash (keep sheet ID stored so user can restore if needed)
      await deleteGoogleSheet(sheetId)
      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => onClose(), 2500)
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
      title: 'Delete this conference standings sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty conference standings stay as-is.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
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

  const handleClose = () => onClose()

  if (!isOpen) return null

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'Standings') : null
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
        <SheetModalHeader eyebrow="Standings" title={`${currentYear} Conference Standings`} onClose={handleClose} />

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
        {useLocal && !showDeletedNote ? (
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            <div
              className="rounded-lg border border-surface-4 bg-surface-2 px-4 py-3 text-xs sm:text-sm text-txt-secondary"
              role="note"
            >
              <span className="text-txt-primary font-semibold">Skip this if you've been entering weekly scores all season.</span>
              {' '}Standings are computed from your saved game results. This is only for end-of-season catch-up if you skipped weekly entry.
            </div>
            <LocalDataEntry
              aiPrompt={localAiPrompt}
              onImport={handleLocalImport}
              onUseGoogle={() => setUseLocal(false)}
              onCancel={handleClose}
              importLabel="Import Conference Standings"
              columns={['Conference', 'Rank', 'Team', 'Wins', 'Losses', 'Points For', 'Points Against']}
              comboboxColumns={{ Team: teamAbbrs }}
              comboboxAliases={getTeamNameAliases(currentDynasty?.teams)}
              initialText={initialText}
            />
          </div>
        ) : isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4" style={{ borderColor: 'var(--text-primary)', borderTopColor: 'transparent' }} />
              <p className="text-lg font-semibold text-txt-primary">Creating Conference Standings Sheet...</p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 text-center max-w-sm">
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
              <p className="text-sm text-txt-secondary">Conference standings saved.</p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            <div
              className="rounded-lg border border-surface-4 bg-surface-2 px-4 py-3 text-xs sm:text-sm text-txt-secondary"
              role="note"
            >
              <span className="text-txt-primary font-semibold">Skip this if you've been entering weekly scores all season.</span>
              {' '}Standings are computed from your saved game results. This sheet is only for end-of-season catch-up if you skipped weekly entry.
            </div>
            <SheetModalAIHero
              tagline="Skip the typing. Let AI fill the conference standings."
              buttons={[{ label: 'Copy AI Prompt', prompt: aiPrompt }]}
            />
            {isMobile || !useEmbedded ? (
              <SheetManualEntry sheetId={sheetId} />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                <SheetToolbar sheetId={sheetId} embedUrl={embedUrl} teamColors={teamColors} title="Conference Standings" />
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
      <AuthErrorModal isOpen={auth.showAuthError} onClose={auth.closeAuthError} onRefresh={auth.retry} teamColors={teamColors} />
    </div>,
    document.body,
  )
}
