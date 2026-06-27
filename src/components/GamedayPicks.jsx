import { useState } from 'react'
import { getTeamRanking, calculateTeamRecordFromGames } from '../context/DynastyContext'
import { getContrastTextColor } from '../utils/colorUtils'

// ── Helpers ──────────────────────────────────────────────────────────────────

function djb2(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i)
  return Math.abs(h >>> 0)
}

function getOvr(dynasty, tid, year) {
  if (!tid || !year) return 75
  const t = dynasty?.teams?.[tid] ?? dynasty?.teams?.[String(tid)]
  const ovr =
    t?.byYear?.[year]?.teamRatings?.overall ??
    t?.byYear?.[String(year)]?.teamRatings?.overall ??
    t?.overall ??
    75
  return parseInt(ovr) || 75
}

function getRank(dynasty, tid, year) {
  return getTeamRanking(dynasty, tid, year)?.rank ?? null
}

function getRecord(dynasty, tid, year) {
  if (!tid) return { wins: 0, losses: 0 }
  return calculateTeamRecordFromGames(dynasty, tid, year)
}

function getTeamColor(dynasty, tid) {
  const t = dynasty?.teams?.[tid] ?? dynasty?.teams?.[String(tid)]
  return t?.primaryColor || t?.color || '#374151'
}

// Returns just the mascot word ("Wildcats") from a full name ("Kentucky Wildcats").
// Used in quips where mid-sentence grammar needs "the Wildcats" not "Kentucky Wildcats".
function mascot(name) {
  if (!name) return 'them'
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? parts[parts.length - 1] : name
}

// ── Probability model ─────────────────────────────────────────────────────────

