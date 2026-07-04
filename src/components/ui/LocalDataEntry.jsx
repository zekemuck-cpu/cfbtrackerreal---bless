import { useState, useMemo, useEffect, useRef } from 'react'
import Button from './Button'
import { useToast } from './Toast'
import { splitTsv } from '../../utils/tsvParse'
import { uploadImage } from '../../utils/imageUpload'
import ComboboxCell from './ComboboxCell'
import PasteEntrySteps from './PasteEntrySteps'

/**
 * LocalDataEntry — the universal "no Google Sheet needed" data-entry panel.
 *
 * This is the DEFAULT ingest path for every sheet/AI modal. The flow, top to
 * bottom, mirrors how the user actually works:
 *
 *   1. Copy AI Prompt              (white button, top)
 *   2. ▾ How to get your data      (collapsed help — screenshot instructions)
 *   3. Paste AI output here  [Paste ▾]   (white Paste button with an attached
 *                              arrow that reveals the raw text box)
 *   4. Editable GRID               (the pasted TSV as a real, gridded table —
 *                              the primary view; edit any cell before import)
 *   5. Import                      (serializes the grid and saves)
 *   …  Use Google Sheet instead    (escape hatch to the legacy Sheets flow)
 *
 * The AI prompts already emit tab-separated values, and `splitTsv` turns a
 * pasted reply into the SAME rows[][] the Google readers consume. The grid is
 * just an editable view of those rows; on import we re-serialize it to TSV so
 * each modal's `onImport(text)` reuses its existing parser. No sheet, no OAuth.
 *
 * Props:
 *   aiPrompt      — string copied by the Copy AI Prompt button.
 *   onImport(text)— async; parse + save the pasted text. Throws on failure.
 *   onUseGoogle   — switch to the Google Sheets flow.
 *   onCancel      — close without importing (optional).
 *   importLabel   — primary button text (default "Import").
 *   busy          — external disable (e.g. a parent save in flight).
 *   instructions  — override the default screenshot how-to copy.
 *   columns       — optional array of header labels. When given, the grid shows
 *                   a header row and a fixed column count; when omitted, the
 *                   column count is inferred from the pasted data.
 *   initialText   — optional TSV to pre-fill the grid with (e.g. the current
 *                   roster), so the modal opens on existing data for mass edits.
 *   imageColumn   — optional header label of a column that accepts a pasted
 *                   image: pasting an image into that cell auto-uploads it and
 *                   drops the resulting URL in the cell (a pasted URL still works).
 *   columnOptions — optional map of header label → allowed values. A value can
 *                   be a string[] (static dropdown) or (row, columns) => string[]
 *                   (dynamic, e.g. archetypes filtered by the row's position).
 *                   Cells in those columns render as a <select> dropdown.
 *   children      — optional extra content rendered above the action row
 *                   (e.g. a rankings-week selector).
 *
 * Grid keyboard nav is Excel-like: Tab moves right (native), Enter moves down.
 */

const DEFAULT_INSTRUCTIONS = `Take screenshots of the data you want to enter here. It doesn't have to be exact, just clear and fully showing. Upload those along with the copied prompt to your AI platform of choice. It will return a TSV output — copy that, then paste it below.`

