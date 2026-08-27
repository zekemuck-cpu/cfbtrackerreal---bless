import { describe, it, expect } from 'vitest'
import { findUserCoachPortraitFallback } from '../cfb27SaveSync'

// The save's Coach table sometimes comes back with NO row flagged
// IsUserControlled at all — confirmed real (not a transition edge case): a
// user reported it on a save where they were plainly still head coach of
// their own team, sync after sync. buildUserCoachInfo already refuses to
// guess in that case (returns null) rather than risk showing a wrong
// coach's face — a team+position-only lookup was tried as the PRIMARY
// signal once already and pulled after it did exactly that to real users.
// This fallback only recovers name/portrait, and only when the coach in
// the user's own team+position slot has the EXACT name a prior successful
// sync already confirmed was them.

const USER_TID = 10
const RAW_USER_TID = 500

const rawTeamIdMap = new Map([
  [RAW_USER_TID, USER_TID],
  [501, 20],
])

const baseDynasty = {
  currentTid: USER_TID,
  coachPosition: 'HC',
  userCoachPortrait: { name: 'Ryan Day', genericHeadAssetName: 'old_asset', portraitId: 111 },
}

const baseParsed = {
  userCoachInfo: null, // the failure case this fallback exists for
  coachingStaff: {
    [RAW_USER_TID]: {
      headCoach: { name: 'Ryan Day', generic_head_asset_name: 'new_asset', portrait_id: 222 },
    },
  },
}

describe('findUserCoachPortraitFallback', () => {
  it('returns null when userCoachInfo is present (the primary signal worked — no fallback needed)', () => {
    const parsed = { ...baseParsed, userCoachInfo: { rawTid: RAW_USER_TID, position: 'HC', name: 'Ryan Day' } }
    expect(findUserCoachPortraitFallback(baseDynasty, parsed, USER_TID, rawTeamIdMap)).toBeNull()
  })

  it('returns null when the dynasty has no prior known coach name to check against', () => {
    const dynasty = { ...baseDynasty, userCoachPortrait: null }
    expect(findUserCoachPortraitFallback(dynasty, baseParsed, USER_TID, rawTeamIdMap)).toBeNull()
  })

  it('returns null when the team+position slot holds a DIFFERENT coach (the exact case that got the old fallback pulled)', () => {
    const parsed = {
      ...baseParsed,
      coachingStaff: {
        [RAW_USER_TID]: { headCoach: { name: 'Sean Lewis', generic_head_asset_name: 'x', portrait_id: 333 } },
      },
    }
    expect(findUserCoachPortraitFallback(baseDynasty, parsed, USER_TID, rawTeamIdMap)).toBeNull()
  })

  it('returns null when dynasty.coachPosition is missing/unrecognized', () => {
    const dynasty = { ...baseDynasty, coachPosition: null }
    expect(findUserCoachPortraitFallback(dynasty, baseParsed, USER_TID, rawTeamIdMap)).toBeNull()
  })

  it('matches on the OC/DC position too, not just HC', () => {
    const dynasty = { ...baseDynasty, coachPosition: 'OC', userCoachPortrait: { name: 'Some Coordinator' } }
    const parsed = {
      ...baseParsed,
      coachingStaff: {
        [RAW_USER_TID]: {
          headCoach: { name: 'Someone Else', generic_head_asset_name: null, portrait_id: null },
          offensiveCoordinator: { name: 'Some Coordinator', generic_head_asset_name: 'oc_asset', portrait_id: 999 },
        },
      },
    }
    expect(findUserCoachPortraitFallback(dynasty, parsed, USER_TID, rawTeamIdMap)).toEqual({
      name: 'Some Coordinator', genericHeadAssetName: 'oc_asset', portraitId: 999,
    })
  })

  it('recovers name/portrait when the team+position slot name exactly matches the known name', () => {
    expect(findUserCoachPortraitFallback(baseDynasty, baseParsed, USER_TID, rawTeamIdMap)).toEqual({
      name: 'Ryan Day', genericHeadAssetName: 'new_asset', portraitId: 222,
    })
  })

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    const dynasty = { ...baseDynasty, userCoachPortrait: { name: '  ryan DAY  ' } }
    expect(findUserCoachPortraitFallback(dynasty, baseParsed, USER_TID, rawTeamIdMap)).toEqual({
      name: 'Ryan Day', genericHeadAssetName: 'new_asset', portraitId: 222,
    })
  })

  it('returns null when the user\'s team has no coaching staff data at all', () => {
    const parsed = { ...baseParsed, coachingStaff: {} }
    expect(findUserCoachPortraitFallback(baseDynasty, parsed, USER_TID, rawTeamIdMap)).toBeNull()
  })
})