// Deterministic PRNG in [0,1) seeded by a string (mulberry32). The same game
// always rolls the same value, so picks are stable across re-renders but differ
// per matchup and per analyst.
function seededRandom(str) {
  let a = djb2(str)
  a |= 0
  a = (a + 0x6D2B79F5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const clamp01 = (x) => Math.max(0.02, Math.min(0.98, x))

// Warp a probability around the 0.5 pivot: k>1 sharpens toward the favorite,
// 0<k<1 pulls toward a coin-flip, k<0 flips contrarian toward the underdog.
function sharpen(p, k) {
  return clamp01(0.5 + (p - 0.5) * k)
}

// Collapse everything we track about a team — rating, ranking, record — into a
// single "power" number. Higher = stronger.
function teamPower({ ovr, rank, wins, losses }) {
  const rankBonus = rank ? Math.max(0, 26 - Math.min(rank, 25)) * 1.2 : 0
  const games = wins + losses
  const winPct = games > 0 ? wins / games : 0.5
  const recordBonus = (winPct - 0.5) * 12
  return ovr + rankBonus + recordBonus
}

// Base probability the USER team wins, before any analyst personality is applied.
// Power gap runs through a logistic curve; home field nudges the margin.
function baseUserWinProb(ctx) {
  const userPow = teamPower({ ovr: ctx.userOvr, rank: ctx.userRank, wins: ctx.userWins, losses: ctx.userLosses })
  const oppPow  = teamPower({ ovr: ctx.oppOvr,  rank: ctx.oppRank,  wins: ctx.oppWins,  losses: ctx.oppLosses })
  let margin = userPow - oppPow
  if (!ctx.isNeutral) margin += ctx.isHome ? 3 : -3
  return clamp01(1 / (1 + Math.exp(-margin / 7)))
}

// ── Analyst definitions ───────────────────────────────────────────────────────
// Each analyst has a `skew(baseProb, ctx)` fn that bends the base user-win
// probability toward their personality, and a `quip` fn for their reasoning.
// The component rolls a seeded RNG against the skewed probability to land the
// final 'user' | 'opp' pick.

const ANALYSTS = [
  {
    id: 'desmond',
    name: 'Desmond',
    title: 'The Enthusiastic Wildcard',
    // Loves the disrespected team — flips contrarian toward the underdog.
    skew(p) {
      return sharpen(p, -0.45)
    },
    quip({ side, userName, oppName, gameKey }) {
      const m  = mascot(side === 'user' ? userName : oppName)
      const mo = mascot(side === 'user' ? oppName  : userName)
      const opts = [
        `The ${m} are DISRESPECTED and they know it. That's bulletin board material!`,
        `The whole country is sleeping on the ${m}?! Not me. Not today!`,
        `The ${m} have got that DOG in 'em. I'm riding with them all day!`,
        `The ${mo} fans acting like this is already over?! The ${m} are coming in angry today, I guarantee it.`,
        `Nobody is giving the ${m} any credit going into this game. That's exactly why I'm riding with them!`,
      ]
      return opts[djb2((gameKey ?? '') + 'desmond') % opts.length]
    },
  },
  {
    id: 'rece',
    name: 'Rece',
    title: 'The Ringmaster',
    // Deadpan — leans the favorite with dry, inevitable certainty.
    skew(p) {
      return sharpen(p, 1.4)
    },
    quip({ side, userName, oppName, gameKey }) {
      const m  = mascot(side === 'user' ? userName : oppName)
      const mo = mascot(side === 'user' ? oppName  : userName)
      const opts = [
        `I'm not making a prediction. I'm just quietly noting that the ${m} are in this spot for a reason.`,
        `No bold take from me. I'll just leave the ${m} right there and let everyone think about it.`,
        `Has anyone checked in with the ${mo} recently? Because the ${m} have been on another level.`,
        `I'm just asking questions here. Why does everyone keep overlooking the ${m}?`,
        `Subtle observation: the ${m} tend to do exactly what people say they can't. Food for thought.`,
      ]
      return opts[djb2((gameKey ?? '') + 'rece') % opts.length]
    },
  },
  {
    id: 'pat',
    name: 'Pat',
    title: 'The Professional Chaos Agent',
    // Pure theater — softens the favorite toward a toss-up, then leans hard
    // toward the road team (the user when away, the opponent when user is home).
    skew(p, ctx) {
      let pp = sharpen(p, 0.7)
      if (!ctx.isNeutral) pp += ctx.isHome ? -0.22 : 0.22
      return clamp01(pp)
    },
    quip({ side, userName, oppName, isNeutral, gameKey }) {
      const m  = mascot(side === 'user' ? userName : oppName)
      const mo = mascot(side === 'user' ? oppName  : userName)
      const opts = isNeutral ? [
        `*stands up* *removes jacket* The ${m}. LET'S. GO.`,
        `I have been building to this moment. The ${m}. Final answer.`,
        `The ${m} win. I said what I said. No further questions.`,
      ] : [
        `I know, I KNOW what you're thinking — but the ${m}. *drops mic*`,
        `The crowd thought they had me. They THOUGHT. The ${m} win on the road!`,
        `The ${mo} fans, I love you, I really do... but it's the ${m}. Sorry. Not sorry.`,
        `*stands up* I'm going with the ${m} on the road and I will NOT be sitting back down.`,
        `Everyone in this building thinks I'm going with the ${mo}. Everyone in this building is wrong.`,
      ]
      return opts[djb2((gameKey ?? '') + 'pat') % opts.length]
    },
  },
  {
    id: 'nick',
    name: 'Saban',
    title: 'The No-Nonsense Professor',
    // Pure process, no emotion — sharpest lean to the favorite of the group.
    skew(p) {
      return sharpen(p, 1.9)
    },
    quip({ side, userName, oppName, gameKey }) {
      const m = mascot(side === 'user' ? userName : oppName)
      const opts = [
        `The ${m} win the line of scrimmage. It's not complicated.`,
        `Talk about momentum all you want. The ${m} control the trenches. Same result.`,
        `The ${m} have the process. The other team does not. That's the pick.`,
        `The ${m} dominate up front. That's not a prediction — that's an analysis.`,
        `I'm not here to entertain. The ${m} win. Next question.`,
      ]
      return opts[djb2((gameKey ?? '') + 'nick') % opts.length]
    },
  },
  {
    id: 'kirk',
    name: 'Kirk',
    title: 'The Golden-Boy Realist',
    // Film study, stays measured — modest lean to the favorite, lots of room
    // for an upset call.
    skew(p) {
      return sharpen(p, 1.15)
    },
    quip({ side, userName, oppName, gameKey }) {
      const m = mascot(side === 'user' ? userName : oppName)
      const opts = [
        `The ${m} are the better football team. The quarterback play, the depth — it's not close.`,
        `I've watched the film. The ${m} control the line of scrimmage and win this game.`,
        `The ${m}. I say that having studied both rosters extensively this week.`,
        `Look, I respect the opponent, but the ${m} have three distinct schematic advantages here.`,
        `The ${m} win. Their secondary has been elite all season, and it shows up in a game like this.`,
      ]
      return opts[djb2((gameKey ?? '') + 'kirk') % opts.length]
    },
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function GamedayPicks({
  dynasty,
  userTid,
  opponentTid,
  isHome,
  isNeutral,
  gameKey,
  userTeamName,
  opponentName,
  userLogoUrl,
  oppLogoUrl,
  year: yearProp,
  week: weekProp,
  mini = false,
}) {
  const [activeId, setActiveId] = useState(null)

  if (!dynasty || !userTid || !opponentTid) return null

  // year defaults to the dynasty's current pointer, but callers on a team page
  // (viewing a past season) or a specific game pass their own.
  const year = yearProp ?? dynasty.currentYear

  const userOvr  = getOvr(dynasty, userTid, year)
  const oppOvr   = getOvr(dynasty, opponentTid, year)
  const userRank = getRank(dynasty, userTid, year)
  const oppRank  = getRank(dynasty, opponentTid, year)
  const userRec  = getRecord(dynasty, userTid, year)
  const oppRec   = getRecord(dynasty, opponentTid, year)

  const ctx = {
    userOvr, oppOvr, userRank, oppRank,
    userWins: userRec.wins, userLosses: userRec.losses,
    oppWins:  oppRec.wins,  oppLosses:  oppRec.losses,
    isHome, isNeutral, gameKey,
    userName: userTeamName || 'Your Team',
    oppName:  opponentName || 'Opponent',
  }

  // Base win probability from the matchup, then each analyst skews it to their
  // personality and a seeded roll lands their final pick. Seeding on gameKey +
  // analyst id keeps picks stable per matchup (no reshuffle on re-render).
  const baseProb = baseUserWinProb(ctx)

  const picks = ANALYSTS.map(a => {
    const pUser = a.skew(baseProb, ctx)
    const roll  = seededRandom((gameKey ?? '') + a.id)
    const side  = roll < pUser ? 'user' : 'opp'
    const quip  = a.quip({ ...ctx, side })
    const conf  = side === 'user' ? pUser : 1 - pUser   // their confidence in their own pick
    return { ...a, side, quip, conf }
  })

  const activePick = picks.find(p => p.id === activeId) ?? null

  const userColor = getTeamColor(dynasty, userTid)
  const oppColor  = getTeamColor(dynasty, opponentTid)

  // Mini mode — just the 5 tinted pick boxes (analyst name + picked-team logo),
  // no quote strip / card chrome. Used inline under the dashboard game-entry row.
  if (mini) {
    return (
      <div className="grid grid-cols-5 rounded-lg overflow-hidden" style={{ border: '1px solid var(--surface-3)' }}>
        {picks.map((analyst, idx) => {
          const pickUser = analyst.side === 'user'
          const logoUrl  = pickUser ? userLogoUrl : oppLogoUrl
          const teamColor = pickUser ? userColor : oppColor
          const txt = getContrastTextColor(teamColor)
          return (
            <div
              key={analyst.id}
              className="flex flex-col items-center gap-1 py-2 px-0.5"
              style={{
                backgroundColor: teamColor,
                borderRight: idx < 4 ? '1px solid rgba(0,0,0,0.18)' : 'none',
              }}
            >
              <div
                className="text-center"
                style={{ fontSize: 8, fontWeight: 700, letterSpacing: '1px', color: txt, opacity: 0.85, textTransform: 'uppercase' }}
              >
                {analyst.name}
              </div>
              <div
                className="flex items-center justify-center rounded-full flex-shrink-0 bg-white"
                style={{ width: 28, height: 28, boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
              >
                {logoUrl
                  ? <img src={logoUrl} alt="" style={{ width: 19, height: 19, objectFit: 'contain' }} />
                  : <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 10, color: teamColor }}>?</span>}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="media-card reveal">

      {/* Quote strip — sits ABOVE the picks row */}
      <div
        style={{
          minHeight: 44,
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          backgroundColor: 'var(--surface-1)',
          borderBottom: '1px solid var(--surface-3)',
          transition: 'background-color 0.15s ease',
        }}
      >
        {activePick ? (
          <div className="flex items-start gap-2.5">
            <div className="flex-shrink-0 pt-0.5">
              <div
                className="label-xs font-bold"
                style={{
                  letterSpacing: '1.5px',
                  fontSize: '9px',
                  color: 'var(--text-tertiary)',
                  whiteSpace: 'nowrap',
                }}
              >
                {activePick.name.toUpperCase()}
              </div>
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                lineHeight: 1.55,
                fontStyle: 'italic',
              }}
            >
              "{activePick.quip}"
            </div>
          </div>
        ) : (
          <h2 className="font-bold text-txt-primary m-0 text-sm" style={{ width: '100%' }}>
            Gameday Picks
            <span className="font-normal text-txt-tertiary">{' · Hover an analyst to hear their take'}</span>
          </h2>
        )}
      </div>

      {/* Picks row — each analyst's column is tinted with the color of the
          team they picked; logo sits in a white circle. */}
      <div className="grid grid-cols-5">
        {picks.map((analyst, idx) => {
          const pickUser = analyst.side === 'user'
          const logoUrl  = pickUser ? userLogoUrl : oppLogoUrl
          const teamName = pickUser ? userTeamName : opponentName
          const teamAbbr = pickUser
            ? (userTeamName?.split(' ').pop() || 'US')
            : (opponentName?.split(' ').pop() || 'OPP')
          const teamColor = pickUser ? userColor : oppColor
          const txt = getContrastTextColor(teamColor)
          const isActive = activeId === analyst.id

          return (
            <div
              key={analyst.id}
              className="flex flex-col items-center px-1 py-3 gap-2 cursor-pointer transition-[filter]"
              style={{
                borderRight: idx < 4 ? '1px solid rgba(0,0,0,0.18)' : 'none',
                backgroundColor: teamColor,
                filter: isActive ? 'brightness(1.12)' : 'none',
              }}
              onMouseEnter={() => setActiveId(analyst.id)}
              onMouseLeave={() => setActiveId(null)}
              onClick={() => setActiveId(isActive ? null : analyst.id)}
            >
              {/* Analyst name */}
              <div
                className="label-xs text-center"
                style={{
                  letterSpacing: '2px',
                  fontSize: '9px',
                  fontWeight: 700,
                  color: txt,
                  opacity: isActive ? 1 : 0.75,
                }}
              >
                {analyst.name.toUpperCase()}
              </div>

              {/* Team logo in a white circle */}
              <div
                className="flex items-center justify-center rounded-full flex-shrink-0 bg-white"
                style={{
                  width: 44,
                  height: 44,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }}
              >
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={teamName}
                    style={{ width: 30, height: 30, objectFit: 'contain' }}
                  />
                ) : (
                  <span
                    style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      fontSize: 13,
                      color: teamColor,
                      letterSpacing: '0.5px',
                    }}
                  >
                    {teamAbbr.slice(0, 3).toUpperCase()}
                  </span>
                )}
              </div>

            </div>
          )
        })}
      </div>

    </div>
  )
}
