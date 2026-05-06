// Lightweight renderer for AI-generated game recaps. Supports the small
// subset of markdown we ask the model to emit: **bold**, *italic* / _italic_,
// and # / ## / ### headings at line-start. Plain text passes through
// unchanged, so pre-markdown recaps still render correctly.
//
// Optional `playerLinks` prop — array of { pattern, render } used to auto-link
// player names inside paragraph text. The renderer compiles all patterns into
// a single word-boundary regex and wraps matches in whatever `render` returns
// (typically a <Link>). Longest patterns are matched first so "Sidney Ebiketie"
// wins over bare "Ebiketie".

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Recap prompt instructs the AI to wrap its entire output in a fenced
// markdown code block so the iOS Claude app preserves the markdown markers
// when the user copies the text. Strip that wrapper here before parsing,
// while staying tolerant of:
//   - users who paste raw markdown (no fences)
//   - opening fences that include a language hint (```markdown / ```md)
//   - leading/trailing whitespace or blank lines around the fences
//   - stray AI commentary above or below the fence (we extract just the
//     fenced contents)
function unwrapCodeFence(text) {
  if (!text) return text
  const lines = text.split('\n')
  const isOpenFence = (l) => /^```[a-zA-Z]*\s*$/.test(l.trim())
  const isCloseFence = (l) => /^```\s*$/.test(l.trim())

  let openIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (isOpenFence(lines[i])) { openIdx = i; break }
  }
  if (openIdx === -1) return text

  let closeIdx = -1
  for (let i = lines.length - 1; i > openIdx; i--) {
    if (isCloseFence(lines[i])) { closeIdx = i; break }
  }
  if (closeIdx === -1) return text

  return lines.slice(openIdx + 1, closeIdx).join('\n')
}

// Each link entry is either:
//   { pattern: 'literal-string', render }  — escaped + word-boundary-wrapped
//   { regex:   'raw regex source', render } — used as-is (caller controls
//                                              boundaries; supports lookbehind
//                                              for context-aware matches)
//
// The combined regex uses NAMED capture groups (g0, g1, ...) so we can tell
// which entry matched without a separate lookup table. Raw entries come
// first in alternation order so more specific patterns ("#9 Alabama",
// "(?<=Tennessee\\s+)56-35") get tried before bare literals ("Alabama").
function compilePlayerRegex(playerLinks) {
  if (!playerLinks?.length) return null
  const sorted = [...playerLinks].sort((a, b) => {
    const ar = !!a.regex
    const br = !!b.regex
    if (ar !== br) return ar ? -1 : 1
    const al = (a.regex || a.pattern || '').length
    const bl = (b.regex || b.pattern || '').length
    return bl - al
  })
  const parts = sorted.map((entry, i) => {
    const source = entry.regex
      ? `(?:${entry.regex})`
      : `\\b${escapeRegex(entry.pattern)}\\b`
    return `(?<g${i}>${source})`
  })
  return { regex: new RegExp(parts.join('|'), 'g'), sorted }
}

function linkifyText(text, compiled, _lookup, keyPrefix, precedingContext = '') {
  if (!text || !compiled) return text ? [text] : []
  const { regex, sorted } = compiled
  // Run the regex against context + text so that lookbehind patterns
  // (e.g. shared-score links that need "Tennessee" before "56-35") can
  // see the prior non-bold portion of the line. Without this, the AI's
  // habit of bolding scores ("Texas State **58-28**") split the team
  // name and score into separate chunks, the score's lookbehind never
  // matched anything, and shared scores silently fell through to plain
  // text. We only EMIT matches that land entirely in the actual text
  // portion — anything in the context was already rendered by an
  // earlier call.
  const fullText = precedingContext + text
  const offset = precedingContext.length
  const out = []
  let lastIdx = 0
  let matchIdx = 0
  regex.lastIndex = 0 // RegExp with /g flag preserves state — reset for each call
  let m
  while ((m = regex.exec(fullText)) !== null) {
    // Match falls entirely inside the prepended context — skip silently.
    if (m.index + m[0].length <= offset) {
      if (m[0].length === 0) regex.lastIndex++
      continue
    }
    // Match straddles the context/text boundary — drop it. Shouldn't
    // happen with well-formed patterns but guards against edge cases.
    if (m.index < offset) {
      if (m[0].length === 0) regex.lastIndex++
      continue
    }
    const startInText = m.index - offset
    if (startInText > lastIdx) out.push(text.slice(lastIdx, startInText))
    let renderer = null
    if (m.groups) {
      for (let i = 0; i < sorted.length; i++) {
        if (m.groups[`g${i}`] !== undefined) {
          renderer = sorted[i].render
          break
        }
      }
    }
    out.push(renderer ? renderer(m[0], `${keyPrefix}-${matchIdx++}`) : m[0])
    lastIdx = startInText + m[0].length
    if (m[0].length === 0) regex.lastIndex++ // guard against zero-length infinite loop
  }
  if (lastIdx < text.length) out.push(text.slice(lastIdx))
  return out
}

