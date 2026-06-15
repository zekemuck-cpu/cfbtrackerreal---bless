import { useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useDynasty } from '../context/DynastyContext'
import { loadPlaybook, loadDefensePlaybook, AVAILABLE_PLAYBOOKS, AVAILABLE_DEFENSE_PLAYBOOKS } from '../data/playbooks/index'
import { getOffenseDefaultPlays, getDefenseDefaultPlays, DEF_TYPE_COLORS } from '../data/defaultPlaySheets'
import { ALL_OFFENSE_PLAYBOOKS, DEFENSE_PLAYBOOKS } from '../data/playbookList'

// ─── Play classification ──────────────────────────────────────────────────────
// Parses the play name to understand what kind of concept it is.

function classify(play) {
  const n = play.name.toLowerCase()
  const t = play.type
  return {
    isRun:      t === 'run',
    isPass:     t === 'pass',
    isRPO:      t === 'rpo',
    // Run sub-types
    isPower:    /power o|counter|\biso\b|\bblast\b|\bduo\b|\bwrap\b|26 duo|95 mike|hb power|fb inside|hb split o|strong toss/i.test(n) && t === 'run',
    isZoneRun:  /inside zone|outside zone|wide zone|zone\b/i.test(n) && t === 'run',
    isOption:   /read option|speed option|zone option|y lead read|qb.*option|\boption\b/i.test(n) && t !== 'pass',
    isDraw:     /\bdraw\b/i.test(n) && t === 'run',
    isSneak:    /sneak/i.test(n),
    isSweep:    /toss|sweep|buck sweep|jet.*dive|jet split/i.test(n) && t === 'run',
    isReverse:  /reverse|diy toss|divert/i.test(n),
    // Pass sub-types
    isDeep:     /all go|four vert|verticals(?! h)|deep post|dagger|corner strike|deep attack|deep stick|deep flood|deep curls|slot fade|double post|deep in|pa verts shot|post shot|post corner|orbit pa shot|shock y post/i.test(n) && t !== 'run',
    isScreen:   /screen/i.test(n),
    isPA:       /\bpa\b/i.test(n) || n.startsWith('pa '),
    isQuick:    /slant|hitch|bubble|quick out|quick slant|smoke|stick\b|y stick/i.test(n) && t !== 'run',
    isMid:      /mesh|curl|cross|flood|spacing|flat|\bdig\b|mills|drive\b|comeback|levels|slant flat|shuffle.*dig|shuffle.*slot|shuffle.*cross|shuffle.*in|return.*spot|snag|shallow/i.test(n) && t === 'pass',
    isJet:      /jet|zone fake jet/i.test(n),
    isChunk:    (/all go|four vert|verticals(?! h)|deep post|dagger|corner strike|deep attack|double post|deep in|pa verts shot|post shot|post corner|shock y post|slot fade|orbit pa shot/i.test(n) || /screen/i.test(n)) && t !== 'run',
  }
}

// ─── Smart scoring engine ─────────────────────────────────────────────────────
// Rates each play on how appropriate it is for the current situation + scouting.

const STYLE_KEY = 'playsheet_user_style'
const DEFAULT_STYLE = {
  // Offense
  tendency:   'balanced', // 'run' | 'balanced' | 'pass' | 'rpo'
  prefPA:     false,
  prefScreen: false,
  prefDeep:   false,
  prefQuick:  false,
  prefPower:  false,
  prefZone:   false,
  // Defense
  defTendency: 'balanced', // 'balanced' | 'blitz' | 'coverage' | 'man'
  prefBlitz:   false,
  prefZoneCov: false,
  prefManCov:  false,
  prefMatch:   false,
  prefBase:    false,
  prefPackage: false,
}

function scorePlay(play, down, ytg, scout, side, oppContext = null, fieldPos = 'opp_mid', pbTendency = null, userStyle = null) {
  const c = classify(play)
  let s = 0

  if (side === 'offense') {
    // ── Situational scoring ─────────────────────────────────────
    if (down === 1) {
      if (c.isRun)                  s += 3   // run on 1st sets up game
      if (c.isRPO)                  s += 4   // RPO keeps defense honest
      if (c.isOption)               s += 3
      if (c.isPA)                   s += 2   // establish PA early
      if (c.isMid)                  s += 2   // avoid 3rd & long
      if (c.isQuick)                s += 1
      if (c.isDeep)                 s += 2   // shot plays are valid on 1st
      if (c.isChunk)                s += 2   // explosive plays worth calling on 1st
      if (c.isScreen)               s -= 1
    }
    if (down === 2 && ytg === 'short') {
      if (c.isSneak)                s += 6
      if (c.isPower || c.isZoneRun) s += 5
      if (c.isRPO || c.isOption)    s += 5
      if (c.isQuick)                s += 3
      if (c.isDraw)                 s += 2
      if (c.isMid)                  s += 2
      if (c.isDeep)                 s -= 4   // too risky for a yard
      if (c.isReverse || c.isSweep) s -= 2  // too slow to develop
    }
    if (down === 2 && ytg === 'med') {
      if (c.isRPO || c.isOption)    s += 4   // ideal 2nd-down play
      if (c.isPA)                   s += 3   // PA after 1st-down run
      if (c.isMid)                  s += 3   // get to manageable 3rd
      if (c.isRun)                  s += 2
      if (c.isDraw)                 s += 2
      if (c.isQuick)                s += 2
      if (c.isDeep)                 s -= 1
    }
    if (down === 2 && ytg === 'long') {
      if (c.isScreen)               s += 5   // YAC to salvage yardage
      if (c.isDraw)                 s += 4   // D in pass rush mode
      if (c.isMid)                  s += 4   // high % for chunk gain
      if (c.isDeep)                 s += 2   // take a shot
      if (c.isRPO)                  s += 2
      if (c.isPower || c.isSneak)   s -= 4   // can't get 8+ on a dive
    }
    if (down === 3 && ytg === 'short') {
      if (c.isSneak)                s += 9   // #1 short-yardage play
      if (c.isPower || c.isZoneRun) s += 7
      if (c.isRPO || c.isOption)    s += 7   // let DE commit
      if (c.isQuick)                s += 4   // quick throw beats defender
      if (c.isPA)                   s += 3   // freeze the LB
      if (c.isDraw)                 s += 3
      if (c.isMid)                  s += 2
      if (c.isDeep)                 s -= 5   // disaster if incomplete
      if (c.isScreen || c.isJet)    s -= 2  // too many moving parts
    }
    if (down === 3 && ytg === 'med') {
      if (c.isMid)                  s += 6   // conversion routes
      if (c.isPA)                   s += 5   // open crossing routes
      if (c.isScreen)               s += 4   // neutralize blitz
      if (c.isDraw)                 s += 4   // D in coverage drops
      if (c.isRPO)                  s += 3
      if (c.isQuick)                s += 2
      if (c.isDeep)                 s += 2   // occasional shot
      if (c.isPower || c.isSneak)   s -= 3
    }
    if (down === 3 && ytg === 'long') {
      if (c.isScreen)               s += 8   // chess move — D expects drop
      if (c.isDraw)                 s += 8   // D rushing upfield, cutbacks open
      if (c.isDeep)                 s += 5   // need the chunk
      if (c.isMid)                  s += 4   // higher % option
      if (c.isRPO)                  s += 3
      if (c.isQuick)                s += 3   // quick dump vs blitz
      if (c.isPower && !c.isDraw)   s -= 6   // can't run for 7+ yards
      if (c.isSneak)                s -= 7
      if (c.isZoneRun && !c.isDraw) s -= 4
      if (c.isSweep)                s -= 3
    }
    if (down === 4) {
      if (ytg === 'short') {
        if (c.isSneak)              s += 9
        if (c.isPower || c.isZoneRun) s += 7
        if (c.isRPO || c.isOption)  s += 7
        if (c.isQuick)              s += 4
        if (c.isDeep)               s -= 4
      } else {
        if (c.isMid)                s += 5
        if (c.isDeep)               s += 4
        if (c.isScreen)             s += 3
        if (c.isPower)              s -= 3
      }
    }

    // ── Scout-based scoring ─────────────────────────────────────
    if (scout) {
      const dg = scout.defGroups || {}
      const rush = parseFloat(scout.defRushAllowed) || 0
      const pass = parseFloat(scout.defPassAllowed) || 0

      // Weak DL → pound the run
      if (dg.DL === 'Weak') {
        if (c.isRun || c.isRPO) s += 5
        if (c.isPower || c.isZoneRun) s += 2
        if (c.isPA)  s += 2  // PA works best when DL is passive
      }
      if (dg.DL === 'Strong') {
        if (c.isRun && !c.isDraw && !c.isOption) s -= 4
      }
      if (dg.DL === 'Elite') {
        if (c.isRun && !c.isDraw && !c.isOption) s -= 6
        if (c.isDraw)   s -= 2  // even draws struggle vs elite DL
        if (c.isPA)     s -= 1  // PA loses its punch when DL gets home anyway
      }

      // Weak LB → screens, draws, crossing routes eat them alive
      if (dg.LB === 'Weak') {
        if (c.isScreen) s += 6   // screens vs soft LBs = big yards
        if (c.isDraw)   s += 5   // draws go right at LBs
        if (c.isMid)    s += 4   // crossing routes cross their face
        if (c.isRPO)    s += 3   // force LBs to declare
        if (c.isOption) s += 3   // read the LB
      }

      // Weak CB → pass the ball, go deep
      if (dg.CB === 'Weak') {
        if (c.isPass || c.isRPO) s += 4
        if (c.isDeep)            s += 6  // deep shots vs poor corners
        if (c.isQuick)           s += 2
      }
      if (dg.CB === 'Strong') {
        if (c.isDeep)            s -= 4
        if (c.isQuick && c.isPass) s -= 1
      }
      if (dg.CB === 'Elite') {
        if (c.isDeep)              s -= 7  // elite corners eliminate deep game
        if (c.isPass)              s -= 2  // all passing is harder
        if (c.isQuick && c.isPass) s -= 2
      }

      // Weak S → go over the top
      if (dg.S === 'Weak') {
        if (c.isDeep) s += 6   // torch weak safeties deep
        if (c.isPA)   s += 4   // PA pulls safeties into run fit
        if (c.isMid && c.isPass) s += 2  // attack behind LBs, in front of S
      }
      if (dg.S === 'Strong') {
        if (c.isDeep) s -= 3
      }
      if (dg.S === 'Elite') {
        if (c.isDeep) s -= 5  // elite safeties erase over-the-top throws
        if (c.isPA)   s -= 2  // won't bite on play-action
      }

      // Stats-based
      if (rush > 165 && (c.isRun || c.isRPO)) s += 3
      else if (rush > 130 && (c.isRun || c.isRPO)) s += 1
      if (rush < 80 && rush > 0 && c.isRun && !c.isDraw) s -= 3

      if (pass > 285 && (c.isPass || c.isRPO)) s += 3
      else if (pass > 240 && (c.isPass || c.isRPO)) s += 1
      if (pass < 150 && pass > 0 && c.isPass && !c.isScreen) s -= 3

      // Cross-weakness combos
      if (dg.DL === 'Weak' && dg.CB === 'Weak' && c.isRPO) s += 4  // can't stop either
      if (dg.LB === 'Weak' && dg.S === 'Weak'  && c.isMid)  s += 3  // two-level attack
      if (dg.CB === 'Weak' && dg.S  === 'Weak'  && c.isDeep) s += 4  // whole secondary weak
    }

    // ── Playbook tendency + unclassified baseline ───────────────
    // Ensures every play gets surfaced when groups are all Neutral.
    // A pass play with no specific sub-type gets a situational base.
    const noSubType = c.isPass && !c.isDeep && !c.isScreen && !c.isPA && !c.isQuick && !c.isMid
    if (noSubType) {
      if (down === 3 || down === 4)             s += 3  // passing situation needs pass plays
      else if (down === 2 && ytg === 'long')    s += 2
      else                                       s += 1
    }
    const noRunSubType = c.isRun && !c.isPower && !c.isZoneRun && !c.isOption && !c.isDraw && !c.isSneak && !c.isSweep
    if (noRunSubType) {
      if (down === 1)                            s += 2
      else if (down === 2 && ytg !== 'long')    s += 1
    }
    // Skew suggestions toward the team's actual run/pass identity
    if (pbTendency) {
      const isRunHeavy  = pbTendency.run > 0.45
      const isPassHeavy = pbTendency.pass > 0.55
      const isRPOHeavy  = pbTendency.rpo > 0.20
      if (isRunHeavy  && c.isRun)              s += 2
      if (isRunHeavy  && c.isRPO)             s += 1
      if (isPassHeavy && c.isPass)             s += 2
      if (isPassHeavy && c.isRPO)             s += 1
      if (isRPOHeavy  && c.isRPO)             s += 3
    }

    // ── Field position adjustments ──────────────────────────────
    if (fieldPos === 'backed_up') {
      if (c.isDeep)                          s -= 7  // turnover near own end zone = disaster
      if (c.isScreen && !c.isPA)             s -= 2  // lateral screen risk in own end
      if (c.isPower || c.isZoneRun)          s += 2  // protect ball, move the chains
      if (c.isRun)                           s += 1
    }
    if (fieldPos === 'own_mid') {
      if (c.isDeep)                          s -= 1  // slightly cautious in own territory
    }
    if (fieldPos === 'scoring_pos') {
      if (c.isDeep)                          s += 2  // good field position, take shots
      if (c.isChunk)                         s += 1
    }
    if (fieldPos === 'red_zone') {
      if (c.isDeep)                          s -= 5  // no room for verticals in RZ
      if (c.isPower || c.isZoneRun)          s += 3  // pound it to the end zone
      if (c.isQuick)                         s += 2  // quick to the boundary
      if (c.isMid)                           s += 2  // crossing routes in RZ are deadly
      if (c.isPA)                            s += 1  // PA freezes safeties in RZ
      if (c.isScreen)                        s -= 1  // screens lose space in RZ
      if (c.isSneak)                         s += 3  // sneak near goal line
    }
  }

  if (side === 'defense') {
    const { type } = play
    const og = scout?.offGroups || {}
    const rush = parseFloat(scout?.offRushYPG) || 0
    const pass = parseFloat(scout?.offPassYPG) || 0

    // Normalize official playbook types to scoring categories
    const isCov   = type === 'coverage' || type === 'zone'
    const isMan   = type === 'man'
    const isMatch = type === 'match'
    const isAnyCov = isCov || isMan || isMatch
    const isBase  = type === 'base'
    const isBlitz = type === 'blitz'
    const isPkg   = type === 'package'

    // Situational base scoring for defense
    if (down === 1) {
      if (isBase)     s += 3
      if (isMan)      s += 2
      if (isCov)      s += 2
    }
    if (down === 2 && ytg === 'short') {
      if (isBase)     s += 5
      if (isBlitz)    s += 3
      if (isAnyCov)   s += 1
    }
    if (down === 2 && ytg === 'med') {
      if (isBase)     s += 3
      if (isAnyCov)   s += 3
      if (isBlitz)    s += 2
    }
    if (down === 2 && ytg === 'long') {
      if (isAnyCov)   s += 4
      if (isPkg)      s += 3
      if (isBlitz)    s += 3
      if (isBase)     s += 1
    }
    if (down === 3 && ytg === 'short') {
      if (isBase)     s += 5
      if (isBlitz)    s += 6
      if (isAnyCov)   s += 2
    }
    if (down === 3 && ytg === 'med') {
      if (isAnyCov)   s += 5
      if (isBlitz)    s += 4
      if (isPkg)      s += 3
    }
    if (down === 3 && ytg === 'long') {
      if (isPkg)      s += 6
      if (isMatch)    s += 6  // match coverage locks down 3rd & long
      if (isAnyCov)   s += 5
      if (isBlitz)    s += 4
    }
    if (down === 4) {
      if (isBlitz)    s += 5
      if (isBase)     s += 4
      if (isAnyCov)   s += 3
    }

    // Scout-based
    if (scout) {
      const ogQBElite = og.QB === 'Elite'; const ogQBStrong = og.QB === 'Strong' || ogQBElite
      const ogHBElite = og.HB === 'Elite'; const ogHBStrong = og.HB === 'Strong' || ogHBElite
      const ogWRElite = og.WR === 'Elite'; const ogWRStrong = og.WR === 'Strong' || ogWRElite
      const ogTEElite = og.TE === 'Elite'; const ogTEStrong = og.TE === 'Strong' || ogTEElite
      const ogOLElite = og.OL === 'Elite'

      if (isBase || isBlitz) {
        if (og.OL === 'Weak')      s += 4  // blitz vs poor OL
        if (ogHBStrong || rush > 180) s += 2
        if (ogHBElite)             s += 2  // extra — elite HB demands extra box attention
      }
      if (isAnyCov || isPkg) {
        if (ogQBStrong || ogWRStrong) s += 3
        if (ogQBElite || ogWRElite)   s += 2  // extra urgency vs elite QB/WR
        if (pass > 300) s += 3
        else if (pass > 250) s += 1
      }
      if (isMatch) {
        if (ogWRStrong) s += 3   // match coverage built for elite WRs
        if (ogWRElite)  s += 2   // even more urgent vs elite WRs
        if (ogTEStrong) s += 2
        if (ogTEElite)  s += 1
      }
      if (isBlitz) {
        if (og.OL === 'Weak')  s += 5
        if (ogOLElite)         s -= 3  // elite OL neutralizes blitz
        if (og.QB === 'Weak')  s += 4  // blitz a struggling QB
        if (ogQBElite)         s -= 4  // elite QBs destroy blitzes — don't do it
        else if (ogQBStrong)   s -= 2  // strong QBs read blitzes
      }
      if (isBase) {
        if (rush > 180)        s += 3
        if (ogHBStrong)        s += 2  // stop their running game first
        if (ogHBElite)         s += 2  // elite HB — commit run defense
      }
    }

    // Opponent offensive formation adjustment
    if (oppContext) {
      const { tendency } = oppContext
      const b = (oppContext.base || '').toLowerCase()

      if (tendency) {
        // Exact formation: score from actual play distribution
        const { run, pass, rpo } = tendency
        if (run > 0.5) {           // run-heavy set
          if (isBase)   s += 4
          if (isBlitz)  s += 3
          if (isAnyCov) s -= 1
        } else if (pass > 0.55) {  // pass-heavy set
          if (isAnyCov) s += 3
          if (isMatch)  s += 2
          if (isBlitz)  s += 2
          if (isBase)   s -= 1
        } else if (rpo > 0.25) {   // RPO threat
          if (isBase)   s += 2
          if (isAnyCov) s += 2
          if (isBlitz)  s += 1
        } else {                    // balanced
          if (isAnyCov) s += 1
          if (isBase)   s += 1
        }
        // Structural overrides regardless of play distribution
        if (b.includes('empty')) { if (isBlitz) s += 3; if (isBase) s -= 2 }
        if (b.includes('goal'))  { if (isBlitz) s += 4; if (isBase) s += 2; if (isAnyCov) s -= 3 }
      } else {
        // Generic base type — structural heuristics
        if (b === 'gun' || b === 'trips')                              { if (isAnyCov) s += 2; if (isMatch) s += 2; if (isBase) s -= 1 }
        if (b.includes('empty'))                                       { if (isBlitz) s += 4; if (isMatch) s += 3; if (isAnyCov) s += 2; if (isBase) s -= 2 }
        if (b === 'i form' || b === 'strong i' || b === 'split t')    { if (isBase) s += 4; if (isBlitz) s += 2; if (isAnyCov) s -= 1 }
        if (b === 'pistol')                                            { if (isBase) s += 2; if (isAnyCov) s += 1 }
        if (b === 'pro' || b === 'singleback')                         { if (isBase) s += 2; if (isMan) s += 2 }
        if (b.includes('goal') || b === 'gl')                         { if (isBlitz) s += 5; if (isBase) s += 3; if (isAnyCov) s -= 3 }
      }
    }

    // ── Field position adjustments (opp position = our defensive situation) ──
    if (fieldPos === 'backed_up') {
      // Opponent pinned deep — they need big plays, play looser
      if (isAnyCov)  s += 2  // give cushion, don't give up chunk
      if (isBlitz)   s -= 2  // blitz risks giving up big play in space
    }
    if (fieldPos === 'scoring_pos') {
      if (isBlitz)   s += 1  // they want points, pressure helps
      if (isAnyCov)  s += 1
    }
    if (fieldPos === 'red_zone') {
      // Opponent threatening to score
      if (isBlitz)   s += 3
      if (isMan)     s += 3
      if (isMatch)   s += 2
      if (isAnyCov)  s += 1
      if (isBase)    s += 1
    }
    if (fieldPos === 'gl_def') {
      // Opponent on our goal line
      if (isBlitz)   s += 5
      if (isBase)    s += 3
      if (isAnyCov)  s -= 2  // no room to drop into coverage
    }
  }

  // ── User style preferences ──────────────────────────────────────────────
  if (userStyle) {
    if (side === 'offense') {
      const t = userStyle.tendency
      if (t === 'run')  { if (c.isRun)  s += 3; if (c.isPass && !c.isRPO) s -= 1 }
      if (t === 'pass') { if (c.isPass) s += 3; if (c.isRun  && !c.isRPO) s -= 1 }
      if (t === 'rpo')  { if (c.isRPO)  s += 4 }
      if (userStyle.prefPA     && c.isPA)      s += 3
      if (userStyle.prefScreen && c.isScreen)  s += 3
      if (userStyle.prefDeep   && c.isDeep)    s += 3
      if (userStyle.prefQuick  && c.isQuick)   s += 3
      if (userStyle.prefPower  && c.isPower)   s += 3
      if (userStyle.prefZone   && c.isZoneRun) s += 3
    } else {
      const { type } = play
      const isBlitz  = type === 'blitz'
      const isCov    = type === 'coverage' || type === 'zone'
      const isMan    = type === 'man'
      const isMatch  = type === 'match'
      const isBase   = type === 'base'
      const isPkg    = type === 'package'
      const isAnyCov = isCov || isMan || isMatch
      const t = userStyle.defTendency
      if (t === 'blitz')    { if (isBlitz)  s += 3; if (isBase) s -= 1 }
      if (t === 'coverage') { if (isAnyCov) s += 3; if (isBlitz) s -= 1 }
      if (t === 'man')      { if (isMan)    s += 3 }
      if (userStyle.prefBlitz   && isBlitz)  s += 3
      if (userStyle.prefZoneCov && isCov)    s += 3
      if (userStyle.prefManCov  && isMan)    s += 3
      if (userStyle.prefMatch   && isMatch)  s += 3
      if (userStyle.prefBase    && isBase)   s += 3
      if (userStyle.prefPackage && isPkg)    s += 3
    }
  }

  return s
}

