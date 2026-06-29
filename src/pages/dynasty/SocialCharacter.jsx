import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getEffectiveCharacters, DEFAULT_SOCIAL_PLATFORM, isOfficialTeamAccount } from '../../data/socialModel'
import { getTeamScoreGraphic } from '../../utils/scoreGraphics'
import { proxyImageUrl } from '../../utils/imageProxy'
import SocialCharacterEditModal from '../../components/SocialCharacterEditModal'
import FormattedRecap from '../../components/FormattedRecap'
import buildRecapLinks from '../../utils/buildRecapLinks'
import buildSocialPlayerLinks from '../../utils/socialPlayerLinks'

/**
 * X-style character profile. Built as a standalone page (like the player page)
 * showing a character's identity and their entire post history across the
 * dynasty. Read-only for now; the editor comes later.
 */

function initials(name) {
  const parts = String(name || '').replace(/^@/, '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function Verified({ color = '#1d9bf0', size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-label="verified" style={{ flexShrink: 0 }}>
      <path fill={color} d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z" />
    </svg>
  )
}

// Twitter/X-style count abbreviation for both thousands and millions:
// 1,217 -> 1.2K, 30,300 -> 30.3K, 2,806,454 -> 2.8M. One decimal under
// 100, dropped when it would be .0, whole numbers at/above 100 of a unit.
function formatCount(n) {
  const num = Number(n) || 0
  if (num >= 1_000_000) {
    const m = num / 1_000_000
    return (m >= 100 ? Math.round(m) : Number(m.toFixed(1))) + 'M'
  }
  if (num >= 1_000) {
    const k = num / 1_000
    return (k >= 100 ? Math.round(k) : Number(k.toFixed(1))) + 'K'
  }
  return num.toLocaleString()
}

const weekLabel = (week) => {
  const w = Number(week)
  if (w === 0) return 'Week 0'
  if (w === 16) return 'Conf. Championship'
  if (w >= 17 && w <= 20) return 'Postseason'
  return `Week ${w}`
}

