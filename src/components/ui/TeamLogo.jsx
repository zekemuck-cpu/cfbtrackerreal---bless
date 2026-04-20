import { getTeamLogoByTid, getTeamLogoByAbbr } from '../../data/teams'

/**
 * TeamLogo primitive. Wraps the existing `.logo-container` CSS.
 *
 * Prefer `tid` (tid-based lookup is the source of truth per CLAUDE.md).
 * `abbr` is supported as a fallback when the caller only has the abbreviation
 * (legacy honors data, etc).
 *
 * Size: xs | sm | md (default) | lg | xl — maps to .logo-container-{size}.
 * Pass `teams` for teambuilder custom logo overrides.
 */
export default function TeamLogo({
  tid,
  abbr,
  teams,
  size = 'md',
  alt,
  className = '',
  ...rest
}) {
  const src =
    tid != null ? getTeamLogoByTid(tid, teams) :
    abbr ? getTeamLogoByAbbr(abbr, teams) :
    null

  if (!src) return null

  const sizeClass = {
    xs: 'logo-container-xs',
    sm: 'logo-container-sm',
    md: 'logo-container-md',
    lg: 'logo-container-lg',
    xl: 'logo-container-xl',
  }[size] || 'logo-container-md'

  const resolvedAlt = alt || (teams && tid != null && teams[tid]?.name) || abbr || 'Team logo'

  return (
    <div className={`logo-container ${sizeClass} ${className}`.trim()} {...rest}>
      <img src={src} alt={resolvedAlt} loading="lazy" decoding="async" />
    </div>
  )
}
