// Local TSV paste parsing — the no-Google-Sheets ingest path.
//
// The app's AI prompts already emit tab-separated values (TSV): one record
// per line, cells split by a single tab, no CSV quoting, no commas inside
// numbers. That is exactly what the Google read functions get back from the
// Sheets API as `data.values` (an array of arrays of cell strings). So a user
// can paste the AI's reply straight into a textarea and we split it into the
// SAME rows[][] shape the existing parsers already consume — no sheet, no
// OAuth, no rate limits.
//
// splitTsv(text) -> string[][]
//   One inner array per data line, each holding that line's tab-separated
//   cells. Skips blank lines, Markdown code fences (``` ...), and the
//   "=== LABEL ===" paste-target markers the prompts wrap their output in,
//   so the AI reply can be pasted verbatim. Only TRAILING empty cells are
//   dropped by the split (a line "420\t" yields ["420"]); callers read cells
//   positionally with `row[i] ?? ''`, so a short row reads as blanks — the
//   same behavior the Sheets API gives (it omits trailing empty cells too).
export function splitTsv(text) {
  if (!text) return []
  return String(text)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, '')) // drop trailing spaces/tabs only
    .filter((line) => {
      const t = line.trim()
      if (t === '') return false
      if (t.startsWith('```')) return false // markdown code fence
      if (/^={2,}.*={2,}$/.test(t)) return false // === paste-target label ===
      return true
    })
    .map((line) => line.split('\t'))
}
