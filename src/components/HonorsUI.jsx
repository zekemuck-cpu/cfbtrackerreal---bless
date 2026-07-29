import { Link } from 'react-router-dom'
import { proxyImageUrl } from '../utils/imageProxy'
import { getContrastTextColor } from '../utils/colorUtils'
import { FittedTeamName } from './ui'

// Hex (#rgb / #rrggbb) → rgba() string for team-color gradient washes.
const hexA = (hex, a) => {
  if (!hex || typeof hex !== 'string') return `rgba(120,120,120,${a})`
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h, 16)
  if (Number.isNaN(n)) return `rgba(120,120,120,${a})`
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

// One honoree tile — a team-color gradient row with the player's photo (or a
// monogram), name, a team logo+name pill, class, and position. The whole tile
// links to the player's page.
export function HonorPlayerTile({ position, name, klass, schoolName, schoolAbbr, teamLogo, primary = '#3a3d47', photoUrl, to, statLine, rankBadge, showLogoWatermark = false, teamRank = null }) {
  // Full, true team color (the box-score / game-card treatment) instead of a
  // low-alpha wash that fades to dark and muddies the color. Text is
  // contrast-aware; the team chip + avatar sit in dark translucent pills so
  // they read on any team color.
  const txt = getContrastTextColor(primary)
  const initial = (name || '?').trim().charAt(0).toUpperCase()
  const inner = (
    <div className="relative z-[1] flex items-center gap-2 px-2 py-2">
      {rankBadge != null && (
        <span
          className="w-7 flex-shrink-0 text-center font-display font-black tabular-nums"
          style={{ color: txt, fontSize: '1.35rem', lineHeight: 1 }}
        >
          {rankBadge}
        </span>
      )}
      {position && (
        <span className="w-7 flex-shrink-0 text-center text-[10px] font-bold tracking-wider tabular-nums" style={{ color: txt, opacity: 0.72 }}>
          {position}
        </span>
      )}
      <span
        className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.28)' }}
      >
        {photoUrl
          ? <img src={proxyImageUrl(photoUrl, 120)} alt="" className="w-full h-full object-cover" />
          : teamLogo
            ? <img src={teamLogo} alt="" className="w-full h-full object-contain p-1" />
            : <span className="text-sm font-bold" style={{ color: txt }}>{initial}</span>}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm leading-tight truncate" style={{ color: txt, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{name}</div>
        <div className="mt-1 flex items-center gap-1.5 min-w-0">
          <span className="inline-flex items-center gap-1 max-w-full pl-0.5 pr-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
            {teamLogo && (
              <span className="w-3.5 h-3.5 rounded-full bg-white p-px flex items-center justify-center flex-shrink-0">
                <img src={teamLogo} alt="" className="w-full h-full object-contain" />
              </span>
            )}
            {teamRank != null && (
              <span className="text-[10px] font-black tabular-nums flex-shrink-0" style={{ color: txt, opacity: 0.85 }}>
                {teamRank}
              </span>
            )}
            <FittedTeamName name={schoolName} abbr={schoolAbbr} className="text-[10px] font-bold uppercase tracking-wide" style={{ color: txt }} />
          </span>
          {klass && <span className="text-[11px] flex-shrink-0" style={{ color: txt, opacity: 0.72 }}>{klass}</span>}
        </div>
        {statLine && (
          <div className="mt-1 text-[11px] font-semibold truncate" style={{ color: txt, opacity: 0.85 }}>
            {statLine}
          </div>
        )}
      </div>
    </div>
  )
  return (
    <div
      className="cfb-texture rounded-lg overflow-hidden relative"
      style={{
        backgroundColor: primary,
        backgroundImage: 'linear-gradient(120deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0) 42%), linear-gradient(180deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.34) 100%)',
        border: '1px solid rgba(0,0,0,0.3)',
      }}
    >
      {/* Team logo watermark — faded, bleeding off the right edge, behind
          the tile's own content (z-[1] above). Opt-in since some callers
          (All-Americans/All-Conference) weren't asked to show this. */}
      {showLogoWatermark && teamLogo && (
        <img
          src={teamLogo}
          alt=""
          aria-hidden="true"
          className="absolute pointer-events-none select-none"
          style={{
            top: '50%',
            right: '-16px',
            transform: 'translateY(-50%)',
            width: '84px',
            height: '84px',
            objectFit: 'contain',
            opacity: 0.2,
            zIndex: 0,
          }}
        />
      )}
      {to
        ? <Link to={to} className="block hover:brightness-110 transition-[filter]">{inner}</Link>
        : inner}
    </div>
  )
}

// Ranked school leaderboard — a 2-up grid of ranked rows with a subtle team
// tint, gold rank numerals for the top three, and a big total on the right.
export function SchoolLeaderboard({ title = 'School Leaderboard', entries, totalSchools, breakdownKeys }) {
  if (!entries || entries.length === 0) return null
  const keys = breakdownKeys || [
    { k: 'first', label: '1st' },
    { k: 'second', label: '2nd' },
    { k: 'freshman', label: 'Fr' },
  ]
  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-txt-tertiary">{title}</span>
        <div className="flex-1 h-px bg-surface-4" />
        {totalSchools != null && (
          <span className="text-[10px] tabular-nums text-txt-muted tracking-wider">
            {totalSchools} {totalSchools === 1 ? 'SCHOOL' : 'SCHOOLS'}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {entries.map((e) => (
          <Link
            key={e.key}
            to={e.link || '#'}
            className="group relative flex items-center gap-3 rounded-lg overflow-hidden border border-surface-4 px-3 py-2.5 hover:brightness-110 transition-[filter] no-underline"
            style={{ background: `linear-gradient(90deg, ${hexA(e.primary, 0.20)} 0%, transparent 70%), var(--surface-2)` }}
          >
            <span
              className="font-display font-black tabular-nums w-6 text-center flex-shrink-0 leading-none"
              style={{ fontSize: '18px', color: e.rank <= 3 ? '#d4af37' : 'var(--text-muted)' }}
            >
              {e.rank}
            </span>
            <span className="w-8 h-8 rounded-full bg-white p-0.5 flex-shrink-0 flex items-center justify-center">
              {e.logo ? <img src={e.logo} alt="" className="w-full h-full object-contain" /> : null}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-txt-primary truncate">{e.name}</div>
              <div className="mt-0.5 flex items-center gap-2 text-[10px] tabular-nums text-txt-tertiary">
                {keys.map(({ k, label }) => (e[k] > 0 ? <span key={k}>{e[k]}× {label}</span> : null))}
              </div>
            </div>
            <span className="font-display font-black tabular-nums text-txt-primary flex-shrink-0 leading-none" style={{ fontSize: '24px' }}>
              {e.total}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
