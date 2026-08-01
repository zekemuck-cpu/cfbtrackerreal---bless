import { useState, useEffect, useMemo, useRef } from 'react'
import Button from './ui/Button'
import ComboboxCell from './ui/ComboboxCell'
import PasteEntrySteps from './ui/PasteEntrySteps'
import { useToast } from './ui/Toast'
import { splitTsv } from '../utils/tsvParse'
import {
  parseUnifiedBoxScoreRows,
  serializeUnifiedBoxScoreToTsv,
  getUnifiedBoxScoreSections,
} from '../services/sheetsService'
import { getPlayerStatsForTid } from '../utils/boxScoreHelpers'

// Local, Google-free player-stats entry. Same shape as the Team Stats grid but
// MULTI-SECTION with DYNAMIC rows: one editable table per stat category
// (Passing, Rushing, …), each with the category's own headers and as many
// player rows as the user needs. The grid is the source of truth; the raw TSV
// textarea (behind the arrow) stays in sync both ways. Paste fills it, existing
// stats pre-fill it, Import hands the same boxScore shape the sheet reader
// produces to the parent's onSave.

const coerce = (v) => {
  const s = (v ?? '').toString().trim()
  if (s === '') return null
  return isNaN(Number(s)) ? s : Number(s)
}

export default function PlayerStatsPasteGrid({
  game,
  targetTid,
  teamAbbr,
  teamLogo,
  dynastyTeams,
  aiPrompt,
  onImport,
  onClose,
  onUseGoogle,
  rosterNames = null,   // string[] of the target team's roster, for name typeahead
}) {
  const { toast } = useToast()
  const sections = useMemo(() => getUnifiedBoxScoreSections(), [])

  // Name typeahead is only useful when we actually track this team's roster
  // (opponents/FCS teams are often untracked — those cells stay free-text).
  const nameOptions = useMemo(
    () => (Array.isArray(rosterNames) ? rosterNames.filter(Boolean) : []),
    [rosterNames]
  )
  // Alias map so an EA-style "A. Guess" or a bare last name still surfaces the
  // full roster name as you type.
  const nameAliases = useMemo(() => {
    const out = {}
    for (const name of nameOptions) {
      const parts = String(name).trim().split(/\s+/)
      if (parts.length < 2) continue
      const first = parts[0]
      const last = parts.slice(1).join(' ')
      out[name] = [`${first[0]}. ${last}`, `${first[0]}.${last}`, last]
    }
    return out
  }, [nameOptions])

  // grid: { [sectionKey]: [ { playerName, [fieldKey]: value } ] }
  const emptyGrid = () => sections.reduce((acc, s) => { acc[s.key] = []; return acc }, {})
  const [grid, setGrid] = useState(emptyGrid)
  const [rawText, setRawText] = useState('')
  const [showRaw, setShowRaw] = useState(false)
  const [importing, setImporting] = useState(false)
  const prefilledRef = useRef(false)

  // Normalize any boxScore into a grid with every section present.
  const toGrid = (boxScore) =>
    sections.reduce((acc, s) => {
      acc[s.key] = (boxScore?.[s.key] || []).map((e) => ({ ...e }))
      return acc
    }, {})

  // Pre-fill from stats already saved for this team, so reopening shows them
  // (editable) instead of blank. Once per mount so edits are never clobbered.
  useEffect(() => {
    if (prefilledRef.current) return
    prefilledRef.current = true
    const existing = getPlayerStatsForTid(game, targetTid, dynastyTeams)
    if (!existing) return
    const g = toGrid(existing)
    setGrid(g)
    setRawText(serializeUnifiedBoxScoreToTsv(g))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const syncFromGrid = (g) => {
    setGrid(g)
    setRawText(serializeUnifiedBoxScoreToTsv(g))
  }

  const countRows = (g) => sections.reduce((n, s) => n + (g[s.key]?.length || 0), 0)

  const applyRawText = (text) => {
    const g = toGrid(parseUnifiedBoxScoreRows(splitTsv(text)))
    setRawText(text)
    setGrid(g)
    return countRows(g)
  }

  const editCell = (sectionKey, rowIdx, fieldKey, value) => {
    const g = { ...grid, [sectionKey]: grid[sectionKey].map((row, i) => (i === rowIdx ? { ...row, [fieldKey]: value } : row)) }
    syncFromGrid(g)
  }

  const addRow = (sectionKey) => {
    syncFromGrid({ ...grid, [sectionKey]: [...grid[sectionKey], { playerName: '' }] })
  }

  const removeRow = (sectionKey, rowIdx) => {
    syncFromGrid({ ...grid, [sectionKey]: grid[sectionKey].filter((_, i) => i !== rowIdx) })
  }

  const pasteFromClipboard = async () => {
    if (!navigator.clipboard?.readText) {
      setShowRaw(true)
      toast.error('Your browser blocks clipboard reads. Tap the arrow and paste into the text box.')
      return
    }
    try {
      const text = await navigator.clipboard.readText()
      if (!text || !text.trim()) {
        // Some mobile/in-app browsers hand back an empty string even when the
        // clipboard has content — open the text box so the user can paste by hand.
        setShowRaw(true)
        toast.error('Clipboard came back empty. Paste the AI reply into the text box below.')
        return
      }
      const rows = applyRawText(text)
      if (rows === 0) {
        // Clipboard had text but nothing parsed — don't fail silently (the grid
        // would just look blank). Surface the raw text so the user can fix it.
        setShowRaw(true)
        toast.error("Couldn't read any players from that paste. Make sure each category keeps its header row (Player Name, …) and the columns are tab-separated.")
      }
    } catch {
      setShowRaw(true)
      toast.error('Could not read the clipboard. Tap the arrow and paste into the text box.')
    }
  }

  // Build the import boxScore: coerce values, drop fully-empty rows.
  const buildBoxScore = () =>
    sections.reduce((acc, s) => {
      acc[s.key] = (grid[s.key] || [])
        .map((row) => {
          const entry = { playerName: (row.playerName ?? '').toString().trim() }
          s.fieldKeys.forEach((fk, idx) => {
            if (idx === 0) return
            entry[fk] = coerce(row[fk])
          })
          return entry
        })
        .filter((e) => e.playerName !== '' || s.fieldKeys.some((fk, idx) => idx > 0 && e[fk] != null))
      return acc
    }, {})

  const handleImport = async () => {
    const boxScore = buildBoxScore()
    const total = sections.reduce((n, s) => n + (boxScore[s.key]?.length || 0), 0)
    if (total === 0) {
      toast.error('Paste or enter at least one player first.')
      return
    }
    setImporting(true)
    try {
      await onImport(boxScore)
      toast.success('Player stats imported.')
      onClose()
    } catch (error) {
      console.error('Player stats paste import failed:', error)
      toast.error('Could not import the stats. Check the values and try again.')
    } finally {
      setImporting(false)
    }
  }

  const hasAny = sections.some((s) => (grid[s.key] || []).some((r) => (r.playerName ?? '') !== '' || s.fieldKeys.some((fk, idx) => idx > 0 && (r[fk] ?? '') !== '')))

  return (
    <div className="flex-1 flex flex-col overflow-hidden gap-3">
      {/* Unified step header: 📸 + Copy Prompt → Open AI → Paste, each with an info toggle. */}
      <PasteEntrySteps
        aiPrompt={aiPrompt}
        onPaste={pasteFromClipboard}
        showText={showRaw}
        onToggleText={() => setShowRaw((v) => !v)}
        hints={{ screenshot: "Take screenshots of the stats you want to enter. It doesn't have to be exact, just clear and fully showing. Then tap Copy Prompt." }}
      />
      <div className="flex-shrink-0 flex items-center gap-1.5 text-xs tabular text-txt-tertiary">
        <span>Entering stats for</span>
        {teamLogo
          ? <img src={teamLogo} alt={teamAbbr} title={teamAbbr} className="h-5 w-5 object-contain" />
          : <span className="font-semibold">{teamAbbr}</span>}
      </div>

      {showRaw && (
        <textarea
          value={rawText}
          onChange={(e) => applyRawText(e.target.value)}
          placeholder="Paste the AI's reply here. Each category has a banner, a header row, then one line per player."
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          rows={5}
          className="flex-shrink-0 w-full rounded-md border border-surface-5 bg-surface-2 p-2 text-sm font-mono text-txt-primary resize-y focus:outline-none focus:ring-2 focus:ring-surface-5"
        />
      )}

      {/* One editable table per category, dynamic player rows. */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 pr-0.5">
        {sections.map((s) => (
          <div key={s.key} className="flex-shrink-0 rounded-md border border-surface-5 overflow-hidden">
            <div className="px-2 py-1 label-xs text-txt-secondary bg-surface-2 border-b border-surface-5">{s.title}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs tabular border-collapse">
                <thead>
                  <tr className="text-txt-tertiary">
                    {s.headers.map((h, idx) => (
                      <th key={h} className={`px-1.5 py-1 font-semibold whitespace-nowrap border border-surface-5 ${idx === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                    <th className="px-1 py-1 w-6 border border-surface-5" aria-label="Remove" />
                  </tr>
                </thead>
                <tbody>
                  {(grid[s.key] || []).map((row, rowIdx) => (
                    <tr key={rowIdx}>
                      {s.fieldKeys.map((fk, idx) => (
                        <td key={fk} className={`border border-surface-5 ${idx === 0 ? 'min-w-[7rem]' : 'w-14'}`}>
                          {idx === 0 && nameOptions.length > 0 ? (
                            <ComboboxCell
                              value={row[fk] ?? ''}
                              options={nameOptions}
                              aliases={nameAliases}
                              onChange={(v) => editCell(s.key, rowIdx, fk, v)}
                              ariaLabel={`${s.title} ${s.headers[idx]} row ${rowIdx + 1}`}
                              placeholder="type to search…"
                            />
                          ) : (
                            <input
                              type="text"
                              inputMode={idx === 0 ? 'text' : 'decimal'}
                              value={row[fk] ?? ''}
                              onChange={(e) => editCell(s.key, rowIdx, fk, e.target.value)}
                              aria-label={`${s.title} ${s.headers[idx]} row ${rowIdx + 1}`}
                              className={`w-full bg-transparent tabular text-txt-primary px-1.5 py-0.5 focus:outline-none focus:bg-surface-3 ${idx === 0 ? 'text-left' : 'text-right'}`}
                            />
                          )}
                        </td>
                      ))}
                      <td className="w-6 text-center border border-surface-5">
                        <button
                          type="button"
                          onClick={() => removeRow(s.key, rowIdx)}
                          aria-label="Remove player"
                          className="text-txt-tertiary hover:text-txt-primary"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={s.headers.length + 1} className="px-1.5 py-1 border border-surface-5">
                      <button
                        type="button"
                        onClick={() => addRow(s.key)}
                        className="text-xs font-semibold text-txt-secondary hover:text-txt-primary"
                      >
                        + Add player
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onUseGoogle}>Use Google Sheet instead</Button>
        <div className="flex gap-2 ml-auto">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleImport} disabled={importing || !hasAny}>
            {importing ? 'Importing…' : 'Import Stats'}
          </Button>
        </div>
      </div>
    </div>
  )
}
