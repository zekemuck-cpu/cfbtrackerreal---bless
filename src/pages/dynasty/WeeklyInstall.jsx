import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react'
import { createPortal } from 'react-dom'
import { useParams, Link } from 'react-router-dom'
import { useDynasty, getTeamRecord, getTeamRatingsForYear } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getUserTeamTid } from '../../data/teamRegistry'
import { getMascotName } from '../../data/teams'
import { getTeamColors } from '../../data/teamColors'
import { getContrastTextColor } from '../../utils/colorUtils'
import OpponentMatchupHero, { gameWeekLabel } from '../../components/OpponentMatchupHero'
import { Card, EmptyState, SectionHeader, Input } from '../../components/ui'

// Solid color-blocked header bars, one per column. Deliberately breaks from
// the app's normal dark-chip UI: this page is meant to read like a real
// laminated call sheet, not app chrome.
const HEADER_STYLE = {
  yellow: { bg: '#facc15', text: '#1a1200' },
  black: { bg: '#18181b', text: '#facc15' },
  blackRed: { bg: '#18181b', text: '#ef4444' },
  red: { bg: '#dc2626', text: '#ffffff' },
}

// Every box on the sheet is now a fixed-size "locked" box — no Add
// Play/Add Group, just a set number of rows the user types into. The whole
// call sheet is one persistent, dynasty-level playbook (currentDynasty.
// playbook) shared by every game rather than rebuilt per matchup, since
// none of this (your formations, your situational menu, your coverage
// answers) really changes week to week — only whether you've reviewed it
// for a given opponent does, which is tracked separately per game.
//
// meta.structure is an ordered list of blocks:
//   { divider: 'Label' }             — a bold section break, no rows of its own
//   { label: 'Label'|undefined, rows: N } — N fixed rows, optionally under a named group
// meta.numbered — rows show their 1-based position instead of a typed "#" (Script only)
// meta.editableTitle / meta.titlePlaceholder — user-named box (the 5 Identity formations)
// meta.units — this box's height on the call sheet, in "1 Identity box"
// units (default 1) — every column sums to 5 units, the same total as the
// 5 Identity boxes, so a 1-unit box in any column is always exactly the
// height of one Identity box, regardless of which column it's in.
const PLAYBOOK_SECTION_META = {
  identityFormation1: { editableTitle: true, titlePlaceholder: 'Blank Formation', structure: [{ rows: 6 }] },
  identityFormation2: { editableTitle: true, titlePlaceholder: 'Blank Formation', structure: [{ rows: 6 }] },
  identityFormation3: { editableTitle: true, titlePlaceholder: 'Blank Formation', structure: [{ rows: 6 }] },
  identityFormation4: { editableTitle: true, titlePlaceholder: 'Blank Formation', structure: [{ rows: 6 }] },
  identityFormation5: { editableTitle: true, titlePlaceholder: 'Blank Formation', structure: [{ rows: 6 }] },
  script: { title: 'Script', numbered: true, units: 2, structure: [{ rows: 10 }] },
  shortYardage: { title: 'Short Yardage', structure: [{ rows: 6 }] },
  secondLong: { title: '2nd & Long', structure: [{ rows: 6 }] },
  thirdDown: { title: '3rd Down', structure: [{ rows: 6 }] },
  playAction: { title: 'Play-Action', structure: [{ rows: 6 }] },
  screensRpos: { title: "Screens & RPO's", structure: [{ rows: 6 }] },
  twoMinute: { title: '2-Minute Offense', structure: [{ rows: 6 }] },
  redZone: { title: 'Red Zone', structure: [{ rows: 6 }] },
  goalLine: { title: 'Goal Line', structure: [{ rows: 6 }] },
  coverageBeaters: {
    title: 'Coverage Beaters',
    units: 4,
    structure: [
      { divider: '1 High' },
      { label: 'vs Cov 1', rows: 4 },
      { label: 'vs Cov 3', rows: 4 },
      { label: 'Cov 3 Match', rows: 4 },
      { divider: '2 High' },
      { label: 'vs Cov 2', rows: 3 },
      { label: 'vs Cov 2 Man', rows: 3 },
      { label: 'Cov 6', rows: 3 },
      { label: 'Cov 4', rows: 3 },
    ],
  },
  blitzAnswers: { title: 'Blitz Answers', structure: [{ rows: 6 }] },
}
const PLAYBOOK_SECTION_KEYS = Object.keys(PLAYBOOK_SECTION_META)

