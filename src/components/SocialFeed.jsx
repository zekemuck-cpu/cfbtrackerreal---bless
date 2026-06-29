import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePathPrefix } from '../hooks/usePathPrefix'
import { getTeamLogoByTid } from '../data/teams'
import { isOfficialTeamAccount } from '../data/socialModel'
import { getTeamScoreGraphic } from '../utils/scoreGraphics'
import { proxyImageUrl } from '../utils/imageProxy'
import FormattedRecap from './FormattedRecap'
import buildRecapLinks from '../utils/buildRecapLinks'
import buildSocialPlayerLinks from '../utils/socialPlayerLinks'

/**
 * Renders a week's social posts. Pure presentational: takes the posts array,
 * the characters map (id -> character), and the platform config. Characters
 * are looked up by stable id so a deleted/renamed handle never breaks a post.
 */

function initials(name) {
  const parts = String(name || '').replace(/^@/, '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function VerifiedTick({ color = '#1d9bf0' }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-label="verified" style={{ flexShrink: 0 }}>
      <path fill={color} d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z" />
    </svg>
  )
}

function MiniTeam({ tid, teams }) {
  const logo = getTeamLogoByTid(tid, teams)
  if (logo) return <img src={logo} alt="" className="w-4 h-4 object-contain" style={{ flexShrink: 0 }} />
  const t = teams?.[tid] || teams?.[String(tid)]
  return <span className="text-[10px] text-txt-tertiary">{t?.abbr || tid}</span>
}

function PostRow({ post, character, platform, game, teams, playerLinks }) {
  const pathPrefix = usePathPrefix()
  const navigate = useNavigate()
  // Game posts open that game; general/national posts open that week's feed.
  const rowHref = game
    ? `${pathPrefix}/game/${game.id}`
    : (post.year != null && post.week != null
      ? `${pathPrefix}/weekly-scores/${post.year}/${post.week}?tab=social`
      : null)
  const stop = (e) => e.stopPropagation()
  const name = character?.displayName || (post.charId || '').replace(/^[a-z]+:/, '')
  const handle = character?.handle || ''
  const color = character?.color || '#657786'
  const profileTo = character ? `${pathPrefix}/social/${encodeURIComponent(character.id)}` : null

  // The official team account's post carries THAT team's uploaded score graphic
  // (the slot branded to the account's team, when one exists for this game).
  const teamGraphic = isOfficialTeamAccount(character) ? getTeamScoreGraphic(game, character.teamTid) : ''
  const showScoreGraphic = !!teamGraphic

  const Avatar = (
    <div
      className="flex items-center justify-center rounded-full flex-shrink-0 overflow-hidden"
      style={{ width: 44, height: 44, background: character?.avatar ? 'transparent' : color, color: '#fff', fontWeight: 700, fontSize: 14 }}
    >
      {character?.avatar
        ? <img src={character.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initials(name)}
    </div>
  )

  return (
    <div
      className={`flex gap-3 px-4 py-3 border-b ${rowHref ? 'cursor-pointer hover:bg-surface-2/40' : ''}`}
      style={{ borderColor: 'var(--surface-4)' }}
      onClick={rowHref ? () => navigate(rowHref) : undefined}
    >
      {profileTo ? <Link to={profileTo} onClick={stop}>{Avatar}</Link> : Avatar}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 flex-wrap">
          {profileTo
            ? <Link to={profileTo} onClick={stop} className="font-semibold text-txt-primary hover:underline truncate">{name}</Link>
            : <span className="font-semibold text-txt-primary truncate">{name}</span>}
          {character?.verified && <VerifiedTick color={platform?.brandColor} />}
          {handle && <span className="text-txt-tertiary text-sm truncate">{handle}</span>}
          {game && (
            <Link
              to={`${pathPrefix}/game/${game.id}`}
              onClick={(e) => e.stopPropagation()}
              title="View game"
              className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded hover:brightness-125"
              style={{ background: 'var(--surface-3)' }}
            >
              <MiniTeam tid={game.team1Tid} teams={teams} />
              <span className="text-[10px] text-txt-tertiary">v</span>
              <MiniTeam tid={game.team2Tid} teams={teams} />
            </Link>
          )}
        </div>
        <div className="text-sm break-words mt-0.5 [&_a]:text-[#1d9bf0] [&_a:hover]:underline [&_a]:underline-offset-2" style={{ lineHeight: 1.5 }} onClick={(e) => { if (e.target.closest('a')) e.stopPropagation() }}>
          <FormattedRecap text={post.text} playerLinks={playerLinks} caseInsensitive className="text-txt-primary" />
        </div>
        {showScoreGraphic && (
          <div className="mt-2 rounded-2xl overflow-hidden" style={{ border: '1px solid var(--surface-4)', width: '100%', maxWidth: 200 }}>
            <img
              src={proxyImageUrl(teamGraphic, 400)}
              alt="Final score graphic"
              loading="lazy"
              className="w-full h-auto block"
              onError={(e) => { if (e.target.src !== teamGraphic) { e.target.src = teamGraphic } else { e.target.style.display = 'none' } }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default function SocialFeed({ posts, charactersById, platform, gamesById, teams, dynasty, year }) {
  const pathPrefix = usePathPrefix()
  // Auto-link player + team names in post text, same as the recap pages.
  const playerLinks = useMemo(() => {
    if (!dynasty) return []
    const linkYear = Number(year) || Number(posts?.[0]?.year) || Number(dynasty.currentYear)
    const allText = (posts || []).map(p => p.text).join('\n')
    return [
      ...buildRecapLinks(dynasty, linkYear, pathPrefix, allText),
      ...buildSocialPlayerLinks(dynasty, allText, pathPrefix),
    ]
  }, [dynasty, year, pathPrefix, posts])

  const ordered = useMemo(() => {
    const list = Array.isArray(posts) ? [...posts] : []
    // National first, then game posts; stable within by createdAt.
    list.sort((a, b) => {
      const an = a.gameId ? 1 : 0
      const bn = b.gameId ? 1 : 0
      if (an !== bn) return an - bn
      return (a.createdAt || 0) - (b.createdAt || 0)
    })
    return list
  }, [posts])

  if (!ordered.length) {
    return (
      <div className="px-4 py-10 text-center text-txt-tertiary text-sm">
        No posts yet for this week. Use Generate Social to create them.
      </div>
    )
  }

  return (
    <div className="social-ui rounded-lg overflow-hidden" style={{ border: '1px solid var(--surface-4)', background: 'var(--surface-1)' }}>
      {ordered.map(post => (
        <PostRow
          key={post.id}
          post={post}
          character={charactersById?.[post.charId]}
          platform={platform}
          game={post.gameId && gamesById ? gamesById[post.gameId] : null}
          teams={teams}
          playerLinks={playerLinks}
        />
      ))}
    </div>
  )
}
