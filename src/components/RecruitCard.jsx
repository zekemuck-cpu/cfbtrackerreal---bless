import { useState } from 'react'
import { Card } from './ui'
import { proxyImageUrl } from '../utils/imageProxy'
import { getTidFromAbbr } from '../data/teamRegistry'
import { getTeamLogoByTid, stripMascotFromName } from '../data/teams'
import { ATTRIBUTE_COLUMNS, ATTRIBUTE_ABBR } from '../utils/recruitAttributes'
import { scoutGrade, scoutLetter, scoutReport } from '../utils/scoutGrade'
import { computeScore } from './archetypeWeights'

const SS_GRADES = [
  { letter: 'A+', min: 95 }, { letter: 'A', min: 90 }, { letter: 'A-', min: 86 },
  { letter: 'B+', min: 82 }, { letter: 'B', min: 78 }, { letter: 'B-', min: 74 },
  { letter: 'C+', min: 70 }, { letter: 'C', min: 66 }, { letter: 'C-', min: 62 },
  { letter: 'D+', min: 58 }, { letter: 'D', min: 54 }, { letter: 'D-', min: 50 },
  { letter: 'F', min: 0 },
]
function ssGradeLetter(score) {
  return SS_GRADES.find(g => score >= g.min)?.letter ?? 'F'
}
function ssGradeColor(score) {
  if (score >= 86) return '#34d399'
  if (score >= 74) return '#60a5fa'
  if (score >= 62) return '#fbbf24'
  if (score >= 50) return '#f97316'
  return '#f87171'
}

// Madden-style rating color ramp for scouted attribute values.
const ratingColor = (v) =>
  v >= 90 ? '#22c55e' : v >= 80 ? '#84cc16' : v >= 70 ? '#eab308' : v >= 60 ? '#f97316' : '#ef4444'

// Shared recruit/target scouting card. Identical visuals for the Commitments
// tab and the Targets tab — the ONLY difference is the color pair fed in:
// committed records use the (committed) team's colors; open targets use a
// neutral slate. Three vertical bands: identity → ranks → scouting → footer.
//
// Props:
//   recruit       — the recruit/target record (name, position, stars, ranks…)
//   player        — matched player record, for the headshot (optional)
//   bg            — card background / accent color
//   text          — text + hairline color (contrast against bg)
//   teamsData     — dynasty.teams (tid-keyed), for the portal FROM-chip logo
//   isAllSeasons  — show the recruit year inline (all-seasons view)
//   interactive   — Card hover affordance (when the tile links somewhere)

const stateFullNames = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'Washington, D.C.',
}