export default function LocalDataEntry({
  aiPrompt,
  onImport,
  onUseGoogle,
  onCancel,
  importLabel = 'Import',
  busy = false,
  instructions = DEFAULT_INSTRUCTIONS,
  columns = null,
  initialText = '',
  imageColumn = null,
  columnOptions = null,
  comboboxColumns = null,
  comboboxAliases = null,
  rowLabels = null,
  rowLabelHeader = '',
  normalizeRows = null,
  children = null,
  // Optional "Upload file" alternative to pasting — reads a local .tsv file's
  // text and feeds it through the exact same applyText() path a clipboard
  // paste already uses. Off by default so no existing caller's UI changes;
  // callers that export/produce their own TSV files (e.g. the Recruiting
  // Database's backup) opt in explicitly.
  allowFileUpload = false,
  fileUploadAccept = '.tsv,.txt',
}) {
  // Fixed-row mode (e.g. the schedule's weeks 0–15): the grid is exactly
  // rowLabels.length rows, each with a read-only leading label. The label's
  // index leads the TSV so a blank row never collapses (splitTsv drops blank
  // lines, which would otherwise shift every later row).
  const isLabeled = Array.isArray(rowLabels) && rowLabels.length > 0
  const parseIncoming = (t) => {
    let parsed = splitTsv(t)
    // Optional per-modal row fixup applied on the way IN, so the GRID shows the
    // corrected shape (e.g. weekly scores recovering a column-shifted AI paste)
    // and the serialized import text is already canonical.
    if (typeof normalizeRows === 'function') parsed = normalizeRows(parsed) || parsed
    if (!isLabeled) return parsed
    // Fixed-row grid (e.g. the schedule's weeks 0–15). Accept BOTH shapes:
    //   • index-led   <idx>\t<col1>\t<col2>  — how serialize() round-trips and
    //     what our AI prompt emits; robust to blank rows (splitTsv drops blanks,
    //     which would otherwise shift every later row).
    //   • positional  <col1>\t<col2>         — a natural paste with no leading
    //     index (one row per label, in order — e.g. copying opponent+site
    //     straight from the game). Mapped by row position.
    // Only treat it as index-led when EVERY row starts with a valid label
    // index; otherwise fall back to position so a plain paste is never dropped.
    const indexLed = parsed.length > 0 && parsed.every((cells) => {
      const idx = Number(cells[0])
      return Number.isInteger(idx) && idx >= 0 && idx < rowLabels.length
    })
    const rows = Array.from({ length: rowLabels.length }, () => [])
    if (indexLed) {
      for (const cells of parsed) rows[Number(cells[0])] = cells.slice(1)
    } else {
      parsed.forEach((cells, i) => { if (i < rowLabels.length) rows[i] = cells })
    }
    return rows
  }
  const serialize = (g) => {
    if (!isLabeled) return g.map((r) => r.join('\t')).join('\n')
    return g.map((row, i) => [String(i), ...row.map((c) => c ?? '')].join('\t')).join('\n')
  }
  const { toast } = useToast()
  const [showText, setShowText] = useState(false)
  const [text, setText] = useState(() => initialText || '')
  const [grid, setGrid] = useState(() => parseIncoming(initialText || '')) // rows[][]
  const [importing, setImporting] = useState(false)
  const [uploadingCells, setUploadingCells] = useState(() => new Set())
  // The last initialText we seeded from. Lets us re-seed when the source data
  // arrives/changes (async roster load, year switch) WITHOUT clobbering edits.
  const seededRef = useRef(initialText || '')

  const imageColIndex = (imageColumn && columns?.length) ? columns.indexOf(imageColumn) : -1
  const cellKey = (ri, ci) => `${ri}:${ci}`

  // Wheel-capture fix. Every cell is an <input>/<select>, and a text input
  // whose value is wider than the cell is itself horizontally scrollable. Two
  // desktop failure modes fall out of that:
  //   • A horizontal wheel/trackpad gesture over the cell scrolls that ONE
  //     input's text a pixel or two and swallows the gesture — the table
  //     appears frozen.
  //   • A plain mouse wheel emits deltaY only. Chrome maps a vertical wheel
  //     over a horizontal-only scroller (the overflowing input) to scroll the
  //     input's TEXT sideways, so the modal never scrolls — the gesture is
  //     trapped in the hovered cell.
  // Attach a NON-passive wheel listener (React's onWheel is passive, so
  // preventDefault there is ignored) that routes horizontal intent to the
  // grid's own sideways scroll and vertical intent to the modal's scroll
  // container, and preventDefault()s so the hovered input never eats it.
  const gridScrollRef = useRef(null)
  const outerScrollRef = useRef(null)
  useEffect(() => {
    const el = gridScrollRef.current
    if (!el) return
    const onWheel = (e) => {
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY)
      if (horizontal) {
        if (el.scrollWidth <= el.clientWidth) return // nothing to scroll sideways
        el.scrollLeft += e.deltaX
        e.preventDefault()
        return
      }
      // Vertical: scroll the modal body ourselves so Chrome can't hijack the
      // wheel into scrolling the hovered input's overflowing text.
      const outer = outerScrollRef.current
      if (!outer || outer.scrollHeight <= outer.clientHeight) return
      outer.scrollTop += e.deltaY
      e.preventDefault()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Re-seed the grid from initialText when it changes, but only while the user
  // hasn't edited away from the last seed (so in-progress edits are never lost).
  useEffect(() => {
    const incoming = initialText || ''
    if (incoming !== seededRef.current && text === seededRef.current) {
      seededRef.current = incoming
      setText(incoming)
      setGrid(parseIncoming(incoming))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialText])

  // Column count: the schema's if provided, else the widest pasted row, else a
  // sensible 2-column default so the empty starter row still looks like a grid.
  const colCount = useMemo(() => {
    if (columns?.length) return columns.length
    const widest = grid.reduce((m, r) => Math.max(m, r.length), 0)
    return widest || 2
  }, [columns, grid])

  // Whether a column renders as a dropdown (select or combobox). Dropdown cells
  // need a little extra room for the caret, so width sizing accounts for it.
  const isDropdownColumn = (ci) => {
    if (!columns?.length) return false
    const key = columns[ci]
    return !!((columnOptions && columnOptions[key]) || (comboboxColumns && comboboxColumns[key]))
  }

  // Per-column widths (in `ch`) sized to the LONGEST value in that column (and
  // its header), so every column is as wide as its content instead of every
  // cell being crammed to an equal share. A text <input> has a fixed intrinsic
  // width regardless of its value, so auto table layout can't do this on its
  // own — we measure the data and drive explicit widths via <colgroup> + a
  // fixed table layout. Columns stay bounded: a floor keeps short columns
  // legible; a ceiling lets a very long cell (e.g. the one-cell Attributes
  // blob) scroll inside its input rather than dominating the whole table.
  const MIN_CH = 7
  const MAX_CH = 42
  const colWidths = useMemo(() => {
    const widths = []
    for (let ci = 0; ci < colCount; ci++) {
      let maxLen = columns?.[ci] ? String(columns[ci]).length : 0
      for (const row of grid) {
        const v = row[ci]
        if (v != null && v !== '') maxLen = Math.max(maxLen, String(v).length)
      }
      const dropdown = isDropdownColumn(ci)
      let ch = maxLen + 3 + (dropdown ? 2 : 0) // +3 breathing room, +2 for a caret
      ch = Math.min(Math.max(ch, dropdown ? 9 : MIN_CH), MAX_CH)
      widths.push(ch)
    }
    return widths
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, columns, colCount, columnOptions, comboboxColumns])

  // Leading row-label column (fixed-row grids like the schedule) sized to its
  // longest label. The remove-row column (dynamic grids) is a fixed narrow ch.
  const labelWidthCh = isLabeled
    ? Math.max(String(rowLabelHeader || '').length, ...rowLabels.map((l) => String(l ?? '').length)) + 3
    : 0
  const removeColCh = isLabeled ? 0 : 3
  const tableWidthCh = colWidths.reduce((a, b) => a + b, 0) + labelWidthCh + removeColCh

  // grid and text are kept in lockstep: whichever the user edits, the other
  // follows, so Import (which uses text) always matches what's on screen.
  // On a bulk paste we also SNAP dropdown-column cells onto their canonical
  // option (see normalizeGrid) so a pasted "hc"/"bama "/"Ul" lands on the exact
  // "HC"/"BAMA"/"UL" a <select>, combobox, or strict downstream parser expects.
  const applyText = (t) => {
    const g = normalizeGrid(parseIncoming(t))
    setGrid(g)
    setText(serialize(g))
  }
  const applyGrid = (g) => {
    setGrid(g)
    setText(serialize(g))
  }

  const editCell = (ri, ci, value) => {
    const g = grid.map((r) => [...r])
    while (g.length <= ri) g.push([])
    const row = g[ri]
    while (row.length <= ci) row.push('')
    row[ci] = value
    applyGrid(g)
  }

  const addRow = () => applyGrid([...grid, Array(colCount).fill('')])
  const removeRow = (ri) => applyGrid(grid.filter((_, i) => i !== ri))

  // Paste into an image column: if the clipboard holds an image, upload it and
  // drop the URL in the cell. If it's plain text (a URL), fall through to the
  // normal paste so the browser inserts it as-is.
  const handleCellPaste = async (e, ri, ci) => {
    if (ci !== imageColIndex) return
    const dt = e.clipboardData
    const imgFile =
      Array.from(dt?.items || [])
        .filter((it) => it.kind === 'file' && it.type?.startsWith('image/'))
        .map((it) => it.getAsFile())
        .find(Boolean) ||
      Array.from(dt?.files || []).find((f) => f.type?.startsWith('image/'))
    if (!imgFile) return // no image on the clipboard — let the URL paste happen
    e.preventDefault()
    const key = cellKey(ri, ci)
    setUploadingCells((prev) => new Set(prev).add(key))
    try {
      const url = await uploadImage(imgFile)
      editCell(ri, ci, url)
      toast.success('Image uploaded.')
    } catch (err) {
      console.error('Cell image upload failed:', err)
      toast.error(err?.message || 'Image upload failed. Try again or paste a URL.')
    } finally {
      setUploadingCells((prev) => {
        const n = new Set(prev)
        n.delete(key)
        return n
      })
    }
  }

  // Excel-like navigation: Tab moves right (native tab order), Enter moves down
  // the column. At the last row, Enter adds a fresh row and lands in it.
  const cellEls = useRef({})
  const registerCell = (ri, ci, el) => {
    if (el) cellEls.current[cellKey(ri, ci)] = el
    else delete cellEls.current[cellKey(ri, ci)]
  }
  const focusCell = (ri, ci) => {
    const el = cellEls.current[cellKey(ri, ci)]
    if (!el) return false
    el.focus()
    if (typeof el.select === 'function') { try { el.select() } catch { /* selects have no select() */ } }
    return true
  }
  const moveDown = (ri, ci) => {
    if (focusCell(ri + 1, ci)) return
    // At the last row: dynamic grids grow a row; fixed (labeled) grids stop.
    if (!isLabeled) { addRow(); setTimeout(() => focusCell(ri + 1, ci), 0) }
  }
  const handleCellKeyDown = (e, ri, ci) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    moveDown(ri, ci)
  }

  // Allowed <select> dropdown values for a column, or null for a free-text cell.
  const optionsFor = (ci, row) => {
    if (!columnOptions || !columns?.length) return null
    const spec = columnOptions[columns[ci]]
    if (!spec) return null
    const arr = typeof spec === 'function' ? spec(row, columns) : spec
    return Array.isArray(arr) ? arr : null
  }

  // Typeahead-combobox options for a column (e.g. team abbreviations), or null.
  const comboOptionsFor = (ci) => {
    if (!comboboxColumns || !columns?.length) return null
    const opts = comboboxColumns[columns[ci]]
    return Array.isArray(opts) ? opts : null
  }

  // The allowed option list for a column, whether it renders as a <select>
  // (columnOptions) or a typeahead combobox (comboboxColumns), or null for a
  // free-text column.
  const dropdownOptionsFor = (ci, row) => optionsFor(ci, row) || comboOptionsFor(ci)

  // Snap ONE pasted cell onto its column's canonical option when it matches
  // case-insensitively (ignoring surrounding spaces): "hc" -> "HC", "bama " ->
  // "BAMA", "Ul" -> "UL". A value that matches no option is returned untouched,
  // so free text and off-list entries are never lost. Free-text columns (no
  // options) are returned unchanged.
  const snapCell = (ci, row, val) => {
    if (val == null || val === '') return val
    const opts = dropdownOptionsFor(ci, row)
    if (!opts || opts.length === 0) return val
    const trimmed = String(val).trim()
    if (trimmed === '') return val
    if (opts.includes(trimmed)) return trimmed
    const lower = trimmed.toLowerCase()
    const hit = opts.find((o) => String(o).toLowerCase() === lower)
    return hit != null ? hit : val
  }

  // Snap every dropdown cell in a freshly-parsed grid. Walks each row left to
  // right so a column whose options depend on an earlier cell (e.g. archetypes
  // filtered by an already-snapped position) sees the canonical earlier value.
  const normalizeGrid = (g) => g.map((row) => {
    const out = [...row]
    for (let ci = 0; ci < out.length; ci++) out[ci] = snapCell(ci, out, out[ci])
    return out
  })


  const fileInputRef = useRef(null)
  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const fileText = await file.text()
      if (!fileText.trim()) {
        toast.error('That file is empty.')
        return
      }
      applyText(fileText)
      toast.success('File loaded into the grid.')
    } catch {
      toast.error('Could not read that file.')
    }
  }

  const pasteFromClipboard = async () => {
    if (!navigator.clipboard?.readText) {
      setShowText(true)
      toast.error('Your browser blocks clipboard reads. Tap the arrow and paste into the text box.')
      return
    }
    try {
      const clip = await navigator.clipboard.readText()
      if (!clip || !clip.trim()) {
        toast.error('Clipboard is empty. Copy the AI reply first.')
        return
      }
      applyText(clip) // fills the grid; no need to reveal the raw textarea
    } catch {
      setShowText(true)
      toast.error('Could not read the clipboard. Tap the arrow and paste into the text box.')
    }
  }

  // "Add below current data": parse the clipboard and APPEND its rows beneath
  // the rows already in the grid, instead of replacing everything. This is how
  // you add one (or a few) players without re-pasting the whole roster — copy
  // the new line(s), then pick this from the Paste arrow menu. Blank filler rows
  // are dropped first so the new rows land flush against the real data.
  const pasteAppendFromClipboard = async () => {
    if (!navigator.clipboard?.readText) {
      setShowText(true)
      toast.error('Your browser blocks clipboard reads. Tap the arrow and paste into the text box.')
      return
    }
    try {
      const clip = await navigator.clipboard.readText()
      if (!clip || !clip.trim()) {
        toast.error('Clipboard is empty. Copy the row(s) you want to add first.')
        return
      }
      const incoming = normalizeGrid(parseIncoming(clip))
      if (incoming.length === 0) {
        toast.error('No rows found in the clipboard.')
        return
      }
      const isBlankRow = (r) => !r.some((c) => (c ?? '').toString().trim() !== '')
      const base = grid.filter((r) => !isBlankRow(r))
      applyGrid([...base, ...incoming])
      toast.success(`Added ${incoming.length} row${incoming.length === 1 ? '' : 's'} below.`)
    } catch {
      setShowText(true)
      toast.error('Could not read the clipboard. Tap the arrow and paste into the text box.')
    }
  }

  const handleImport = async () => {
    if (!text.trim()) {
      setShowText(true)
      toast.error('Paste the AI output first.')
      return
    }
    setImporting(true)
    try {
      await onImport(text)
      // The parent closes/advances on success; toast there if it wants to.
    } catch (error) {
      console.error('Local import failed:', error)
      toast.error(error?.message || 'Could not import. Check the pasted output and try again.')
    } finally {
      setImporting(false)
    }
  }

  const disabled = busy || importing
  // Always render a grid (never a bare textarea). Empty → one starter row.
  // Labeled (fixed-row) grids always render exactly rowLabels.length rows.
  const displayRows = isLabeled
    ? Array.from({ length: rowLabels.length }, (_, i) => grid[i] || [])
    : (grid.length > 0 ? grid : [Array(colCount).fill('')])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div ref={outerScrollRef} className="flex-1 overflow-y-auto flex flex-col gap-3 pr-0.5">
        {/* Unified step header: 📸 + Copy Prompt → Open AI → Paste, each with an info toggle. */}
        <PasteEntrySteps
          aiPrompt={aiPrompt}
          onPaste={pasteFromClipboard}
          onPasteAppend={isLabeled ? undefined : pasteAppendFromClipboard}
          showText={showText}
          onToggleText={() => setShowText((v) => !v)}
          disabled={disabled}
          hints={{ screenshot: instructions }}
        />

        {allowFileUpload && (
          <div className="flex-shrink-0 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept={fileUploadAccept}
              onChange={handleFileSelected}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="text-xs text-txt-tertiary hover:text-txt-secondary transition disabled:opacity-60"
            >
              …or upload a file instead of pasting
            </button>
          </div>
        )}

        {showText && (
          <textarea
            value={text}
            onChange={(e) => applyText(e.target.value)}
            placeholder="Paste the AI's TSV reply here."
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            rows={6}
            className="flex-shrink-0 w-full rounded-md border border-surface-5 bg-surface-2 p-2 text-sm font-mono text-txt-primary resize-y focus:outline-none focus:ring-2 focus:ring-surface-5"
          />
        )}

        {/* 4. Editable grid — the primary view. Full gridlines (surface-5), no
            inter-cell gaps. Paste fills it; edits flow back to the text. */}
        <div
          ref={gridScrollRef}
          className="flex-shrink-0 rounded-md border border-surface-5 overflow-x-auto"
          style={{ touchAction: 'pan-x pan-y' }}
        >
          {/* table-layout:fixed honors the per-column <col> widths below; width
              is the summed content width so long columns push the table past the
              modal (horizontal scroll), while minWidth:100% still fills it when
              the content is narrow. */}
          <table
            className="text-[11px] sm:text-xs tabular border-collapse"
            style={{ tableLayout: 'fixed', width: `${tableWidthCh}ch`, minWidth: '100%' }}
          >
            <colgroup>
              {isLabeled && <col style={{ width: `${labelWidthCh}ch` }} />}
              {colWidths.map((w, ci) => (
                <col key={ci} style={{ width: `${w}ch` }} />
              ))}
              {!isLabeled && <col style={{ width: `${removeColCh}ch` }} />}
            </colgroup>
            {columns?.length ? (
              <thead className="bg-surface-2">
                <tr className="text-txt-tertiary">
                  {isLabeled && <th className="px-2 py-1 text-left font-semibold whitespace-nowrap border border-surface-5">{rowLabelHeader}</th>}
                  {columns.map((c, i) => (
                    <th key={i} className="px-2 py-1 text-left font-semibold whitespace-nowrap border border-surface-5">{c}</th>
                  ))}
                  {!isLabeled && <th className="w-6 border border-surface-5" aria-label="Remove" />}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {displayRows.map((row, ri) => (
                <tr key={ri}>
                  {isLabeled && (
                    <td className="border border-surface-5 px-2 py-0.5 whitespace-nowrap text-txt-tertiary bg-surface-2">{rowLabels[ri]}</td>
                  )}
                  {Array.from({ length: colCount }).map((_, ci) => {
                    const isImageCol = ci === imageColIndex
                    const uploading = isImageCol && uploadingCells.has(cellKey(ri, ci))
                    const opts = optionsFor(ci, row)
                    const comboOpts = comboOptionsFor(ci)
                    const val = row[ci] ?? ''
                    const label = columns?.[ci] ? `${columns[ci]} row ${ri + 1}` : `Row ${ri + 1} column ${ci + 1}`
                    return (
                      <td key={ci} className="border border-surface-5">
                        {uploading ? (
                          <div className="px-2 py-0.5 text-txt-tertiary italic">Uploading…</div>
                        ) : comboOpts ? (
                          <ComboboxCell
                            value={val}
                            options={comboOpts}
                            aliases={comboboxAliases}
                            onChange={(v) => editCell(ri, ci, v)}
                            onEnterDown={() => moveDown(ri, ci)}
                            inputRef={(el) => registerCell(ri, ci, el)}
                            ariaLabel={label}
                            placeholder="type to search…"
                          />
                        ) : opts ? (
                          <select
                            ref={(el) => registerCell(ri, ci, el)}
                            value={val}
                            onChange={(e) => editCell(ri, ci, e.target.value)}
                            onKeyDown={(e) => handleCellKeyDown(e, ri, ci)}
                            aria-label={label}
                            className="w-full bg-transparent text-txt-primary px-2 py-0.5 focus:outline-none focus:bg-surface-3"
                          >
                            <option value=""></option>
                            {/* Keep an off-list current value visible instead of silently blanking it. */}
                            {val && !opts.includes(val) && <option value={val}>{val}</option>}
                            {opts.map((o) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            ref={(el) => registerCell(ri, ci, el)}
                            type="text"
                            value={val}
                            placeholder={isImageCol ? 'paste image or URL' : undefined}
                            onChange={(e) => editCell(ri, ci, e.target.value)}
                            onPaste={isImageCol ? (e) => handleCellPaste(e, ri, ci) : undefined}
                            onKeyDown={(e) => handleCellKeyDown(e, ri, ci)}
                            aria-label={label}
                            // pan-x pan-y: a horizontal finger drag over an overflowing
                            // cell scrolls the TABLE, not the input's own text.
                            style={{ touchAction: 'pan-x pan-y' }}
                            className="w-full bg-transparent text-txt-primary px-2 py-0.5 focus:outline-none focus:bg-surface-3"
                          />
                        )}
                      </td>
                    )
                  })}
                  {!isLabeled && (
                    <td className="w-6 text-center border border-surface-5">
                      <button
                        type="button"
                        onClick={() => removeRow(ri)}
                        aria-label="Remove row"
                        className="text-txt-tertiary hover:text-txt-primary"
                      >
                        ×
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {!isLabeled && (
                <tr>
                  <td colSpan={colCount + 1} className="px-2 py-1 border border-surface-5">
                    <button
                      type="button"
                      onClick={addRow}
                      className="text-xs font-semibold text-txt-secondary hover:text-txt-primary"
                    >
                      + Add row
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {children}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 pt-3">
        <Button variant="ghost" size="sm" onClick={onUseGoogle} disabled={disabled}>Use Google Sheet instead</Button>
        <div className="flex gap-2 ml-auto">
          {onCancel && <Button variant="secondary" size="sm" onClick={onCancel} disabled={disabled}>Cancel</Button>}
          <Button variant="primary" size="sm" onClick={handleImport} disabled={disabled || !text.trim()}>
            {importing ? 'Importing…' : importLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
