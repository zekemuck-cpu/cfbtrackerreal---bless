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
  it('omits FB by default and includes it when enabled', () => {
    expect(formationFor('offense').slots.some(s => s.id === 'FB')).toBe(false)
    expect(formationFor('offense', true).slots.some(s => s.id === 'FB')).toBe(true)
  })
})

describe('buildBoard — auto-seed', () => {
  it('seeds single-position players into their slot, ordered by OVR', () => {
    const board = buildBoard([ret('qb1', 'QB', 88), ret('qb2', 'QB', 70), ret('c1', 'C', 75)], 'offense')
    expect(findSlot(board, 'QB').starter.pid).toBe('qb1')
    expect(findSlot(board, 'QB').tiles.map(t => t.pid)).toEqual(['qb1', 'qb2'])
    expect(findSlot(board, 'C').starter.pid).toBe('c1')
  })

  it('distributes WR across WR1/SLOT/WR2 by OVR', () => {
    const board = buildBoard(
      [ret('a', 'WR', 90), ret('b', 'WR', 85), ret('c', 'WR', 80), ret('d', 'WR', 70)], 'offense')
    expect(findSlot(board, 'WR1').starter.pid).toBe('a')
    expect(findSlot(board, 'SLOTWR').starter.pid).toBe('b')
    expect(findSlot(board, 'WR2').starter.pid).toBe('c')
    expect(findSlot(board, 'WR1').tiles.map(t => t.pid)).toEqual(['a', 'd'])
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
    // A safety the user slid to nickel.
    const board = buildBoard([ret('s1', 'FS', 85), ret('cb1', 'CB', 80)], 'defense',
      { placements: { 'pid:s1': 'NICKEL' } })
    expect(findSlot(board, 'NICKEL').starter.pid).toBe('s1')
    expect(findSlot(board, 'FS').isHole).toBe(true)
  })

  it('sends an unplaced incoming commit to the pen, not a slot', () => {
    const board = buildBoard([inc('r1', 'WR', 74)], 'offense')
    expect(board.pen.map(t => t.key)).toEqual(['inc:r1'])
    expect(findSlot(board, 'WR1').isHole).toBe(true)
  })

  it('places an incoming commit once it has a placement (cascade by stable key)', () => {
    const board = buildBoard([inc('r1', 'WR', 74)], 'offense', { placements: { 'inc:r1': 'WR2' } })
    expect(board.pen).toHaveLength(0)
    expect(findSlot(board, 'WR2').starter.key).toBe('inc:r1')
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

describe('buildBoard — special teams roles', () => {
  it('auto-seeds K/P and fills KR/PR from stRoles (which may reference an offense player)', () => {
    const players = [ret('k1', 'K', 80), ret('p1', 'P', 78), ret('wr1', 'WR', 90)]
    const board = buildBoard(players, 'st', { stRoles: { KR: ['pid:wr1'], PR: ['pid:wr1'] } })
    expect(findSlot(board, 'K').starter.pid).toBe('k1')
    expect(findSlot(board, 'KR').starter.pid).toBe('wr1')
    expect(findSlot(board, 'PR').starter.pid).toBe('wr1')
    // KR/PR being empty does not count as a roster hole.
    const board2 = buildBoard([ret('k1', 'K', 80), ret('p1', 'P', 78)], 'st')
    expect(board2.summary.holes).toBe(0)
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
