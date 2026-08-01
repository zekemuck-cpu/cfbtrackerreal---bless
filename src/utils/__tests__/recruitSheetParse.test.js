import { describe, it, expect } from 'vitest'
import { parseRecruitingRow, parseRecruitingRows, normalizeRecruitRows, ATTR_COL_START, PID_COL } from '../recruitSheetParse'
import { attributeNamesFor, mapAttributeColumns, ATTRIBUTE_COLUMNS } from '../recruitAttributes'

// A legacy A–O row (15 cells), mirroring the old reader's expected input.
const legacyRow = [
  'Bryce Young', 'HS', 'QB', 'Dual Threat', '☆☆☆☆☆', '1', '1', '1',
  "6'2\"", '195', 'Shelby', 'NC', '', 'Elite', '',
]

describe('parseRecruitingRow — legacy A–O parity', () => {
  it('parses the 15 existing fields exactly + defaults the new fields', () => {
    expect(parseRecruitingRow(legacyRow)).toEqual({
      name: 'Bryce Young', class: 'HS', position: 'QB', archetype: 'Dual Threat',
      stars: 5, nationalRank: 1, stateRank: 1, positionRank: 1,
      height: "6'2\"", weight: 195, hometown: 'Shelby', state: 'NC',
      gemBust: '', devTrait: 'Elite', previousTeam: '',
      isPortal: false,
      // new fields default harmlessly on a legacy sheet:
      commitment: '', attributes: null, pid: undefined, nil: null, updatedAt: null,
    })
  })

  it('detects portal class and leaves a blank devTrait blank', () => {
    // Dev traits are hidden until signing day — a blank cell must stay blank
    // (not get presumed Normal), so grading can project from stars instead.
    const r = parseRecruitingRow(['Joe Transfer', 'Jr', 'WR', '', '☆☆☆☆', '', '', '', '', '', '', '', '', '', 'OHIO'])
    expect(r.isPortal).toBe(true)
    expect(r.stars).toBe(4)
    expect(r.devTrait).toBe('')
    expect(r.previousTeam).toBe('OHIO')
  })

  it('skips a nameless row', () => {
    expect(parseRecruitingRow(['', 'HS', 'QB'])).toBeNull()
    expect(parseRecruitingRows([legacyRow, [''], ['  ']])).toHaveLength(1)
  })

  it('parses every star notation: outline, filled, mixed, and numeric', () => {
    const rowWithStars = (cell) => ['Star Test', 'HS', 'QB', '', cell, '', '', '', '', '', '', '', '', '', '']
    // Our own sheets write outline stars.
    expect(parseRecruitingRow(rowWithStars('☆☆☆☆')).stars).toBe(4)
    // Hand-typed / external tools use filled stars — used to parse as 0.
    expect(parseRecruitingRow(rowWithStars('★★★★')).stars).toBe(4)
    // Mixed ratings format: filled = rating, outline = empty remainder —
    // used to parse as 1 (the "all recruits show 1 star" bug).
    expect(parseRecruitingRow(rowWithStars('★★★★☆')).stars).toBe(4)
    expect(parseRecruitingRow(rowWithStars('★★★☆☆')).stars).toBe(3)
    // Plain digits work too.
    expect(parseRecruitingRow(rowWithStars('5')).stars).toBe(5)
    expect(parseRecruitingRow(rowWithStars('')).stars).toBe(0)
  })
})

