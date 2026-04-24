// Lightweight renderer for AI-generated game recaps. Supports the small
// subset of markdown we ask the model to emit: **bold**, *italic* / _italic_,
// and # / ## / ### headings at line-start. Plain text passes through
// unchanged, so pre-markdown recaps still render correctly.

function renderItalic(text, keyPrefix) {
  if (!text) return null
  const parts = text.split(/(\*[^*\n]+?\*|_[^_\n]+?_)/g)
  return parts.map((part, i) => {
    const key = `${keyPrefix}-i${i}`
    const ast = part.match(/^\*(.+?)\*$/)
    if (ast) return <em key={key}>{ast[1]}</em>
    const und = part.match(/^_(.+?)_$/)
    if (und) return <em key={key}>{und[1]}</em>
    return part
  })
}

function renderInline(text, keyPrefix) {
  if (!text) return null
  // Bold first so its inner asterisks can't be mistaken for italics
  const parts = text.split(/(\*\*[^*]+?\*\*)/g)
  return parts.map((part, i) => {
    const key = `${keyPrefix}-b${i}`
    const bold = part.match(/^\*\*(.+?)\*\*$/)
    if (bold) return <strong key={key} className="font-bold text-white">{renderItalic(bold[1], key)}</strong>
    return <span key={key}>{renderItalic(part, key)}</span>
  })
}

export default function FormattedRecap({ text, className = '' }) {
  if (!text) return null

  const blocks = text.split(/\n{2,}/)

  return (
    <div className={className}>
      {blocks.map((block, bi) => {
        const trimmed = block.trim()
        if (!trimmed) return null

        if (/^###\s+/.test(trimmed)) {
          return (
            <h4 key={bi} className="text-sm font-bold text-white uppercase tracking-wide mt-4 mb-1.5 first:mt-0">
              {renderInline(trimmed.replace(/^###\s+/, ''), `h4-${bi}`)}
            </h4>
          )
        }
        if (/^##\s+/.test(trimmed)) {
          return (
            <h3 key={bi} className="text-base font-bold text-white mt-5 mb-2 first:mt-0">
              {renderInline(trimmed.replace(/^##\s+/, ''), `h3-${bi}`)}
            </h3>
          )
        }
        if (/^#\s+/.test(trimmed)) {
          return (
            <h2 key={bi} className="text-lg font-bold text-white mt-6 mb-3 first:mt-0">
              {renderInline(trimmed.replace(/^#\s+/, ''), `h2-${bi}`)}
            </h2>
          )
        }

        const lines = trimmed.split('\n')
        return (
          <p key={bi} className="mb-3 last:mb-0">
            {lines.map((line, li) => (
              <span key={`p${bi}-l${li}`}>
                {renderInline(line, `p${bi}-l${li}`)}
                {li < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}