// The 4 call-sheet columns. "Situational" is a single header spanning the
// middle two columns (situationalA/situationalB) — those two columns don't
// get their own top-level header, just their own box coloring underneath
// the shared banner.
const COLUMNS = [
  { key: 'identity', boxBarStyle: 'yellow', sections: ['identityFormation1', 'identityFormation2', 'identityFormation3', 'identityFormation4', 'identityFormation5'] },
  { key: 'situationalA', boxBarStyle: 'black', sections: ['script', 'shortYardage', 'secondLong', 'thirdDown'] },
  { key: 'situationalB', boxBarStyle: 'blackRed', sections: ['playAction', 'screensRpos', 'twoMinute', 'redZone', 'goalLine'] },
  { key: 'answers', boxBarStyle: 'red', sections: ['coverageBeaters', 'blitzAnswers'] },
]

// Weekly install schedule the editable page is organized around — Tuesday
// through Friday work through the persistent playbook columns in order;
// Saturday is pure review before kickoff. All of it is editable any week,
// any time — the schedule is just a suggested rhythm, not a gate.
const DAY_META = {
  tue: { title: 'Tuesday Install', subtitle: 'Identity - your 5 base formations this week' },
  wed: { title: 'Wednesday Install', subtitle: 'Situational — script, short yardage, 2nd & long, 3rd down' },
  thu: { title: 'Thursday Install', subtitle: 'Situational — play-action, screens/RPOs, 2-minute, red zone, goal line' },
  fri: { title: 'Friday Install', subtitle: 'Answers — coverage beaters, blitz answers' },
  sat: { title: 'Saturday — Game Day', subtitle: 'Final review before kickoff' },
}

function newId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// Play-type tag, shown as its abbreviation everywhere except the dropdown
// itself (which lists full names) — a run/pass/RPO/screen/play-action
// label per play, narrow enough to sit in a "#"-box-sized slot.
const PLAY_TAG_OPTIONS = [
  { value: '', label: '—', abbr: '' },
  { value: 'run', label: 'Run', abbr: 'R' },
  { value: 'pass', label: 'Pass', abbr: 'P' },
  { value: 'rpo', label: 'RPO', abbr: 'RPO' },
  { value: 'screen', label: 'Screen', abbr: 'S' },
  { value: 'playAction', label: 'Play Action', abbr: 'PA' },
]
const PLAY_TAG_ABBR = Object.fromEntries(PLAY_TAG_OPTIONS.map((o) => [o.value, o.abbr]))

function emptyRow() {
  return { id: newId(), num: '', formation: '', play: '', tag: '' }
}

function emptyLockedSection(meta) {
  const total = meta.structure.reduce((sum, block) => sum + (block.rows || 0), 0)
  const base = { rows: Array.from({ length: total }, emptyRow) }
  return meta.editableTitle ? { ...base, title: '' } : base
}

const EMPTY_PLAYBOOK = PLAYBOOK_SECTION_KEYS.reduce((acc, key) => {
  acc[key] = emptyLockedSection(PLAYBOOK_SECTION_META[key])
  return acc
}, {})

// The only thing still tracked per-game — whether you've reviewed the
// (shared) playbook and scouting report for this particular opponent.
const EMPTY_GAME_INSTALL = {
  reviewedInstall: false,
  reviewScoutingReport: false,
  reviewCallSheet: false,
  walkthroughComplete: false,
}

// Header bar sizing, matching the reference sheet's hierarchy: column
// headers (IDENTITY, SITUATIONAL...) read big and bold, box headers (Base
// Runs, Red Zone...) a step down.
const BAR_SIZE_COMPACT = {
  lg: 'text-sm px-2 py-2',
  md: 'text-[11px] px-1.5 py-1.5',
  sm: 'text-[9px] px-1 py-1',
}
const BAR_SIZE_FULL = {
  lg: 'text-sm px-3 py-2',
  md: 'text-xs px-3 py-1.5',
  sm: 'text-[11px] px-2 py-1',
}