describe('parseRecruitingRow — recovers AI paste that drops empty Dev Trait / Prev Team', () => {
  it('realigns Commitment + Attributes that slid two columns left', () => {
    // AI dropped the empty Dev Trait (N) and Prev Team (O) cells, so "Uncommitted"
    // landed in Dev Trait and the attributes string landed in Prev Team.
    const shifted = [
      'Slid Recruit', 'HS', 'WR', 'Speedster', '☆☆☆☆', '5', '', '',
      "6'0\"", '190', 'Naples', 'FL', '',
      'Uncommitted',        // 13 (Dev Trait slot) — actually the Commitment
      'AWR 76, SPD 67',     // 14 (Prev Team slot) — actually the Attributes
    ]
    const r = parseRecruitingRow(shifted)
    expect(r.commitment).toBe('Uncommitted')
    expect(r.attributes).toEqual({ Awareness: 76, Speed: 67 })
    expect(r.devTrait).toBe('')
    expect(r.previousTeam).toBe('')
  })

  it('does NOT touch a correctly-aligned row (valid Dev Trait + real Prev Team)', () => {
    const r = parseRecruitingRow(['Joe Transfer', 'Jr', 'WR', '', '☆☆☆☆', '', '', '', '', '', '', '', '', 'Normal', 'OHIO'])
    expect(r.devTrait).toBe('Normal')
    expect(r.previousTeam).toBe('OHIO')
    expect(r.commitment).toBe('')
  })

  // The exact screenshot failure: an HS recruit with a blank Dev Trait had that
  // ONE empty cell dropped, sliding Commitment + Attributes each one column left
  // (Uncommitted → Prev Team slot, attributes → Commitment slot). The old
  // positional heuristic missed this because the vacated Dev slot stayed a
  // valid-looking blank.
  it('realigns a SINGLE dropped empty Dev Trait (Uncommitted + attributes slid one left)', () => {
    const shifted = [
      'Kenton Recruit', 'HS', 'RG', 'Raw Strength', '☆☆☆', '1700', '', '',
      "6'3\"", '330', 'Tuscaloosa', 'AL', '',
      'Uncommitted',                       // 13 — actually the Commitment
      'Awareness 88, Strength 93',         // 14 — actually the Attributes
    ]
    const r = parseRecruitingRow(shifted)
    expect(r.commitment).toBe('Uncommitted')
    expect(r.attributes).toEqual({ Awareness: 88, Strength: 93 })
    expect(r.devTrait).toBe('')
    expect(r.previousTeam).toBe('')
    expect(r.gemBust).toBe('')
  })

  // A single dropped empty cell on an UNSCOUTED recruit: only Commitment exists
  // (no attributes), so it slid from slot 15 into slot 14 with nothing to its
  // right to signal a problem. Content re-placement still recovers it.
  it('realigns an unscouted recruit whose Commitment slid left with no attributes', () => {
    const shifted = [
      'No Attrs', 'HS', 'CB', 'Field', '☆☆☆', '1800', '', '',
      "5'10\"", '175', 'Nashville', 'TN', '',
      'Uncommitted',   // 13 — the Commitment, slid one left
    ]
    const r = parseRecruitingRow(shifted)
    expect(r.commitment).toBe('Uncommitted')
    expect(r.attributes).toBeNull()
    expect(r.previousTeam).toBe('')
    expect(r.devTrait).toBe('')
  })

  it('keeps Gem/Bust when it survives a shift', () => {
    // Gem present, Dev + Prev Team blank & dropped → commitment slid one left.
    const shifted = [
      'Gem Guy', 'HS', 'WR', 'Speedster', '☆☆☆☆', '900', '', '',
      "6'0\"", '190', 'Miami', 'FL', 'Gem',
      'Uncommitted',                 // 13 — Commitment
      'Speed 91, Acceleration 88',   // 14 — Attributes
    ]
    const r = parseRecruitingRow(shifted)
    expect(r.gemBust).toBe('Gem')
    expect(r.commitment).toBe('Uncommitted')
    expect(r.attributes).toEqual({ Speed: 91, Acceleration: 88 })
    expect(r.devTrait).toBe('')
  })

  it('merges attributes split across cells and still recovers the Commitment', () => {
    // A stray tab split one recruit's attributes into two cells; Commitment slid
    // left. Both attribute fragments must merge into the Attributes slot (not be
    // mistaken for a Prev Team), and Commitment must still parse.
    const shifted = [
      'Split Attrs', 'HS', 'WR', 'Speedster', '☆☆☆', '1200', '', '',
      "6'0\"", '185', 'Marietta', 'GA', '',
      'Uncommitted',              // 13 — Commitment
      'Awareness 76, Speed 86',   // 14 — Attributes part 1
      'Release 72, Agility 80',   // 15 — Attributes part 2
    ]
    const r = parseRecruitingRow(shifted)
    expect(r.commitment).toBe('Uncommitted')
    expect(r.previousTeam).toBe('')
    expect(r.attributes).toEqual({ Awareness: 76, Speed: 86, Release: 72, Agility: 80 })
  })

  it('recognizes Gem/Bust and Dev case-insensitively and canonicalizes them', () => {
    // A paste with lowercase "gem" / "hidden" must still land in the right slots
    // (not get dropped as unknown), normalized to canonical casing.
    const r = parseRecruitingRow([
      'Case Guy', 'HS', 'WR', 'Speedster', '☆☆☆', '900', '', '',
      "6'0\"", '190', 'Miami', 'FL', 'gem', 'hidden', '', 'Uncommitted', '',
    ])
    expect(r.gemBust).toBe('Gem')
    expect(r.devTrait).toBe('Hidden')
    expect(r.commitment).toBe('Uncommitted')
  })

  it('keeps a transfer with BOTH Prev Team and a real Commitment aligned', () => {
    const r = parseRecruitingRow([
      'Two Team', 'Jr', 'WR', '', '☆☆☆☆', '', '', '',
      "6'1\"", '200', 'Austin', 'TX', '', 'Normal', 'OHIO', 'Michigan',
    ])
    expect(r.previousTeam).toBe('OHIO')
    expect(r.commitment).toBe('Michigan')
    expect(r.devTrait).toBe('Normal')
  })
})

