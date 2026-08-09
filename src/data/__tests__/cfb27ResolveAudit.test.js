import { describe, it, expect } from 'vitest'
import { TEAMS } from '../teamRegistry'
import { CFB27_TEAM_ABBRS } from '../cfb27TeamAbbrs'
import { getTidFromTeamText } from '../teams'

// Build a CFB 27 dynasty teams map exactly like creation + the load-time heal:
// clone the registry, override each tid's abbr with the CFB 27 launch set.
function cfb27Teams() {
  const teams = {}
  for (const [tid, t] of Object.entries(TEAMS)) teams[tid] = { ...t, tid: Number(tid) }
  for (const [tid, abbr] of Object.entries(CFB27_TEAM_ABBRS)) {
    if (teams[tid]) teams[tid].abbr = abbr
  }
  return teams
}

const T = cfb27Teams()
const tidOf = (name) => getTidFromTeamText(name, T)

describe('CFB 27 team resolution audit — Louisville / Lafayette / Monroe', () => {
  it('registry identities are what we expect', () => {
    expect(TEAMS[50].name).toBe('Louisville Cardinals')
    expect(TEAMS[110].name).toBe('Louisiana Ragin\' Cajuns')
    expect(TEAMS[112]?.name || TEAMS[111]?.name).toBeDefined()
    expect(CFB27_TEAM_ABBRS[50]).toBe('UL')   // Louisville
    expect(CFB27_TEAM_ABBRS[110]).toBe('ULL') // Louisiana (Lafayette)
  })

  it('full NAMES resolve to the correct, distinct tids', () => {
    expect(tidOf('Louisville')).toBe(50)
    expect(tidOf('Lafayette')).toBe(110)
    expect(tidOf('Monroe')).not.toBe(50)
    expect(tidOf('Monroe')).not.toBe(110)
    expect(tidOf('Louisville')).not.toBe(tidOf('Lafayette'))
  })

  it('CFB 27 ABBRS resolve dynasty-first (no UL/ULL collision)', () => {
    expect(tidOf('UL')).toBe(50)    // Louisville in CFB 27
    expect(tidOf('ULL')).toBe(110)  // Lafayette in CFB 27
    expect(tidOf('LOU')).toBe(50)   // legacy Louisville abbr still resolves
  })

  it('Monroe / UL Monroe alias resolves to the Warhawks (ULM), never Lafayette/Louisville', () => {
    const monroe = tidOf('Monroe')
    expect(tidOf('UL Monroe')).toBe(monroe)
    expect(tidOf('ULM')).toBe(monroe)
    expect(tidOf('Louisiana Monroe')).toBe(monroe)
    expect(monroe).not.toBe(tidOf('Lafayette'))
    expect(monroe).not.toBe(tidOf('Louisville'))
  })

  it('the three teams are mutually distinct', () => {
    const s = new Set([tidOf('Louisville'), tidOf('Lafayette'), tidOf('Monroe')])
    expect(s.size).toBe(3)
  })
})