// ─── Rationale generator ──────────────────────────────────────────────────────
// Returns a short punchy reason (≤6 words) for why a play is recommended.

function getRationale(play, down, ytg, scout, side, oppContext = null) {
  const c = classify(play)
  const dg = scout?.defGroups || {}
  const og = scout?.offGroups || {}
  const rush = parseFloat(scout?.defRushAllowed || scout?.offRushYPG) || 0
  const pass = parseFloat(scout?.defPassAllowed || scout?.offPassYPG) || 0

  if (side === 'offense') {
    // Critical-situation lines (highest priority)
    if (down === 3 && ytg === 'short') {
      if (c.isSneak)  return 'Best conversion play in football'
      if (c.isPower)  return 'Physical — make them stop you'
      if (c.isRPO)    return 'Let the defense decide'
      if (c.isQuick)  return 'Quick throw before D can set'
    }
    if (down === 3 && ytg === 'long') {
      if (c.isScreen) return 'Defense expects drop-back — hit the screen'
      if (c.isDraw)   return 'DL rushing upfield — draw them inside'
      if (c.isDeep)   return 'Need the chunk — take the shot'
    }
    if (down === 3 && ytg === 'med') {
      if (c.isPA)     return 'PA freezes the LBs'
      if (c.isScreen) return 'Answers an expected blitz'
      if (c.isDraw)   return 'D in coverage drops — lane is open'
      if (c.isMid)    return 'Conversion route — high percentage'
    }
    if (down === 2 && ytg === 'long') {
      if (c.isScreen) return 'Screen + YAC to salvage the down'
      if (c.isDraw)   return 'D in pass rush — run fits wide open'
    }
    if (down === 2 && ytg === 'short') {
      if (c.isSneak)  return 'Never doubt the QB sneak'
      if (c.isPower)  return 'Run for the first — no tricks'
      if (c.isRPO)    return 'Defense picks run or pass — you win either way'
    }
    // Scout-based lines (next priority)
    if (scout) {
      // Elite weaknesses — highest priority warning lines
      if (dg.DL === 'Elite' && c.isRun)                     return 'Elite DL — avoid running into them'
      if (dg.CB  === 'Elite' && c.isDeep)                   return 'Elite CB — that deep shot won\'t connect'
      if (dg.S   === 'Elite' && c.isDeep)                   return 'Elite safety — no one gets over the top'
      if (dg.CB  === 'Elite' && dg.S === 'Elite' && c.isPass) return 'Elite secondary — go under or run it'
      // Elite strengths — exploit opportunities
      if (dg.DL === 'Weak' && dg.CB === 'Weak' && c.isRPO) return 'They can\'t stop run or pass — RPO'
      if (dg.DL === 'Weak' && (c.isRun || c.isZoneRun))    return 'Weak DL — run right at them'
      if (dg.DL === 'Weak' && c.isPower)                    return 'Weak DL — pound it inside'
      if (dg.LB === 'Weak' && c.isScreen)                   return 'Weak LBs can\'t contain screens'
      if (dg.LB === 'Weak' && c.isDraw)                     return 'Draw exploits weak LBs'
      if (dg.LB === 'Weak' && c.isMid)                      return 'Cross their face — weak LB area'
      if (dg.CB === 'Weak' && c.isDeep)                     return 'Weak CB — take the deep shot'
      if (dg.CB === 'Weak' && c.isPass)                     return 'Attack the weak corner'
      if (dg.S  === 'Weak' && c.isDeep)                     return 'Weak safety — throw it over them'
      if (dg.S  === 'Weak' && c.isPA)                       return 'PA pulls weak safety into run fit'
      if (dg.LB === 'Weak' && dg.S === 'Weak' && c.isMid)  return 'Two-level attack — huge window'
      if (dg.CB === 'Weak' && dg.S === 'Weak' && c.isDeep) return 'Entire secondary is weak'
      if (rush > 165 && (c.isRun || c.isRPO))               return `They allow ${Math.round(rush)} rush yds/game`
      if (pass > 285 && c.isPass)                            return `They allow ${Math.round(pass)} pass yds/game`
      if (dg.DL === 'Weak' && c.isPA)                       return 'Passive DL — run fake opens it up'
    }
    // Generic lines
    if (c.isRPO)    return 'Stresses both run and pass fits'
    if (c.isPA && down <= 2) return 'Establishes play-action threat'
    if (c.isOption) return 'Read the DE — easy decision tree'
    if (c.isMid && down === 1) return 'High % to avoid 3rd & long'
    if (c.isPower && down <= 2) return 'Establish the ground game'
  }

  if (side === 'defense') {
    const { type } = play
    const isAnyCov = type === 'coverage' || type === 'zone' || type === 'man' || type === 'match'
    const isBase   = type === 'base'
    const isBlitz  = type === 'blitz'

    // Formation-specific rationale (highest priority)
    if (oppContext) {
      const { tendency, base, name } = oppContext
      const formLabel = name ? `${base} ${name}` : (base || '')
      const b = (base || '').toLowerCase()
      const t = tendency || {}
      const runHeavy = t.run > 0.5
      const passHeavy = t.pass > 0.55
      const rpoSet = t.rpo > 0.25

      if (tendency) {
        if (passHeavy && b.includes('empty') && isBlitz)   return 'No RB — blitz freely, no chip blocks'
        if (passHeavy && type === 'match')                  return `Match routes out of ${formLabel}`
        if (passHeavy && isBlitz)                           return `${formLabel} passes ${Math.round(t.pass*100)}% — get home`
        if (passHeavy && isAnyCov)                          return `${formLabel} is a pass set — lock it down`
        if (runHeavy && isBase)                             return `${formLabel} runs ${Math.round(t.run*100)}% — stack the box`
        if (runHeavy && isBlitz)                            return `Run-heavy set — gap blitz to disrupt`
        if (rpoSet && isBase)                               return 'RPO set — keep base, read both keys'
        if (rpoSet && isAnyCov)                             return 'Match RPO routes — no free releases'
      }
      if (b.includes('empty') && isBlitz)                   return 'No RB — blitz freely, no chip blocks'
      if (b.includes('empty') && type === 'match')          return 'Match every route — no run to respect'
      if ((b.includes('goal') || b === 'gl') && isBlitz)   return 'Goal line — swarm the ball carrier'
      if ((b.includes('goal') || b === 'gl') && isBase)    return 'Goal line — stack the front 7'
      if ((b === 'i form' || b === 'strong i') && isBase)  return 'Stack the box — they want to pound it'
      if ((b === 'i form' || b === 'strong i') && isBlitz) return 'Gap blitz — disrupt the power run'
      if (b === 'pistol' && isBase)                        return 'Pistol means run-pass — keep your base'
      if ((b === 'gun' || b === 'trips') && type === 'match') return 'Match their spread route tree'
      if ((b === 'gun' || b === 'trips') && isBlitz)       return 'Attack edges — spread OL is thin'
    }

    // Scout-based lines
    if (og.QB === 'Elite' && isBlitz)                        return 'Elite QB destroys blitzes — avoid'
    if (og.OL === 'Elite' && isBlitz)                        return 'Elite OL will neutralize this blitz'
    if (og.WR === 'Elite' && type === 'match')               return 'Elite WRs demand match — don\'t let them run free'
    if (og.QB === 'Elite' && type === 'match')               return 'Elite QB + match reads = chaos for offense'
    if (og.HB === 'Elite' && isBase)                         return 'Elite HB — stack the box or they run wild'
    if (og.OL === 'Weak' && isBlitz)                        return 'Their OL is weak — bring pressure'
    if (og.QB === 'Weak' && isBlitz)                        return 'Pressure the struggling QB'
    if (og.WR === 'Strong' && type === 'match')              return 'Match coverage locks down their WRs'
    if ((og.WR === 'Strong' || pass > 300) && type === 'man') return 'Press man — your CBs can handle it'
    if ((og.WR === 'Strong' || pass > 300) && isAnyCov)      return 'Lock down their strong WRs'
    if (rush > 180 && isBase)                               return `They run for ${Math.round(rush)} yds/game — set your edge`
    if (down === 3 && ytg === 'long' && type === 'package')  return 'Dime package — they have to pass'
    if (down === 3 && ytg === 'long' && type === 'match')    return 'Match coverage — no free releases'
    if (down === 3 && ytg === 'short' && isBlitz)            return 'Attack on 3rd & short'
    if (isBlitz)           return 'Pressure creates negative plays'
    if (type === 'match')  return 'Mirror their routes — no easy throws'
    if (type === 'man')    return 'Press man — take away the release'
    if (type === 'zone')   return 'Zone drops — cover the field'
    if (type === 'coverage') return 'Take away their favorite routes'
    if (isBase)            return 'Set the front — stop the run first'
    if (type === 'package') return 'Matchup package for this situation'
  }

  return ''
}

// ─── Score tiers ──────────────────────────────────────────────────────────────

function getTier(score) {
  if (score >= 10) return 'elite'
  if (score >= 6)  return 'great'
  if (score >= 3)  return 'good'
  return 'neutral'
}

const TIER_STYLE = {
  elite:   { badge: 'ELITE' },
  great:   { badge: 'GREAT' },
  good:    { badge: 'GOOD'  },
  neutral: { badge: ''      },
}

// Returns inline style for a tier badge colored to the play's type
function tierBadgeStyle(tier, color) {
  if (tier === 'neutral') return null
  if (tier === 'good')    return { fontSize: 10, fontWeight: 600, borderRadius: 4, padding: '1px 5px', background: 'var(--surface-4)', color: 'var(--text-secondary)', border: '1px solid var(--surface-5)' }
  const alpha = tier === 'elite' ? '44' : '28'
  return { fontSize: 10, fontWeight: 900, borderRadius: 4, padding: '1px 5px', background: color + alpha, color, border: `1px solid ${color}66` }
}

// ─── Result helpers ───────────────────────────────────────────────────────────

const DOWN_LABELS = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' }
const YTG_LABELS  = { short: '1-4', med: '5-7', long: '8+' }