describe('normalizeRecruitRows — corrects the GRID (paste preview) in place', () => {
  it('realigns a shifted row so Gem/Bust/Dev/PrevTeam/Commit/Attrs land in their columns', () => {
    // Exactly the on-screen failure: a blank cell dropped slid the tail one left,
    // so "Uncommitted" showed under Prev Team (col 14) and the attributes under
    // Commit (col 15). The grid normalizer must fix the columns before render.
    const shiftedGrid = [[
      'Deon Goodin', 'HS', 'QB', 'Dual Threat', '☆☆☆', '1842', '', '',
      "6'0\"", '181', 'Rome', 'GA', '',
      'Uncommitted',            // 13 — really the Commitment (slid one left)
      'Awareness 61, Speed 75', // 14 — really the Attributes
    ]]
    const [row] = normalizeRecruitRows(shiftedGrid)
    expect(row[12]).toBe('')             // Gem/Bust
    expect(row[13]).toBe('')             // Dev
    expect(row[14]).toBe('')             // Prev Team
    expect(row[15]).toBe('Uncommitted')  // Commit
    expect(row[16]).toBe('Awareness 61, Speed 75') // Attributes
  })

  it('leaves an already-aligned Hidden-dev row untouched', () => {
    const alignedGrid = [[
      'Karlos Spruce', 'HS', 'REDG', 'Power Rusher', '☆☆☆', '1856', '', '',
      "6'5\"", '251', 'Harvest', 'AL', '', 'Hidden', '', 'Uncommitted', 'Hit Power 87',
    ]]
    const [row] = normalizeRecruitRows(alignedGrid)
    expect(row[13]).toBe('Hidden')
    expect(row[15]).toBe('Uncommitted')
    expect(row[16]).toBe('Hit Power 87')
  })

  it('is a safe pass-through for empty / nameless rows', () => {
    expect(normalizeRecruitRows([[''], ['  ']])).toEqual([[''], ['  ']])
    expect(normalizeRecruitRows(null)).toBe(null)
  })
})

describe('parseRecruitingRow — Targets extension (P–AA)', () => {
  it('reads the Commitment column (P)', () => {
    const row = [...legacyRow]
    row[15] = '(Pursuing)'
    expect(parseRecruitingRow(row).commitment).toBe('(Pursuing)')
  })

  it('reads pid from the hidden column', () => {
    const row = [...legacyRow]
    row[PID_COL] = '4042'
    expect(parseRecruitingRow(row).pid).toBe(4042)
  })

  it('parses attributes from the single labeled cell (codes or full names)', () => {
    const row = [...legacyRow]
    row[ATTR_COL_START] = 'AWR 70, Speed 95, ACC 88'
    expect(parseRecruitingRow(row).attributes).toEqual({ Awareness: 70, Speed: 95, Acceleration: 88 })
  })

  it('handles multi-word names and skips unrecognized labels', () => {
    const row = [...legacyRow]
    row[ATTR_COL_START] = 'Awareness 76, Man Coverage 76, Play Recognition 74, Bogus 50'
    expect(parseRecruitingRow(row).attributes).toEqual({ Awareness: 76, 'Man Coverage': 76, 'Play Recognition': 74 })
  })

  it('treats a bare-number legacy cell as no attributes', () => {
    const row = [...legacyRow]
    row[ATTR_COL_START] = '76'
    expect(parseRecruitingRow(row).attributes).toBeNull()
  })

  it('leaves attributes null when none are filled (unscouted target)', () => {
    expect(parseRecruitingRow(legacyRow).attributes).toBeNull()
  })
})

describe('attribute name resolution', () => {
  it('uses the position base order', () => {
    expect(attributeNamesFor('QB')[0]).toBe('Awareness')
    expect(attributeNamesFor('QB')[1]).toBe('Throw Power')
  })
  it('aliases line positions to their bucket (LT → OT)', () => {
    expect(attributeNamesFor('LT')).toEqual(attributeNamesFor('OT'))
  })
  it('applies an archetype override (WR Speedster ends in Release, Route Artist in Agility)', () => {
    expect(attributeNamesFor('WR', 'Speedster').at(-1)).toBe('Release')
    expect(attributeNamesFor('WR', 'Route Artist').at(-1)).toBe('Agility')
  })
  it('applies the OL "Raw Strength (POS)" override via position alias', () => {
    expect(attributeNamesFor('LT', 'Raw Strength').at(-1)).toBe('Strength')
  })
  it('maps K/P attribute columns (profiles added in Scout Staff v20/v21)', () => {
    expect(attributeNamesFor('K')?.[0]).toBe('Awareness')
    expect(mapAttributeColumns(['10', '20'], 'P')).toEqual({ Awareness: 10, 'Kick Power': 20 })
  })
  it('skips blank/non-numeric cells', () => {
    expect(mapAttributeColumns(['70', '', 'x', '88'], 'QB')).toEqual({ Awareness: 70, 'Medium Accuracy': 88 })
  })
})
