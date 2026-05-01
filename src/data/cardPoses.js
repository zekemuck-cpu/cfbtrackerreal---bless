// Pose presets for the player card image-gen prompt, scoped by
// position group so the dropdown only shows poses that make sense
// (no "passing in pocket" for a defensive lineman).
//
// Each pose has a `label` (UI text), `prompt` (the verbatim string
// pasted into the card prompt's ACTION line), and an optional
// `cameraHint` to nudge the framing. Poses are intentionally
// concrete and physical — image models do better with verbs and
// body positions than with abstract phrases like "intensity".
//
// Position-group buckets are kept short on purpose so we don't
// overwhelm the dropdown. The `_universal` bucket is appended to
// every position's list because some poses (sideline portrait,
// celebration, posed bust) work for any player.

export const CARD_POSES = {
  qb: [
    {
      key: 'qb_passing',
      label: 'Passing — mid-throw',
      prompt: 'Mid-throwing motion, arm cocked back at the high-release point, body weight transferring forward, eyes downfield.',
    },
    {
      key: 'qb_pocket',
      label: 'In the pocket — scanning',
      prompt: 'Standing tall in the pocket, ball at chest level in both hands, eyes scanning downfield, slight crouch in the legs.',
    },
    {
      key: 'qb_scramble',
      label: 'Scrambling — escape',
      prompt: 'Mid-scramble outside the pocket, ball tucked tight to ribs, body angled at 30° toward the sideline, defender just out of frame.',
    },
    {
      key: 'qb_handoff',
      label: 'Handoff — fake or live',
      prompt: 'Extending the ball into a running back\'s belly at mesh point, both hands cradling the ball, eyes on the line of scrimmage.',
    },
  ],
  hb: [
    {
      key: 'rb_breakaway',
      label: 'Breakaway run — open field',
      prompt: 'Sprinting in the open field with the ball in one hand and the other arm pumping, knees high, defenders trailing in the background blur.',
    },
    {
      key: 'rb_juke',
      label: 'Mid-juke',
      prompt: 'Mid-juke move with the ball tucked, weight shifted dramatically to one foot, hips angled away from a defender, plant foot dug into the turf.',
    },
    {
      key: 'rb_stiff_arm',
      label: 'Stiff-arm',
      prompt: 'Extending a stiff-arm into a defender\'s helmet, ball tucked under the off-arm, leaning forward with full extension and a flexed bicep.',
    },
    {
      key: 'rb_dive',
      label: 'Goal-line dive',
      prompt: 'Mid-air dive over the goal line, ball extended at full reach in both hands, body horizontal, helmet first toward the pylon.',
    },
  ],
  fb: [
    {
      key: 'fb_lead_block',
      label: 'Lead block — engaged',
      prompt: 'Engaged in a lead block on a linebacker at the second level, low pad level, hands inside the chest plate, driving feet through the contact.',
    },
    {
      key: 'fb_short_yardage',
      label: 'Short-yardage carry',
      prompt: 'Pile-driving forward on a short-yardage run, ball tucked, lowered shoulder leading into traffic, helmets and pads colliding around them.',
    },
  ],
  wr: [
    {
      key: 'wr_catch_jump',
      label: 'Leaping catch',
      prompt: 'High-pointing the ball at the apex of a leap, arms fully extended above the helmet, body twisted in mid-air, ball squeezing between the fingertips.',
    },
    {
      key: 'wr_sideline_toes',
      label: 'Sideline toe-tap',
      prompt: 'Catching a sideline pass in tight coverage, both feet dragging the back-corner-of-the-end-zone chalk, body falling out of bounds, eyes locked on the ball.',
    },
    {
      key: 'wr_route',
      label: 'Coming out of a break',
      prompt: 'Coming out of a sharp route break, low body lean, head turned back to find the quarterback, hands rising to receive the ball.',
    },
    {
      key: 'wr_yac',
      label: 'After the catch — eluding',
      prompt: 'Mid-cutback after the catch, ball tucked tight, off-arm pumping, defender lunging just past in the background.',
    },
  ],
  te: [
    {
      key: 'te_seam_catch',
      label: 'Seam catch',
      prompt: 'Catching a seam pass between two defenders, ball secured at the chest, body bracing for contact, helmet rotating to protect the ball.',
    },
    {
      key: 'te_block',
      label: 'Drive block — point of attack',
      prompt: 'Drive-blocking an edge defender at the line of scrimmage, low pad level, hands inside the chest, feet churning forward.',
    },
    {
      key: 'te_red_zone',
      label: 'Red-zone fade',
      prompt: 'Boxing out a defender in the back of the end zone, ball secured high above the helmet at the apex of a leap, defender\'s hand flailing behind them.',
    },
  ],
  ol: [
    // Covers LT, LG, C, RG, RT
    {
      key: 'ol_pass_pro',
      label: 'Pass protection set',
      prompt: 'Anchored in a pass-protection set, low pad level, hands punched into a rusher\'s chest plate, hips sunk, feet shoulder-width apart.',
    },
    {
      key: 'ol_run_block',
      label: 'Run-block drive',
      prompt: 'Driving a defensive lineman backward off the snap, double-handed punch into the chest, helmet under the chin, churning legs.',
    },
    {
      key: 'ol_pull',
      label: 'Pulling on power run',
      prompt: 'Pulling laterally across the formation on a power run, helmet up looking for a target, free hand tucked tight, feet in mid-stride.',
    },
    {
      key: 'ol_stance',
      label: 'Three-point stance',
      prompt: 'Set in a three-point stance just before the snap, knuckles down on the turf, head up, eyes on the defender, helmet inches above the line of scrimmage.',
    },
  ],
  dl: [
    // Covers LE, RE, DT
    {
      key: 'dl_pass_rush',
      label: 'Pass-rush move',
      prompt: 'Mid pass-rush move, swatting away an offensive tackle\'s punch with one arm while ripping past the outside shoulder, eyes locked on the quarterback.',
    },
    {
      key: 'dl_sack',
      label: 'Closing for a sack',
      prompt: 'Closing in on the quarterback for a sack, arms wrapped around the QB\'s torso, helmet driving forward into the ribs, both feet off the ground.',
    },
    {
      key: 'dl_stunt',
      label: 'Stunting through the gap',
      prompt: 'Looping through an interior gap on a stunt, low pad level, arms swinging through traffic, eyes on the ball carrier.',
    },
    {
      key: 'dl_stance',
      label: 'Four-point stance',
      prompt: 'Coiled in a four-point stance just before the snap, knuckles dug into the turf, hips low, eyes locked on the football.',
    },
  ],
  lb: [
    // Covers MLB, OLB
    {
      key: 'lb_tackle',
      label: 'Form tackle',
      prompt: 'Wrapping up a ball carrier at the waist with a textbook form tackle, helmet across the bow, arms locking, feet driving.',
    },
    {
      key: 'lb_blitz',
      label: 'A-gap blitz',
      prompt: 'Shooting through the A-gap on a blitz, full sprint posture, eyes on the quarterback, arms extending toward the football.',
    },
    {
      key: 'lb_drop',
      label: 'Coverage drop',
      prompt: 'Backpedaling in a coverage zone, hips open, eyes scanning the QB, hands ready to break on a route.',
    },
    {
      key: 'lb_celebrate',
      label: 'Post-stop celebration',
      prompt: 'Celebrating a third-down stop, both arms flexed at chest level, helmet tilted back, mouth wide in a primal yell.',
    },
  ],
  cb: [
    {
      key: 'cb_press',
      label: 'Press coverage at the line',
      prompt: 'In press coverage at the line of scrimmage, jamming a receiver with both hands, hips low, eyes locked on the receiver\'s waist.',
    },
    {
      key: 'cb_break',
      label: 'Breaking on the ball',
      prompt: 'Breaking on a route with arms reaching to undercut a pass, body angled toward the football, defender turning into the receiver\'s lane.',
    },
    {
      key: 'cb_int',
      label: 'Interception — high point',
      prompt: 'High-pointing an interception with both hands at full extension above the helmet, body twisting, receiver visible behind in the blur.',
    },
    {
      key: 'cb_pbu',
      label: 'Pass break-up',
      prompt: 'Punching the ball away from a receiver at the catch point, arm extended through the receiver\'s hands, both bodies in mid-air.',
    },
  ],
  s: [
    // Covers FS, SS
    {
      key: 's_centerfield',
      label: 'Center-field read',
      prompt: 'Patrolling deep center-field with a wide stance, eyes on the quarterback through the trees, hips ready to break in any direction.',
    },
    {
      key: 's_hit',
      label: 'Hit on a crosser',
      prompt: 'Delivering a heat-seeking hit on a receiver crossing the middle, helmet just above the chest, both bodies blurred at the point of contact.',
    },
    {
      key: 's_int_return',
      label: 'Interception return',
      prompt: 'Sprinting upfield with an interception in one hand and the off-arm pumping, blockers forming downfield.',
    },
  ],
  k: [
    {
      key: 'k_kick',
      label: 'Kicking — through the ball',
      prompt: 'Through-the-ball kicking motion, plant foot dug into the turf, kicking leg fully extended at follow-through, head down on the ball.',
    },
    {
      key: 'k_celebrate_fg',
      label: 'Game-winner celebration',
      prompt: 'Arms raised at full extension after a game-winning field goal, helmet tilted to the sky, holder visible just behind in the background.',
    },
  ],
  p: [
    {
      key: 'p_punt',
      label: 'Punting — release',
      prompt: 'At the moment of foot-to-ball contact on a punt, kicking leg fully extended above the waist, both arms balanced for follow-through.',
    },
  ],

  // Universal poses — appended to every position's list. Useful when
  // the user wants a posed/portrait card rather than action.
  _universal: [
    {
      key: 'sideline_portrait',
      label: 'Sideline portrait',
      prompt: 'A serious sideline portrait, helmet held at the waist by one hand, looking just past camera, stadium lights bokeh in the background.',
    },
    {
      key: 'helmet_off_smile',
      label: 'Helmet-off smile',
      prompt: 'Helmet off and held under one arm, easy half-smile, looking just past camera, sweaty hair and eye-black still in place from a game.',
    },
    {
      key: 'team_celebration',
      label: 'Team celebration',
      prompt: 'In the middle of a team celebration after a big play, helmet held high in one hand, mouth open in a yell, teammates blurred around them.',
    },
    {
      key: 'posed_bust',
      label: 'Posed bust shot',
      prompt: 'A formal posed bust shot — head and shoulders, three-quarter angle to camera, neutral expression, full uniform in studio-style light.',
    },
  ],
}