function getOffResults(down) {
  const base = [
    { value: 'td',       label: 'Touchdown',  success: true  },
    { value: 'turnover', label: 'Turnover',   success: false },
  ]
  if (down === 1) return [
    { value: '1st',       label: '1st Down',      success: true  },
    { value: 'chunk',     label: 'Chunk (20+)',    success: true  },
    { value: '2nd_short', label: '2nd & Short',   success: true  },
    { value: '2nd_med',   label: '2nd & Med',     success: true  },
    { value: '2nd_long',  label: '2nd & Long',    success: false },
    ...base,
  ]
  if (down === 2) return [
    { value: '1st',       label: '1st & 10',    success: true  },
    { value: '3rd_short', label: '3rd & Short', success: true  },
    { value: '3rd_med',   label: '3rd & Med',   success: false },
    { value: '3rd_long',  label: '3rd & Long',  success: false },
    ...base,
  ]
  if (down === 3) return [
    { value: '1st',       label: '1st & 10',   success: true  },
    { value: 'fg',        label: 'Field Goal',  success: true  },
    { value: '4th',       label: '4th Down',   success: false },
    { value: 'punt',      label: 'Punt',        success: false },
    ...base,
  ]
  // 4th down
  return [
    { value: '1st',       label: '1st & 10',   success: true  },
    { value: 'fg',        label: 'Field Goal',  success: true  },
    { value: 'punt',      label: 'Kick / Punt', success: false },
    ...base,
  ]
}

function getDefResults(down) {
  if (down <= 2) return [
    { value: 'sack',    label: 'Sack / TFL',      success: true  },
    { value: 'stop',    label: 'Stop (0-3 yds)',   success: true  },
    { value: 'turnover',label: 'Turnover!',        success: true  },
    { value: 'med',     label: 'Medium Gain',      success: false },
    { value: 'big',     label: 'Big Play (8+)',    success: false },
    { value: 'td',      label: 'TD Allowed',       success: false },
  ]
  return [
    { value: 'sack',       label: 'Sack / TFL',       success: true  },
    { value: 'stop',       label: 'Stop / 3 & Out',   success: true  },
    { value: 'turnover',   label: 'Turnover!',         success: true  },
    { value: 'fg_miss',    label: 'FG Miss (we ball)', success: true  },
    { value: 'punt_recv',  label: 'Opp Punts',         success: true  },
    { value: 'fg_allowed', label: 'FG Allowed',        success: false },
    { value: 'conv',       label: 'Conversion',        success: false },
    { value: 'td',         label: 'TD Allowed',        success: false },
  ]
}

// Convert yard line (1–99, distance from own end zone) to fieldPos zone
function yardToZone(yd) {
  if (yd <= 20) return 'backed_up'
  if (yd <= 50) return 'own_mid'
  if (yd <= 75) return 'scoring_pos'
  return 'red_zone'
}

// Terminal results that end a possession and switch sides
const OFF_TERMINAL = new Set(['td', 'turnover', 'punt', 'fg'])
const DEF_TERMINAL = new Set(['td', 'turnover', 'fg_allowed', 'punt_recv', 'fg_miss'])

function nextSit(result, down, side) {
  if (side === 'defense') {
    if (result === 'sack') return { down: Math.min(down + 1, 4), ytg: 'long' }
    if (result === 'stop') return { down: Math.min(down + 1, 4), ytg: down === 1 ? 'long' : 'med' }
    return { down: 1, ytg: 'long' } // turnover, conv, td, fg_allowed, big
  }
  const map = {
    '2nd_short': { down: 2, ytg: 'short' },
    '2nd_med':   { down: 2, ytg: 'med'   },
    '2nd_long':  { down: 2, ytg: 'long'  },
    '1st':       { down: 1, ytg: 'long'  },
    'chunk':     { down: 1, ytg: 'long'  },
    '3rd_short': { down: 3, ytg: 'short' },
    '3rd_med':   { down: 3, ytg: 'med'   },
    '3rd_long':  { down: 3, ytg: 'long'  },
    '4th':       { down: 4, ytg: 'med'   },
  }
  return map[result] || { down: 1, ytg: 'long' }
}

// ─── Offensive formation types (opponent) ─────────────────────────────────────

const OPP_FORM_TYPES = [
  { value: 'Gun',       label: 'Gun',    desc: 'Spread / shotgun' },
  { value: 'Pistol',    label: 'Pistol', desc: 'Balanced backfield' },
  { value: 'I Form',    label: 'I Form', desc: 'Power run set' },
  { value: 'Pro',       label: 'Pro',    desc: 'Pro / singleback' },
  { value: 'Trips',     label: 'Trips',  desc: '3 receivers one side' },
  { value: 'Empty',     label: 'Empty',  desc: 'No RB — obvious pass' },
  { value: 'Goal Line', label: 'GL',     desc: 'Goal line / short yardage' },
]

// ─── Scout constants ──────────────────────────────────────────────────────────

const OFF_POS = ['QB', 'HB', 'WR', 'TE', 'OL']
const DEF_POS = ['DL', 'LB', 'CB', 'S']
const RATINGS  = ['Elite', 'Strong', 'Neutral', 'Weak']

const EMPTY_SCOUT = {
  defPlaybook: '', defPointsAllowed: '', defRushAllowed: '', defPassAllowed: '',
  defGroups: { DL: 'Neutral', LB: 'Neutral', CB: 'Neutral', S: 'Neutral' },
  offPlaybook: '', offPPG: '', offRushYPG: '', offPassYPG: '',
  offGroups: { QB: 'Neutral', HB: 'Neutral', WR: 'Neutral', TE: 'Neutral', OL: 'Neutral' },
}

const OFF_TYPE_COLORS = {
  run:    '#34d399',  // emerald-400
  pass:   '#60a5fa',  // blue-400
  pa:     '#22d3ee',  // cyan-400
  screen: '#fbbf24',  // amber-400
  rpo:    '#a78bfa',  // violet-400
}

function getPlayLabel(play) {
  if (!play) return ''
  const c = classify(play)
  if (play.type === 'pass') {
    if (c.isPA)     return 'pa'
    if (c.isScreen) return 'screen'
  }
  return play.type || ''
}
const BASE_ABBRS = { 'Gun': 'Gun', 'Pistol': 'Pistol', 'I Form': 'I Form', 'Wildcat': 'Wildcat', 'Goal Line': 'GL' }

// ─── Component ────────────────────────────────────────────────────────────────

