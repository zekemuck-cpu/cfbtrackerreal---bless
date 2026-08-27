import { describe, it, expect } from 'vitest'
import { resolveDepartureReason } from '../cfb27SaveSync'

// PC dynasties' "Players Leaving" page used to always show a generic
// "Departed" for every transfer/graduation, because the sync only ever
// guessed from Sr-vs-not (and even that guess's own 'graduated'/'pro_draft'
// keys weren't in PlayersLeaving.jsx's REASON_LABEL map). The save itself
// has a real LeavingPlayer table with the exact reason the in-game screen
// shows ("Transfer (Pro Potential)", etc.) — verified against a real save,
// see extractPlayers.cjs's buildLeavingPlayers/LEAVE_TYPE_MAP. These tests
// cover resolveDepartureReason's precedence: real draft round > real
// LeavingPlayer data > the old Sr-vs-not guess as a last resort.

describe('resolveDepartureReason', () => {
  it('a real draft round always wins, regardless of any LeavingPlayer data', () => {
    const result = resolveDepartureReason({
      draftRound: 3,
      leaving: { category: 'transfer', reason: 'Pro Potential' },
      lastClass: 'Jr',
    })
    expect(result).toEqual({ departure: 'pro_draft', departureReason: null })
  })

  it('a real transfer reason from LeavingPlayer is used when there is no draft round', () => {
    const result = resolveDepartureReason({
      draftRound: null,
      leaving: { category: 'transfer', reason: 'Pro Potential' },
      lastClass: 'RS Jr',
    })
    expect(result).toEqual({ departure: 'transfer_out', departureReason: 'Pro Potential' })
  })

  it('a real graduation flag from LeavingPlayer is used when there is no draft round', () => {
    const result = resolveDepartureReason({
      draftRound: null,
      leaving: { category: 'graduate', reason: null },
      lastClass: 'Jr', // deliberately NOT "Sr" -- LeavingPlayer's real data overrides the guess
    })
    expect(result).toEqual({ departure: 'graduated', departureReason: null })
  })

  it('falls back to the Sr-vs-not heuristic when LeavingPlayer has no resolvable entry', () => {
    const senior = resolveDepartureReason({ draftRound: null, leaving: null, lastClass: 'Sr' })
    expect(senior).toEqual({ departure: 'graduated', departureReason: null })

    const nonSenior = resolveDepartureReason({ draftRound: null, leaving: null, lastClass: 'Jr' })
    expect(nonSenior).toEqual({ departure: 'pro_draft', departureReason: null })
  })

  it('falls back to the heuristic for an unmapped LeavingPlayer category too', () => {
    // extractPlayers.cjs's buildLeavingPlayers only ever returns
    // 'transfer'/'draft'/'graduate' categories (it drops unmapped raw
    // LeaveType values entirely) -- 'draft' shouldn't reach here in
    // practice since draftRound would already be set in that case, but the
    // function still degrades safely if it ever does.
    const result = resolveDepartureReason({ draftRound: null, leaving: { category: 'draft', reason: null }, lastClass: 'RS Sr' })
    expect(result).toEqual({ departure: 'graduated', departureReason: null })
  })
})
