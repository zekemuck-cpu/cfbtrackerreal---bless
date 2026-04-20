import { Link } from 'react-router-dom'
import TeamLogo from './TeamLogo'
import Badge from './Badge'

/**
 * ScoreRow primitive — scorebug-style game result row.
 *
 * Structure (see docs/DESIGN.md):
 *   [prefix]  [logo]  TEAM NAME (rank)            [result chip]  [score]  [site/notes]
 *
 * Props:
 *   prefix    — string (e.g. "W1", week number, date). Fixed-width, text-tertiary.
 *   tid       — viewed team tid for logo lookup
 *   teams     — custom teams object (for teambuilder overrides)
 *   teamName  — string name/label
 *   teamRank  — optional numeric rank (pre-pended as "#12 ")
 *   result    — 'W' | 'L' | 'T' | null (pending)
 *   score     — string, e.g. "41-17"
 *   site      — 'HOME' | 'AWAY' | 'NEUTRAL' | null
 *   notes     — array of small labels to show on right (e.g. ["OT"])
 *   to        — optional link destination
 *   onClick   — optional onclick (if no `to`)
 */
export default function ScoreRow({
  prefix,
  tid,
  teams,
  teamName,
  teamRank,
  result,
  score,
  site,
  notes = [],
  to,
  onClick,
  className = '',
}) {
  const resultVariant =
    result === 'W' ? 'success' :
    result === 'L' ? 'danger' :
    result === 'T' ? 'warning' :
    'outline'

  const resultLabel = result || '—'

  const Container = to ? Link : onClick ? 'button' : 'div'
  const containerProps = to ? { to } : onClick ? { onClick, type: 'button' } : {}

  return (
    <Container
      {...containerProps}
      className={`flex items-center gap-3 px-4 py-2.5 w-full text-left hover:bg-surface-3 transition-colors ${to || onClick ? 'cursor-pointer' : ''} ${className}`.trim()}
      style={{ borderBottom: '1px solid var(--surface-4)' }}
    >
      {prefix != null && (
        <span className="label-xs text-txt-tertiary tabular w-10 flex-shrink-0">
          {prefix}
        </span>
      )}
      {tid != null && <TeamLogo tid={tid} teams={teams} size="sm" />}
      <div className="flex-1 min-w-0 flex items-baseline gap-2">
        {teamRank != null && (
          <span className="text-xs text-txt-tertiary tabular flex-shrink-0">#{teamRank}</span>
        )}
        <span className="text-sm font-semibold text-txt-primary truncate">{teamName}</span>
      </div>
      <Badge variant={resultVariant} size="sm">{resultLabel}</Badge>
      <span className="stat-md text-txt-primary tabular min-w-[3.5rem] text-right">
        {score || '—'}
      </span>
      {site && (
        <span className="label-xs text-txt-tertiary w-14 text-right hidden sm:block">
          {site}
        </span>
      )}
      {notes.length > 0 && (
        <span className="flex items-center gap-1 flex-shrink-0">
          {notes.map((n, i) => (
            <span key={i} className="label-xs text-txt-tertiary">{n}</span>
          ))}
        </span>
      )}
    </Container>
  )
}
