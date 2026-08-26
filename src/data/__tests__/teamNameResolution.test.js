import { describe, it, expect } from 'vitest'
import { getTidFromTeamText } from '../teams'
import { TEAMS } from '../teamRegistry'

// Reported: "Importing scores I always have to go back and look for Sam Houston
// and Middle Tennessee cause it doesn't recognize the State I guess." Both
// schools brand their athletics WITHOUT "State" (and EA uses the short form),
// while the registry name carries it — so the pasted name matched nothing.

describe('team name resolution — short brand names', () => {
  it('resolves the two names from the report, with or without "State"', () => {
    expect(getTidFromTeamText('Sam Houston')).toBe(88)
    expect(getTidFromTeamText('Sam Houston State')).toBe(88)
    expect(getTidFromTeamText('Middle Tennessee')).toBe(64)
    expect(getTidFromTeamText('Middle Tennessee State')).toBe(64)
  })

  it('resolves other common short/legacy forms', () => {
    expect(getTidFromTeamText('App State')).toBe(3)
    expect(getTidFromTeamText('Central Florida')).toBe(105) // UCF's former name
    expect(getTidFromTeamText('Middle Tenn')).toBe(64)
  })
})

describe('team name resolution — "St" abbreviation', () => {
  it('treats a standalone "St" as "State"', () => {
    expect(getTidFromTeamText('Boise St')).toBe(getTidFromTeamText('Boise State'))
    expect(getTidFromTeamText('Fresno St')).toBe(getTidFromTeamText('Fresno State'))
    expect(getTidFromTeamText('Appalachian St')).toBe(3)
    expect(getTidFromTeamText('Sam Houston St')).toBe(88)
  })
})

describe('team name resolution — diacritics', () => {
  it('matches an accented spelling to its plain form', () => {
    expect(getTidFromTeamText('San José State')).toBe(getTidFromTeamText('San Jose State'))
  })
})

// The dangerous half of this change. Expanding "St"->"State" is one-way on
// purpose: dropping "State" instead would merge schools that genuinely differ
// only by that word, and a score import silently crediting Washington State's
// result to Washington is far worse than a name that fails to resolve.
describe('team name resolution — must NOT merge distinct schools', () => {
  const pairs = [
    ['Washington', 'Washington State'],
    ['Ohio', 'Ohio State'],
    ['Michigan', 'Michigan State'],
    ['Oregon', 'Oregon State'],
    ['Arizona', 'Arizona State'],
    ['Kansas', 'Kansas State'],
    ['Florida', 'Florida State'],
    ['Iowa', 'Iowa State'],
    ['Mississippi State', 'Ole Miss'],
    ['Utah', 'Utah State'],
    ['Colorado', 'Colorado State'],
    ['Oklahoma', 'Oklahoma State'],
    ['San Diego State', 'San Jose State'],
  ]
  it.each(pairs)('%s and %s stay distinct', (a, b) => {
    const ta = getTidFromTeamText(a)
    const tb = getTidFromTeamText(b)
    expect(ta).not.toBeNull()
    expect(tb).not.toBeNull()
    expect(ta).not.toBe(tb)
  })

  // Sweep every real team: its own full name must still resolve to itself.
  // Guards against an alias or the St-expansion hijacking an existing name.
  it('every registry team still resolves to its own tid by full name', () => {
    const wrong = []
    for (const [tid, team] of Object.entries(TEAMS)) {
      if (!team?.name) continue
      const got = getTidFromTeamText(team.name)
      if (Number(got) !== Number(tid)) wrong.push({ tid, name: team.name, got })
    }
    expect(wrong).toEqual([])
  })
})
