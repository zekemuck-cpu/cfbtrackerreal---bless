import { describe, it, expect, vi } from 'vitest'

// Mock the heavy React/Firebase context module with lightweight fakes that
// mirror the real helper semantics against the test fixtures below.
vi.mock('../../context/DynastyContext', () => ({
  isPlayerOnRoster: (p, tid, year) => (p.teamsByYear?.[year] ?? p.teamsByYear?.[String(year)]) === tid,
  getPlayerClassForYear: (p, year) => p.classByYear?.[year] ?? p.classByYear?.[String(year)] ?? p.class ?? null,
  // Pending offseason "leaving" list, keyed by recruiting/season year in the fixture.
  getPlayersLeaving: (dynasty, tid, year) => dynasty.__leaving?.[year] || [],
  // Real model keys commitments by RECRUITING year (recruits enroll year+1).
  getRecruitingCommitments: (dynasty, tid, year) => dynasty.recruitingCommitmentsByTeamYear?.[year]?.[String(tid)] || {},
}))

import { advanceClass, yearsLeftAfter, projectRoster, projectDepartures, projectOvrForward, starBaselineOvr } from '../rosterProjection'

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
    expect(r.map(p => p.pid).sort()).toEqual(['a', 'b'])
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
      // Class that ENROLLS in 2036 is keyed under recruiting year 2035.
      recruitingCommitmentsByTeamYear: { 2035: { '10': { regular_1: [ { name: 'Frosh WR', position: 'WR', class: 'HS', stars: 4, devTrait: 'Star', isPortal: false } ] } } },
    }
  }

  it('ages returners, drops grads, develops OVR estimate', () => {
    const d = futureDynasty()
    const r = projectRoster(d, 10, 2036)
    const jr = r.find(p => p.pid === 'jr')
    expect(jr.projectedClass).toBe('Sr')
    // Jr/Impact/80 → +1 season: round(4 × 1.0 × 0.55) = 2 → 82.
    expect(jr.projectedOvr).toBe(82)
    expect(jr.status).toBe('returning')
    expect(r.find(p => p.pid === 'sr')).toBeUndefined()
  })

  it('adds the incoming class (keyed by recruiting year) with a star-baseline OVR', () => {
    const d = futureDynasty()
    const r = projectRoster(d, 10, 2036)
    const frosh = r.find(p => p.isIncoming && p.name === 'Frosh WR')
    expect(frosh).toBeTruthy()
    expect(frosh.projectedOvr).toBe(75) // 4-star baseline, join year → 0 dev seasons
    expect(frosh.stars).toBe(4)
    expect(frosh.projectedClass).toBe('Fr')
    expect(frosh.position).toBe('WR')
  })

  it('ages the incoming recruit one more year by +2', () => {
    const d = futureDynasty()
    const r = projectRoster(d, 10, 2037)
    const frosh = r.find(p => p.isIncoming && p.name === 'Frosh WR')
    expect(frosh.projectedClass).toBe('So')   // joined 2036 as Fr → So in 2037
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

describe('projectRoster — departure detection', () => {
  const base = (extra) => ({
    currentYear: 2035, currentTid: 10,
    players: [{ pid: 'p', name: 'P', position: 'CB', teamsByYear: { 2035: 10 }, classByYear: { 2035: 'So' }, overallByYear: { 2035: 80 }, ...extra }],
  })

  it('drops declared_for_draft and entered_portal (not just type==departure)', () => {
    expect(projectRoster(base({ movementByYear: { 2035: { type: 'declared_for_draft' } } }), 10, 2036)).toHaveLength(0)
    expect(projectRoster(base({ movementByYear: { 2036: { type: 'entered_portal' } } }), 10, 2036)).toHaveLength(0)
  })

  it('drops via the departure sub-field (transfer_out / pro_draft / graduated)', () => {
    expect(projectRoster(base({ movementByYear: { 2036: { departure: 'transfer_out', toTid: 99 } } }), 10, 2036)).toHaveLength(0)
    expect(projectRoster(base({ movementByYear: { 2036: { departure: 'pro_draft' } } }), 10, 2036)).toHaveLength(0)
  })

  it('KEEPS a transfer_out whose destination is THIS team (arrival, not departure)', () => {
    const r = projectRoster(base({ movementByYear: { 2036: { type: 'departure', departure: 'transfer_out', toTid: 10 } } }), 10, 2036)
    expect(r.map(p => p.pid)).toEqual(['p'])
  })

  it('drops a departure stamped in the current year', () => {
    expect(projectRoster(base({ movementByYear: { 2035: { type: 'departure', departure: 'graduated' } } }), 10, 2036)).toHaveLength(0)
  })

  it('drops legacy encouraged_to_transfer (un-normalized type)', () => {
    expect(projectRoster(base({ movementByYear: { 2036: { type: 'encouraged_to_transfer' } } }), 10, 2036)).toHaveLength(0)
  })
})

describe('projectRoster — pending leaving + unknown class + JUCO', () => {
  it('excludes pending getPlayersLeaving pids (object or id form)', () => {
    const d = {
      currentYear: 2035, currentTid: 10,
      players: [{ pid: 'p', name: 'P', position: 'WR', teamsByYear: { 2035: 10 }, classByYear: { 2035: 'So' }, overallByYear: { 2035: 80 } }],
      __leaving: { 2035: [{ pid: 'p' }] },
    }
    expect(projectRoster(d, 10, 2036)).toHaveLength(0)
  })

  it('keeps a returner whose class is unknown/missing (does not drop)', () => {
    const d = {
      currentYear: 2035, currentTid: 10,
      players: [{ pid: 'p', name: 'P', position: 'DT', teamsByYear: { 2035: 10 }, overallByYear: { 2035: 75 } }],
    }
    const r = projectRoster(d, 10, 2036)
    expect(r.map(p => p.pid)).toEqual(['p'])
    expect(r[0].status).toBe('returning')
  })

  it('enrolls a JUCO Jr transfer as a Jr (not a Fr)', () => {
    const d = {
      currentYear: 2035, currentTid: 10, players: [],
      recruitingCommitmentsByTeamYear: { 2035: { '10': { portal: [ { name: 'Juco Guy', position: 'DT', class: 'JUCO Jr', stars: 3, isPortal: true } ] } } },
    }
    const r = projectRoster(d, 10, 2036)
    const g = r.find(p => p.name === 'Juco Guy')
    expect(g.projectedClass).toBe('Jr')
    expect(g.isPortal).toBe(true)
  })
})

describe('projectOvrForward (dev model)', () => {
  it('reproduces the published four-year arcs', () => {
    expect([1, 2, 3].map(n => projectOvrForward(70, 'Fr', 'Normal', n))).toEqual([72, 74, 76])
    expect([1, 2, 3].map(n => projectOvrForward(74, 'Fr', 'Impact', n))).toEqual([79, 82, 84])
    expect([1, 2, 3].map(n => projectOvrForward(78, 'Fr', 'Star', n))).toEqual([83, 86, 88])
    expect([1, 2, 3].map(n => projectOvrForward(82, 'Fr', 'Elite', n))).toEqual([87, 90, 92])
  })
  it('caps at 99 and barely moves near the cap', () => {
    expect(projectOvrForward(98, 'Sr', 'Elite', 1)).toBe(98) // round(8×0.9×0.05)=0
    expect(projectOvrForward(99, 'Jr', 'Elite', 3)).toBe(99)
  })
  it('treats RS Fr like a freshman for the class multiplier', () => {
    expect(projectOvrForward(70, 'RS Fr', 'Normal', 1)).toBe(72)
  })
  it('returns null when the starting OVR is unknown', () => {
    expect(projectOvrForward(null, 'Fr', 'Star', 2)).toBe(null)
  })
  it('0 seasons is a no-op', () => {
    expect(projectOvrForward(85, 'Jr', 'Star', 0)).toBe(85)
  })
})

describe('starBaselineOvr', () => {
  it('maps stars to a baseline freshman OVR', () => {
    expect([5, 4, 3, 2, 1].map(starBaselineOvr)).toEqual([79, 75, 70, 65, 60])
  })
  it('returns null for unrated commits', () => {
    expect(starBaselineOvr(0)).toBe(null)
    expect(starBaselineOvr(null)).toBe(null)
  })
})

describe('projectDepartures (manual likely-to-depart flags only)', () => {
  const team = (players, extra = {}) => ({ currentYear: 2035, currentTid: 10, players, ...extra })
  const P = (pid, cls, extra = {}) => ({ pid, name: pid, position: 'CB', teamsByYear: { 2035: 10 }, classByYear: { 2035: cls }, overallByYear: { 2035: 80 }, ...extra })

  it('does NOT auto-list graduating seniors or other natural departures', () => {
    const d = team([P('a', 'Sr'), P('b', 'Jr', { movementByYear: { 2036: { type: 'declared_for_draft' } } })])
    expect(projectDepartures(d, 10, 2035)).toEqual([])
    expect(projectDepartures(d, 10, 2036)).toEqual([])
    expect(projectDepartures(d, 10, 2037)).toEqual([])
  })

  it('lists a flagged player, projected to the viewed year', () => {
    const dep = projectDepartures(team([P('a', 'So')]), 10, 2037, { leaveFlags: new Set(['a']) })
    expect(dep.map(x => x.pid)).toEqual(['a'])
    expect(dep[0].isFlag).toBe(true)
    expect(dep[0].projectedClass).toBe('Sr') // So 2035 → Sr 2037
  })

  it('omits a flagged player who would have graduated by the viewed year', () => {
    const d = team([P('a', 'Sr')]) // Sr 2035 → gone by 2036, flag is moot
    expect(projectDepartures(d, 10, 2036, { leaveFlags: new Set(['a']) })).toEqual([])
  })

  it('returns [] for past years even when flagged', () => {
    expect(projectDepartures(team([P('a', 'So')]), 10, 2034, { leaveFlags: new Set(['a']) })).toEqual([])
  })
})