export default function SocialCharacter() {
  const { charId } = useParams()
  const navigate = useNavigate()
  const pathPrefix = usePathPrefix()
  const { currentDynasty, loadSocial, isViewOnly } = useDynasty()
  const [ready, setReady] = useState(false)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!currentDynasty?.id) return
    let alive = true
    loadSocial(currentDynasty.id).then(() => { if (alive) setReady(true) }).catch(() => { if (alive) setReady(true) })
    return () => { alive = false }
  }, [currentDynasty?.id, loadSocial])

  const id = decodeURIComponent(charId || '')
  const character = useMemo(() => getEffectiveCharacters(currentDynasty)[id], [currentDynasty, id, ready])
  const platform = { ...DEFAULT_SOCIAL_PLATFORM, ...(currentDynasty?.socialPlatform || {}) }

  // Gather all of this character's posts across the whole dynasty.
  const posts = useMemo(() => {
    const feed = currentDynasty?.socialFeedByYear || {}
    const out = []
    for (const yr of Object.keys(feed)) {
      for (const wk of Object.keys(feed[yr] || {})) {
        for (const p of (feed[yr][wk] || [])) {
          if (p.charId === id) out.push(p)
        }
      }
    }
    out.sort((a, b) => (b.year - a.year) || (b.week - a.week) || ((b.createdAt || 0) - (a.createdAt || 0)))
    return out
  }, [currentDynasty?.socialFeedByYear, id])

  // Games keyed by id, so the official team account's game posts can carry the
  // uploaded final-score graphic (mirrors the feed behavior).
  const gamesById = useMemo(() => {
    const out = {}
    for (const g of (currentDynasty?.games || [])) if (g?.id) out[g.id] = g
    return out
  }, [currentDynasty?.games])

  const playerLinks = useMemo(() => {
    if (!currentDynasty) return []
    const allText = posts.map(p => p.text).join('\n')
    return [
      ...buildRecapLinks(currentDynasty, currentDynasty.currentYear, pathPrefix, allText),
      ...buildSocialPlayerLinks(currentDynasty, allText, pathPrefix),
    ]
  }, [currentDynasty, posts, pathPrefix])

  if (!currentDynasty) return null

  if (!character) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <button onClick={() => navigate(-1)} className="text-txt-tertiary hover:text-txt-primary text-sm mb-4">← Back</button>
        <div className="text-center text-txt-tertiary py-16">
          {ready ? 'Character not found.' : 'Loading…'}
        </div>
      </div>
    )
  }

  const color = character.color || '#1d9bf0'
  const handle = character.handle || ''

  return (
    <div className="social-ui max-w-2xl mx-auto pb-10">
      {/* Header bar */}
      <div className="sticky top-0 z-10 flex items-center gap-4 px-4 py-2" style={{ background: 'color-mix(in srgb, var(--surface-1) 85%, transparent)', backdropFilter: 'blur(6px)' }}>
        <button onClick={() => navigate(-1)} aria-label="Back" className="text-txt-primary p-1.5 rounded-full hover:bg-surface-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
        <div className="min-w-0">
          <div className="font-bold text-txt-primary truncate flex items-center gap-1">
            {character.displayName}{character.verified && <Verified color={platform.brandColor} size={16} />}
          </div>
          <div className="text-xs text-txt-tertiary">{posts.length.toLocaleString()} {platform.postNoun}s</div>
        </div>
      </div>

      {/* Banner */}
      <div className="w-full h-40 sm:h-48 overflow-hidden" style={{ background: character.bannerImage ? 'transparent' : `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 40%, #000))` }}>
        {character.bannerImage && <img src={character.bannerImage} alt="" className="w-full h-full object-cover" />}
      </div>

      {/* Avatar + identity */}
      <div className="px-4">
        <div className="flex justify-between items-end" style={{ marginTop: -44 }}>
          <div
            className="rounded-full flex items-center justify-center overflow-hidden"
            style={{ width: 88, height: 88, border: '4px solid var(--surface-1)', background: character.avatar ? 'transparent' : color, color: '#fff', fontWeight: 700, fontSize: 30 }}
          >
            {character.avatar ? <img src={character.avatar} alt="" className="w-full h-full object-cover" /> : initials(character.displayName)}
          </div>
          <div className="flex items-center gap-2">
            {character.xUrl && (
              <a
                href={character.xUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-1.5 rounded-full text-sm font-semibold border border-surface-5 text-txt-primary hover:bg-surface-3 transition-colors"
              >
                View on X
              </a>
            )}
            {!isViewOnly && (
              <button
                onClick={() => setEditing(true)}
                className="px-4 py-1.5 rounded-full text-sm font-semibold border border-surface-5 text-txt-primary hover:bg-surface-3 transition-colors"
              >
                Edit profile
              </button>
            )}
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center gap-1.5">
            <h1 className="text-xl font-bold text-txt-primary">{character.displayName}</h1>
            {character.verified && <Verified color={platform.brandColor} />}
          </div>
          <div className="text-txt-tertiary">{handle}</div>
        </div>

        {character.bio && <p className="mt-3 text-txt-primary text-sm whitespace-pre-wrap">{character.bio}</p>}

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-txt-tertiary">
          {character.category && <span>{character.category}</span>}
          {character.location && <span>{character.location}</span>}
          {character.website && <span style={{ color: platform.brandColor }}>{character.website}</span>}
          {character.joinedLabel && <span>{character.joinedLabel}</span>}
        </div>

        <div className="mt-3 flex gap-4 text-sm">
          <span className="text-txt-primary font-semibold">{formatCount(character.followingCount)} <span className="text-txt-tertiary font-normal">Following</span></span>
          <span className="text-txt-primary font-semibold">{formatCount(character.followerCount)} <span className="text-txt-tertiary font-normal">Followers</span></span>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-4 border-b flex" style={{ borderColor: 'var(--surface-4)' }}>
        <div className="px-5 py-3 font-semibold text-txt-primary relative">
          {platform.postNoun.charAt(0).toUpperCase() + platform.postNoun.slice(1)}s
          <span className="absolute left-4 right-4 bottom-0 h-[3px] rounded-t" style={{ background: platform.brandColor }} />
        </div>
      </div>

      {/* Posts */}
      {posts.length === 0 ? (
        <div className="text-center text-txt-tertiary py-16 text-sm">No {platform.postNoun}s yet.</div>
      ) : (
        <div>
          {posts.map(p => {
            // Game posts open that game; general/national posts open that week's feed.
            const rowHref = p.gameId
              ? `${pathPrefix}/game/${p.gameId}`
              : (p.year != null && p.week != null
                ? `${pathPrefix}/weekly-scores/${p.year}/${p.week}?tab=social`
                : null)
            const pg = p.gameId ? gamesById[p.gameId] : null
            const teamGraphic = isOfficialTeamAccount(character) ? getTeamScoreGraphic(pg, character.teamTid) : ''
            const showScoreGraphic = !!teamGraphic
            return (
            <div
              key={p.id}
              className={`px-4 py-3 border-b ${rowHref ? 'cursor-pointer hover:bg-surface-2/40' : ''}`}
              style={{ borderColor: 'var(--surface-4)' }}
              onClick={rowHref ? (e) => { if (!e.target.closest('a')) navigate(rowHref) } : undefined}
            >
              <div className="flex items-center gap-1.5 text-sm">
                <span className="font-semibold text-txt-primary">{character.displayName}</span>
                {character.verified && <Verified color={platform.brandColor} size={14} />}
                <span className="text-txt-tertiary truncate">{handle}</span>
                <span className="text-txt-tertiary">· {weekLabel(p.week)} {p.year}</span>
              </div>
              <div className="text-sm break-words mt-0.5 [&_a]:text-[#1d9bf0] [&_a:hover]:underline [&_a]:underline-offset-2" style={{ lineHeight: 1.5 }}>
                <FormattedRecap text={p.text} playerLinks={playerLinks} caseInsensitive className="text-txt-primary" />
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
            )
          })}
        </div>
      )}

      {editing && (
        <SocialCharacterEditModal
          isOpen={editing}
          onClose={() => setEditing(false)}
          character={character}
        />
      )}
    </div>
  )
}