function renderItalic(text, keyPrefix, playerRegex, lookup, precedingContext = '') {
  if (!text) return null
  const parts = text.split(/(\*[^*\n]+?\*|_[^_\n]+?_)/g)
  const out = []
  let ctx = precedingContext
  parts.forEach((part, i) => {
    if (!part) return
    const key = `${keyPrefix}-i${i}`
    const ast = part.match(/^\*(.+?)\*$/)
    if (ast) {
      out.push(<em key={key}>{linkifyText(ast[1], playerRegex, lookup, key, ctx)}</em>)
      ctx += ast[1]
      return
    }
    const und = part.match(/^_(.+?)_$/)
    if (und) {
      out.push(<em key={key}>{linkifyText(und[1], playerRegex, lookup, key, ctx)}</em>)
      ctx += und[1]
      return
    }
    const linked = linkifyText(part, playerRegex, lookup, key, ctx)
    linked.forEach((node) => out.push(typeof node === 'string' ? node : node))
    ctx += part
  })
  return out
}

function renderInline(text, keyPrefix, playerRegex, lookup) {
  if (!text) return null
  const parts = text.split(/(\*\*[^*]+?\*\*)/g)
  // Accumulate plain-text prefix as we walk the bold-split chunks so
  // each linkifyText call inside a bold span gets the line's earlier
  // text as lookbehind context. The recap commonly bolds scores after
  // a team name ("Tennessee 56-35" rendered as "Tennessee **56-35**"),
  // and without this context the score's team-name lookbehind would
  // fail for any shared score and the link would never render.
  let priorContext = ''
  const out = []
  parts.forEach((part, i) => {
    if (!part) return
    const key = `${keyPrefix}-b${i}`
    const bold = part.match(/^\*\*(.+?)\*\*$/)
    if (bold) {
      out.push(
        <strong key={key} className="font-bold text-white">
          {renderItalic(bold[1], key, playerRegex, lookup, priorContext)}
        </strong>
      )
      priorContext += bold[1]
      return
    }
    out.push(<span key={key}>{renderItalic(part, key, playerRegex, lookup, priorContext)}</span>)
    priorContext += part
  })
  return out
}

export default function FormattedRecap({ text, className = '', playerLinks = null }) {
  if (!text) return null

  // `playerLinks` was the original prop name (back when it only auto-linked
  // player names). It now accepts any mix of literal-string patterns AND raw
  // regex source — the compiled value carries both the combined regex and
  // the ordered entry list so linkifyText can identify which entry matched.
  const playerRegex = compilePlayerRegex(playerLinks)
  const lookup = null // legacy arg slot — no longer used by linkifyText

  // Strip any outer ```markdown ... ``` wrapper added by the AI per our
  // recap prompt before splitting into paragraphs.
  const unwrapped = unwrapCodeFence(text)
  const blocks = unwrapped.split(/\n{2,}/)

  // Headings intentionally skip player linking. A linked name inside a bold
  // heading ends up rendered at the same size but non-bold (our link forces
  // font-normal to avoid the "bold + underlined" look users hated inside
  // body **bold** spans), which next to the bold heading text visually
  // reads as smaller. Keeping headings link-free preserves the weight
  // consistency readers expect from a headline.

  return (
    <div className={className}>
      {blocks.map((block, bi) => {
        const trimmed = block.trim()
        if (!trimmed) return null

        if (/^###\s+/.test(trimmed)) {
          return (
            <h4 key={bi} className="text-sm font-bold text-white uppercase tracking-wide mt-4 mb-1.5 first:mt-0">
              {renderInline(trimmed.replace(/^###\s+/, ''), `h4-${bi}`, null, lookup)}
            </h4>
          )
        }
        if (/^##\s+/.test(trimmed)) {
          return (
            <h3 key={bi} className="text-base font-bold text-white mt-5 mb-2 first:mt-0">
              {renderInline(trimmed.replace(/^##\s+/, ''), `h3-${bi}`, null, lookup)}
            </h3>
          )
        }
        if (/^#\s+/.test(trimmed)) {
          return (
            <h2 key={bi} className="text-lg font-bold text-white mt-6 mb-3 first:mt-0">
              {renderInline(trimmed.replace(/^#\s+/, ''), `h2-${bi}`, null, lookup)}
            </h2>
          )
        }

        const lines = trimmed.split('\n')
        return (
          <p key={bi} className="mb-3 last:mb-0">
            {lines.map((line, li) => (
              <span key={`p${bi}-l${li}`}>
                {renderInline(line, `p${bi}-l${li}`, playerRegex, lookup)}
                {li < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}
