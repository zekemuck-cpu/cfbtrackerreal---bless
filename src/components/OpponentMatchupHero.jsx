import { Link } from 'react-router-dom'
import { getTeamLogoByTid, getMascotName } from '../data/teams'
import { getTeamColors } from '../data/teamColors'
import { getContrastTextColor } from '../utils/colorUtils'
import { StatRings } from './CfbUI'

// Same week-slug logic GameEdit.jsx's weekLabel() uses, expanded to a
// human-readable header label instead of the compact BW1/BW2/CCG slug.
export function gameWeekLabel(game) {
  if (!game) return ''
  if (game.isCFPChampionship) return 'National Championship'
  if (game.isCFPSemifinal) return 'Bowl Week 3'
  if (game.isCFPQuarterfinal) return 'Bowl Week 2'
  if (game.isBowlGame && game.bowlWeek === 'week2') return 'Bowl Week 2'
  if (game.isCFPFirstRound || game.isBowlGame) return 'Bowl Week 1'
  if (game.isConferenceChampionship || game.week === 'CCG') return 'Conference Championship'
  const w = game.week
  return (w !== null && w !== undefined && w !== '') ? `Week ${w}` : ''
}

/**
 * Team-colored, textured hero shared by the per-matchup weekly-prep pages
 * (Scouting Report, Weekly Install) — opponent logo watermarked into a
 * team-primary-color background, name/record/kickoff, and OVR/OFF/DEF
 * rating rings. Callers own their own data-fetching (analytics rows, roster,
 * etc.); this only needs the opponent tid plus optional record/ratings.
 */
export default function OpponentMatchupHero({ dynasty, game, opponentTid, pageTitle, record, ratings, pathPrefix }) {
  const teamsSource = dynasty?.teams || {}
  const mascotName = getMascotName(opponentTid, teamsSource)
  const logo = getTeamLogoByTid(opponentTid, teamsSource)
  const teamColors = mascotName ? getTeamColors(mascotName, teamsSource) : null
  const heroBg = teamColors?.primary || '#1f2937'
  const heroText = getContrastTextColor(heroBg)
  const hasRatings = !!(ratings?.overall || ratings?.offense || ratings?.defense)
  const kickoffLabel = [game?.dateLabel, game?.kickoffTimeLabel].filter(Boolean).join(' · ')

  return (
    <div
      className="card overflow-hidden relative reveal cfb-texture cfb-texture-strong"
      style={{
        backgroundColor: heroBg,
        backgroundImage: 'linear-gradient(120deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 44%), linear-gradient(180deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.44) 100%)',
        ...(logo ? { '--cfb-watermark': `url("${logo}")`, '--cfb-watermark-right': '7rem' } : {}),
      }}
    >
      <div className="relative p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 cfb-watermark">
        <div className="min-w-0">
          <div className="label-sm mb-1.5" style={{ color: heroText, opacity: 0.75 }}>{gameWeekLabel(game)}</div>
          <div className="flex items-center gap-3">
            {logo && (
              <span
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white p-1 flex-shrink-0 flex items-center justify-center overflow-hidden"
                style={{ border: `2px solid ${heroBg}` }}
              >
                <img src={logo} alt="" className="w-full h-full object-contain" />
              </span>
            )}
            <h1
              className="font-display font-extrabold uppercase tracking-tight leading-none m-0"
              style={{ color: heroText, fontSize: 'clamp(1.375rem, 2.6vw, 2.125rem)' }}
            >
              {pageTitle}
            </h1>
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap text-sm" style={{ color: heroText, opacity: 0.85 }}>
            <span>{mascotName || 'Opponent'}{record ? ` (${record.wins}-${record.losses})` : ''}</span>
            {kickoffLabel && (
              <>
                <span aria-hidden="true" style={{ opacity: 0.5 }}>•</span>
                <span>{kickoffLabel}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {hasRatings && (
            <StatRings
              items={[
                { label: 'OVR', value: ratings.overall },
                { label: 'OFF', value: ratings.offense },
                { label: 'DEF', value: ratings.defense },
              ]}
              ringColor={heroText}
              textColor={heroText}
              size="sm"
            />
          )}
          <Link to={`${pathPrefix}/game/${game.id}`} className="btn-refined btn-refined--ghost">
            View Game
          </Link>
        </div>
      </div>
    </div>
  )
}
