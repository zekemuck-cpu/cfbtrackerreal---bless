// SCRATCH verification — not permanent. Delete after manual verification.
import { describe, it, expect } from 'vitest'
import { extractFullSave } from '../../../api/_lib/cfb27Extract/extractPlayers.cjs'
import { buildSyncPlan } from '../cfb27SaveSync'
import { initializeDynastyTeams, getTidFromTeamName } from '../teamRegistry'

const SAVE = 'C:/Users/zekem/OneDrive/Documents/EA SPORTS College Football 27/saves/DYNASTY-VOLUNTEERSTEST-AUTOSAVE'

describe('single-candidate collision no longer overwrites the wrong player (scratch)', () => {
  it('Chris Henry Jr keeps his own identity when Demetres Samuel Jr was never tracked before', async () => {
    const parsed = await extractFullSave(SAVE)
    const dynastyTeams = initializeDynastyTeams('cfb27')
    const ohioTid = getTidFromTeamName('Ohio State Buckeyes', dynastyTeams)
    const year = parsed.season.year

    // ONLY Chris Henry Jr previously tracked — Demetres Samuel Jr (Syracuse)
    // has NEVER been synced before, exactly the scenario that broke.
    const existingPlayers = [{
      pid: 955, name: 'Chris Henry Jr.', firstName: 'Chris', lastName: 'Henry Jr.',
      position: 'WR', team: ohioTid,
      cfb27AssetName: 'SamuelJrDemetres_25401',
      teamsByYear: { [year]: ohioTid },
    }]

    const dynasty = { players: existingPlayers, teams: dynastyTeams, currentYear: year, currentTid: ohioTid, games: [], nextPID: 5000 }
    const plan = buildSyncPlan(dynasty, parsed)

    const chrisPatch = plan.toUpdatePatches.find((p) => p.pid === 955)
    console.log('Chris Henry Jr patch (pid 955):', JSON.stringify(chrisPatch?.patch?.name, chrisPatch?.patch?.team))
    console.log('departures:', JSON.stringify(plan.departurePatches.map((d) => d.pid)))
    const demetresCreated = plan.toCreatePlayers.find((p) => p.firstName === 'Demetres' && p.lastName === 'Samuel Jr.')
    console.log('Demetres created as new:', !!demetresCreated, demetresCreated?.pid)

    // The critical assertion: pid 955 must stay "Chris Henry Jr.", never
    // get overwritten to "Demetres Samuel Jr."
    expect(plan.departurePatches.find((d) => d.pid === 955)).toBeFalsy()
    if (chrisPatch) {
      expect(chrisPatch.patch.name).toBe('Chris Henry Jr.')
      expect(chrisPatch.patch.team).toBe(ohioTid)
    }
    // Demetres should never be assigned pid 955.
    const demetresPatch955 = plan.toUpdatePatches.find((p) => p.pid === 955 && p.patch.name === 'Demetres Samuel Jr.')
    expect(demetresPatch955).toBeFalsy()
  }, 30000)
})
