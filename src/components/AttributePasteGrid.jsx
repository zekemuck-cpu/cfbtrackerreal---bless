import { useState, useEffect, useRef } from 'react'
import Button from './ui/Button'
import PasteEntrySteps from './ui/PasteEntrySteps'
import { useToast } from './ui/Toast'
import { splitTsv } from '../utils/tsvParse'
import { parseAttributeRows, serializeAttributeRows } from '../utils/attributeEntry'

// Local, Google-free FULL-ATTRIBUTE entry for Training Results / Recruit
// Overalls. One row per player: Player, Position, OVR, and the whole rating set
// as a single comma-separated "CODE value" cell (kept compact instead of ~50
// columns). The grid is the source of truth; the raw TSV textarea (behind the
// arrow) stays in sync both ways. Paste fills it, existing ratings pre-fill it,
// Import hands [{ playerName, position, overall, attributes }] to the parent.

export default function AttributePasteGrid({
  players,        // roster/recruit list to pre-fill from
  year,           // season key for overallByYear / attributesByYear
  aiPrompt,
  onImport,
  onClose,
  onUseGoogle,
  hint = 'Paste the AI reply here. One line per player: name, position, OVR, then the ratings cell.',
}) {
  const { toast } = useToast()
  const [grid, setGrid] = useState([])
  const [rawText, setRawText] = useState('')
  const [showRaw, setShowRaw] = useState(false)
  const [importing, setImporting] = useState(false)
  const prefilledRef = useRef(false)

  // Pre-fill from ratings already stored on each player for this season, so
  // reopening shows them (editable) and the AI only needs to fill blanks.
  useEffect(() => {
    if (prefilledRef.current) return
    prefilledRef.current = true
    const y = Number(year)
    const entries = (players || []).map((p) => {
      const ovr = p?.overallByYear?.[y] ?? p?.overallByYear?.[String(y)] ?? p?.overall ?? null
      const attrs = p?.attributesByYear?.[y] || p?.attributesByYear?.[String(y)] || {}
      return { playerName: p?.name || '', position: p?.position || '', overall: ovr, attributes: { ...attrs } }
    }).filter((e) => e.playerName)
    setGrid(entries)
    setRawText(serializeAttributeRows(entries))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const syncFromGrid = (g) => {
    setGrid(g)
    setRawText(serializeAttributeRows(g))
  }

  const applyRawText = (text) => {
    setRawText(text)
    setGrid(parseAttributeRows(splitTsv(text)))
  }

  const editCell = (rowIdx, field, value) => {
    const g = grid.map((row, i) => (i === rowIdx ? { ...row, [field]: value } : row))
    setGrid(g)
    setRawText(serializeAttributeRows(g))
  }

  // Edit the raw attributes cell for one row -> reparse just that cell.
  const editAttrsCell = (rowIdx, cellText) => {
    const parsed = parseAttributeRows(splitTsv(`x\t\t\t${cellText}`))
    const attributes = parsed[0]?.attributes || {}
    const g = grid.map((row, i) => (i === rowIdx ? { ...row, attributes, _attrsText: cellText } : row))
    setGrid(g)
    setRawText(serializeAttributeRows(g))
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
        toast.error('Clipboard is empty. Copy the AI reply first.')
        return
      }
      applyRawText(text)
    } catch {
      setShowRaw(true)
      toast.error('Could not read the clipboard. Tap the arrow and paste into the text box.')
    }
  }

  const attrCount = (attrs) => (attrs ? Object.keys(attrs).length : 0)
  const attrsCellText = (row) => row._attrsText ?? serializeAttributeRows([row]).split('\t').slice(3).join('\t')

  // Keep rows that carry real data (OVR or at least one attribute).
  const buildEntries = () =>
    grid
      .map((r) => ({
        playerName: (r.playerName ?? '').toString().trim(),
        position: (r.position ?? '').toString().trim(),
        overall: r.overall === '' || r.overall == null ? null : Number(r.overall),
        attributes: r.attributes || {},
      }))
      .filter((e) => e.playerName && (e.overall != null || attrCount(e.attributes) > 0))

  const handleImport = async () => {
    const entries = buildEntries()
    if (entries.length === 0) {
      toast.error('Paste or enter at least one player first.')
      return
    }
    setImporting(true)
    try {
      await onImport(entries)
      toast.success('Attributes imported.')
      onClose()
    } catch (error) {
      console.error('Attribute paste import failed:', error)
      toast.error('Could not import the ratings. Check the values and try again.')
    } finally {
      setImporting(false)
    }
  }

  const hasAny = grid.some((r) => (r.playerName ?? '') !== '' && (r.overall != null || attrCount(r.attributes) > 0))

  return (
    <div className="flex-1 flex flex-col overflow-hidden gap-3">
      {/* Unified step header: 📸 + Copy Prompt → Open AI → Paste, each with an info toggle. */}
      <PasteEntrySteps
        aiPrompt={aiPrompt}
        onPaste={pasteFromClipboard}
        showText={showRaw}
        onToggleText={() => setShowRaw((v) => !v)}
      />

      {showRaw && (
        <textarea
          value={rawText}
          onChange={(e) => applyRawText(e.target.value)}
          placeholder={hint}
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          rows={6}
          className="flex-shrink-0 w-full rounded-md border border-surface-5 bg-surface-2 p-2 text-sm font-mono text-txt-primary resize-y focus:outline-none focus:ring-2 focus:ring-surface-5"
        />
      )}

      <div className="flex-1 min-h-0 overflow-auto rounded-md border border-surface-5">
        <table className="w-full text-xs tabular border-collapse">
          <thead className="sticky top-0 bg-surface-2 z-10">
            <tr className="text-txt-tertiary">
              <th className="px-2 py-1 text-left font-semibold whitespace-nowrap border border-surface-5">Player</th>
              <th className="px-2 py-1 text-left font-semibold whitespace-nowrap border border-surface-5">Pos</th>
              <th className="px-2 py-1 text-right font-semibold whitespace-nowrap border border-surface-5">OVR</th>
              <th className="px-2 py-1 text-left font-semibold whitespace-nowrap border border-surface-5">Attributes</th>
            </tr>
          </thead>
          <tbody>
            {grid.map((row, i) => (
              <tr key={i}>
                <td className="min-w-[8rem] border border-surface-5">
                  <input
                    type="text"
                    value={row.playerName ?? ''}
                    onChange={(e) => editCell(i, 'playerName', e.target.value)}
                    aria-label={`Player ${i + 1}`}
                    className="w-full bg-transparent text-txt-primary px-2 py-0.5 focus:outline-none focus:bg-surface-3"
                  />
                </td>
                <td className="w-14 border border-surface-5">
                  <input
                    type="text"
                    value={row.position ?? ''}
                    onChange={(e) => editCell(i, 'position', e.target.value)}
                    aria-label={`Position ${i + 1}`}
                    className="w-full bg-transparent text-txt-primary px-2 py-0.5 focus:outline-none focus:bg-surface-3"
                  />
                </td>
                <td className="w-14 border border-surface-5">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={row.overall ?? ''}
                    onChange={(e) => editCell(i, 'overall', e.target.value)}
                    aria-label={`Overall ${i + 1}`}
                    className="w-full bg-transparent text-right tabular text-txt-primary px-2 py-0.5 focus:outline-none focus:bg-surface-3"
                  />
                </td>
                <td className="min-w-[16rem] border border-surface-5">
                  <input
                    type="text"
                    value={attrsCellText(row)}
                    onChange={(e) => editAttrsCell(i, e.target.value)}
                    aria-label={`Attributes ${i + 1}`}
                    placeholder="AWR 88, SPD 90, …"
                    className="w-full bg-transparent text-txt-primary px-2 py-0.5 font-mono focus:outline-none focus:bg-surface-3"
                  />
                </td>
              </tr>
            ))}
            {grid.length === 0 && (
              <tr>
                <td colSpan={4} className="px-2 py-4 text-center text-txt-tertiary border border-surface-5">
                  Paste the AI reply to fill ratings.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {onUseGoogle
          ? <Button variant="ghost" size="sm" onClick={onUseGoogle}>Use Google Sheet instead</Button>
          : <span />}
        <div className="flex gap-2 ml-auto">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleImport} disabled={importing || !hasAny}>
            {importing ? 'Importing…' : 'Import Ratings'}
          </Button>
        </div>
      </div>
    </div>
  )
}
