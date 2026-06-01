import { describe, it, expect } from 'vitest'
import { buildBoard, formationFor, sideOfPosition } from '../outlookBoard'

// Returning entry: key = pid:<pid>. Incoming commit: key = inc:<...>.
const ret = (pid, position, ovr, extra = {}) => ({
  key: 'pid:' + pid, pid, player: { pid }, name: pid, position,
  projectedClass: 'Jr', projectedOvr: ovr, devTrait: 'Normal',
  isIncoming: false, stars: null, isPortal: false, ...extra,
})
const inc = (id, position, ovr, stars = 4, extra = {}) => ({
  key: 'inc:' + id, pid: null, player: null, name: id, position,
  projectedClass: 'Fr', projectedOvr: ovr, devTrait: 'Normal',
  isIncoming: true, stars, isPortal: false, ...extra,
})
const findSlot = (board, id) => board.slots.find(sl => sl.id === id)

describe('sideOfPosition', () => {
  it('maps positions to the right side', () => {
    expect(sideOfPosition('QB')).toBe('offense')
    expect(sideOfPosition('LT')).toBe('offense')
    expect(sideOfPosition('MIKE')).toBe('defense')
    expect(sideOfPosition('FS')).toBe('defense')
    expect(sideOfPosition('K')).toBe('st')
    expect(sideOfPosition('???')).toBe(null)
  })
})

describe('formationFor', () => {
  it('includes FB in the offense formation', () => {
    expect(formationFor('offense').slots.some(s => s.id === 'FB')).toBe(true)
  })
})

describe('buildBoard — auto-seed', () => {
  it('seeds single-position players into their slot, ordered by OVR', () => {
    const board = buildBoard([ret('qb1', 'QB', 88), ret('qb2', 'QB', 70), ret('c1', 'C', 75)], 'offense')
    expect(findSlot(board, 'QB').starter.pid).toBe('qb1')
    expect(findSlot(board, 'QB').tiles.map(t => t.pid)).toEqual(['qb1', 'qb2'])
    expect(findSlot(board, 'C').starter.pid).toBe('c1')
  })

  it('stacks all WRs in the single WR slot, ordered by OVR', () => {
    const board = buildBoard(
      [ret('a', 'WR', 90), ret('b', 'WR', 85), ret('c', 'WR', 80), ret('d', 'WR', 70)], 'offense')
    expect(findSlot(board, 'WR').tiles.map(t => t.pid)).toEqual(['a', 'b', 'c', 'd'])
    expect(findSlot(board, 'WR').starter.pid).toBe('a')
  })

  it('pins LEDG/REDG to their side and balances generic EDGE across the pair', () => {
    const board = buildBoard([ret('l1', 'LEDG', 88), ret('r1', 'REDG', 84), ret('e1', 'EDGE', 80)], 'defense')
    expect(findSlot(board, 'LEDG').starter.pid).toBe('l1')
    expect(findSlot(board, 'REDG').starter.pid).toBe('r1')
    // the generic edge back-fills the lighter side (both have 1; picks first → LEDG)
    const onLeft = findSlot(board, 'LEDG').tiles.some(t => t.pid === 'e1')
    const onRight = findSlot(board, 'REDG').tiles.some(t => t.pid === 'e1')
    expect(onLeft || onRight).toBe(true)
  })

  it('pins SAM/WILL to their side', () => {
    const board = buildBoard([ret('s1', 'SAM', 85), ret('w1', 'WILL', 80), ret('m1', 'MIKE', 82)], 'defense')
    expect(findSlot(board, 'SAM').starter.pid).toBe('s1')
    expect(findSlot(board, 'WILL').starter.pid).toBe('w1')
    expect(findSlot(board, 'MIKE').starter.pid).toBe('m1')
  })

  it('flags an empty slot as a hole with grade F', () => {
    const board = buildBoard([ret('qb1', 'QB', 88)], 'offense')
    const lt = findSlot(board, 'LT')
    expect(lt.isHole).toBe(true)
    expect(lt.starter).toBe(null)
    expect(lt.grade).toBe('F')
    expect(board.summary.holes).toBeGreaterThan(0)
  })
})

describe('buildBoard — placements & cascade', () => {
  it('honors an explicit cross-position placement', () => {
    // A safety the user slid to corner.
    const board = buildBoard([ret('s1', 'FS', 85), ret('cb1', 'CB', 80)], 'defense',
      { placements: { 'pid:s1': 'CB' } })
    // both stack at CB, ordered by OVR (s1 85 > cb1 80)
    expect(findSlot(board, 'CB').tiles.map(t => t.pid)).toEqual(['s1', 'cb1'])
    expect(findSlot(board, 'FS').isHole).toBe(true)
  })

  it('auto-seeds an incoming commit into its position column by projected OVR', () => {
    // commit (74) stacks under the returning starter (82) at WR
    const board = buildBoard([ret('w1', 'WR', 82), inc('r1', 'WR', 74)], 'offense')
    expect(findSlot(board, 'WR').tiles.map(t => t.key)).toEqual(['pid:w1', 'inc:r1'])
  })

  it('honors an explicit placement for an incoming commit (cascade by stable key)', () => {
    const board = buildBoard([inc('r1', 'WR', 74)], 'offense', { placements: { 'inc:r1': 'TE' } })
    expect(findSlot(board, 'TE').starter.key).toBe('inc:r1')
    expect(findSlot(board, 'WR').isHole).toBe(true)
  })

  it('treats a reset sentinel ("" placement, [] order) as default (auto-seed by OVR)', () => {
    // resetSide writes '' / [] instead of deleting keys (the local-state merge
    // can\'t delete). buildBoard must read these as "no customization".
    const board = buildBoard(
      [ret('s1', 'FS', 85), ret('cb1', 'CB', 80)], 'defense',
      { placements: { 'pid:s1': '' }, order: { CB: [] } })
    expect(findSlot(board, 'FS').starter.pid).toBe('s1')   // back at natural FS
    expect(findSlot(board, 'CB').starter.pid).toBe('cb1')
  })
})

describe('buildBoard — within-slot order', () => {
  it('honors manual order over OVR', () => {
    const board = buildBoard([ret('qb1', 'QB', 88), ret('qb2', 'QB', 70)], 'offense',
      { order: { QB: ['pid:qb2', 'pid:qb1'] } })
    expect(findSlot(board, 'QB').starter.pid).toBe('qb2')
    expect(findSlot(board, 'QB').tiles.map(t => t.pid)).toEqual(['qb2', 'qb1'])
  })
})

describe('buildBoard — special teams', () => {
  it('auto-seeds K and P into their columns', () => {
    const board = buildBoard([ret('k1', 'K', 80), ret('p1', 'P', 78)], 'st')
    expect(findSlot(board, 'K').starter.pid).toBe('k1')
    expect(findSlot(board, 'P').starter.pid).toBe('p1')
    expect(board.summary.holes).toBe(0)
  })
})

describe('buildBoard — markers & summary', () => {
  it('tags NFL pids and computes unit OVR from starters', () => {
    const board = buildBoard([ret('qb1', 'QB', 90, { projectedClass: 'Sr' }), ret('c1', 'C', 80)], 'offense',
      { nflPids: new Set(['qb1']) })
    expect(findSlot(board, 'QB').starter.isNfl).toBe(true)
    expect(findSlot(board, 'C').starter.isNfl).toBe(false)
    expect(board.summary.unitOvr).toBe(85)
  })
})