export default function PlaySheetModal({ dynastyId, gameId, week, opponent, onClose }) {
  const { currentDynasty } = useDynasty()

  const offScheme       = currentDynasty?.offenseScheme    || ''
  const defScheme       = currentDynasty?.defenseScheme    || ''
  const offPlaybookName = currentDynasty?.offensePlaybook  || null
  const hasOfficialPB   = offPlaybookName && AVAILABLE_PLAYBOOKS.has(offPlaybookName)
  // Defense playbook: use explicit defensePlaybook field, then fall back to matching defenseScheme
  const defPlaybookName = currentDynasty?.defensePlaybook || defScheme || null
  const hasOfficialDefPB = defPlaybookName && AVAILABLE_DEFENSE_PLAYBOOKS.has(defPlaybookName)
  const depthChartUrl   = `/dynasty/${dynastyId}/team/${currentDynasty?.currentTid}/${currentDynasty?.currentYear}?tab=depthchart&side=offense`

  // ── Top-level phase ──────────────────────────────────────────────────────
  const [side,       setSide]       = useState('offense')   // 'offense' | 'defense'
  const [phase,      setPhase]      = useState('prompt')    // 'prompt' | 'form' | 'ready'
  const [view,       setView]       = useState('sheet')     // 'sheet' | 'log'
  const [shuffleKey, setShuffleKey] = useState(0)           // increments after each play to re-draw suggestions
  const [yardLine,   setYardLine]   = useState(25)           // 1–99, distance from own end zone
  const [yardRaw,    setYardRaw]    = useState('25')         // raw text buffer for the Ball On input
  const [fieldPos,   setFieldPos]   = useState('own_mid')   // backed_up|own_mid|scoring_pos|red_zone
  const [recentPlays,setRecentPlays]= useState([])          // last 3 play names, most recent first

  // ── Scout ────────────────────────────────────────────────────────────────
  const scoutKey = gameId ? `playsheet_scout_${gameId}` : null

  const [scout,          setScout]          = useState(() => {
    if (!scoutKey) return null
    try {
      const saved = localStorage.getItem(scoutKey)
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })
  const [draft,          setDraft]          = useState(EMPTY_SCOUT)
  const [scoutTab,       setScoutTab]       = useState('their-defense')
  const [showExitConfirm, setShowExitConfirm] = useState(false)

  const saveScout = (data) => {
    setScout(data)
    if (scoutKey && data) {
      try { localStorage.setItem(scoutKey, JSON.stringify(data)) } catch {}
    }
  }

  const resetScout = () => {
    setScout(null)
    setDraft(EMPTY_SCOUT)
    if (scoutKey) {
      try { localStorage.removeItem(scoutKey) } catch {}
    }
  }

  // ── User style ───────────────────────────────────────────────────────────
  const [userStyle, setUserStyle] = useState(() => {
    try { const s = localStorage.getItem(STYLE_KEY); return s ? { ...DEFAULT_STYLE, ...JSON.parse(s) } : DEFAULT_STYLE }
    catch { return DEFAULT_STYLE }
  })
  const saveUserStyle = (s) => {
    setUserStyle(s)
    try { localStorage.setItem(STYLE_KEY, JSON.stringify(s)) } catch {}
  }
  const patchStyle = (key, val) => saveUserStyle({ ...userStyle, [key]: val })

  // ── Situation ────────────────────────────────────────────────────────────
  const [situation,   setSituation]   = useState({ down: 1, ytg: 'long' })
  const [exactYtg,    setExactYtg]    = useState(10)  // actual yards to go (number)
  const [oppFormBase, setOppFormBase] = useState(null)  // opponent's base formation or generic type
  const [oppFormName, setOppFormName] = useState(null)  // exact formation name (when playbook loaded)
  const [oppPbForms,  setOppPbForms]  = useState(null)  // opponent's loaded offense playbook formations
  const [oppPbLoading,setOppPbLoading]= useState(false)
  const [pending,     setPending]     = useState(null)
  const [kickStep,    setKickStep]    = useState(null) // null | { type: 'fg' | 'punt', yard: number }
  const [log,         setLog]         = useState([])

  // ── Official playbook ────────────────────────────────────────────────────
  const [formations, setFormations] = useState(null)
  const [pbLoading,  setPbLoading]  = useState(false)
  const [baseFilter, setBaseFilter] = useState(null)
  const [formName,   setFormName]   = useState(null)
  const [typeFilter, setTypeFilter] = useState('all')
  const [showFormBrowser, setShowFormBrowser] = useState(false)

  const [defFormations, setDefFormations] = useState(null)
  const [defPbLoading,  setDefPbLoading]  = useState(false)

  useEffect(() => {
    if (!hasOfficialPB) { setFormations(null); return }
    setPbLoading(true)
    loadPlaybook(offPlaybookName)
      .then(data => {
        setFormations(data)
        if (data?.length) { setBaseFilter(data[0].base); setFormName(data[0].name) }
        setPbLoading(false)
      })
      .catch(() => setPbLoading(false))
  }, [offPlaybookName, hasOfficialPB])

  useEffect(() => {
    if (!hasOfficialDefPB) { setDefFormations(null); return }
    setDefPbLoading(true)
    loadDefensePlaybook(defPlaybookName)
      .then(data => { setDefFormations(data); setDefPbLoading(false) })
      .catch(() => setDefPbLoading(false))
  }, [defPlaybookName, hasOfficialDefPB])

  // Load opponent's offense playbook for exact formation picking (defense side)
  const oppScoutPlaybook = scout?.offPlaybook || null
  const hasOppPb = oppScoutPlaybook && AVAILABLE_PLAYBOOKS.has(oppScoutPlaybook)

  useEffect(() => {
    if (!hasOppPb) { setOppPbForms(null); setOppFormBase(null); setOppFormName(null); return }
    setOppPbLoading(true)
    loadPlaybook(oppScoutPlaybook)
      .then(data => { setOppPbForms(data); setOppPbLoading(false) })
      .catch(() => setOppPbLoading(false))
  }, [oppScoutPlaybook, hasOppPb])

  // Computed formation chain from loaded opp playbook
  const oppBases = useMemo(() => {
    if (!oppPbForms) return []
    const seen = new Set(); const out = []
    for (const f of oppPbForms) { if (!seen.has(f.base)) { seen.add(f.base); out.push(f.base) } }
    return out
  }, [oppPbForms])

  const oppFormsInBase = useMemo(
    () => (oppPbForms || []).filter(f => f.base === oppFormBase),
    [oppPbForms, oppFormBase]
  )

  const selectedOppForm = useMemo(
    () => oppFormsInBase.find(f => f.name === oppFormName) || null,
    [oppFormsInBase, oppFormName]
  )

  const oppFormTendency = useMemo(() => {
    if (!selectedOppForm) return null
    const plays = selectedOppForm.plays; const total = plays.length
    if (!total) return null
    return {
      run:  plays.filter(p => p.type === 'run').length  / total,
      pass: plays.filter(p => p.type === 'pass').length / total,
      rpo:  plays.filter(p => p.type === 'rpo').length  / total,
    }
  }, [selectedOppForm])

  // Combined opponent context passed to scorePlay / getRationale
  const oppContext = useMemo(() => {
    if (!oppFormBase) return null
    return {
      base:     oppFormBase,
      name:     oppFormName || null,
      tendency: selectedOppForm ? oppFormTendency : null,
    }
  }, [oppFormBase, oppFormName, selectedOppForm, oppFormTendency])

  // ── Derived play lists ───────────────────────────────────────────────────
  const { down, ytg } = situation

  // Compute run/pass/RPO split from loaded playbook so scoring reflects our team's identity
  const pbTendency = useMemo(() => {
    if (!formations) return null
    const counts = { run: 0, pass: 0, rpo: 0 }
    formations.forEach(f => f.plays.forEach(p => { if (counts[p.type] !== undefined) counts[p.type]++ }))
    const total = counts.run + counts.pass + counts.rpo || 1
    return { run: counts.run / total, pass: counts.pass / total, rpo: counts.rpo / total }
  }, [formations])

  // Score every play in the official playbook
  const scoredAllPlays = useMemo(() => {
    if (!formations) return []
    return formations.flatMap(f =>
      f.plays.map((p, idx) => ({
        ...p,
        formation: `${f.base} ${f.name}`,
        formBase: f.base,
        formPlayIdx: idx,
        _score: scorePlay(p, down, ytg, scout, 'offense', null, fieldPos, pbTendency, userStyle),
      }))
    ).sort((a, b) => b._score - a._score)
  }, [formations, down, ytg, scout, fieldPos, pbTendency, userStyle])

  const applyTypeFilter = (plays, tf) => {
    if (tf === 'all')    return plays
    if (tf === 'chunk')  return plays.filter(p => classify(p).isChunk)
    if (tf === 'pa')     return plays.filter(p => classify(p).isPA)
    if (tf === 'screen') return plays.filter(p => classify(p).isScreen)
    if (tf === 'pass')   return plays.filter(p => p.type === 'pass' && !classify(p).isPA && !classify(p).isScreen)
    return plays.filter(p => p.type === tf)
  }

  // Plays that should only surface when specifically warranted, not in random draws
  const SITUATIONAL_ONLY = /sneak|kneel|spike/i

  // Top plays for the situational panel — shuffled from the eligible pool each draw
  const topPlays = useMemo(() => {
    if (side !== 'offense') return []
    const lastPlay = recentPlays[0] || null
    const allNeutral = !scout || Object.values(scout.defGroups || {}).every(v => v === 'Neutral')
    const threshold = allNeutral ? 1 : 3
    const filtered = applyTypeFilter(scoredAllPlays, typeFilter)

    // Separate situational-only plays from the main pool
    const pool = []; const situOnly = []; const seen = new Set()
    for (const p of filtered) {
      if (seen.has(p.name) || p.name === lastPlay || p._score < threshold) continue
      seen.add(p.name)
      if (SITUATIONAL_ONLY.test(p.name)) { situOnly.push(p) }
      else { pool.push(p) }
      if (pool.length >= 20) break
    }

    // Fisher-Yates shuffle, then take 6
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]]
    }
    const out = pool.slice(0, 6)

    // Append high-scoring situational plays (e.g. QB Sneak on 4th & 1) at the end
    for (const p of situOnly) {
      if (p._score >= 8) out.push(p)
    }

    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoredAllPlays, typeFilter, side, recentPlays, scout, shuffleKey])

  // All plays for the situational list (limit to 30) — also exclude the last called play
  const situationalPlays = useMemo(() => {
    const lastPlay = recentPlays[0] || null
    const filtered = applyTypeFilter(scoredAllPlays, typeFilter)
    const topNames = new Set(topPlays.map(p => p.name))
    const seen = new Set(); const out = []
    for (const p of filtered) {
      if (out.length >= 30) break
      if (!topNames.has(p.name) && !seen.has(p.name) && p.name !== lastPlay && p._score >= -1) {
        seen.add(p.name); out.push(p)
      }
    }
    return out
  }, [scoredAllPlays, topPlays, typeFilter, recentPlays])

  // Score every play in the official defense playbook
  const scoredDefPlays = useMemo(() => {
    if (!defFormations) return []
    return defFormations.flatMap(f =>
      f.plays.map((p, idx) => ({
        ...p,
        formation: `${f.base} ${f.name}`,
        formBase: f.base,
        formPlayIdx: idx,
        _score: scorePlay(p, down, ytg, scout, 'defense', oppContext, fieldPos, null, userStyle),
      }))
    ).sort((a, b) => b._score - a._score)
  }, [defFormations, down, ytg, scout, oppContext, fieldPos, userStyle])

  const topDefPlays = useMemo(() => {
    const lastPlay = recentPlays[0] || null
    const seen = new Set(); const out = []
    for (const p of scoredDefPlays) {
      if (out.length >= 6) break
      if (!seen.has(p.name) && p.name !== lastPlay) { seen.add(p.name); out.push(p) }
    }
    return out.filter(p => p._score >= 3)
  }, [scoredDefPlays, recentPlays])

  // Default plays (no official playbook)
  const defaultPlays = useMemo(() => {
    const raw = side === 'offense'
      ? getOffenseDefaultPlays(offScheme, `${down === 1 ? '1st' : down === 4 ? '4th' : `${down}${ytg === 'short' ? '_short' : ytg === 'med' ? '_med' : '_long'}`}`)
      : getDefenseDefaultPlays(defScheme, `${down === 1 ? '1st' : down === 4 ? '4th' : `${down}${ytg === 'short' ? '_short' : ytg === 'med' ? '_med' : '_long'}`}`)
    return raw.map(p => ({
      ...p,
      _score: scorePlay(p, down, ytg, scout, side, side === 'defense' ? oppContext : null),
    })).sort((a, b) => b._score - a._score)
  }, [side, offScheme, defScheme, down, ytg, scout, oppContext])

  // Formation browser data
  const bases = useMemo(() => {
    if (!formations) return []
    const seen = new Set(); const out = []
    for (const f of formations) { if (!seen.has(f.base)) { seen.add(f.base); out.push(f.base) } }
    return out
  }, [formations])

  const formsInBase = useMemo(
    () => (formations || []).filter(f => f.base === baseFilter),
    [formations, baseFilter]
  )
  const activeForm = useMemo(
    () => formsInBase.find(f => f.name === formName) || formsInBase[0],
    [formsInBase, formName]
  )
  const formPlays = useMemo(() => {
    if (!activeForm) return []
    const plays = applyTypeFilter(activeForm.plays, typeFilter)
    return plays.map(p => ({ ...p, _score: scorePlay(p, down, ytg, scout, 'offense', null, fieldPos, pbTendency, userStyle) }))
      .sort((a, b) => b._score - a._score)
  }, [activeForm, typeFilter, down, ytg, scout, fieldPos, pbTendency, userStyle])

  const applyYardLine = (v) => { setYardLine(v); setYardRaw(String(v)) }

  // ── Result handling ──────────────────────────────────────────────────────
  const resultOptions = side === 'offense' ? getOffResults(down) : getDefResults(down)

  // FG result (made = true → scored, made = false → no good / blocked)
  const handleFGResult = (made) => {
    const isOffense = side === 'offense'
    const logEntry = {
      id: Date.now().toString(36),
      side, down, ytg,
      playName:  'Field Goal',
      playType:  'special',
      formation: null,
    }
    if (isOffense) {
      if (made) {
        setLog(prev => [...prev, { ...logEntry, result: 'fg',       resultLabel: 'Field Goal (Good)',  success: true  }])
        setSide('defense'); setSituation({ down: 1, ytg: 'long' }); setExactYtg(10); applyYardLine(25); setFieldPos('own_mid')
      } else {
        setLog(prev => [...prev, { ...logEntry, result: 'fg_miss',  resultLabel: 'FG No Good',         success: false }])
        const newYard = Math.max(1, Math.min(99, 100 - yardLine))
        setSide('defense'); setSituation({ down: 1, ytg: 'long' }); setExactYtg(10); applyYardLine(newYard); setFieldPos(yardToZone(newYard))
      }
    } else {
      if (made) {
        setLog(prev => [...prev, { ...logEntry, result: 'fg_allowed', resultLabel: 'FG Made (Allowed)',     success: false }])
        setSide('offense'); setSituation({ down: 1, ytg: 'long' }); setExactYtg(10); applyYardLine(25); setFieldPos('own_mid')
      } else {
        setLog(prev => [...prev, { ...logEntry, result: 'fg_block',   resultLabel: 'FG Blocked / No Good', success: true  }])
        const newYard = Math.max(1, Math.min(99, 100 - yardLine))
        setSide('offense'); setSituation({ down: 1, ytg: 'long' }); setExactYtg(10); applyYardLine(newYard); setFieldPos(yardToZone(newYard))
      }
    }
    setShuffleKey(k => k + 1)
    setKickStep(null)
  }

  // Punt result — yard = where the RECEIVING TEAM starts (1–99 from their own end zone)
  const handlePuntResult = (yard) => {
    const clamped = Math.max(1, Math.min(99, yard))
    const label   = clamped <= 50 ? `Own ${clamped}` : `Opp ${100 - clamped}`
    setLog(prev => [...prev, {
      id: Date.now().toString(36),
      side, down, ytg,
      playName:    side === 'offense' ? 'Punt' : 'Punt Return',
      playType:    'special',
      formation:   null,
      result:      'punt',
      resultLabel: `Punt → ${label}`,
      success:     side === 'defense',
    }])
    setShuffleKey(k => k + 1)
    setSide(side === 'offense' ? 'defense' : 'offense')
    setSituation({ down: 1, ytg: 'long' })
    setExactYtg(10)
    applyYardLine(clamped)
    setFieldPos(yardToZone(clamped))
    setKickStep(null)
  }

  const handleResult = (opt) => {
    if (!pending) return
    setLog(prev => [...prev, {
      id: Date.now().toString(36),
      side, down, ytg,
      playName:    pending.name,
      playType:    pending.type,
      formation:   pending.formation || null,
      result:      opt.value,
      resultLabel: opt.label,
      success:     opt.success,
    }])
    setRecentPlays(prev => [pending.name, ...prev].slice(0, 3))
    setShuffleKey(k => k + 1)
    setPending(null)
    const offSwitch = side === 'offense' && OFF_TERMINAL.has(opt.value)
    const defSwitch = side === 'defense' && (DEF_TERMINAL.has(opt.value) || (opt.value === 'stop' && down >= 3))
    if (offSwitch) {
      setSide('defense')
      setSituation({ down: 1, ytg: 'long' })
      setExactYtg(10)
      applyYardLine(25)
      setFieldPos('own_mid')
    } else if (defSwitch) {
      setSide('offense')
      setSituation({ down: 1, ytg: 'long' })
      setExactYtg(10)
      applyYardLine(25)
      setFieldPos('own_mid')
    } else {
      setSituation(nextSit(opt.value, down, side))
    }
  }

  const handleYardage = (yards) => {
    if (!pending) return
    const newYardLine = yardLine + yards
    const logBase = {
      id: Date.now().toString(36),
      side, down, ytg,
      playName:  pending.name,
      playType:  pending.type,
      formation: pending.formation || null,
      yardsGained: yards,
    }
    setRecentPlays(prev => [pending.name, ...prev].slice(0, 3))
    setShuffleKey(k => k + 1)
    setPending(null)

    if (side === 'offense') {
      if (newYardLine >= 100) {
        setLog(prev => [...prev, { ...logBase, result: 'td', resultLabel: 'Touchdown', success: true }])
        setSide('defense')
        setSituation({ down: 1, ytg: 'long' })
        setExactYtg(10)
        applyYardLine(25)
        setFieldPos('own_mid')
        return
      }
      const clamped = Math.max(1, Math.min(99, newYardLine))
      applyYardLine(clamped)
      setFieldPos(yardToZone(clamped))
      const remaining = exactYtg - yards
      if (remaining <= 0) {
        const isBig = yards >= 20
        setLog(prev => [...prev, { ...logBase, result: isBig ? 'chunk' : '1st', resultLabel: isBig ? `Chunk ${yards} yds` : `1st Down ${yards} yds`, success: true }])
        setSituation({ down: 1, ytg: 'long' })
        setExactYtg(10)
      } else if (down >= 4) {
        setLog(prev => [...prev, { ...logBase, result: 'downs', resultLabel: 'Turnover on Downs', success: false }])
        setSide('defense')
        setSituation({ down: 1, ytg: 'long' })
        setExactYtg(10)
      } else {
        const newYtgStr = remaining <= 4 ? 'short' : remaining <= 9 ? 'med' : 'long'
        setLog(prev => [...prev, { ...logBase, result: 'gain', resultLabel: `${yards >= 0 ? '+' : ''}${yards} yds`, success: yards > 0 }])
        setSituation({ down: down + 1, ytg: newYtgStr })
        setExactYtg(remaining)
      }
    } else {
      // Defense: yards = yards allowed (positive = opponent gains, negative = sack/TFL)
      if (newYardLine >= 100) {
        setLog(prev => [...prev, { ...logBase, result: 'td', resultLabel: 'TD Allowed', success: false }])
        setSide('offense')
        setSituation({ down: 1, ytg: 'long' })
        setExactYtg(10)
        applyYardLine(25)
        setFieldPos('own_mid')
        return
      }
      const clamped = Math.max(1, Math.min(99, newYardLine))
      applyYardLine(clamped)
      setFieldPos(yardToZone(clamped))
      const remaining = exactYtg - yards
      if (yards >= exactYtg) {
        // Opponent gets first down
        const isBig = yards >= 20
        setLog(prev => [...prev, { ...logBase, result: 'allowed', resultLabel: isBig ? `Big Gain Allowed (${yards} yds)` : `First Down Allowed (${yards} yds)`, success: false }])
        setSituation({ down: 1, ytg: 'long' })
        setExactYtg(10)
      } else if (down >= 4) {
        // 4th down stop — switch to offense, flip field position
        setLog(prev => [...prev, { ...logBase, result: 'stop', resultLabel: '4th Down Stop', success: true }])
        setSide('offense')
        setSituation({ down: 1, ytg: 'long' })
        setExactYtg(10)
        const flipYard = Math.max(1, Math.min(99, 100 - clamped))
        applyYardLine(flipYard)
        setFieldPos(yardToZone(flipYard))
      } else {
        const newYtgStr = remaining <= 4 ? 'short' : remaining <= 9 ? 'med' : 'long'
        const label = yards <= 0 ? `Sack/TFL (${Math.abs(yards)} yds)` : `Hold (${yards} yds allowed)`
        setLog(prev => [...prev, { ...logBase, result: 'stop', resultLabel: label, success: yards < exactYtg }])
        setSituation({ down: down + 1, ytg: newYtgStr })
        setExactYtg(remaining)
      }
    }
  }

  // ── Scout draft helpers ───────────────────────────────────────────────────
  const patchDraft = (path, value) => {
    setDraft(prev => {
      const next = { ...prev }
      const keys = path.split('.')
      let node = next
      for (let i = 0; i < keys.length - 1; i++) {
        node[keys[i]] = { ...node[keys[i]] }
        node = node[keys[i]]
      }
      node[keys[keys.length - 1]] = value
      return next
    })
  }

  // ── Per-play success map (whole-game log, both sides) ────────────────────
  const playSuccessMap = useMemo(() => {
    const map = {}
    for (const entry of log) {
      if (!map[entry.playName]) map[entry.playName] = { wins: 0, total: 0, yards: 0, yardsCalls: 0 }
      map[entry.playName].total++
      if (entry.success) map[entry.playName].wins++
      if (entry.yardsGained != null) {
        map[entry.playName].yards += entry.yardsGained
        map[entry.playName].yardsCalls++
      }
    }
    return map
  }, [log])

  const getPlayStats = (playName) => {
    const sd = playSuccessMap[playName]
    if (!sd || sd.total === 0) return null
    return {
      total: sd.total,
      pct:   Math.round((sd.wins / sd.total) * 100),
      avg:   sd.yardsCalls > 0 ? (sd.yards / sd.yardsCalls).toFixed(1) : null,
      wins:  sd.wins,
    }
  }

  // ── Stats ────────────────────────────────────────────────────────────────
  const sideLog    = log.filter(e => e.side === side)
  const wins       = sideLog.filter(e => e.success).length
  const total      = sideLog.length
  const situLabel  = `${DOWN_LABELS[down]} & ${ytg === 'short' ? 'Short' : ytg === 'med' ? 'Medium' : 'Long'}`
  const typeColors    = side === 'offense' ? OFF_TYPE_COLORS : DEF_TYPE_COLORS
  const getTypeColor  = (play) => typeColors[getPlayLabel(play)] || typeColors[play.type] || '#9ca3af'

  const usingSituational = hasOfficialPB && !showFormBrowser
  const usingDefault     = !hasOfficialPB

  // ── Exit handling ────────────────────────────────────────────────────────
  const draftHasData = (
    draft.defPlaybook || draft.defPointsAllowed || draft.defRushAllowed || draft.defPassAllowed ||
    draft.offPlaybook || draft.offPPG || draft.offRushYPG || draft.offPassYPG ||
    Object.values(draft.defGroups).some(v => v !== 'Neutral') ||
    Object.values(draft.offGroups).some(v => v !== 'Neutral')
  )

  const handleExit = () => {
    if (phase === 'form' && draftHasData) {
      setShowExitConfirm(true)
    } else {
      onClose()
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col overflow-hidden" style={{ background: 'var(--surface-1)' }}>

      {/* Exit confirmation overlay */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center px-8" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-xs rounded-2xl p-6 flex flex-col gap-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--surface-5)' }}>
            <div className="text-center">
              <div className="text-base font-bold text-txt-primary mb-1">Unsaved Scout Data</div>
              <p className="text-sm text-txt-secondary">You have scout information entered. Do you want to save it before leaving?</p>
            </div>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => { saveScout(draft); setShowExitConfirm(false); onClose() }}
                className="w-full py-3 rounded-xl font-bold text-sm transition-opacity hover:opacity-90"
                style={{ background: 'var(--text-primary)', color: 'var(--surface-1)' }}
              >
                Save Scout &amp; Exit
              </button>
              <button
                onClick={() => { setShowExitConfirm(false); onClose() }}
                className="w-full py-3 rounded-xl font-semibold text-sm border transition-colors text-txt-secondary hover:text-txt-primary"
                style={{ borderColor: 'var(--surface-5)', background: 'var(--surface-3)' }}
              >
                Exit Without Saving
              </button>
              <button
                onClick={() => setShowExitConfirm(false)}
                className="w-full py-2 text-xs text-txt-secondary hover:text-txt-primary transition-colors"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <div className="shrink-0 border-b px-3 py-2.5 flex items-center gap-2" style={{ borderColor: 'var(--surface-4)' }}>

        {/* Offense / Defense toggle */}
        <div className="flex gap-1.5">
          {['offense', 'defense'].map(s => (
            <button
              key={s}
              onClick={() => { setSide(s); setPending(null) }}
              className="px-3 py-1.5 rounded-full text-xs font-bold border transition-colors capitalize"
              style={side === s
                ? { background: 'var(--text-primary)', color: 'var(--surface-1)', borderColor: 'var(--text-primary)' }
                : { background: 'var(--surface-3)', color: 'var(--text-secondary)', borderColor: 'var(--surface-5)' }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Title */}
        <div className="flex-1 text-center px-2">
          <div className="text-sm font-black uppercase tracking-wider text-txt-primary leading-tight">Playcall Sheet</div>
          {(week || opponent) && (
            <div className="text-[11px] text-txt-secondary leading-tight mt-0.5">
              {week ? `Week ${week}` : ''}{week && opponent ? ' · ' : ''}{opponent ? `vs ${opponent}` : ''}
            </div>
          )}
        </div>

        {/* My Style button */}
        {phase === 'ready' && (
          <button
            onClick={() => setView(v => v === 'style' ? 'sheet' : 'style')}
            className="text-xs font-semibold px-2.5 py-1.5 rounded border transition-colors"
            style={view === 'style'
              ? { color: '#a5f3fc', borderColor: '#06b6d4', background: 'rgba(6,182,212,0.12)' }
              : userStyle.tendency !== 'balanced' || Object.values(userStyle).some(v => v === true)
                ? { color: '#fde68a', borderColor: '#f59e0b', background: 'rgba(245,158,11,0.08)' }
                : { color: 'var(--text-secondary)', borderColor: 'var(--surface-5)', background: 'var(--surface-3)' }}
          >
            My Style
          </button>
        )}

        {/* Scout indicator */}
        {phase === 'ready' && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setDraft(scout || EMPTY_SCOUT); setScoutTab('their-defense'); setPhase('form') }}
              className="text-xs font-semibold px-2.5 py-1.5 rounded border transition-colors"
              style={scout
                ? { color: '#4ade80', borderColor: '#4ade80', background: 'rgba(74,222,128,0.08)' }
                : { color: 'var(--text-secondary)', borderColor: 'var(--surface-5)', background: 'var(--surface-3)' }}
            >
              {scout ? '✓ Scouted' : 'Scout opp'}
            </button>
            {scout && (
              <button
                onClick={resetScout}
                title="Clear saved scout data"
                className="text-xs px-1.5 py-1.5 rounded border transition-colors"
                style={{ color: 'var(--text-secondary)', borderColor: 'var(--surface-5)', background: 'var(--surface-3)' }}
              >
                Reset
              </button>
            )}
          </div>
        )}

        {/* Log tab */}
        {phase === 'ready' && (
          <button
            onClick={() => setView(v => v === 'log' ? 'sheet' : 'log')}
            className="text-xs font-semibold px-2.5 py-1.5 rounded border transition-colors"
            style={{
              borderColor: 'var(--surface-5)',
              background: view === 'log' ? 'var(--surface-4)' : 'var(--surface-3)',
              color: view === 'log' ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            Log{total > 0 ? ` (${total})` : ''}
          </button>
        )}

        {/* Exit — always rightmost */}
        <button
          onClick={handleExit}
          className="px-3 py-1.5 rounded-lg text-xs font-bold border"
          style={{ background: 'var(--surface-3)', borderColor: 'var(--surface-4)', color: 'var(--text-primary)' }}
        >
          ← Exit
        </button>
      </div>

      {/* ══ SCOUT PROMPT ════════════════════════════════════════════════════ */}
      {phase === 'prompt' && (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-5">
          <div>
            <div className="text-xl font-bold text-txt-primary mb-2">Scout the opponent?</div>
            <p className="text-txt-secondary text-sm leading-relaxed max-w-xs mx-auto">
              Enter their position group ratings, team stats, and playbooks — the system will rank every play call for this matchup and tell you exactly why.
            </p>
          </div>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <button
              onClick={() => { setDraft(EMPTY_SCOUT); setScoutTab('their-defense'); setPhase('form') }}
              className="w-full py-4 rounded-xl font-bold text-sm shadow-lg transition-opacity hover:opacity-90"
              style={{ background: 'var(--text-primary)', color: 'var(--surface-1)' }}
            >
              Scout Opponent
            </button>
            <button
              onClick={() => setPhase('ready')}
              className="w-full py-3 rounded-xl font-semibold text-sm border transition-colors text-txt-secondary hover:text-txt-primary"
              style={{ borderColor: 'var(--surface-5)', background: 'var(--surface-3)' }}
            >
              Skip — use default sheet
            </button>
          </div>
        </div>
      )}

      {/* ══ SCOUT FORM ══════════════════════════════════════════════════════ */}
      {phase === 'form' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b px-4 pt-1 shrink-0" style={{ borderColor: 'var(--surface-4)' }}>
            {[
              { key: 'their-defense', label: 'Their Defense' },
              { key: 'their-offense', label: 'Their Offense' },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setScoutTab(t.key)}
                className={`mr-5 pb-2.5 pt-1.5 text-sm font-semibold border-b-2 transition-colors ${
                  scoutTab === t.key
                    ? 'text-txt-primary border-txt-primary'
                    : 'text-txt-secondary border-transparent hover:text-txt-primary'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Form body */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
            {scoutTab === 'their-defense' ? (
              <>
                <ScoutField label="Defensive Playbook">
                  <select
                    value={draft.defPlaybook}
                    onChange={e => patchDraft('defPlaybook', e.target.value)}
                    className="w-full rounded px-3 py-2 text-sm text-txt-primary"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--surface-5)' }}
                  >
                    <option value="">Unknown</option>
                    {DEFENSE_PLAYBOOKS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </ScoutField>

                <div>
                  <SectionLabel>Defense Stats</SectionLabel>
                  <div className="space-y-3">
                    <ScoutStat label="Pts Allowed / G" value={draft.defPointsAllowed}
                      onChange={v => patchDraft('defPointsAllowed', v)} placeholder="e.g. 24.5" />
                    <ScoutStat label="Rush Yds Allowed / G" value={draft.defRushAllowed}
                      onChange={v => patchDraft('defRushAllowed', v)} placeholder="e.g. 130" />
                    <ScoutStat label="Pass Yds Allowed / G" value={draft.defPassAllowed}
                      onChange={v => patchDraft('defPassAllowed', v)} placeholder="e.g. 210" />
                  </div>
                </div>

                <div>
                  <SectionLabel>Defense Position Groups</SectionLabel>
                  <p className="text-xs text-txt-secondary mb-3">Rate each group relative to their tier. Weak = below average, Strong = elite.</p>
                  <div className="space-y-3">
                    {DEF_POS.map(g => (
                      <RatingRow key={g} label={g}
                        value={draft.defGroups[g]}
                        onChange={v => patchDraft(`defGroups.${g}`, v)} />
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <ScoutField label="Offensive Playbook">
                  <select
                    value={draft.offPlaybook}
                    onChange={e => patchDraft('offPlaybook', e.target.value)}
                    className="w-full rounded px-3 py-2 text-sm text-txt-primary"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--surface-5)' }}
                  >
                    <option value="">Unknown</option>
                    {ALL_OFFENSE_PLAYBOOKS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </ScoutField>

                <div>
                  <SectionLabel>Offense Stats</SectionLabel>
                  <div className="space-y-3">
                    <ScoutStat label="Points / G" value={draft.offPPG}
                      onChange={v => patchDraft('offPPG', v)} placeholder="e.g. 35.0" />
                    <ScoutStat label="Rush Yds / G" value={draft.offRushYPG}
                      onChange={v => patchDraft('offRushYPG', v)} placeholder="e.g. 180" />
                    <ScoutStat label="Pass Yds / G" value={draft.offPassYPG}
                      onChange={v => patchDraft('offPassYPG', v)} placeholder="e.g. 245" />
                  </div>
                </div>

                <div>
                  <SectionLabel>Offense Position Groups</SectionLabel>
                  <p className="text-xs text-txt-secondary mb-3">Rate what your defense will face.</p>
                  <div className="space-y-3">
                    {OFF_POS.map(g => (
                      <RatingRow key={g} label={g}
                        value={draft.offGroups[g]}
                        onChange={v => patchDraft(`offGroups.${g}`, v)} />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 px-4 py-3 flex gap-3 border-t" style={{ borderColor: 'var(--surface-4)' }}>
            <button
              onClick={() => setPhase(scout ? 'ready' : 'prompt')}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-txt-secondary hover:text-txt-primary border transition-colors"
              style={{ borderColor: 'var(--surface-5)', background: 'var(--surface-3)' }}
            >
              Back
            </button>
            <button
              onClick={() => { saveScout(draft); setPhase('ready') }}
              className="flex-1 py-3 rounded-xl text-sm font-bold transition-opacity hover:opacity-90"
              style={{ background: 'var(--text-primary)', color: 'var(--surface-1)' }}
            >
              Done Scouting
            </button>
          </div>
        </div>
      )}

      {/* ══ PLAY SHEET ══════════════════════════════════════════════════════ */}
      {phase === 'ready' && (
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* My Style view */}
          {view === 'style' ? (
            <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6 max-w-md mx-auto w-full">
              <div>
                <div className="text-sm font-bold text-txt-primary mb-1">My {side === 'offense' ? 'Offensive' : 'Defensive'} Style</div>
                <p className="text-xs text-txt-secondary">These preferences bias play suggestions toward how you personally call games. Persists across all dynasties.</p>
              </div>

              {side === 'offense' ? (<>
                {/* Offense tendency */}
                <div>
                  <div className="text-xs font-semibold text-txt-secondary uppercase tracking-wide mb-2">Overall Tendency</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'balanced', label: 'Balanced',   desc: 'No bias — let the situation decide' },
                      { id: 'run',      label: 'Run Heavy',  desc: 'Boosts run plays, slightly discounts pass' },
                      { id: 'pass',     label: 'Pass Heavy', desc: 'Boosts pass plays, slightly discounts run' },
                      { id: 'rpo',      label: 'RPO Heavy',  desc: 'Strong boost to RPO plays across all downs' },
                    ].map(({ id, label, desc }) => (
                      <button key={id} onClick={() => patchStyle('tendency', id)}
                        className="text-left rounded-xl px-3 py-2.5 border transition-colors"
                        style={userStyle.tendency === id
                          ? { background: 'var(--text-primary)', color: 'var(--surface-1)', borderColor: 'var(--text-primary)' }
                          : { background: 'var(--surface-3)', color: 'var(--text-secondary)', borderColor: 'var(--surface-5)' }}>
                        <div className="text-xs font-bold mb-0.5">{label}</div>
                        <div className="text-[10px] opacity-70 leading-tight">{desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Offense play preferences */}
                <div>
                  <div className="text-xs font-semibold text-txt-secondary uppercase tracking-wide mb-2">Preferred Play Styles</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'prefPA',     label: 'Play Action', desc: 'Boosts PA passes' },
                      { key: 'prefScreen', label: 'Screens',     desc: 'Boosts screen plays' },
                      { key: 'prefDeep',   label: 'Deep Ball',   desc: 'Boosts deep routes' },
                      { key: 'prefQuick',  label: 'Quick Game',  desc: 'Boosts quick throws' },
                      { key: 'prefPower',  label: 'Power Run',   desc: 'Boosts power/iso runs' },
                      { key: 'prefZone',   label: 'Zone Run',    desc: 'Boosts inside/outside zone' },
                    ].map(({ key, label, desc }) => (
                      <button key={key} onClick={() => patchStyle(key, !userStyle[key])}
                        className="text-left rounded-xl px-3 py-2.5 border transition-colors"
                        style={userStyle[key]
                          ? { background: 'rgba(245,158,11,0.12)', color: '#fde68a', borderColor: '#f59e0b' }
                          : { background: 'var(--surface-3)', color: 'var(--text-secondary)', borderColor: 'var(--surface-5)' }}>
                        <div className="text-xs font-bold mb-0.5">{label}</div>
                        <div className="text-[10px] opacity-70 leading-tight">{desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </>) : (<>
                {/* Defense tendency */}
                <div>
                  <div className="text-xs font-semibold text-txt-secondary uppercase tracking-wide mb-2">Overall Tendency</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'balanced',  label: 'Balanced',        desc: 'No bias — let the situation decide' },
                      { id: 'blitz',     label: 'Blitz Heavy',     desc: 'Boosts blitz calls, discounts base' },
                      { id: 'coverage',  label: 'Coverage Heavy',  desc: 'Boosts coverage shells, discounts blitz' },
                      { id: 'man',       label: 'Man Heavy',       desc: 'Boosts man coverage calls' },
                    ].map(({ id, label, desc }) => (
                      <button key={id} onClick={() => patchStyle('defTendency', id)}
                        className="text-left rounded-xl px-3 py-2.5 border transition-colors"
                        style={userStyle.defTendency === id
                          ? { background: 'var(--text-primary)', color: 'var(--surface-1)', borderColor: 'var(--text-primary)' }
                          : { background: 'var(--surface-3)', color: 'var(--text-secondary)', borderColor: 'var(--surface-5)' }}>
                        <div className="text-xs font-bold mb-0.5">{label}</div>
                        <div className="text-[10px] opacity-70 leading-tight">{desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Defense play preferences */}
                <div>
                  <div className="text-xs font-semibold text-txt-secondary uppercase tracking-wide mb-2">Preferred Coverages & Schemes</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'prefBlitz',   label: 'Blitz',          desc: 'Boosts blitz packages' },
                      { key: 'prefZoneCov', label: 'Zone Coverage',  desc: 'Boosts zone shells' },
                      { key: 'prefManCov',  label: 'Man Coverage',   desc: 'Boosts man packages' },
                      { key: 'prefMatch',   label: 'Match Coverage', desc: 'Boosts match/hybrid shells' },
                      { key: 'prefBase',    label: 'Base Defense',   desc: 'Boosts base formation calls' },
                      { key: 'prefPackage', label: 'Packages',       desc: 'Boosts specialty packages' },
                    ].map(({ key, label, desc }) => (
                      <button key={key} onClick={() => patchStyle(key, !userStyle[key])}
                        className="text-left rounded-xl px-3 py-2.5 border transition-colors"
                        style={userStyle[key]
                          ? { background: 'rgba(245,158,11,0.12)', color: '#fde68a', borderColor: '#f59e0b' }
                          : { background: 'var(--surface-3)', color: 'var(--text-secondary)', borderColor: 'var(--surface-5)' }}>
                        <div className="text-xs font-bold mb-0.5">{label}</div>
                        <div className="text-[10px] opacity-70 leading-tight">{desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </>)}

              {/* Reset */}
              <button
                onClick={() => saveUserStyle(DEFAULT_STYLE)}
                className="text-xs text-txt-secondary hover:text-txt-primary transition-colors"
              >
                Reset to defaults
              </button>
            </div>

          ) : /* Log view */
          view === 'log' ? (
            <LogView log={log} onBack={() => setView('sheet')} />
          ) : pending ? (
            /* Result picker */
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <ResultPicker
                play={pending}
                situLabel={situLabel}
                side={side}
                down={down}
                exactYtg={exactYtg}
                yardLine={yardLine}
                options={resultOptions}
                onResult={handleResult}
                onYardage={handleYardage}
                onBack={() => setPending(null)}
                typeColors={typeColors}
              />
            </div>
          ) : (
            <>
              {/* Situation bar */}
              <div className="shrink-0 px-4 pt-3 pb-2.5 border-b" style={{ borderColor: 'var(--surface-4)' }}>
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-xs text-txt-secondary shrink-0">
                    {side === 'defense' ? 'Opp ' : ''}Down:
                  </span>
                  {[1, 2, 3, 4].map(d => (
                    <button
                      key={d}
                      onClick={() => { setSituation(s => ({ ...s, down: d })); if (d === 1) setExactYtg(10) }}
                      className="px-2.5 py-1.5 rounded text-xs font-bold border transition-colors"
                      style={down === d
                        ? { background: 'var(--text-primary)', color: 'var(--surface-1)', borderColor: 'var(--text-primary)' }
                        : { background: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: 'var(--surface-5)' }}
                    >
                      {DOWN_LABELS[d]}
                    </button>
                  ))}
                  <span className="text-xs text-txt-secondary mx-0.5">&</span>
                  {Object.entries(YTG_LABELS).map(([k, lbl]) => (
                    <button
                      key={k}
                      onClick={() => { setSituation(s => ({ ...s, ytg: k })); setExactYtg(k === 'short' ? 4 : k === 'med' ? 7 : 10) }}
                      className="px-2.5 py-1.5 rounded text-xs font-bold border transition-colors"
                      style={ytg === k
                        ? { background: 'var(--text-primary)', color: 'var(--surface-1)', borderColor: 'var(--text-primary)' }
                        : { background: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: 'var(--surface-5)' }}
                    >
                      {lbl}
                    </button>
                  ))}
                  {/* Field position — yard line input */}
                  <div className="w-full mt-1.5 flex items-center gap-2">
                    <span className="text-xs text-txt-secondary shrink-0">Ball On:</span>
                    <button
                      onClick={() => {
                        const next = Math.max(1, yardLine - 1)
                        applyYardLine(next)
                        setFieldPos(yardToZone(next))
                      }}
                      className="w-7 h-7 rounded text-sm font-bold border flex items-center justify-center"
                      style={{ background: 'var(--surface-3)', borderColor: 'var(--surface-5)', color: 'var(--text-primary)' }}
                    >-</button>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={yardRaw}
                      onChange={e => setYardRaw(e.target.value)}
                      onBlur={() => {
                        const v = Math.min(99, Math.max(1, parseInt(yardRaw) || 1))
                        applyYardLine(v)
                        setFieldPos(yardToZone(v))
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') e.target.blur()
                      }}
                      className="w-12 text-center text-sm font-bold rounded border py-1"
                      style={{ background: 'var(--surface-2)', borderColor: 'var(--surface-5)', color: 'var(--text-primary)' }}
                    />
                    <button
                      onClick={() => {
                        const next = Math.min(99, yardLine + 1)
                        applyYardLine(next)
                        setFieldPos(yardToZone(next))
                      }}
                      className="w-7 h-7 rounded text-sm font-bold border flex items-center justify-center"
                      style={{ background: 'var(--surface-3)', borderColor: 'var(--surface-5)', color: 'var(--text-primary)' }}
                    >+</button>
                    <span
                      className="text-[10px] font-black uppercase px-2 py-1 rounded border"
                      style={
                        fieldPos === 'red_zone'    ? { background: '#7c2d12', color: '#fed7aa', borderColor: '#ea580c' } :
                        fieldPos === 'scoring_pos' ? { background: '#713f12', color: '#fef08a', borderColor: '#ca8a04' } :
                        fieldPos === 'backed_up'   ? { background: '#1e3a5f', color: '#bfdbfe', borderColor: '#3b82f6' } :
                                                     { background: 'var(--surface-3)', color: 'var(--text-secondary)', borderColor: 'var(--surface-5)' }
                      }
                    >
                      {yardLine <= 50
                        ? `Own ${yardLine}`
                        : `Opp ${100 - yardLine}`
                      } — {fieldPos === 'backed_up' ? 'Backed Up' : fieldPos === 'own_mid' ? 'Own Mid' : fieldPos === 'scoring_pos' ? 'Scoring' : 'Red Zone'}
                    </span>
                  </div>

                  {/* Opponent formation picker (defense only) */}
                  {side === 'defense' && (
                    <div className="w-full mt-1.5">
                      {hasOppPb && oppPbForms ? (
                        /* ── Exact formation picker from scouted playbook ── */
                        oppPbLoading ? (
                          <span className="text-xs text-txt-secondary">Loading {oppScoutPlaybook} formations…</span>
                        ) : (
                          <>
                            {/* Base row */}
                            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                              <span className="text-xs text-txt-secondary shrink-0">Opp Set:</span>
                              {oppBases.map(base => (
                                <button
                                  key={base}
                                  onClick={() => {
                                    if (oppFormBase === base) { setOppFormBase(null); setOppFormName(null) }
                                    else { setOppFormBase(base); setOppFormName(null) }
                                  }}
                                  className="px-2.5 py-1 rounded text-[11px] font-bold border transition-colors"
                                  style={oppFormBase === base
                                    ? { background: 'var(--text-primary)', color: 'var(--surface-1)', borderColor: 'var(--text-primary)' }
                                    : { background: 'var(--surface-3)', color: 'var(--text-secondary)', borderColor: 'var(--surface-5)' }}
                                >
                                  {base}
                                </button>
                              ))}
                            </div>
                            {/* Formation name buttons */}
                            {oppFormBase && oppFormsInBase.length > 0 && (
                              <div className="flex gap-1.5 flex-wrap">
                                {[...oppFormsInBase].sort((a, b) => a.name.localeCompare(b.name)).map(f => (
                                  <button
                                    key={f.name}
                                    onClick={() => setOppFormName(prev => prev === f.name ? null : f.name)}
                                    className="px-2.5 py-1 rounded text-[11px] font-bold border transition-colors"
                                    style={oppFormName === f.name
                                      ? { background: '#1e3a5f', color: '#bfdbfe', borderColor: '#3b82f6' }
                                      : { background: 'var(--surface-3)', color: 'var(--text-secondary)', borderColor: 'var(--surface-5)' }}
                                  >
                                    {f.name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        )
                      ) : (
                        /* ── Generic type buttons (no playbook scouted) ── */
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-txt-secondary shrink-0">Opp Set:</span>
                          {OPP_FORM_TYPES.map(f => (
                            <button
                              key={f.value}
                              onClick={() => {
                                setOppFormBase(prev => prev === f.value ? null : f.value)
                                setOppFormName(null)
                              }}
                              title={f.desc}
                              className="px-2.5 py-1 rounded text-[11px] font-bold border transition-colors"
                              style={oppFormBase === f.value
                                ? { background: 'var(--text-primary)', color: 'var(--surface-1)', borderColor: 'var(--text-primary)' }
                                : { background: 'var(--surface-3)', color: 'var(--text-secondary)', borderColor: 'var(--surface-5)' }}
                            >
                              {f.label}
                            </button>
                          ))}
                          {oppFormBase && (
                            <button onClick={() => setOppFormBase(null)} className="text-xs text-txt-secondary hover:text-txt-primary px-1">✕</button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Type filter (offense only) */}
                  {side === 'offense' && (
                    <>
                      <span className="text-xs text-txt-secondary ml-1">|</span>
                      {[
                        { id: 'all',    label: 'All',   activeColor: null,      activeBg: null,      activeBorder: null },
                        { id: 'run',    label: 'Run',   activeColor: '#34d399', activeBg: '#064e3b', activeBorder: '#34d399' },
                        { id: 'pass',   label: 'Pass',  activeColor: '#60a5fa', activeBg: '#172554', activeBorder: '#60a5fa' },
                        { id: 'pa',     label: 'PA',    activeColor: '#22d3ee', activeBg: '#083344', activeBorder: '#22d3ee' },
                        { id: 'screen', label: 'SCR',   activeColor: '#fbbf24', activeBg: '#451a03', activeBorder: '#fbbf24' },
                        { id: 'rpo',    label: 'RPO',   activeColor: '#a78bfa', activeBg: '#2e1065', activeBorder: '#a78bfa' },
                        { id: 'chunk',  label: 'Chunk', activeColor: '#fed7aa', activeBg: '#7c2d12', activeBorder: '#ea580c' },
                      ].map(({ id, label, activeColor, activeBg, activeBorder }) => {
                        const isActive = typeFilter === id
                        const color  = activeColor || 'var(--text-primary)'
                        const bg     = activeBg    || 'var(--surface-1)'
                        const border = activeBorder || 'var(--text-primary)'
                        return (
                          <button
                            key={id}
                            onClick={() => setTypeFilter(id)}
                            className="px-2 py-1 rounded text-[10px] font-black uppercase border transition-all"
                            style={isActive
                              ? { background: bg, color, borderColor: border }
                              : { background: 'var(--surface-3)', color: activeColor || 'var(--text-secondary)', borderColor: activeColor ? `${activeColor}55` : 'var(--surface-5)', opacity: 0.7 }}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </>
                  )}
                </div>
              </div>

              {/* Play list */}
              <div className="flex-1 overflow-y-auto">

                {/* ── 4th down kick/special bar ── */}
                {down === 4 && (
                  <div className="px-4 pt-3 pb-1">
                    <div
                      className="rounded-xl p-3"
                      style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.3)' }}
                    >
                      <div className="text-[10px] font-black uppercase tracking-widest text-center mb-2.5" style={{ color: '#fbbf24' }}>
                        4th Down — Kick or Special
                      </div>

                      {/* Sub-step: Punt yardage picker — same layout as Ball On */}
                      {kickStep?.type === 'punt' && (() => {
                        const pYard = kickStep.yard
                        const pZone = yardToZone(pYard)
                        const pLabel = pYard <= 50 ? `Own ${pYard}` : `Opp ${100 - pYard}`
                        const pZoneName = pZone === 'backed_up' ? 'Backed Up' : pZone === 'own_mid' ? 'Own Mid' : pZone === 'scoring_pos' ? 'Scoring' : 'Red Zone'
                        return (
                          <div>
                            <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                              Ball placed at (receiving team):
                            </div>
                            <div className="flex items-center gap-2 mb-3">
                              <button
                                onClick={() => setKickStep(s => ({ ...s, yard: Math.max(1, s.yard - 1), yardRaw: String(Math.max(1, s.yard - 1)) }))}
                                className="w-7 h-7 rounded text-sm font-bold border flex items-center justify-center"
                                style={{ background: 'var(--surface-3)', borderColor: 'var(--surface-5)', color: 'var(--text-primary)' }}
                              >-</button>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={kickStep.yardRaw ?? String(pYard)}
                                onChange={e => setKickStep(s => ({ ...s, yardRaw: e.target.value }))}
                                onBlur={() => {
                                  const v = Math.min(99, Math.max(1, parseInt(kickStep.yardRaw) || 1))
                                  setKickStep(s => ({ ...s, yard: v, yardRaw: String(v) }))
                                }}
                                onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                                className="w-12 text-center text-sm font-bold rounded border py-1"
                                style={{ background: 'var(--surface-2)', borderColor: 'var(--surface-5)', color: 'var(--text-primary)' }}
                              />
                              <button
                                onClick={() => setKickStep(s => ({ ...s, yard: Math.min(99, s.yard + 1), yardRaw: String(Math.min(99, s.yard + 1)) }))}
                                className="w-7 h-7 rounded text-sm font-bold border flex items-center justify-center"
                                style={{ background: 'var(--surface-3)', borderColor: 'var(--surface-5)', color: 'var(--text-primary)' }}
                              >+</button>
                              <span
                                className="text-[10px] font-black uppercase px-2 py-1 rounded border"
                                style={
                                  pZone === 'red_zone'    ? { background: '#7c2d12', color: '#fed7aa', borderColor: '#ea580c' } :
                                  pZone === 'scoring_pos' ? { background: '#713f12', color: '#fef08a', borderColor: '#ca8a04' } :
                                  pZone === 'backed_up'   ? { background: '#1e3a5f', color: '#bfdbfe', borderColor: '#3b82f6' } :
                                                             { background: 'var(--surface-3)', color: 'var(--text-secondary)', borderColor: 'var(--surface-5)' }
                                }
                              >
                                {pLabel} — {pZoneName}
                              </span>
                            </div>
                            <PuntStrip
                              yard={pYard}
                              onChange={y => setKickStep(s => ({ ...s, yard: y, yardRaw: String(y) }))}
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => handlePuntResult(pYard)}
                                className="py-2.5 rounded-xl font-bold text-sm border"
                                style={{ background: 'rgba(22,101,52,0.4)', borderColor: '#16a34a', color: '#86efac' }}
                              >
                                Confirm Punt
                              </button>
                              <button
                                onClick={() => setKickStep(null)}
                                className="py-2.5 rounded-xl font-bold text-sm border"
                                style={{ background: 'var(--surface-3)', borderColor: 'var(--surface-5)', color: 'var(--text-secondary)' }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )
                      })()}

                      {/* Sub-step: FG Made / No Good */}
                      {kickStep?.type === 'fg' && (
                        <div>
                          <div className="text-xs text-center font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                            Field Goal Result
                          </div>
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <button
                              onClick={() => handleFGResult(true)}
                              className="py-3 rounded-xl font-bold text-sm border"
                              style={{ background: 'rgba(22,101,52,0.4)', borderColor: '#16a34a', color: '#86efac' }}
                            >
                              {side === 'offense' ? 'Good!' : 'FG Made'}
                            </button>
                            <button
                              onClick={() => handleFGResult(false)}
                              className="py-3 rounded-xl font-bold text-sm border"
                              style={{ background: 'rgba(127,29,29,0.3)', borderColor: '#991b1b', color: '#fca5a5' }}
                            >
                              {side === 'offense' ? 'No Good' : 'Blocked / No Good'}
                            </button>
                          </div>
                          <button
                            onClick={() => setKickStep(null)}
                            className="w-full py-1.5 text-xs"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            Cancel
                          </button>
                        </div>
                      )}

                      {/* Default: kick option buttons */}
                      {!kickStep && (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setKickStep({ type: 'fg' })}
                            className="py-3 rounded-xl font-bold text-sm border transition-colors"
                            style={{ background: 'rgba(22,101,52,0.4)', borderColor: '#16a34a', color: '#86efac' }}
                          >
                            Field Goal
                          </button>
                          <button
                            onClick={() => setKickStep({ type: 'punt', yard: 20 })}
                            className="py-3 rounded-xl font-bold text-sm border transition-colors"
                            style={{ background: 'rgba(30,58,138,0.4)', borderColor: '#3b82f6', color: '#93c5fd' }}
                          >
                            {side === 'offense' ? 'Punt' : 'Opp Punts'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Official playbook situational ── */}
                {side === 'offense' && hasOfficialPB && !showFormBrowser && (
                  <div className="px-4 pb-4">
                    {pbLoading ? (
                      <div className="py-12 text-center text-txt-secondary text-sm">Loading {offPlaybookName} playbook…</div>
                    ) : (
                      <>
                        {/* Top Calls */}
                        {topPlays.length > 0 && (
                          <div className="pt-4 pb-2">
                            <div className="flex items-baseline gap-2 mb-3">
                              <span className="text-xs font-black uppercase tracking-widest text-txt-secondary">AI Top Calls</span>
                              {scout && <span className="text-xs text-green-400">vs scouted defense</span>}
                            </div>
                            <div className="space-y-2">
                              {topPlays.map((play, i) => {
                                const tier      = getTier(play._score)
                                const tierStyle = TIER_STYLE[tier]
                                const rationale = getRationale(play, down, ytg, scout, 'offense')
                                const stats     = getPlayStats(play.name)
                                const tc        = getTypeColor(play)
                                const pNum      = play.formPlayIdx != null ? Math.floor(play.formPlayIdx / 3) + 1 : null
                                return (
                                  <button
                                    key={`top-${play.name}-${i}`}
                                    onClick={() => setPending(play)}
                                    className="w-full flex items-start gap-3 px-4 py-3.5 rounded-xl text-left transition-all active:scale-[0.99] border"
                                    style={{
                                      background:  tier === 'neutral' ? 'var(--surface-2)' : `${tc}11`,
                                      borderColor: tier === 'neutral' ? 'var(--surface-4)'  : `${tc}44`,
                                    }}
                                  >
                                    <div className="shrink-0 w-6 text-center">
                                      {pNum != null && <div className="text-[9px] font-black leading-none mb-0.5" style={{ color: '#4b5563' }}>P{pNum}</div>}
                                      {tier === 'elite' && <span className="text-base">🔥</span>}
                                      {tier === 'great' && <span className="text-sm font-black" style={{ color: tc }}>✓</span>}
                                      {tier === 'good'  && <span className="text-txt-secondary text-sm font-bold">+</span>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-bold text-txt-primary">{play.name}</span>
                                        {tierStyle.badge && (
                                          <span style={tierBadgeStyle(tier, tc)}>{tierStyle.badge}</span>
                                        )}
                                      </div>
                                      {stats && (
                                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                          <span className="text-[10px]" style={{ color: '#6b7280' }}>{stats.total}x called</span>
                                          <span className="text-[10px] font-bold" style={{ color: stats.pct >= 50 ? '#86efac' : '#fca5a5' }}>{stats.pct}% success</span>
                                          {stats.avg !== null && <span className="text-[10px]" style={{ color: '#6b7280' }}>avg {stats.avg} yds</span>}
                                        </div>
                                      )}
                                      {rationale && (
                                        <div className="text-xs text-txt-secondary mt-0.5">{rationale}</div>
                                      )}
                                      {play.formation && (
                                        <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-tertiary, var(--text-secondary))' }}>{play.formation}</div>
                                      )}
                                    </div>
                                    <span className="text-[10px] font-black uppercase shrink-0 self-start mt-0.5" style={{ color: OFF_TYPE_COLORS[getPlayLabel(play)] || 'var(--text-secondary)' }}>{getPlayLabel(play)}</span>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Divider */}
                        {topPlays.length > 0 && situationalPlays.length > 0 && (
                          <div className="flex items-center gap-3 my-4">
                            <div className="flex-1 h-px" style={{ background: 'var(--surface-4)' }} />
                            <span className="text-[10px] uppercase tracking-widest text-txt-secondary font-bold">All Plays</span>
                            <div className="flex-1 h-px" style={{ background: 'var(--surface-4)' }} />
                          </div>
                        )}

                        {/* All situational plays */}
                        <div className="space-y-1.5">
                          {situationalPlays.map((play, i) => (
                            <PlayRow
                              key={`all-${play.name}-${i}`}
                              play={play}
                              onPick={() => setPending(play)}
                              typeColors={OFF_TYPE_COLORS}
                              showFormation
                              successData={playSuccessMap[play.name] || null}
                              pNum={play.formPlayIdx != null ? Math.floor(play.formPlayIdx / 3) + 1 : null}
                            />
                          ))}
                        </div>

                        {/* Formation browser toggle */}
                        <button
                          onClick={() => setShowFormBrowser(true)}
                          className="w-full mt-5 py-3 rounded-xl text-sm font-semibold text-txt-secondary hover:text-txt-primary border transition-colors text-center"
                          style={{ borderColor: 'var(--surface-5)', background: 'var(--surface-2)' }}
                        >
                          Browse All Formations →
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* ── Formation browser ── */}
                {side === 'offense' && hasOfficialPB && showFormBrowser && (
                  <div className="px-4 pb-4">
                    <div className="flex items-center gap-3 pt-3 pb-3">
                      <button
                        onClick={() => setShowFormBrowser(false)}
                        className="text-xs text-txt-secondary hover:text-txt-primary"
                      >
                        ← Back to plays
                      </button>
                      <span className="text-xs text-txt-secondary">Formation Browser</span>
                    </div>
                    {/* Base tabs */}
                    <div className="flex gap-1.5 flex-wrap mb-3">
                      {bases.map(b => (
                        <button
                          key={b}
                          onClick={() => { setBaseFilter(b); setFormName(null) }}
                          className="px-3 py-1.5 rounded-full text-xs font-bold border transition-colors"
                          style={baseFilter === b
                            ? { background: 'var(--text-primary)', color: 'var(--surface-1)', borderColor: 'var(--text-primary)' }
                            : { background: 'var(--surface-3)', color: 'var(--text-secondary)', borderColor: 'var(--surface-5)' }}
                        >
                          {BASE_ABBRS[b] || b}
                        </button>
                      ))}
                    </div>
                    {/* Formation select */}
                    <select
                      value={formName || ''}
                      onChange={e => setFormName(e.target.value)}
                      className="w-full rounded px-3 py-2 text-sm text-txt-primary mb-3"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--surface-5)' }}
                    >
                      {formsInBase.map(f => (
                        <option key={f.name} value={f.name}>{f.base} {f.name} ({f.plays.length})</option>
                      ))}
                    </select>
                    {/* Formation plays */}
                    <div className="space-y-1.5">
                      {formPlays.map((play, i) => {
                        const tier    = getTier(play._score)
                        const sd      = playSuccessMap[play.name]
                        const winRate = sd && sd.total > 0 ? `${sd.wins}/${sd.total}` : null
                        const tc      = getTypeColor(play)
                        return (
                          <button
                            key={`fb-${play.name}-${i}`}
                            onClick={() => setPending({ ...play, formation: activeForm ? `${activeForm.base} ${activeForm.name}` : null })}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left border transition-colors"
                            style={{ background: tier === 'neutral' ? 'var(--surface-2)' : `${tc}0d`, borderColor: tier === 'neutral' ? 'var(--surface-4)' : `${tc}44` }}
                          >
                            <span className="text-[9px] font-black shrink-0 w-5 text-center" style={{ color: '#4b5563' }}>P{Math.floor(i / 3) + 1}</span>
                            <span className="text-[10px] font-black uppercase w-7 shrink-0" style={{ color: tc }}>{getPlayLabel(play).slice(0,3)}</span>
                            <span className="flex-1 text-sm font-semibold text-txt-primary">{play.name}</span>
                            {winRate && (
                              <span
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                                style={{
                                  background: sd.wins / sd.total >= 0.5 ? 'rgba(22,101,52,0.4)' : 'rgba(127,29,29,0.3)',
                                  color: sd.wins / sd.total >= 0.5 ? '#86efac' : '#fca5a5',
                                }}
                              >
                                {winRate}
                              </span>
                            )}
                            {TIER_STYLE[tier]?.badge && (
                              <span style={{ ...tierBadgeStyle(tier, tc), flexShrink: 0 }}>{TIER_STYLE[tier].badge}</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* ── Official defense playbook ── */}
                {side === 'defense' && hasOfficialDefPB && !defPbLoading && (
                  <div className="px-4 pb-4">
                    <div className="pt-4 space-y-4">
                      {/* Top Calls */}
                      {topDefPlays.length > 0 && (
                        <div className="pb-2">
                          <div className="flex items-baseline gap-2 mb-3 flex-wrap">
                            <span className="text-xs font-black uppercase tracking-widest text-txt-secondary">Top Calls</span>
                            {oppContext && <span className="text-xs text-yellow-400">vs {oppContext.name ? `${oppContext.base} ${oppContext.name}` : oppContext.base}</span>}
                            {scout && <span className="text-xs text-green-400">vs scouted offense</span>}
                          </div>
                          <div className="space-y-2">
                            {topDefPlays.map((play, i) => {
                              const tier      = getTier(play._score)
                              const tierStyle = TIER_STYLE[tier]
                              const rationale = getRationale(play, down, ytg, scout, 'defense', oppContext)
                              const stats     = getPlayStats(play.name)
                              const tc        = getTypeColor(play)
                              const pNum      = play.formPlayIdx != null ? Math.floor(play.formPlayIdx / 3) + 1 : null
                              return (
                                <button
                                  key={`td-${i}`}
                                  onClick={() => setPending(play)}
                                  className="w-full flex items-start gap-3 px-4 py-3.5 rounded-xl text-left border transition-all active:scale-[0.99]"
                                  style={{
                                    background:  tier === 'neutral' ? 'var(--surface-2)' : `${tc}11`,
                                    borderColor: tier === 'neutral' ? 'var(--surface-4)'  : `${tc}44`,
                                  }}
                                >
                                  <div className="shrink-0 w-6 text-center">
                                    {pNum != null && <div className="text-[9px] font-black leading-none mb-0.5" style={{ color: '#4b5563' }}>P{pNum}</div>}
                                    {tier === 'elite' && <span className="text-base">🔥</span>}
                                    {tier === 'great' && <span className="text-sm font-black" style={{ color: tc }}>✓</span>}
                                    {tier === 'good'  && <span className="text-txt-secondary text-sm font-bold">+</span>}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-sm font-bold text-txt-primary">{play.name}</span>
                                      {tierStyle.badge && (
                                        <span style={tierBadgeStyle(tier, tc)}>{tierStyle.badge}</span>
                                      )}
                                    </div>
                                    {stats && (
                                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                        <span className="text-[10px]" style={{ color: '#6b7280' }}>{stats.total}x called</span>
                                        <span className="text-[10px] font-bold" style={{ color: stats.pct >= 50 ? '#86efac' : '#fca5a5' }}>{stats.pct}% success</span>
                                        {stats.avg !== null && <span className="text-[10px]" style={{ color: '#6b7280' }}>avg {stats.avg} yds</span>}
                                      </div>
                                    )}
                                    {rationale && <div className="text-xs text-txt-secondary mt-0.5">{rationale}</div>}
                                    {play.formation && <div className="text-[10px] text-txt-secondary mt-0.5 opacity-60">{play.formation}</div>}
                                  </div>
                                  <span className="text-[10px] font-black uppercase shrink-0 self-start mt-0.5" style={{ color: DEF_TYPE_COLORS[play.type] || 'var(--text-secondary)' }}>
                                    {play.type || ''}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* All Plays */}
                      {scoredDefPlays.filter(p => !topDefPlays.some(t => t.name === p.name)).length > 0 && (
                        <>
                          <div className="flex items-center gap-3 my-4">
                            <div className="flex-1 h-px" style={{ background: 'var(--surface-4)' }} />
                            <span className="text-[10px] uppercase tracking-widest text-txt-secondary font-bold">More Options</span>
                            <div className="flex-1 h-px" style={{ background: 'var(--surface-4)' }} />
                          </div>
                          <div className="space-y-1.5">
                            {scoredDefPlays.filter(p => !topDefPlays.some(t => t.name === p.name)).slice(0, 30).map((play, i) => (
                              <PlayRow
                                key={`dpr-${i}`}
                                play={play}
                                onPick={() => setPending(play)}
                                typeColors={DEF_TYPE_COLORS}
                                showFormation
                                successData={playSuccessMap[play.name] || null}
                                pNum={play.formPlayIdx != null ? Math.floor(play.formPlayIdx / 3) + 1 : null}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {side === 'defense' && hasOfficialDefPB && defPbLoading && (
                  <div className="py-12 text-center text-sm text-txt-secondary">Loading playbook...</div>
                )}

                {/* ── Default play sheet (offense or defense, no official PB) ── */}
                {(usingDefault || (side === 'defense' && !hasOfficialDefPB)) && (
                  <div className="px-4 pb-4">
                    {defaultPlays.length === 0 ? (
                      <div className="py-12 text-center">
                        <p className="text-sm text-txt-secondary mb-3">
                          {side === 'offense'
                            ? 'Set your offense scheme in the Depth Chart to get a play sheet.'
                            : 'Set your defense scheme in the Depth Chart to get a play sheet.'}
                        </p>
                        {side === 'offense' && depthChartUrl && (
                          <Link to={depthChartUrl} className="text-sm underline text-txt-primary">
                            Go to Depth Chart
                          </Link>
                        )}
                      </div>
                    ) : (
                      <>
                        {/* Top calls from default plays */}
                        {defaultPlays.filter(p => p._score >= 3).length > 0 && (
                          <div className="pt-4 pb-2">
                            <div className="flex items-baseline gap-2 mb-3 flex-wrap">
                              <span className="text-xs font-black uppercase tracking-widest text-txt-secondary">Top Calls</span>
                              {side === 'defense' && oppContext && <span className="text-xs text-yellow-400">vs {oppContext.name ? `${oppContext.base} ${oppContext.name}` : oppContext.base}</span>}
                              {scout && <span className="text-xs text-green-400">vs scouted {side === 'offense' ? 'defense' : 'offense'}</span>}
                            </div>
                            <div className="space-y-2">
                              {defaultPlays.filter(p => p._score >= 3).slice(0, 4).map((play, i) => {
                                const tier      = getTier(play._score)
                                const tierStyle = TIER_STYLE[tier]
                                const rationale = getRationale(play, down, ytg, scout, side, side === 'defense' ? oppContext : null)
                                const stats     = getPlayStats(play.name)
                                const tc        = getTypeColor(play)
                                const pNum      = play.formPlayIdx != null ? Math.floor(play.formPlayIdx / 3) + 1 : null
                                return (
                                  <button
                                    key={`dt-${i}`}
                                    onClick={() => setPending(play)}
                                    className="w-full flex items-start gap-3 px-4 py-3.5 rounded-xl text-left border transition-all active:scale-[0.99]"
                                    style={{
                                      background:  tier === 'neutral' ? 'var(--surface-2)' : `${tc}11`,
                                      borderColor: tier === 'neutral' ? 'var(--surface-4)'  : `${tc}44`,
                                    }}
                                  >
                                    <div className="shrink-0 w-6 text-center">
                                      {pNum != null && <div className="text-[9px] font-black leading-none mb-0.5" style={{ color: '#4b5563' }}>P{pNum}</div>}
                                      {tier === 'elite' && <span className="text-base">🔥</span>}
                                      {tier === 'great' && <span className="text-sm font-black" style={{ color: tc }}>✓</span>}
                                      {tier === 'good'  && <span className="text-txt-secondary text-sm font-bold">+</span>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-bold text-txt-primary">{play.name}</span>
                                        {tierStyle.badge && (
                                          <span style={tierBadgeStyle(tier, tc)}>{tierStyle.badge}</span>
                                        )}
                                      </div>
                                      {stats && (
                                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                          <span className="text-[10px]" style={{ color: '#6b7280' }}>{stats.total}x called</span>
                                          <span className="text-[10px] font-bold" style={{ color: stats.pct >= 50 ? '#86efac' : '#fca5a5' }}>{stats.pct}% success</span>
                                          {stats.avg !== null && <span className="text-[10px]" style={{ color: '#6b7280' }}>avg {stats.avg} yds</span>}
                                        </div>
                                      )}
                                      {rationale && <div className="text-xs text-txt-secondary mt-0.5">{rationale}</div>}
                                    </div>
                                    <span className="text-[10px] font-black uppercase shrink-0 self-start mt-0.5" style={{ color: typeColors[getPlayLabel(play)] || typeColors[play.type] || 'var(--text-secondary)' }}>
                                      {getPlayLabel(play) || play.type || ''}
                                    </span>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Remaining default plays */}
                        {defaultPlays.filter(p => p._score < 3).length > 0 && (
                          <>
                            <div className="flex items-center gap-3 my-4">
                              <div className="flex-1 h-px" style={{ background: 'var(--surface-4)' }} />
                              <span className="text-[10px] uppercase tracking-widest text-txt-secondary font-bold">More Options</span>
                              <div className="flex-1 h-px" style={{ background: 'var(--surface-4)' }} />
                            </div>
                            <div className="space-y-1.5">
                              {defaultPlays.filter(p => p._score < 3).map((play, i) => (
                                <PlayRow
                                  key={`dr-${i}`}
                                  play={play}
                                  onPick={() => setPending(play)}
                                  typeColors={typeColors}
                                  successData={playSuccessMap[play.name] || null}
                                  pNum={play.formPlayIdx != null ? Math.floor(play.formPlayIdx / 3) + 1 : null}
                                />
                              ))}
                            </div>
                          </>
                        )}

                        {side === 'offense' && !offPlaybookName && depthChartUrl && (
                          <Link
                            to={depthChartUrl}
                            className="block text-center text-xs text-txt-secondary hover:text-txt-primary mt-5 underline"
                          >
                            Add official playbook for full play list
                          </Link>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Stats bar */}
              {total > 0 && (
                <div className="shrink-0 px-4 py-2 border-t flex gap-4 text-xs" style={{ borderColor: 'var(--surface-4)' }}>
                  <span className="text-green-400 font-semibold">
                    {wins} {side === 'defense' ? 'stop' : 'success'}{wins !== 1 ? 's' : ''}
                  </span>
                  <span className="text-red-400 font-semibold">
                    {total - wins} {side === 'defense' ? 'allowed' : 'fail'}{(total - wins) !== 1 ? 's' : ''}
                  </span>
                  <span className="text-txt-secondary">{Math.round((wins / total) * 100)}% rate</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>,
    document.body
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PlayRow({ play, onPick, typeColors, showFormation = false, successData = null, pNum = null }) {
  const sd    = successData
  const stats = sd && sd.total > 0 ? {
    total: sd.total,
    pct:   Math.round((sd.wins / sd.total) * 100),
    avg:   sd.yardsCalls > 0 ? (sd.yards / sd.yardsCalls).toFixed(1) : null,
  } : null
  return (
    <button
      onClick={onPick}
      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left border transition-colors active:scale-[0.99]"
      style={{ background: 'var(--surface-2)', borderColor: 'var(--surface-4)' }}
    >
      {pNum != null && (
        <span className="text-[9px] font-black shrink-0 w-5 text-center" style={{ color: '#4b5563' }}>
          P{pNum}
        </span>
      )}
      <span className="text-[10px] font-black uppercase w-7 shrink-0" style={{ color: typeColors[getPlayLabel(play)] || typeColors[play.type] || 'var(--text-secondary)' }}>
        {getPlayLabel(play).slice(0, 3) || play.type?.slice(0, 3)}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-txt-primary truncate">{play.name}</div>
        {showFormation && play.formation && (
          <div className="text-[10px] text-txt-secondary truncate">{play.formation}</div>
        )}
        {stats && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px]" style={{ color: '#6b7280' }}>{stats.total}x</span>
            <span className="text-[10px] font-bold" style={{ color: stats.pct >= 50 ? '#86efac' : '#fca5a5' }}>{stats.pct}%</span>
            {stats.avg !== null && <span className="text-[10px]" style={{ color: '#6b7280' }}>avg {stats.avg} yds</span>}
          </div>
        )}
      </div>
    </button>
  )
}

function PuntStrip({ yard, onChange }) {
  const scrollRef   = useRef(null)
  const selectedRef = useRef(null)

  useEffect(() => {
    if (!scrollRef.current || !selectedRef.current) return
    const c = scrollRef.current
    const s = selectedRef.current
    c.scrollLeft = s.offsetLeft - c.clientWidth / 2 + s.offsetWidth / 2
  }, [yard])

  const BTN_W = 38
  return (
    <div
      className="rounded-lg overflow-hidden mb-3"
      style={{ background: '#0f2e0f', border: '2px solid #2d5a2d' }}
    >
      <div
        ref={scrollRef}
        className="overflow-x-auto"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#2d5a2d #0f2e0f' }}
      >
        <div className="flex gap-px pt-1 pb-2 px-1 min-w-max">
          {Array.from({ length: 99 }, (_, i) => i + 1).map(y => {
            const isSelected = yard === y
            const label = y <= 50 ? `Own ${y}` : `Opp ${100 - y}`
            const bg     = isSelected ? '#15803d' : y <= 20 ? '#1c3a1c' : y <= 50 ? '#162116' : y <= 75 ? '#2d1a0a' : '#2d0a0a'
            const border = isSelected ? '#4ade80' : y <= 20 ? '#2d5a2d' : y <= 50 ? '#2d3d2d' : y <= 75 ? '#7c4a1a' : '#7f1d1d'
            const color  = isSelected ? '#bbf7d0' : y <= 20 ? '#86efac' : y <= 50 ? '#6b7280' : y <= 75 ? '#fcd34d' : '#f87171'
            return (
              <div key={y} ref={isSelected ? selectedRef : null} className="flex-shrink-0" style={{ width: BTN_W }}>
                <button
                  onClick={() => onChange(y)}
                  className="font-bold rounded-sm w-full transition-all active:scale-90"
                  style={{ height: 40, background: bg, border: `${isSelected ? 2 : 1}px solid ${border}`, color, fontWeight: isSelected ? 900 : 600, fontSize: 8, lineHeight: 1.1 }}
                >
                  {label}
                </button>
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex gap-3 px-2 pb-1.5 text-[9px]" style={{ borderTop: '1px solid #1a4a1a' }}>
        <span style={{ color: '#86efac' }}>Pinned back (great)</span>
        <span style={{ color: '#6b7280' }}>Midfield</span>
        <span style={{ color: '#fcd34d' }}>Short punt</span>
        <span style={{ color: '#f87171' }}>Very short</span>
      </div>
    </div>
  )
}

function FieldStrip({ lossRange, gainRange, yardLine, btnStyle, posLabel, onYardage, BTN_W, header, specialOptions, fourthDownOpts = [], onResult, onBack }) {
  const scrollRef = useRef(null)
  const losRef    = useRef(null)

  // On mount: scroll so LOS button is centered in the viewport
  useEffect(() => {
    if (!scrollRef.current || !losRef.current) return
    const container = scrollRef.current
    const losEl     = losRef.current
    container.scrollLeft = losEl.offsetLeft - container.clientWidth / 2 + losEl.offsetWidth / 2
  }, [])

  // Track scroll position to draw the fixed LOS pin overlay
  const [losPx, setLosPx] = useState(null)
  useEffect(() => {
    const container = scrollRef.current
    const losEl     = losRef.current
    if (!container || !losEl) return
    const update = () => {
      const rect = container.getBoundingClientRect()
      const losRect = losEl.getBoundingClientRect()
      setLosPx(losRect.left - rect.left + losEl.offsetWidth / 2)
    }
    update()
    container.addEventListener('scroll', update)
    return () => container.removeEventListener('scroll', update)
  }, [])

  const losLabel = yardLine <= 50 ? `Own ${yardLine}` : `Opp ${100 - yardLine}`

  return (
    <div className="pt-2 w-full">
      {header}

      {/* 4th down / special kick options — shown above field on 3rd & 4th down */}
      {fourthDownOpts.length > 0 && (
        <div className="mb-3 rounded-lg p-2" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)' }}>
          <div className="text-[10px] font-bold uppercase tracking-widest text-center mb-2" style={{ color: '#fbbf24' }}>
            Kick / Special
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${fourthDownOpts.length}, 1fr)` }}>
            {fourthDownOpts.map(opt => (
              <button
                key={opt.value}
                onClick={() => onResult(opt)}
                className="py-2.5 rounded-lg font-bold text-sm border transition-colors"
                style={opt.success
                  ? { background: 'rgba(22,101,52,0.4)', borderColor: '#16a34a', color: '#86efac' }
                  : { background: 'rgba(127,29,29,0.3)', borderColor: '#b45309', color: '#fcd34d' }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Field container */}
      <div
        className="rounded-lg overflow-hidden mb-3 relative"
        style={{ background: '#0f2e0f', border: '2px solid #2d5a2d' }}
      >
        {/* Fixed LOS pin — absolute overlay that stays put as strip scrolls */}
        {losPx !== null && (
          <div
            className="absolute top-0 bottom-0 pointer-events-none z-20 flex flex-col items-center"
            style={{ left: losPx, transform: 'translateX(-50%)' }}
          >
            {/* Pin line */}
            <div className="w-0.5 flex-1" style={{ background: 'rgba(255,255,255,0.7)' }} />
            {/* LOS label chip at bottom */}
            <div
              className="text-[9px] font-black px-1 py-0.5 rounded-sm mb-0.5 whitespace-nowrap"
              style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', backdropFilter: 'blur(2px)' }}
            >
              {losLabel}
            </div>
          </div>
        )}

        {/* Scrollable strip */}
        <div
          ref={scrollRef}
          className="overflow-x-auto"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#2d5a2d #0f2e0f' }}
        >
          <div className="flex gap-px pt-1 pb-2 px-1 min-w-max">

            {/* Loss buttons */}
            {lossRange.map(y => {
              const s    = btnStyle(y)
              const dest = yardLine + y
              return (
                <button
                  key={y}
                  onClick={() => onYardage(y)}
                  className="font-bold transition-all active:scale-90 rounded-sm flex-shrink-0"
                  style={{ width: BTN_W, height: 40, background: s.bg, border: `1px solid ${s.border}`, color: s.color, fontWeight: s.fw, fontSize: 8, lineHeight: 1.1 }}
                >
                  {posLabel(dest)}
                </button>
              )
            })}

            {/* LOS (0) */}
            <div ref={losRef} className="relative flex-shrink-0" style={{ width: BTN_W }}>
              <button
                onClick={() => onYardage(0)}
                className="font-bold transition-all active:scale-90 rounded-sm w-full"
                style={{ height: 40, background: '#1a4a1a', border: '2px solid rgba(255,255,255,0.5)', color: '#fff', fontWeight: 700, fontSize: 8, lineHeight: 1.1 }}
              >
                {posLabel(yardLine)}
              </button>
            </div>

            {/* Gain buttons */}
            {gainRange.map(y => {
              const s    = btnStyle(y)
              const dest = yardLine + y
              const isRZStart = dest === 80
              return (
                <div key={y} className="relative flex-shrink-0" style={{ width: BTN_W }}>
                  {/* Red zone entry line */}
                  {isRZStart && (
                    <div className="absolute -left-px top-0 bottom-0 w-0.5 z-10" style={{ background: '#ef4444', opacity: 0.8 }} />
                  )}
                  <button
                    onClick={() => onYardage(y)}
                    className="font-bold transition-all active:scale-90 rounded-sm w-full"
                    style={{ height: 40, background: s.bg, border: `1px solid ${s.border}`, color: s.color, fontWeight: s.fw, fontSize: 8, lineHeight: 1.1 }}
                  >
                    {posLabel(dest)}
                  </button>
                </div>
              )
            })}

          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-3 px-2 pb-1.5 text-[9px]" style={{ borderTop: '1px solid #1a4a1a' }}>
          <span style={{ color: '#f87171' }}>Loss</span>
          <span style={{ color: '#9ca3af' }}>No gain</span>
          <span style={{ color: '#86efac' }}>Gain / 1st</span>
          <span style={{ color: '#fca5a5' }}>Red Zone</span>
          <span style={{ color: '#4ade80' }}>TD</span>
        </div>
      </div>

      {/* Special outcomes */}
      {specialOptions.length > 0 && (
        <>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex-1 h-px" style={{ background: 'var(--surface-4)' }} />
            <span className="text-[10px] text-txt-secondary uppercase tracking-widest">or</span>
            <div className="flex-1 h-px" style={{ background: 'var(--surface-4)' }} />
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {specialOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => onResult(opt)}
                className="py-3 rounded-xl font-bold text-sm border transition-colors"
                style={opt.success
                  ? { background: 'rgba(22,101,52,0.4)', borderColor: '#16a34a', color: '#86efac' }
                  : { background: 'rgba(127,29,29,0.3)', borderColor: '#7f1d1d', color: '#fca5a5' }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
      <button onClick={onBack} className="w-full text-xs text-txt-secondary hover:text-txt-primary py-2 text-center">
        ← Back to play sheet
      </button>
    </div>
  )
}

function ResultPicker({ play, situLabel, side, down, exactYtg, yardLine, options, onResult, onYardage, onBack, typeColors }) {
  const specialOptions = side === 'offense'
    ? options.filter(o => ['td', 'turnover'].includes(o.value))
    : options.filter(o => ['td', 'turnover', 'fg_allowed'].includes(o.value))

  const fourthDownOpts = down >= 3
    ? (side === 'offense'
        ? options.filter(o => ['fg', 'punt'].includes(o.value))
        : options.filter(o => ['fg_miss', 'punt_recv'].includes(o.value)))
    : []

  const header = (
    <div className="text-center pb-2">
      <div className="text-xs text-txt-secondary mb-1">{situLabel}</div>
      {play.formation && <div className="text-xs text-txt-secondary">{play.formation}</div>}
      <div className="text-xl font-bold text-txt-primary mt-1">{play.name}</div>
      <div className="text-xs font-semibold uppercase mt-0.5" style={{ color: typeColors[getPlayLabel(play)] || typeColors[play.type] || 'var(--text-secondary)' }}>{getPlayLabel(play) || play.type}</div>
    </div>
  )

  const yardStyle = (y) => {
    const newYl = yardLine + y
    if (newYl >= 100)      return { background: 'rgba(74,222,128,0.35)', borderColor: '#4ade80', color: '#bbf7d0' }
    if (y >= exactYtg)     return { background: 'rgba(22,101,52,0.4)',   borderColor: '#16a34a', color: '#86efac' }
    if (y > 0)             return { background: 'rgba(120,53,15,0.35)',  borderColor: '#b45309', color: '#fde68a' }
    if (y === 0)           return { background: 'var(--surface-3)',      borderColor: 'var(--surface-5)', color: 'var(--text-secondary)' }
    return                        { background: 'rgba(127,29,29,0.3)',   borderColor: '#991b1b', color: '#fca5a5' }
  }

  if (side === 'offense') {
    const btnStyle = (y) => {
      const dest = yardLine + y
      if (dest >= 100) return { bg: '#15803d', border: '#4ade80', color: '#bbf7d0', fw: '900' }
      if (y >= exactYtg && dest >= 80) return { bg: '#7f1d1d', border: '#f87171', color: '#fee2e2', fw: '800' }
      if (dest >= 80)    return { bg: '#991b1b', border: '#b91c1c', color: '#fca5a5', fw: '700' }
      if (y >= exactYtg) return { bg: '#166534', border: '#16a34a', color: '#86efac', fw: '800' }
      if (y > 0)         return { bg: '#1c3a1c', border: '#2d5a2d', color: '#86efac', fw: '600' }
      if (y === 0)       return { bg: '#1a4a1a', border: '#4b7a4b', color: '#9ca3af', fw: '600' }
      return                    { bg: '#2d0a0a', border: '#7f1d1d', color: '#f87171', fw: '600' }
    }

    const posLabel = (dest) => {
      if (dest >= 100) return 'TD'
      if (dest <= 0)   return 'Safety'
      if (dest === 50) return '50'
      if (dest > 50)   return `Opp ${100 - dest}`
      return `Own ${dest}`
    }

    const lossRange = Array.from({ length: yardLine }, (_, i) => -(yardLine - i))
    const gainRange = Array.from({ length: 100 - yardLine }, (_, i) => i + 1)
    const BTN_W = 38  // px per button + gap

    return (
      <FieldStrip
        lossRange={lossRange}
        gainRange={gainRange}
        yardLine={yardLine}
        btnStyle={btnStyle}
        posLabel={posLabel}
        onYardage={onYardage}
        BTN_W={BTN_W}
        header={header}
        specialOptions={specialOptions}
        fourthDownOpts={fourthDownOpts}
        onResult={onResult}
        onBack={onBack}
      />
    )
  }

  // Defense also gets a FieldStrip — yards = yards allowed, inverted colors
  const defBtnStyle = (y) => {
    const dest = yardLine + y
    if (dest >= 100) return { bg: '#7f1d1d', border: '#ef4444', color: '#fecaca', fw: '900' }  // TD allowed
    if (y >= exactYtg) return { bg: '#991b1b', border: '#dc2626', color: '#fca5a5', fw: '800' }  // 1st down allowed
    if (y > 0)         return { bg: '#431407', border: '#c2410c', color: '#fed7aa', fw: '600' }  // gain (bad)
    if (y === 0)       return { bg: '#1a2a1a', border: '#4b7a4b', color: '#9ca3af', fw: '600' }  // LOS
    return                   { bg: '#14532d', border: '#16a34a', color: '#86efac', fw: '800' }  // sack/TFL (good)
  }

  const defPosLabel = (dest) => {
    if (dest >= 100) return 'TD'
    if (dest <= 0)   return 'Safety'
    if (dest === 50) return '50'
    if (dest > 50)   return `Opp ${100 - dest}`
    return `Own ${dest}`
  }

  const lossRange = Array.from({ length: yardLine }, (_, i) => -(yardLine - i))
  const gainRange = Array.from({ length: 100 - yardLine }, (_, i) => i + 1)
  const BTN_W = 38

  return (
    <FieldStrip
      lossRange={lossRange}
      gainRange={gainRange}
      yardLine={yardLine}
      btnStyle={defBtnStyle}
      posLabel={defPosLabel}
      onYardage={onYardage}
      BTN_W={BTN_W}
      header={header}
      specialOptions={specialOptions}
      fourthDownOpts={fourthDownOpts}
      onResult={onResult}
      onBack={onBack}
    />
  )
}

function LogView({ log, onBack }) {
  const reversed = [...log].reverse()
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--surface-4)' }}>
        <button onClick={onBack} className="text-xs text-txt-secondary hover:text-txt-primary">← Play Sheet</button>
        <span className="text-sm font-bold text-txt-primary">Session Log</span>
        <span className="text-xs text-txt-secondary ml-auto">{log.length} plays</span>
      </div>
      {reversed.length === 0 ? (
        <div className="py-16 text-center text-txt-secondary text-sm">No plays logged yet.</div>
      ) : (
        <div className="px-4 py-3 space-y-2">
          {reversed.map(entry => (
            <div
              key={entry.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg border"
              style={entry.success
                ? { borderColor: '#166534', background: 'rgba(74,222,128,0.06)' }
                : { borderColor: '#7f1d1d', background: 'rgba(239,68,68,0.05)' }}
            >
              <span className={`text-xs font-bold shrink-0 ${entry.success ? 'text-green-400' : 'text-red-400'}`}>
                {entry.side === 'defense'
                  ? (entry.success ? 'STOP' : 'GAVE')
                  : (entry.success ? 'WIN'  : 'FAIL')}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-txt-primary truncate">{entry.playName}</div>
                <div className="text-xs text-txt-secondary">
                  {entry.formation && <span>{entry.formation} · </span>}
                  {DOWN_LABELS[entry.down]} & {entry.ytg === 'short' ? 'Short' : entry.ytg === 'med' ? 'Med' : 'Long'}
                  {' → '}{entry.resultLabel}
                </div>
              </div>
              <span className="text-[10px] uppercase text-txt-secondary shrink-0">{entry.side}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SectionLabel({ children }) {
  return <div className="text-xs font-bold uppercase tracking-wider text-txt-secondary mb-3">{children}</div>
}

function ScoutField({ label, children }) {
  return (
    <div>
      <label className="block text-sm text-txt-primary mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function ScoutStat({ label, value, onChange, placeholder }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-txt-primary">{label}</span>
      <input
        type="number"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-28 rounded px-2.5 py-1.5 text-sm text-txt-primary text-right"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--surface-5)' }}
      />
    </div>
  )
}

function RatingRow({ label, value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-bold text-txt-primary w-8 shrink-0">{label}</span>
      <div className="flex gap-1.5 flex-1">
        {RATINGS.map(r => (
          <button
            key={r}
            onClick={() => onChange(r)}
            className="flex-1 py-1.5 rounded text-xs font-bold border transition-colors"
            style={value === r
              ? r === 'Elite'  ? { background: '#713f12', color: '#fef08a', borderColor: '#ca8a04' }
                : r === 'Strong' ? { background: '#166534', color: '#bbf7d0', borderColor: '#16a34a' }
                : r === 'Weak'   ? { background: '#7f1d1d', color: '#fecaca', borderColor: '#dc2626' }
                : { background: 'var(--text-primary)', color: 'var(--surface-1)', borderColor: 'var(--text-primary)' }
              : { background: 'var(--surface-3)', color: 'var(--text-secondary)', borderColor: 'var(--surface-5)' }}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  )
}