// Solid color bar — used both as a big column header (Identity,
// Situational, Answers) and as a smaller box header nested inside a
// column. `editable` swaps the static label for a text input, but only in
// the full editable page — on the (read-only) call sheet it still just
// shows the current value (or placeholder) as plain text.
function Bar({ label, style, compact, size = 'md', editable, value, placeholder = 'Untitled', onChange, onBlur, disabled }) {
  const sizeClass = compact ? BAR_SIZE_COMPACT[size] : BAR_SIZE_FULL[size]
  if (editable && !compact) {
    return (
      <div className={`font-bold uppercase tracking-wide ${sizeClass}`} style={{ backgroundColor: style.bg }}>
        <input
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          placeholder={disabled ? placeholder : `Click to Name — ${placeholder}`}
          autoComplete="off"
          spellCheck="false"
          className="w-full outline-none truncate uppercase placeholder:text-[color:var(--bar-text)] placeholder:opacity-70"
          style={{ backgroundColor: 'transparent', color: style.text, colorScheme: 'light', '--bar-text': style.text }}
        />
      </div>
    )
  }
  const text = editable ? (value || placeholder) : label
  return (
    <div className={`font-bold uppercase tracking-wide truncate ${sizeClass}`} style={{ backgroundColor: style.bg, color: style.text }}>
      {text}
    </div>
  )
}

// Read-only [1.][#][Formation][Play][Tag] row for the white call-sheet
// overlay — dividers render even when blank (locked boxes always show
// their full fixed structure, filled or not, since the point is a
// checklist of exact slots). `numbered` (Script only) adds a fixed "1."
// sequence prefix ahead of the normal fields — it doesn't replace "#",
// which is still the user's own short code (e.g. personnel — "3Y").
// Formation reads widest (e.g. "Gun Y Off Trips Wk"), Play a little
// narrower (e.g. "Slot 2 Buc"), # and Tag both narrowest (2-3 characters,
// e.g. "3Y" / "RPO") — Tag mirrors #'s width, opposite end of the row.
function SlotRowCompact({ row, numbered, index }) {
  const cols = numbered ? '1.1rem 2rem 1.3fr 1fr 2rem' : '2rem 1.3fr 1fr 2rem'
  return (
    <div className="grid border-b border-black last:border-0 flex-1 min-h-0 h-full" style={{ gridTemplateColumns: cols }}>
      {numbered && (
        <div className="px-0.5 text-xs font-bold text-center border-r border-black text-black truncate flex items-center justify-center">
          {index + 1}.
        </div>
      )}
      <div className="px-1 text-sm font-bold text-center border-r border-black text-black truncate flex items-center justify-center">{row.num}</div>
      <div className="px-1.5 text-sm font-semibold border-r border-black text-black truncate flex items-center">{row.formation}</div>
      <div className="px-1.5 text-sm text-black border-r border-black truncate flex items-center">{row.play}</div>
      <div className="px-1 text-sm font-bold text-center text-black truncate flex items-center justify-center">{PLAY_TAG_ABBR[row.tag] || ''}</div>
    </div>
  )
}

