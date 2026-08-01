import { describe, it, expect } from 'vitest'
import { splitTsv } from '../tsvParse'

const gameRows = (prefix, n) =>
  Array.from({ length: n }, (_, i) => `${prefix}Home${i}\t\t21\t${prefix}Away${i}\t\t14\t`).join('\n')

describe('splitTsv — fenced ```tsv blocks', () => {
  it('reads EVERY tsv block, not just the first', () => {
    // Regression: an AI reply that chunks a full week across two fenced
    // blocks used to parse as only the first block's rows — a 55-game week
    // silently imported as 10 games ("it only reads 10 games").
    const reply = [
      'Here are the first games:',
      '',
      '```tsv',
      gameRows('A', 10),
      '```',
      '',
      'And the rest of the slate:',
      '',
      '```tsv',
      gameRows('B', 45),
      '```',
    ].join('\n')

    expect(splitTsv(reply)).toHaveLength(55)
  })

  it('still reads a single block and ignores surrounding prose', () => {
    const reply = `Sure! Here you go.\n\n\`\`\`tsv\n${gameRows('A', 12)}\n\`\`\`\n\nLet me know if you need more.`
    const rows = splitTsv(reply)
    expect(rows).toHaveLength(12)
    expect(rows[0][0]).toBe('AHome0')
  })

  it('still recovers an unclosed (truncated) fence', () => {
    const reply = `\`\`\`tsv\n${gameRows('A', 7)}`
    expect(splitTsv(reply)).toHaveLength(7)
  })

  it('ignores empty tsv blocks rather than counting them as data', () => {
    const reply = `\`\`\`tsv\n\`\`\`\n\n\`\`\`tsv\n${gameRows('A', 4)}\n\`\`\``
    expect(splitTsv(reply)).toHaveLength(4)
  })

  it('is unchanged for a plain paste with no fences', () => {
    const rows = splitTsv(gameRows('A', 9))
    expect(rows).toHaveLength(9)
    expect(rows[0]).toEqual(['AHome0', '', '21', 'AAway0', '', '14'])
  })
})
