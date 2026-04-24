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

function compilePlayerRegex(playerLinks) {
  if (!playerLinks?.length) return null
  // Sort DESC by length so multi-word matches beat single-word matches
  const sorted = [...playerLinks].sort((a, b) => b.pattern.length - a.pattern.length)
  const alt = sorted.map(p => escapeRegex(p.pattern)).join('|')
  // Capturing group so .split() preserves the match. Word boundaries keep
  // "Brown" from matching inside "Browning" or "McBrown".
  return new RegExp(`\\b(${alt})\\b`, 'g')
}

function linkifyText(text, playerRegex, lookup, keyPrefix) {
  if (!text || !playerRegex) return text ? [text] : []
  const parts = text.split(playerRegex)
  const out = []
  for (let i = 0; i < parts.length; i++) {
    const piece = parts[i]
    if (!piece) continue
    // Even indices are plain text, odd indices are captured player-name matches
    if (i % 2 === 1) {
      const hit = lookup.get(piece)
      if (hit) {
        out.push(hit.render(piece, `${keyPrefix}-pl${i}`))
        continue
      }
    }
    out.push(piece)
  }
  return out
}

function renderItalic(text, keyPrefix, playerRegex, lookup) {
  if (!text) return null
  const parts = text.split(/(\*[^*\n]+?\*|_[^_\n]+?_)/g)
  const out = []
  parts.forEach((part, i) => {
    if (!part) return
    const key = `${keyPrefix}-i${i}`
    const ast = part.match(/^\*(.+?)\*$/)
    if (ast) {
      out.push(<em key={key}>{linkifyText(ast[1], playerRegex, lookup, key)}</em>)
      return
    }
    const und = part.match(/^_(.+?)_$/)
    if (und) {
      out.push(<em key={key}>{linkifyText(und[1], playerRegex, lookup, key)}</em>)
      return
    }
    const linked = linkifyText(part, playerRegex, lookup, key)
    linked.forEach((node, j) => out.push(typeof node === 'string' ? node : node))
  })
  return out
}

function renderInline(text, keyPrefix, playerRegex, lookup) {
  if (!text) return null
  const parts = text.split(/(\*\*[^*]+?\*\*)/g)
  return parts.map((part, i) => {
    if (!part) return null
    const key = `${keyPrefix}-b${i}`
    const bold = part.match(/^\*\*(.+?)\*\*$/)
    if (bold) {
      return (
        <strong key={key} className="font-bold text-white">
          {renderItalic(bold[1], key, playerRegex, lookup)}
        </strong>
      )
    }
    return <span key={key}>{renderItalic(part, key, playerRegex, lookup)}</span>
  })
}

export default function FormattedRecap({ text, className = '', playerLinks = null }) {
  if (!text) return null

  const playerRegex = compilePlayerRegex(playerLinks)
  const lookup = new Map()
  if (playerLinks) {
    for (const p of playerLinks) {
      lookup.set(p.pattern, p)
    }
  }

  const blocks = text.split(/\n{2,}/)

  return (
    <div className={className}>
      {blocks.map((block, bi) => {
        const trimmed = block.trim()
        if (!trimmed) return null

        if (/^###\s+/.test(trimmed)) {
          return (
            <h4 key={bi} className="text-sm font-bold text-white uppercase tracking-wide mt-4 mb-1.5 first:mt-0">
              {renderInline(trimmed.replace(/^###\s+/, ''), `h4-${bi}`, playerRegex, lookup)}
            </h4>
          )
        }
        if (/^##\s+/.test(trimmed)) {
          return (
            <h3 key={bi} className="text-base font-bold text-white mt-5 mb-2 first:mt-0">
              {renderInline(trimmed.replace(/^##\s+/, ''), `h3-${bi}`, playerRegex, lookup)}
            </h3>
          )
        }
        if (/^#\s+/.test(trimmed)) {
          return (
            <h2 key={bi} className="text-lg font-bold text-white mt-6 mb-3 first:mt-0">
              {renderInline(trimmed.replace(/^#\s+/, ''), `h2-${bi}`, playerRegex, lookup)}
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