// Editable [1.][#][Formation][Play][Tag] row for the full-size page — no
// remove button, since locked boxes don't support structural changes.
// Tag is a real <select> (full option names — Run/Pass/RPO/Screen/Play
// Action) made invisible and stacked over a trigger that's the exact same
// <Input size="sm"> component as # — not a hand-styled div trying to
// approximate its box model — so the two boxes are guaranteed pixel-equal
// in both width and height. The trigger always shows a caret — in place
// of where # shows a number — so it reads as a picker even before
// anything's selected; once a tag is chosen, its abbreviation sits next
// to the caret.
function SlotRowEdit({ row, onChange, onBlur, disabled, numbered, index }) {
  return (
    <div className="flex gap-1 items-center">
      {numbered && (
        <div className="flex-none text-center text-xs font-bold text-txt-tertiary" style={{ width: '1.25rem' }}>{index + 1}.</div>
      )}
      <Input size="sm" value={row.num} onChange={(e) => onChange('num', e.target.value)} onBlur={onBlur} disabled={disabled} placeholder="#" className="flex-none text-center" style={{ width: '2.25rem' }} autoComplete="off" spellCheck="false" />
      <Input size="sm" value={row.formation} onChange={(e) => onChange('formation', e.target.value)} onBlur={onBlur} disabled={disabled} placeholder="Formation" className="flex-[1.3] min-w-0" autoComplete="off" spellCheck="false" />
      <Input size="sm" value={row.play} onChange={(e) => onChange('play', e.target.value)} onBlur={onBlur} disabled={disabled} placeholder="Play" className="flex-1 min-w-0" autoComplete="off" spellCheck="false" />
      <div className="relative flex-none" style={{ width: '2.25rem' }}>
        <Input
          size="sm"
          readOnly
          tabIndex={-1}
          value={PLAY_TAG_ABBR[row.tag] ? `${PLAY_TAG_ABBR[row.tag]} ▾` : '▾'}
          disabled={disabled}
          className="text-center pointer-events-none"
          style={{ width: '2.25rem', paddingLeft: '2px', paddingRight: '2px' }}
        />
        <select
          value={row.tag}
          onChange={(e) => onChange('tag', e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          aria-label="Play type"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        >
          {PLAY_TAG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    </div>
  )
}

// Owns local text state for exactly ONE row — typing here never touches
// the box's shared `section.rows` array, only this row's own state. Only
// on blur does it push the finished row up via `onCommitRow(rowId, row)`.
// This is the row-level counterpart to SheetBox's local draft: without it,
// every keystroke in ANY row called the box's shared state setter
// directly, which re-rendered EVERY row in the box on every character
// typed — cheap for a 6-row box, but genuinely laggy for a 24-row one
// (Coverage Beaters). Memoized with a stable `onCommitRow` (see SheetBox)
// so unrelated rows in the same box skip re-rendering entirely, the same
// way unrelated boxes already skip re-rendering each other. Deliberately
// has no resync-from-props effect, for the same reason SheetBox doesn't —
// see SheetBox's comment.
const EditableSlotRow = memo(function EditableSlotRow({ row, numbered, index, onCommitRow, disabled }) {
  const [local, setLocal] = useState(row)
  return (
    <SlotRowEdit
      row={local}
      numbered={numbered}
      index={index}
      onChange={(field, value) => setLocal((r) => ({ ...r, [field]: value }))}
      onBlur={() => onCommitRow(row.id, local)}
      disabled={disabled}
    />
  )
})

// Renders a locked section's fixed structure (dividers + labeled/unlabeled
// row runs), compact (read-only) or full (editable, but structurally
// fixed — no add/remove).
//
// Compact mode flattens dividers/labels/rows into ONE flex column filling
// the box's full height: dividers and labels stay their natural (small)
// size, and every data row gets an equal flex-1 share of whatever's left —
// so a 6-row box's rows always fill the box edge-to-edge with no dead
// space, and a 24-row box's rows come out proportionally the same height
// per row (since the box itself is sized in proportion to its row count —
// see `units` on PLAYBOOK_SECTION_META).
function LockedBox({ meta, section, compact, onCommitRow, disabled }) {
  if (compact) {
    const items = []
    let idx = 0
    meta.structure.forEach((block, bi) => {
      if (block.divider) {
        items.push(
          <div key={`d-${bi}`} className="flex-none px-1.5 py-1 text-[9px] font-extrabold uppercase bg-black text-white border-y-2 border-black truncate">
            {block.divider}
          </div>,
        )
        return
      }
      if (block.label) {
        items.push(
          <div key={`l-${bi}`} className="flex-none px-1.5 py-0.5 text-[8px] font-bold uppercase bg-black text-white border-y border-black truncate">
            {block.label}
          </div>,
        )
      }
      const start = idx
      idx += block.rows
      section.rows.slice(start, start + block.rows).forEach((r, ri) => {
        items.push(<SlotRowCompact key={r.id} row={r} numbered={meta.numbered} index={start + ri} />)
      })
    })
    return <div className="bg-white h-full flex flex-col">{items}</div>
  }

  let idx = 0
  return (
    <div className="p-2.5 space-y-2">
      {meta.structure.map((block, bi) => {
        if (block.divider) {
          return (
            <div key={bi} className="-mx-2.5 px-3 py-1 bg-surface-2 border-y border-surface-4 text-xs font-extrabold uppercase tracking-wide text-txt-primary">
              {block.divider}
            </div>
          )
        }
        const start = idx
        idx += block.rows
        const blockRows = section.rows.slice(start, start + block.rows)
        return (
          <div key={bi} className="space-y-1.5">
            {block.label && <div className="text-[11px] font-bold uppercase text-txt-tertiary">{block.label}</div>}
            {blockRows.map((r, ri) => (
              <EditableSlotRow
                key={r.id}
                row={r}
                numbered={meta.numbered}
                index={start + ri}
                onCommitRow={onCommitRow}
                disabled={disabled}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}

// One bordered box: a colored header bar (static, or for the 5 Identity
// formations, an editable title) + its locked row structure, in either
// compact (white call sheet) or full (editable page) rendering. `fill`
// makes it stretch to its parent's height with internal scrolling.
//
// Owns its OWN local draft of `section`. Title edits (the 5 Identity
// formations) update this directly and push up via `onCommit(sectionKey,
// draft)` on blur — cheap, since there's only one title per box. Row edits
// go through EditableSlotRow instead (see its comment) — each row owns
// ITS OWN local text and only touches this box's draft on that row's own
// blur, via the stable `commitRow` below. Without that, every keystroke
// in ANY row would update `draft` directly, re-rendering every other row
// in the box on every character typed.
//
// Deliberately does NOT resync `draft` from the `section` prop after
// mount. That resync used to exist for external updates (switching
// dynasties), but since the parent's own commit is what changes `section`
// in the first place, any resync effect risks clobbering newer local
// typing with an older snapshot the moment the parent's update lands —
// which is exactly what caused text to vanish after a paste. Switching
// dynasties instead gives this component a fresh `key` (see
// commitPlaybookSection's caller) so React mounts a brand-new instance
// with the right starting value, rather than trying to patch an existing
// one's state from outside.
//
// Wrapped in React.memo, with `onCommit` kept permanently stable by the
// caller (see commitPlaybookSection) — that combination means an edit in
// one box, or any unrelated app-wide re-render while editing, skips
// re-rendering the other 16 boxes entirely instead of just leaving their
// (harmless but wasteful) re-render to React.
const SheetBox = memo(function SheetBox({ meta, barStyle, compact, size = 'md', sectionKey, section, onCommit, disabled, fill }) {
  const [draft, setDraft] = useState(section)
  const draftRef = useRef(draft)
  useEffect(() => { draftRef.current = draft }, [draft])

  // Stable identity (the "latest ref" pattern again) so EditableSlotRow's
  // React.memo can bail out for every row except the one that actually
  // committed — a fresh closure per render would defeat that the same way
  // it would have defeated SheetBox's own memoization.
  const commitRowImplRef = useRef(null)
  commitRowImplRef.current = (rowId, updatedRow) => {
    const next = { ...draftRef.current, rows: draftRef.current.rows.map((r) => (r.id === rowId ? updatedRow : r)) }
    draftRef.current = next
    setDraft(next)
    onCommit(sectionKey, next)
  }
  const commitRow = useCallback((rowId, updatedRow) => commitRowImplRef.current(rowId, updatedRow), [])

  const wrapClass = compact
    ? `border-2 border-black overflow-hidden bg-white flex flex-col ${fill ? 'h-full min-h-0' : ''}`
    : 'border border-surface-4 rounded-md overflow-hidden'
  const commit = () => onCommit(sectionKey, draft)
  const content = <LockedBox meta={meta} section={draft} compact={compact} onCommitRow={commitRow} disabled={disabled} />
  return (
    <div className={wrapClass}>
      <Bar
        label={meta.title}
        style={barStyle}
        compact={compact}
        size={size}
        editable={!!meta.editableTitle}
        value={meta.editableTitle ? draft.title : undefined}
        placeholder={meta.titlePlaceholder}
        onChange={meta.editableTitle ? (value) => setDraft({ ...draft, title: value }) : undefined}
        onBlur={meta.editableTitle ? commit : undefined}
        disabled={disabled}
      />
      {compact && fill ? <div className="flex-1 min-h-0 overflow-y-auto">{content}</div> : content}
    </div>
  )
})

// Plain-flowing column wrapper for the editable page's day sections — a
// big header bar + its stacked boxes. The call-sheet overlay builds its
// own grid directly (see below), since it needs a header spanning two
// columns for "Situational".
function DayColumn({ title, barStyle, children }) {
  return (
    <div>
      <Bar label={title} style={barStyle} size="lg" />
      <div className="space-y-2 mt-2">{children}</div>
    </div>
  )
}

// Locks a box to a fixed share of its column's height on the call sheet —
// `units` flex-grow, not natural content size — so a 2-unit box (Script)
// or 4-unit box (Coverage Beaters) comes out exactly 2x/4x an ordinary
// 1-unit box's height. No-op on the editable page, which just flows
// naturally.
function SizedZone({ compact, units, children }) {
  if (!compact) return children
  return (
    <div className="flex flex-col min-h-0" style={{ flexGrow: units, flexBasis: 0 }}>
      {children}
    </div>
  )
}

// Weekly Install — PC/CFB27-only game-planning companion to Scouting
// Report. The Call Sheet opens as a full-screen white overlay via "View
// Call Sheet" — 4 columns (Identity / Situational [spans 2] / Answers)
// styled like a real laminated call sheet rather than app chrome. Every
// box is fixed-size (no add/remove) and the whole sheet is one persistent,
// dynasty-level playbook (currentDynasty.playbook) shared across every
// game. The same columns, full-size and editable, live in the page below,
// organized into a Tuesday-Saturday install schedule — that's a suggested
// rhythm, not a gate, since everything's editable any week. Only the
// review checklist (Friday/Saturday toggles) is still tracked per-game via
// patchGameFields.
export default function WeeklyInstall() {
  const { gameId } = useParams()
  const { currentDynasty, patchGameFields, updateDynasty, isViewOnly } = useDynasty()
  const pathPrefix = usePathPrefix()

  const game = useMemo(
    () => (currentDynasty?.games || []).find((g) => g.id === gameId),
    [currentDynasty?.games, gameId],
  )

  const [playbook, setPlaybook] = useState(() => ({ ...EMPTY_PLAYBOOK, ...(currentDynasty?.playbook || {}) }))
  useEffect(() => {
    setPlaybook({ ...EMPTY_PLAYBOOK, ...(currentDynasty?.playbook || {}) })
  }, [currentDynasty?.id])

  // Commit path for playbook edits. Each box keeps its own local draft
  // while typing (see SheetBox), so this only fires on blur. `setPlaybook`
  // fires immediately/synchronously — with SheetBox no longer resyncing
  // from props (see its comment), that's safe and correct, and
  // React.memo below keeps it cheap by only re-rendering the ONE box that
  // actually changed. Only the STORAGE write is debounced, so bouncing
  // box to box rapidly doesn't queue up a write on every single blur —
  // those coalesce into one write shortly after you pause. `onCommit` is
  // kept permanently stable via the "latest ref" pattern (commitImplRef)
  // so SheetBox's React.memo can actually bail out for the other boxes —
  // a fresh closure every render would defeat it.
  const playbookRef = useRef(playbook)
  useEffect(() => { playbookRef.current = playbook }, [playbook])
  const saveTimeoutRef = useRef(null)

  const flushImplRef = useRef(null)
  flushImplRef.current = () => {
    if (!saveTimeoutRef.current) return
    clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = null
    if (!currentDynasty || isViewOnly) return
    updateDynasty(currentDynasty.id, {
      playbook: { ...playbookRef.current, updatedAt: new Date().toISOString() },
    })
  }
  // Stable — safe to call from the "View Call Sheet" button so any
  // still-pending write flushes immediately, and from the unmount cleanup
  // below.
  const flushPlaybookSave = useCallback(() => flushImplRef.current(), [])

  const commitImplRef = useRef(null)
  commitImplRef.current = (key, nextSection) => {
    const next = { ...playbookRef.current, [key]: nextSection }
    playbookRef.current = next
    setPlaybook(next)
    if (!currentDynasty || isViewOnly) return
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => flushImplRef.current(), 500)
  }
  const commitPlaybookSection = useCallback((key, nextSection) => commitImplRef.current(key, nextSection), [])

  useEffect(() => {
    // Flush a pending debounced save on unmount (leaving the page) so a
    // last edit right before navigating away doesn't get lost.
    return () => flushImplRef.current()
  }, [])

  const [gameFields, setGameFields] = useState(() => ({ ...EMPTY_GAME_INSTALL, ...(game?.weeklyInstall || {}) }))
  useEffect(() => {
    setGameFields({ ...EMPTY_GAME_INSTALL, ...(game?.weeklyInstall || {}) })
  }, [game?.id])

  const [showCallSheet, setShowCallSheet] = useState(false)
  useEffect(() => {
    if (!showCallSheet) return
    const onKeyDown = (e) => { if (e.key === 'Escape') setShowCallSheet(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showCallSheet])

  // Memoized: getTeamRecord/getTeamRatingsForYear scan currentDynasty's
  // full game history, and getMascotName/getTeamColors scan its team list
  // — real work for a long dynasty. None of these inputs change when a
  // playbook edit re-renders this component (which happens on every
  // box/row commit — see commitPlaybookSection/commitRow), so without
  // memoizing, that scan reran on every single blur for no reason, and
  // handed OpponentMatchupHero new prop references every time, forcing
  // it to re-render too even though nothing it displays actually changed.
  const year = game ? Number(game.year) : null
  const userTeamTid = getUserTeamTid(currentDynasty)
  const opponentTid = game
    ? (Number(game.team1Tid) === Number(userTeamTid) ? Number(game.team2Tid) : Number(game.team1Tid))
    : null

  const record = useMemo(
    () => (game ? getTeamRecord(currentDynasty, opponentTid, year) : null),
    [currentDynasty, opponentTid, year, game],
  )
  const ratings = useMemo(
    () => (game ? getTeamRatingsForYear(currentDynasty, opponentTid, year) : null),
    [currentDynasty, opponentTid, year, game],
  )
  const opponentMascot = useMemo(
    () => (game ? getMascotName(opponentTid, currentDynasty?.teams || {}) : null),
    [game, opponentTid, currentDynasty?.teams],
  )
  const opponentColors = useMemo(
    () => (opponentMascot ? getTeamColors(opponentMascot, currentDynasty?.teams) : null),
    [opponentMascot, currentDynasty?.teams],
  )
  const bannerBg = opponentColors?.primary || '#1f2937'
  const bannerText = useMemo(() => getContrastTextColor(bannerBg), [bannerBg])
  const bannerLabel = useMemo(
    () => (game ? [gameWeekLabel(game), opponentMascot].filter(Boolean).join(' - ') : ''),
    [game, opponentMascot],
  )

  if (!currentDynasty) return null

  if (!game) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Weekly Install" />
        <Card><EmptyState title="Game Not Found" message="This matchup could not be located." /></Card>
      </div>
    )
  }

  const persistGame = async (nextFields) => {
    if (isViewOnly) return
    await patchGameFields(currentDynasty.id, game.id, {
      weeklyInstall: { ...nextFields, updatedAt: new Date().toISOString() },
    })
  }
  const handleToggle = (key) => {
    const next = { ...gameFields, [key]: !gameFields[key] }
    setGameFields(next)
    persistGame(next)
  }

  const toggleButton = (key, label) => (
    <button
      type="button"
      onClick={() => handleToggle(key)}
      disabled={isViewOnly}
      className={`btn-refined ${gameFields[key] ? 'btn-refined--solid' : ''}`}
    >
      {label}{gameFields[key] ? ' — Done' : ''}
    </button>
  )

  const renderColumnBoxes = (colKey, compact) => {
    const col = COLUMNS.find((c) => c.key === colKey)
    return col.sections.map((key) => {
      const meta = PLAYBOOK_SECTION_META[key]
      return (
        <SizedZone key={key} compact={compact} units={meta.units || 1}>
          <SheetBox
            key={currentDynasty.id}
            meta={meta}
            barStyle={HEADER_STYLE[col.boxBarStyle]}
            compact={compact}
            fill={compact}
            sectionKey={key}
            section={playbook[key]}
            onCommit={commitPlaybookSection}
            disabled={isViewOnly}
          />
        </SizedZone>
      )
    })
  }

  return (
    <div className="space-y-6">
      <OpponentMatchupHero
        dynasty={currentDynasty}
        game={game}
        opponentTid={opponentTid}
        pageTitle="Weekly Install"
        record={record}
        ratings={ratings}
        pathPrefix={pathPrefix}
      />

      <div className="flex flex-col sm:flex-row sm:justify-between gap-4">
        <div>
          <SectionHeader
            title="Call Sheet"
            subtitle="Builds itself from the daily installs — view below"
            size="sm"
          />
          <button type="button" onClick={() => { flushPlaybookSave(); setShowCallSheet(true) }} className="btn-refined btn-refined--solid">
            View Call Sheet
          </button>
        </div>
        <div className="sm:text-right">
          <SectionHeader
            title="Scouting Report"
            subtitle="View Scouting Report"
            size="sm"
          />
          <Link to={`${pathPrefix}/scouting/${game.id}`} className="btn-refined btn-refined--solid">
            View Scouting Report
          </Link>
        </div>
      </div>

      {showCallSheet && createPortal(
        <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 z-[9999] bg-surface-1 flex flex-col" style={{ margin: 0 }}>
          <div
            className="flex items-center justify-between gap-3 px-4 py-2 flex-shrink-0"
            style={{ backgroundColor: bannerBg, color: bannerText }}
          >
            <h2 className="text-sm font-bold uppercase tracking-wide m-0 flex-shrink-0">Call Sheet</h2>
            <div className="flex-1 text-center font-extrabold uppercase tracking-wide text-sm truncate px-2">
              {bannerLabel || 'Weekly Install'}
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => window.print()}
                className="text-[11px] font-semibold uppercase tracking-wide px-2 py-1 rounded-sm border bg-transparent"
                style={{ borderColor: bannerText, color: bannerText }}
              >
                Print
              </button>
              <button
                type="button"
                onClick={() => setShowCallSheet(false)}
                className="text-[11px] font-semibold uppercase tracking-wide px-2 py-1 rounded-sm border bg-transparent"
                style={{ borderColor: bannerText, color: bannerText }}
              >
                Close
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 bg-white flex flex-col print-call-sheet">
            {/* Screen shows the banner merged into the toolbar above (kept
                the same content-hugging width, not stretched) — this
                duplicate only renders for print, since the toolbar itself
                is app chrome that gets hidden when printing. */}
            <div
              className="hidden print:block flex-none text-center font-extrabold uppercase tracking-wide text-sm px-3 py-2"
              style={{ backgroundColor: bannerBg, color: bannerText }}
            >
              {bannerLabel || 'Weekly Install'}
            </div>
            <div
              className="grid flex-1 min-h-0"
              style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gridTemplateRows: 'auto 1fr' }}
            >
              <Bar label="Identity" style={HEADER_STYLE.yellow} compact size="lg" />
              <div style={{ gridColumn: 'span 2 / span 2' }}>
                <Bar label="Situational" style={HEADER_STYLE.black} compact size="lg" />
              </div>
              <Bar label="Answers" style={HEADER_STYLE.red} compact size="lg" />

              {COLUMNS.map((col) => (
                <div key={col.key} className="border-2 border-black bg-white flex flex-col overflow-hidden min-h-0">
                  <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
                    {renderColumnBoxes(col.key, true)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}

      <div>
        <SectionHeader title={DAY_META.tue.title} subtitle={DAY_META.tue.subtitle} size="sm" />
        <DayColumn title="Identity" barStyle={HEADER_STYLE.yellow}>
          {renderColumnBoxes('identity', false)}
        </DayColumn>
      </div>

      <div>
        <SectionHeader title={DAY_META.wed.title} subtitle={DAY_META.wed.subtitle} size="sm" />
        <DayColumn title="Situational" barStyle={HEADER_STYLE.black}>
          {renderColumnBoxes('situationalA', false)}
        </DayColumn>
      </div>

      <div>
        <SectionHeader title={DAY_META.thu.title} subtitle={DAY_META.thu.subtitle} size="sm" />
        <DayColumn title="Situational" barStyle={HEADER_STYLE.blackRed}>
          {renderColumnBoxes('situationalB', false)}
        </DayColumn>
      </div>

      <div>
        <SectionHeader title={DAY_META.fri.title} subtitle={DAY_META.fri.subtitle} size="sm" />
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {toggleButton('reviewedInstall', 'Reviewed Tuesday-Thursday Installs')}
          </div>
          <DayColumn title="Answers" barStyle={HEADER_STYLE.red}>
            {renderColumnBoxes('answers', false)}
          </DayColumn>
        </div>
      </div>

      <div>
        <SectionHeader title={DAY_META.sat.title} subtitle={DAY_META.sat.subtitle} size="sm" />
        <div className="flex flex-wrap gap-2">
          {toggleButton('reviewScoutingReport', 'Review Scouting Report')}
          {toggleButton('reviewCallSheet', 'Review Call Sheet')}
          {toggleButton('walkthroughComplete', 'Full Game Plan Walkthrough Complete')}
        </div>
      </div>
    </div>
  )
}
