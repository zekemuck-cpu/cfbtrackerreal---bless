import { describe, it, expect } from 'vitest'
import { normalizeWeeklyScoreRow, normalizeWeeklyScoreRows } from '../weeklyScoreRealign'
import { splitTsv } from '../tsvParse'

// Canonical layout: [Home, HomeRank, HomeScore, Away, AwayRank, AwayScore, Neutral]

describe('normalizeWeeklyScoreRow — heals AI-paste column shifts', () => {
  it('recovers a ranked-team single-column shift (away score slid into Neutral)', () => {
    // The reported bug: USC ranked #15 beat San Jose State 38-31, but the away
    // score "31" slid one column right into the Neutral slot, leaving away score blank.
    const shifted = ['USC', '15', '38', 'San Jose State', '', '', '31']
    expect(normalizeWeeklyScoreRow(shifted)).toEqual(
      ['USC', '15', '38', 'San Jose State', '', '31', ''],
    )
  })

  it('is a no-op on an already-canonical ranked row (idempotent)', () => {
    const canonical = ['USC', '15', '38', 'San Jose State', '', '31', '']
    expect(normalizeWeeklyScoreRow(canonical)).toEqual(canonical)
    // Double application must be stable.
    expect(normalizeWeeklyScoreRow(normalizeWeeklyScoreRow(canonical))).toEqual(canonical)
  })

  it('is a no-op on a canonical unranked row', () => {
    const canonical = ['TCU', '', '26', 'BAMA', '', '29', 'Y']
    expect(normalizeWeeklyScoreRow(canonical)).toEqual(canonical)
  })

  it('recovers the symmetric double-blank insert (extra blank between Rank and Score)', () => {
    // [Home, HRk, '', HScore, Away, ARk, '', AScore, Neut]
    const shifted = ['MIA', '3', '', '45', 'FSU', '12', '', '20', 'Y']
    expect(normalizeWeeklyScoreRow(shifted)).toEqual(
      ['MIA', '3', '45', 'FSU', '12', '20', 'Y'],
    )
  })

  it('recovers a leading blank that pushes the home team out of col A', () => {
    const shifted = ['', 'USC', '15', '38', 'San Jose State', '', '31']
    expect(normalizeWeeklyScoreRow(shifted)).toEqual(
      ['USC', '15', '38', 'San Jose State', '', '31', ''],
    )
  })

  it('handles both teams ranked', () => {
    const canonical = ['OSU', '1', '31', 'MICH', '5', '24', '']
    expect(normalizeWeeklyScoreRow(canonical)).toEqual(canonical)
  })

  it('preserves a shutout (0 score)', () => {
    const canonical = ['JVST', '', '35', 'DEL', '', '0', '']
    expect(normalizeWeeklyScoreRow(canonical)).toEqual(canonical)
  })

  it('leaves a bye-rank row (one team anchor) untouched', () => {
    const bye = ['UGA', '4', '', '', '', '', '']
    expect(normalizeWeeklyScoreRow(bye)).toEqual(bye)
  })

  it('leaves an ambiguous row (3 numbers on one side) untouched', () => {
    const weird = ['USC', '15', '38', '99', 'San Jose State', '', '31']
    expect(normalizeWeeklyScoreRow(weird)).toEqual(weird)
  })

  it('passes through non-array input', () => {
    expect(normalizeWeeklyScoreRow(null)).toBe(null)
    expect(normalizeWeeklyScoreRow(undefined)).toBe(undefined)
  })

  it('normalizeWeeklyScoreRows maps every row', () => {
    const rows = [
      ['USC', '15', '38', 'San Jose State', '', '', '31'],
      ['TCU', '', '26', 'BAMA', '', '29', 'Y'],
    ]
    expect(normalizeWeeklyScoreRows(rows)).toEqual([
      ['USC', '15', '38', 'San Jose State', '', '31', ''],
      ['TCU', '', '26', 'BAMA', '', '29', 'Y'],
    ])
  })
})

describe('splitTsv — extracts the ```tsv block, ignoring AI prose/worksheet', () => {
  it('parses only the ```tsv block when the AI returns prose + worksheet + tsv', () => {
    const reply = [
      "Here are this week's scores. I derived the Top 25 automatically.",
      '',
      '```worksheet',
      'USC (15) | 38 vs San Jose State | 31',
      '```',
      '',
      '```tsv',
      'USC\t15\t38\tSan Jose State\t\t31\t',
      'TCU\t\t26\tBAMA\t\t29\tY',
      '```',
      '',
      'Let me know if you want any adjustments!',
    ].join('\n')
    expect(splitTsv(reply)).toEqual([
      ['USC', '15', '38', 'San Jose State', '', '31'],
      ['TCU', '', '26', 'BAMA', '', '29', 'Y'],
    ])
  })

  it('tolerates an unclosed ```tsv fence (truncated paste)', () => {
    const reply = '```tsv\nUSC\t15\t38\tSJSU\t\t31'
    expect(splitTsv(reply)).toEqual([['USC', '15', '38', 'SJSU', '', '31']])
  })

  it('is unchanged when no ```tsv fence is present (backward compatible)', () => {
    const reply = 'USC\t15\t38\tSJSU\t\t31\ny'
    expect(splitTsv(reply)).toEqual([['USC', '15', '38', 'SJSU', '', '31'], ['y']])
  })
})