export default function RecruitCard({ recruit, player, bg, text, teamsData, teamLogo = null, isAllSeasons = false, interactive = false, playStyle = 'balanced', model = null, graphicUrl = null, onOpenGraphic = null, scoutStaffEnabled = false, weightsMap = null, pool = null }) {
  const teamBgText = text
  const teamAccent = bg
  const teamsSource = teamsData || {}

  const [showAttrs, setShowAttrs] = useState(false)
  const [showStaff, setShowStaff] = useState(false)
  const attrEntries = ATTRIBUTE_COLUMNS
    .filter((name) => recruit.attributes?.[name] != null && recruit.attributes[name] !== '')
    .map((name) => ({ name, abbr: ATTRIBUTE_ABBR[name] || name, value: Number(recruit.attributes[name]) }))
  const hasAttrs = attrEntries.length > 0
  const grade = scoutGrade(recruit, model) // { score, tier } — null score when unscouted
  const report = scoutReport(recruit, playStyle, null, model) // generated blurb, null when unscouted

  // Scout Staff grade (computeScore) — only when enabled and player has attrs.
  // computeScore can still return null even with attrs on file (zero comps
  // for this archetype at any star level) — hasAttrs alone isn't enough.
  const rawSsScore = scoutStaffEnabled && hasAttrs ? computeScore(recruit, weightsMap, pool) : null
  const ssScore = rawSsScore != null ? Math.round(rawSsScore) : null
  const ssLetter = ssScore != null ? ssGradeLetter(ssScore) : null
  const ssColor = ssScore != null ? ssGradeColor(ssScore) : null

  const hometownText = recruit.hometown
    ? `${recruit.hometown}${recruit.state ? `, ${recruit.state}` : ''}`
    : (recruit.state ? (stateFullNames[recruit.state] || recruit.state) : null)
  const sizeOnly = (recruit.height || recruit.weight)
    ? `${recruit.height || ''}${recruit.height && recruit.weight ? ', ' : ''}${recruit.weight ? `${recruit.weight} lbs` : ''}`
    : null

  // Prefer the durable origin-school tid (movementByYear[year].fromTid, threaded
  // onto the commit) so the FROM-chip logo/name resolve LIVE from dynasty.teams
  // even after that school is renamed. Only round-trip the stored abbr string
  // when no fromTid is available (legacy commits).
  const previousTeamTid = (recruit.previousTeamTid != null ? Number(recruit.previousTeamTid) : null)
    ?? (recruit.previousTeam ? getTidFromAbbr(recruit.previousTeam, teamsSource) : null)
  const transferLogo = previousTeamTid ? getTeamLogoByTid(previousTeamTid, teamsSource) : null
  const rawPreviousTeamName = previousTeamTid && teamsSource[previousTeamTid]?.name
    ? teamsSource[previousTeamTid].name
    : recruit.previousTeam
  const previousTeamName = rawPreviousTeamName
    ? (stripMascotFromName(rawPreviousTeamName) || rawPreviousTeamName)
    : null

  const isPortalRecruit = recruit.isPortal === true
  const showFromChip = isPortalRecruit && !!previousTeamName
  // A JUCO recruit isn't a High School recruit — covers both the CFB27 sync
  // path (isHighSchoolRecruit: false) and the manual/sheet-entry path, which
  // has never had that flag and instead encodes it directly in the class
  // string ('JUCO Fr'/'JUCO So'/'JUCO Jr', or this feature's own 'JC (JR)'
  // etc — see mapRecruitClassLabel in cfb27SaveImport.js).
  const isJucoRecruit = recruit.isHighSchoolRecruit === false ||
    (typeof recruit.class === 'string' && (recruit.class.toUpperCase().startsWith('JUCO') || recruit.class.startsWith('JC (')))
  const showHsMarker = !showFromChip && !isJucoRecruit
  const showJucoMarker = !showFromChip && isJucoRecruit
  const showBottomChips = showFromChip || showHsMarker || showJucoMarker
  const starCount = Number(recruit.stars) || 0

  return (
    <Card
      padding="none"
      variant="bordered"
      interactive={interactive}
      className="relative h-full overflow-hidden group"
      style={{
        color: teamBgText,
        borderColor: `${teamBgText}33`,
        backgroundColor: teamAccent,
        backgroundImage: 'linear-gradient(120deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 44%), linear-gradient(180deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.30) 100%)',
      }}
    >
      {/* Commit-graphic button — top-left so it clears the stars. The card is a
          link to the player page, so stop the click from navigating. */}
      {onOpenGraphic && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenGraphic() }}
          aria-label={graphicUrl ? 'View commit graphic' : 'Add commit graphic'}
          title={graphicUrl ? 'View commit graphic' : 'Add commit graphic'}
          className="absolute top-1 left-1 z-10 w-6 h-6 rounded-md flex items-center justify-center transition-transform active:scale-95"
          style={{
            backgroundColor: graphicUrl ? teamBgText : 'rgba(0,0,0,0.35)',
            color: graphicUrl ? teamAccent : teamBgText,
          }}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      <div className="p-2 sm:p-3 flex flex-col h-full gap-1.5 sm:gap-2.5">
        {/* === IDENTITY BAND === photo + name + pos·class + stars */}
        <div className="flex flex-col items-center gap-1 sm:gap-1.5 text-center">
          {player?.pictureUrl ? (
            <img
              src={proxyImageUrl(player.pictureUrl, 300)}
              alt={recruit.name}
              className="w-11 h-11 sm:w-14 sm:h-14 object-cover rounded-md flex-shrink-0"
              style={{ border: `2px solid ${teamBgText}66` }}
            />
          ) : teamLogo ? (
            <div
              className="w-11 h-11 sm:w-14 sm:h-14 rounded-md flex-shrink-0 flex items-center justify-center bg-white p-1.5"
              style={{ border: `2px solid ${teamBgText}66` }}
            >
              <img src={teamLogo} alt="" className="w-full h-full object-contain" />
            </div>
          ) : (
            <div
              className="w-11 h-11 sm:w-14 sm:h-14 rounded-md flex-shrink-0 flex items-center justify-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.12)', border: `2px solid ${teamBgText}66` }}
            >
              <span
                className="text-xs sm:text-sm font-black uppercase tracking-wide tabular-nums"
                style={{ letterSpacing: '0.05em', color: teamBgText, opacity: 0.9 }}
              >
                {(recruit.position || 'ATH').slice(0, 3)}
              </span>
            </div>
          )}
          <h3
            className="font-display font-black text-txt-primary leading-tight truncate max-w-full"
            style={{ fontSize: 'clamp(13px, 3.4vw, 16px)', letterSpacing: '-0.02em', color: teamBgText }}
          >
            {recruit.name || 'Unknown'}
          </h3>
          <div
            className="flex items-center justify-center gap-1 sm:gap-1.5 label-xs text-txt-secondary flex-wrap"
            style={{ letterSpacing: '1.2px', fontSize: '9px', color: teamBgText, opacity: 0.85 }}
          >
            <span className="font-bold">{recruit.position || 'ATH'}</span>
            <span>{recruit.class || 'HS'}</span>
            {recruit.devTrait && (
              <span>{recruit.devTrait}</span>
            )}
            {isAllSeasons && recruit.recruitYear && (
              <span className="tabular-nums">{recruit.recruitYear}</span>
            )}
          </div>
          {/* Stars — broadcast-style yellow */}
          <span className="flex items-center justify-center gap-0.5">
            {[...Array(5)].map((_, i) => (
              <svg
                key={i}
                className="w-2.5 h-2.5 sm:w-3 sm:h-3"
                fill={i < starCount ? 'var(--accent-warning, #f59e0b)' : 'var(--surface-4)'}
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
          </span>
          {/* Verbal (SoftCommitted) tag — a commitment, but still reversible
              unlike Hard/Signed, so it's called out distinctly here. */}
          {recruit.commitmentTier === 'SoftCommitted' && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-widest"
              style={{ letterSpacing: '1.5px', color: teamAccent, backgroundColor: teamBgText, border: `1px solid ${teamBgText}` }}
            >
              Verbal
            </span>
          )}
          {/* Scout grade — score + tier, color-coded. Only when scouted. */}
          {grade.score != null && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase mt-0.5"
              style={{ letterSpacing: '0.08em', backgroundColor: grade.tier.color, color: '#0a0a0a' }}
              title={`Scout grade ${grade.score} — ${grade.tier.label}`}
            >
              <span className="tabular-nums">{grade.score}</span>
              <span style={{ opacity: 0.85 }}>{scoutLetter(grade.score)}</span>
            </span>
          )}
        </div>

        {/* === RANK BAND === */}
        {(recruit.nationalRank || recruit.stateRank || recruit.positionRank) && (
          <div
            className="grid grid-cols-3 gap-1 sm:gap-2 py-1.5 sm:py-2"
            style={{ borderTop: `1px solid ${teamBgText}33`, borderBottom: `1px solid ${teamBgText}33` }}
          >
            <div className="text-center">
              <div className="label-xs text-txt-tertiary" style={{ letterSpacing: '1.2px', fontSize: '8px', color: teamBgText, opacity: 0.6 }}>NATL</div>
              <div className="font-display font-black tabular-nums text-txt-primary leading-none mt-0.5 sm:mt-1" style={{ fontSize: 'clamp(13px, 3.5vw, 17px)', letterSpacing: '-0.02em', color: teamBgText }}>
                {recruit.nationalRank ? `#${recruit.nationalRank}` : '—'}
              </div>
            </div>
            <div className="text-center" style={{ borderLeft: `1px solid ${teamBgText}33`, borderRight: `1px solid ${teamBgText}33` }}>
              <div className="label-xs text-txt-tertiary" style={{ letterSpacing: '1.2px', fontSize: '8px', color: teamBgText, opacity: 0.6 }}>{recruit.position || 'POS'}</div>
              <div className="font-display font-black tabular-nums text-txt-primary leading-none mt-0.5 sm:mt-1" style={{ fontSize: 'clamp(13px, 3.5vw, 17px)', letterSpacing: '-0.02em', color: teamBgText }}>
                {recruit.positionRank ? `#${recruit.positionRank}` : '—'}
              </div>
            </div>
            <div className="text-center">
              <div className="label-xs text-txt-tertiary" style={{ letterSpacing: '1.2px', fontSize: '8px', color: teamBgText, opacity: 0.6 }}>{recruit.state || 'ST'}</div>
              <div className="font-display font-black tabular-nums text-txt-primary leading-none mt-0.5 sm:mt-1" style={{ fontSize: 'clamp(13px, 3.5vw, 17px)', letterSpacing: '-0.02em', color: teamBgText }}>
                {recruit.stateRank ? `#${recruit.stateRank}` : '—'}
              </div>
            </div>
          </div>
        )}

        {/* === SCOUTING BAND === */}
        {(recruit.archetype || sizeOnly || hometownText) && (
          <div className="text-[10px] sm:text-[12px] leading-snug space-y-0.5 text-center">
            {recruit.archetype && (
              <div className="font-semibold truncate" style={{ color: teamBgText }}>{recruit.archetype}</div>
            )}
            {sizeOnly && (
              <div className="tabular-nums truncate" style={{ color: teamBgText, opacity: 0.85 }}>{sizeOnly}</div>
            )}
            {hometownText && (
              <div className="truncate" style={{ color: teamBgText, opacity: 0.65 }}>{hometownText}</div>
            )}
          </div>
        )}

        {/* === CONTEXT BAND === FROM-school (portal) or "High School" chip */}
        {showBottomChips && (
          <div className="mt-auto pt-1.5 sm:pt-2 flex justify-center" style={{ borderTop: `1px solid ${teamBgText}33` }}>
            {showFromChip ? (() => {
              const prevTeam = previousTeamTid ? teamsSource[previousTeamTid] : null
              const prevPrimary = prevTeam?.primaryColor
              const prevSecondary = prevTeam?.secondaryColor || '#ffffff'
              const themed = !!prevPrimary
              return (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-widest min-w-0"
                  style={{
                    letterSpacing: '1.5px',
                    color: themed ? prevSecondary : 'var(--text-secondary)',
                    backgroundColor: themed ? prevPrimary : 'transparent',
                    border: themed ? `1px solid ${prevPrimary}` : '1px solid var(--surface-5)',
                  }}
                >
                  <span className="flex-shrink-0" style={{ color: themed ? prevSecondary : 'var(--text-tertiary)', opacity: themed ? 0.7 : 1 }}>FROM</span>
                  {transferLogo && (
                    <img
                      src={transferLogo}
                      alt=""
                      className="w-3.5 h-3.5 object-contain flex-shrink-0 rounded-sm"
                      style={themed ? { backgroundColor: prevSecondary, padding: '1px' } : undefined}
                    />
                  )}
                  <span className="truncate" style={{ color: themed ? prevSecondary : undefined }}>{previousTeamName}</span>
                </span>
              )
            })() : showJucoMarker ? (
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-widest"
                style={{ letterSpacing: '1.5px', color: teamAccent, backgroundColor: teamBgText, border: `1px solid ${teamBgText}` }}
              >
                Junior College
              </span>
            ) : (
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-widest"
                style={{ letterSpacing: '1.5px', color: teamAccent, backgroundColor: teamBgText, border: `1px solid ${teamBgText}` }}
              >
                High School
              </span>
            )}
          </div>
        )}

        {/* === SCOUT STAFF SUMMARY === grade + report, shown when enabled */}
        {scoutStaffEnabled && ssScore != null && (
          <div className="pt-1.5" style={{ borderTop: `1px solid ${teamBgText}33` }}>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowStaff((v) => !v) }}
              className="w-full flex items-center justify-center gap-1.5 text-[9px] font-bold uppercase"
              style={{ letterSpacing: '1.2px', color: teamBgText, opacity: 0.75 }}
            >
              Scout Staff
              <span className="font-black" style={{ color: ssColor, opacity: 1 }}>{ssLetter} ({ssScore})</span>
              <svg className="w-2.5 h-2.5 transition-transform" style={{ transform: showStaff ? 'rotate(180deg)' : 'none' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showStaff && (
              <div className="mt-2 space-y-1.5">
                {report && (
                  <p className="text-[10px] leading-snug text-left" style={{ color: teamBgText, opacity: 0.85 }}>
                    {report}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[9px] font-bold uppercase" style={{ letterSpacing: '1px', color: teamBgText, opacity: 0.5 }}>Grade</span>
                  <span className="font-display font-black tabular-nums" style={{ fontSize: '18px', color: ssColor }}>{ssLetter}</span>
                  <span className="text-[10px] tabular-nums font-bold" style={{ color: teamBgText, opacity: 0.6 }}>{ssScore}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* === ATTRIBUTES DROPDOWN === scouted ratings, collapsed behind a
            chevron. preventDefault/stopPropagation so toggling doesn't follow
            the card's player-page link. */}
        {hasAttrs && (
          <div className="pt-1.5" style={{ borderTop: `1px solid ${teamBgText}33` }}>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowAttrs((v) => !v) }}
              className="w-full flex items-center justify-center gap-1 text-[9px] font-bold uppercase"
              style={{ letterSpacing: '1.2px', color: teamBgText, opacity: 0.75 }}
            >
              {attrEntries.length} Attribute{attrEntries.length === 1 ? '' : 's'}
              <svg
                className="w-2.5 h-2.5 transition-transform"
                style={{ transform: showAttrs ? 'rotate(180deg)' : 'none' }}
                fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showAttrs && report && (
              <p className="text-[10px] leading-snug mt-2 text-left" style={{ color: teamBgText, opacity: 0.8 }}>
                {report}
              </p>
            )}
            {showAttrs && (
              <div className="grid grid-cols-3 gap-x-1 gap-y-1.5 mt-2">
                {attrEntries.map((e) => (
                  <div key={e.name} className="text-center" title={e.name}>
                    <div className="font-display font-black tabular-nums leading-none" style={{ fontSize: '14px', color: ratingColor(e.value) }}>{e.value}</div>
                    <div className="text-[8px] font-bold uppercase tracking-wide" style={{ color: teamBgText, opacity: 0.6 }}>{e.abbr}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
