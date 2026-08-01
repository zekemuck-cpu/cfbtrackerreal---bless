// Pull the prose recap out of a pasted AI response.
//
// The AI wraps the recap in a ```markdown … ``` fence and — when it needs to
// flag something the user should know (a data contradiction, an impossible
// stat, an ambiguous winner) — MAY add a short plain-text note ABOVE the fence.
// We extract the fenced block's contents and DISCARD everything outside it, so
// that note is still visible in the chat the user reads but never leaks into
// the saved recap. The sibling cfb-social block is pulled separately (by regex
// in socialModel.js), so both halves auto-separate from a single paste even
// when a note is present.
//
// Falls back to the raw text (minus stray fence lines) when no fence is present
// so a bare-markdown paste keeps working exactly as before.
export function extractRecapBlock(raw) {
  if (!raw) return ''
  const s = String(raw).replace(/\r\n/g, '\n')

  // 1) A labeled recap fence (```markdown / ```md), closed. This is what our
  //    prompt tells the AI to emit, so it's the primary path.
  let m = s.match(/```(?:markdown|md)[ \t]*\n([\s\S]*?)\n?```/i)
  // 2) Any closed fence, if the AI omitted the language label.
  if (!m) m = s.match(/```[a-zA-Z]*[ \t]*\n([\s\S]*?)\n?```/)
  // 3) An unclosed labeled fence (AI was cut off before the closing ```).
  if (!m) m = s.match(/```(?:markdown|md)[ \t]*\n([\s\S]+)$/i)

  let body = m ? m[1] : s
  // Belt-and-suspenders: drop any stray fence lines and collapse the blank
  // lines a stripped fence can leave behind.
  body = body.replace(/^[ \t]*```[a-zA-Z]*[ \t]*$/gm, '')
  body = body.replace(/\n{3,}/g, '\n\n')
  return body.trim()
}