/**
 * Resolve the position label saved on the player to a pose-bucket
 * key. Mirrors how the rest of the app groups positions (offensive
 * line is one bucket, defensive line is one bucket, etc.).
 */
export function getPoseBucketForPosition(position) {
  if (!position) return null
  const p = String(position).toUpperCase().trim()
  if (p === 'QB') return 'qb'
  if (p === 'HB' || p === 'RB') return 'hb'
  if (p === 'FB') return 'fb'
  if (p === 'WR') return 'wr'
  if (p === 'TE') return 'te'
  if (['LT', 'LG', 'C', 'RG', 'RT', 'OL', 'OT', 'OG'].includes(p)) return 'ol'
  if (['LE', 'RE', 'DT', 'DE', 'DL', 'NT'].includes(p)) return 'dl'
  if (['MLB', 'OLB', 'ILB', 'LOLB', 'ROLB', 'LB'].includes(p)) return 'lb'
  if (['CB', 'NB'].includes(p)) return 'cb'
  if (['FS', 'SS', 'S', 'DB'].includes(p)) return 's'
  if (p === 'K') return 'k'
  if (p === 'P') return 'p'
  return null
}

/**
 * For dropdowns. Returns the per-position pose list with the
 * universal poses appended at the end.
 */
export function listPosesForPosition(position) {
  const bucket = getPoseBucketForPosition(position)
  const positionPoses = bucket ? CARD_POSES[bucket] || [] : []
  return [...positionPoses, ...CARD_POSES._universal]
}
