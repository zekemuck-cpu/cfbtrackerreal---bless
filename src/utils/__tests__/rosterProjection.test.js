import { describe, it, expect, vi } from 'vitest'

vi.mock('../../context/DynastyContext', () => ({
  isPlayerOnRoster: (p, tid, year) => (p.teamsByYear?.[year] ?? p.teamsByYear?.[String(year)]) === tid,
  getPlayerClassForYear: (p, year) => p.classByYear?.[year] ?? p.classByYear?.[String(year)] ?? p.class ?? null,
  getPlayersLeaving: () => [],
  getRecruitingCommitments: (dynasty, tid, year) => dynasty.recruitingCommitmentsByTeamYear?.[year]?.[String(tid)] || {},
}))

import { advanceClass, yearsLeftAfter, projectRoster } from '../rosterProjection'

describe('advanceClass', () => {
  it('walks the standard track and graduates after Sr', () => {
    expect(advanceClass('Fr', 1)).toBe('So')
    expect(advanceClass('Jr', 1)).toBe('Sr')
    expect(advanceClass('Sr', 1)).toBe(null)
    expect(advanceClass('Fr', 3)).toBe('Sr')
    expect(advanceClass('Fr', 4)).toBe(null)
  })
  it('walks the redshirt track', () => {
    expect(advanceClass('RS Fr', 1)).toBe('RS So')
    expect(advanceClass('RS Sr', 1)).toBe(null)
  })
  it('returns the same class for 0 steps and passes through unknowns', () => {
    expect(advanceClass('Jr', 0)).toBe('Jr')
    expect(advanceClass('', 1)).toBe(null)
  })
})

describe('yearsLeftAfter', () => {
  it('counts remaining seasons after the given one', () => {
    expect(yearsLeftAfter('Sr')).toBe(0)
    expect(yearsLeftAfter('Jr')).toBe(1)
    expect(yearsLeftAfter('Fr')).toBe(3)
    expect(yearsLeftAfter('RS So')).toBe(2)
  })
})

function fakeDynasty() {
  return {
    currentYear: 2035,
    currentTid: 10,
    players: [
      { pid: 'a', name: 'Vet Sr', position: 'QB', teamsByYear: { 2034: 10, 2035: 10 },
        classByYear: { 2035: 'Sr' }, overallByYear: { 2034: 84, 2035: 88 }, devTraitByYear: { 2035: 'Star' } },
      { pid: 'b', name: 'Soph', position: 'WR', teamsByYear: { 2035: 10 },
        classByYear: { 2035: 'So' }, overallByYear: { 2035: 79 }, devTraitByYear: { 2035: 'Normal' } },
      { pid: 'z', name: 'Honor', position: 'QB', isHonorOnly: true, teamsByYear: { 2035: 10 }, classByYear: { 2035: 'Sr' } },
    ],
  }
}

describe('projectRoster — present year', () => {
  it('returns on-roster, non-honor players with that year class/ovr', () => {
    const d = fakeDynasty()
    const r = projectRoster(d, 10, 2035)
    const pids = r.map(p => p.pid).sort()
    expect(pids).toEqual(['a', 'b'])
    const a = r.find(p => p.pid === 'a')
    expect(a.projectedClass).toBe('Sr')
    expect(a.projectedOvr).toBe(88)
    expect(a.status).toBe('current')
  })
})

describe('projectRoster — past year', () => {
  it('reads that season roster + OVR', () => {
    const d = fakeDynasty()
    const r = projectRoster(d, 10, 2034)
    expect(r.map(p => p.pid)).toEqual(['a'])
    expect(r[0].projectedOvr).toBe(84)
    expect(r[0].status).toBe('historical')
  })
})

describe('projectRoster — future year', () => {
  function futureDynasty() {
    return {
      currentYear: 2035, currentTid: 10,
      players: [
        { pid: 'jr', name: 'Junior', position: 'HB', teamsByYear: { 2035: 10 }, classByYear: { 2035: 'Jr' }, overallByYear: { 2035: 80 }, devTraitByYear: { 2035: 'Impact' } },
        { pid: 'sr', name: 'Senior', position: 'QB', teamsByYear: { 2035: 10 }, classByYear: { 2035: 'Sr' }, overallByYear: { 2035: 90 } },
        { pid: 'risk', name: 'Flighty', position: 'WR', teamsByYear: { 2035: 10 }, classByYear: { 2035: 'So' }, overallByYear: { 2035: 77 } },
      ],
      recruitingCommitmentsByTeamYear: { 2036: { '10': { regular_1: [ { name: 'Frosh WR', position: 'WR', class: 'HS', stars: 4, devTrait: 'Star', isPortal: false } ] } } },
    }
  }

  it('ages returners, drops grads, keeps OVR estimate', () => {
    const d = futureDynasty()
    const r = projectRoster(d, 10, 2036)
    const jr = r.find(p => p.pid === 'jr')
    expect(jr.projectedClass).toBe('Sr')
    expect(jr.projectedOvr).toBe(80)
    expect(jr.status).toBe('returning')
    expect(r.find(p => p.pid === 'sr')).toBeUndefined()
  })

  it('adds the incoming class with no OVR', () => {
    const d = futureDynasty()
    const r = projectRoster(d, 10, 2036)
    const frosh = r.find(p => p.isIncoming && p.name === 'Frosh WR')
    expect(frosh).toBeTruthy()
    expect(frosh.projectedOvr).toBe(null)
    expect(frosh.stars).toBe(4)
    expect(frosh.projectedClass).toBe('Fr')
  })

  it('excludes manually flagged "likely to leave" players', () => {
    const d = futureDynasty()
    const r = projectRoster(d, 10, 2036, { leaveFlags: new Set(['risk']) })
    expect(r.find(p => p.pid === 'risk')).toBeUndefined()
  })

  it('drops the Sr-in-2036 returner by 2037', () => {
    const d = futureDynasty()
    const r = projectRoster(d, 10, 2037)
    expect(r.find(p => p.pid === 'jr')).toBeUndefined()
  })
})
