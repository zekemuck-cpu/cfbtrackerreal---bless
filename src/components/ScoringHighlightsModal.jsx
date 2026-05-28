import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { proxyImageUrl } from '../utils/imageProxy'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'

const PLAY_DURATION = 30 // seconds per play before auto-advance

// When a YouTube link arrives with a start timestamp but no end time, we
// auto-clip the embed to this many seconds so the video actually stops at
// the end of the play instead of rolling forward into the next snap. Stays
// in sync with PLAY_DURATION so the visible advance and the embed end
// coincide. Bump them together if you ever change the clip length.
const YOUTUBE_AUTO_CLIP_SECONDS = PLAY_DURATION

// Build a YouTube embed URL. Used only for non-React consumers / legacy
// callers; the in-app surfaces (InlineScoringHighlights, this modal)
// render via the YouTubePlayer component which talks to the IFrame
// Player API directly and provides custom chrome.
function buildYouTubeEmbed(videoId, startSec, endSec, { controls = 0 } = {}) {
  const params = ['autoplay=1', 'mute=1', 'rel=0', 'modestbranding=1', `controls=${controls}`]
  if (startSec != null) params.push(`start=${startSec}`)
  if (endSec != null) params.push(`end=${endSec}`)
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.join('&')}`
}

// Parse a URL and return YouTube embed data when it's a YouTube link:
// { kind: 'youtube', videoId, startSec, endSec }. Returns null for any
// non-YouTube URL so callers can fall through to the generic
// getEmbedUrl path (Twitch, direct video, etc).
export function getYouTubeData(url) {
  if (!url) return null

  const finalize = (videoId, startSec, endSec) => {
    if (!videoId || !/^[a-zA-Z0-9_-]+$/.test(videoId)) return null
    const s = Number.isFinite(startSec) ? startSec : null
    const e = Number.isFinite(endSec) ? endSec : (s != null ? s + YOUTUBE_AUTO_CLIP_SECONDS : null)
    return { kind: 'youtube', videoId, startSec: s, endSec: e }
  }

  // youtubetrimmer.com share links carry explicit start+end.
  const trimmerMatch = url.match(/youtubetrimmer\.com\/view\/?\?([^#]+)/)
  if (trimmerMatch) {
    const qs = new URLSearchParams(trimmerMatch[1])
    const v = qs.get('v')
    const s = parseInt(qs.get('start'), 10)
    const e = parseInt(qs.get('end'), 10)
    const data = finalize(v, Number.isFinite(s) ? s : null, Number.isFinite(e) ? e : null)
    if (data) return data
  }

  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)(?:\?t=(\d+))?/)
  if (shortMatch) {
    const s = shortMatch[2] ? parseInt(shortMatch[2], 10) : null
    return finalize(shortMatch[1], s, null)
  }

  const longMatch = url.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)(?:.*[&?]t=(\d+))?/)
  if (longMatch) {
    const s = longMatch[2] ? parseInt(longMatch[2], 10) : null
    return finalize(longMatch[1], s, null)
  }

  const embedMatch = url.match(/youtube(?:-nocookie)?\.com\/embed\/([a-zA-Z0-9_-]+)/)
  if (embedMatch) {
    try {
      const u = new URL(url)
      const startParam = u.searchParams.get('start') || u.searchParams.get('t')
      const endParam = u.searchParams.get('end')
      const s = startParam ? parseInt(startParam, 10) : null
      const e = endParam ? parseInt(endParam, 10) : null
      return finalize(embedMatch[1], s, e)
    } catch {
      return finalize(embedMatch[1], null, null)
    }
  }

  return null
}

// Extract video embed URL from various platforms.
// Exported so the inline highlights widget can reuse the same parsing.
// `controls` (default 0 = suppressed for the inline tile) is passed
// through to YouTube; the expanded modal requests `controls: 1` so the
// full-screen viewer gets native scrub/volume/fullscreen chrome.
export function getEmbedUrl(url, { controls = 0 } = {}) {
  if (!url) return null

  // youtubetrimmer.com share links carry both start and end explicitly — use
  // them verbatim so a user who actually clipped the play gets exact bounds.
  const trimmerMatch = url.match(/youtubetrimmer\.com\/view\/?\?([^#]+)/)
  if (trimmerMatch) {
    const qs = new URLSearchParams(trimmerMatch[1])
    const v = qs.get('v')
    if (v && /^[a-zA-Z0-9_-]+$/.test(v)) {
      const s = parseInt(qs.get('start'), 10)
      const e = parseInt(qs.get('end'), 10)
      return buildYouTubeEmbed(
        v,
        Number.isFinite(s) ? s : null,
        Number.isFinite(e) ? e : null,
        { controls },
      )
    }
  }

  // YouTube: youtu.be/VIDEO_ID?t=SECONDS or youtube.com/watch?v=VIDEO_ID&t=SECONDS
  const youtubeShortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)(?:\?t=(\d+))?/)
  if (youtubeShortMatch) {
    const videoId = youtubeShortMatch[1]
    const startTime = youtubeShortMatch[2] ? parseInt(youtubeShortMatch[2], 10) : null
    const endTime = startTime != null ? startTime + YOUTUBE_AUTO_CLIP_SECONDS : null
    return buildYouTubeEmbed(videoId, startTime, endTime, { controls })
  }

  const youtubeLongMatch = url.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)(?:.*[&?]t=(\d+))?/)
  if (youtubeLongMatch) {
    const videoId = youtubeLongMatch[1]
    const startTime = youtubeLongMatch[2] ? parseInt(youtubeLongMatch[2], 10) : null
    const endTime = startTime != null ? startTime + YOUTUBE_AUTO_CLIP_SECONDS : null
    return buildYouTubeEmbed(videoId, startTime, endTime, { controls })
  }

  const youtubeEmbedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]+)/)
  if (youtubeEmbedMatch) {
    // Respect an end time the pasted URL already specifies. Otherwise, if
    // there's a start but no end, clip to our standard duration.
    try {
      const u = new URL(url)
      const hasEnd = u.searchParams.has('end')
      const startParam = u.searchParams.get('start') || u.searchParams.get('t')
      if (!u.searchParams.has('autoplay')) u.searchParams.set('autoplay', '1')
      if (!u.searchParams.has('mute')) u.searchParams.set('mute', '1')
      if (!u.searchParams.has('rel')) u.searchParams.set('rel', '0')
      if (!u.searchParams.has('controls')) u.searchParams.set('controls', String(controls))
      if (!u.searchParams.has('modestbranding')) u.searchParams.set('modestbranding', '1')
      if (!hasEnd && startParam != null) {
        const startSec = parseInt(startParam, 10)
        if (Number.isFinite(startSec)) {
          u.searchParams.set('end', String(startSec + YOUTUBE_AUTO_CLIP_SECONDS))
        }
      }
      return u.toString()
    } catch {
      return url.includes('autoplay') ? url : `${url}${url.includes('?') ? '&' : '?'}autoplay=1`
    }
  }

  // Twitch clips: clips.twitch.tv/CLIP_ID or twitch.tv/*/clip/CLIP_ID
  const twitchClipMatch = url.match(/clips\.twitch\.tv\/([a-zA-Z0-9_-]+)/)
  if (twitchClipMatch) {
    return `https://clips.twitch.tv/embed?clip=${twitchClipMatch[1]}&parent=${window.location.hostname}&autoplay=true`
  }

  const twitchClipAltMatch = url.match(/twitch\.tv\/[^/]+\/clip\/([a-zA-Z0-9_-]+)/)
  if (twitchClipAltMatch) {
    return `https://clips.twitch.tv/embed?clip=${twitchClipAltMatch[1]}&parent=${window.location.hostname}&autoplay=true`
  }

  // Twitch VOD: twitch.tv/videos/VIDEO_ID?t=TIMEhTIMEmTIMEs
  const twitchVodMatch = url.match(/twitch\.tv\/videos\/(\d+)(?:\?t=([^&]+))?/)
  if (twitchVodMatch) {
    const time = twitchVodMatch[2] || '0h0m0s'
    return `https://player.twitch.tv/?video=${twitchVodMatch[1]}&time=${time}&parent=${window.location.hostname}&autoplay=true`
  }

  // Vimeo: vimeo.com/VIDEO_ID or vimeo.com/VIDEO_ID#t=TIMEs or with ?t= or &t=
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/)
  if (vimeoMatch) {
    const videoId = vimeoMatch[1]
    // Extract timestamp from #t=, ?t=, or &t= formats
    const timeMatch = url.match(/[#?&]t=(\d+)/)
    const startTime = timeMatch ? timeMatch[1] : null
    return startTime
      ? `https://player.vimeo.com/video/${videoId}?autoplay=1#t=${startTime}s`
      : `https://player.vimeo.com/video/${videoId}?autoplay=1`
  }

  // Streamable: streamable.com/CODE
  const streamableMatch = url.match(/streamable\.com\/([a-zA-Z0-9]+)/)
  if (streamableMatch) {
    return `https://streamable.com/e/${streamableMatch[1]}?autoplay=1`
  }

  // Dailymotion: dailymotion.com/video/VIDEO_ID
  const dailymotionMatch = url.match(/dailymotion\.com\/video\/([a-zA-Z0-9]+)/)
  if (dailymotionMatch) {
    return `https://www.dailymotion.com/embed/video/${dailymotionMatch[1]}?autoplay=1`
  }

  // Hudl: hudl.com/video/ID or hudl.com/embed/video/ID
  const hudlMatch = url.match(/hudl\.com\/(?:video|embed\/video)\/([a-zA-Z0-9]+)/)
  if (hudlMatch) {
    return `https://www.hudl.com/embed/video/${hudlMatch[1]}`
  }

  // Twitter/X: twitter.com or x.com video URLs
  const twitterMatch = url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/)
  if (twitterMatch) {
    // Twitter videos need to be opened in new tab (no embed API)
    return null
  }

  // Imgur: i.imgur.com/VIDEO.mp4 or imgur.com/VIDEO
  const imgurMatch = url.match(/(?:i\.)?imgur\.com\/([a-zA-Z0-9]+)(?:\.mp4)?/)
  if (imgurMatch) {
    return `https://i.imgur.com/${imgurMatch[1]}.mp4`
  }

  // Clippituser: clippituser.tv/c/CODE
  const clippituserMatch = url.match(/clippituser\.tv\/c\/([a-zA-Z0-9]+)/)
  if (clippituserMatch) {
    return `https://clippituser.tv/c/${clippituserMatch[1]}`
  }

  // Direct video files (.mp4, .webm, .ogg)
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) {
    return { type: 'video', url }
  }

  // If we can't parse it, return null (will show "Open in new tab" fallback)
  return null
}

export default function ScoringHighlightsModal({
  isOpen,
  onClose,
  scoringPlays,
  team1Abbr,
  team2Abbr,
  team1Logo,
  team2Logo,
  // Optional: tid-based identity for the two teams in this game. When
  // provided, the fallback running-score calc resolves play.team → tid
  // instead of comparing strings, which survives teambuilder abbr drift.
  team1Tid,
  team2Tid,
  players,
  getTeamLogo,
  getMascotName,
  teamsData,
  customTitle,
  pathPrefix,
  startIndex = 0,
  // When opening mid-clip from the inline widget, seek the initial play to
  // this offset so playback "resumes" where the small video was. Only applies
  // to the first play rendered after open; clearing on navigation is handled
  // inside the effect below.
  resumeOffsetSec = 0,
}) {
  const navigate = useNavigate()
  const [currentIndex, setCurrentIndex] = useState(startIndex)
  const [isPlaying, setIsPlaying] = useState(true)
  const [timeRemaining, setTimeRemaining] = useState(PLAY_DURATION)
  const [showGameDropdown, setShowGameDropdown] = useState(false)
  // The resume offset only applies to the very first play we show on open.
  // Once the user navigates (or the clip auto-advances), we clear it so
  // subsequent plays start from the beginning.
  const [appliedResumeOffset, setAppliedResumeOffset] = useState(0)
  const timerRef = useRef(null)
  const gameDropdownRef = useRef(null)

  // Filter to only plays with video links
  const playsWithVideo = scoringPlays?.filter(p => p.videoLink) || []
  const currentPlay = playsWithVideo[currentIndex]
  const totalPlays = playsWithVideo.length

  // Extract unique seasons and games for filtering
  const seasons = useMemo(() => {
    const uniqueSeasons = [...new Set(playsWithVideo.map(p => p.gameInfo?.year).filter(Boolean))]
    return uniqueSeasons.sort((a, b) => b - a) // Descending order
  }, [playsWithVideo])

  const games = useMemo(() => {
    const uniqueGames = []
    const seen = new Set()
    playsWithVideo.forEach(play => {
      if (play.gameInfo) {
        // Include opponentTid in the dedup key when available — survives
        // a teambuilder opponent rename (otherwise plays from the same
        // game pre/post-rename would split into two dropdown entries).
        const oppKey = play.gameInfo.opponentTid != null
          ? `tid:${play.gameInfo.opponentTid}`
          : `abbr:${play.gameInfo.opponent}`
        const key = `${play.gameInfo.year}-${play.gameInfo.week}-${oppKey}`
        if (!seen.has(key)) {
          seen.add(key)
          uniqueGames.push({
            year: play.gameInfo.year,
            week: play.gameInfo.week,
            opponent: play.gameInfo.opponent,
            opponentTid: play.gameInfo.opponentTid ?? null,
            opponentLogo: play.gameInfo.opponentLogo,
            label: `${play.gameInfo.year} Week ${play.gameInfo.week} vs ${play.gameInfo.opponent}`
          })
        }
      }
    })
    return uniqueGames
  }, [playsWithVideo])

  // Jump to first play of selected season
  const jumpToSeason = (year) => {
    const index = playsWithVideo.findIndex(p => p.gameInfo?.year === parseInt(year))
    if (index !== -1) {
      setCurrentIndex(index)
      setTimeRemaining(PLAY_DURATION)
    }
  }

  // Jump to first play of selected game. Tid match for opponent is
  // preferred; abbr fallback for legacy plays.
  const jumpToGame = (gameKey) => {
    const [year, week, opponentField] = gameKey.split('|||')
    const isTidKey = opponentField?.startsWith('tid:')
    const targetTid = isTidKey ? Number(opponentField.slice(4)) : null
    const targetAbbr = isTidKey ? null : opponentField
    const index = playsWithVideo.findIndex(p =>
      p.gameInfo?.year === parseInt(year) &&
      p.gameInfo?.week === parseInt(week) &&
      (
        (targetTid != null && Number(p.gameInfo?.opponentTid) === targetTid) ||
        (targetAbbr != null && p.gameInfo?.opponent === targetAbbr)
      )
    )
    if (index !== -1) {
      setCurrentIndex(index)
      setTimeRemaining(PLAY_DURATION)
    }
  }

  // Find player by name
  const findPlayer = useCallback((name) => {
    if (!name || !players) return null
    return players.find(p => p.name === name)
  }, [players])

  // Get team logo for a team abbreviation
  const getTeamLogoForAbbr = useCallback((abbr) => {
    if (!abbr) return null
    // Check if it matches team1 or team2
    if (abbr.toUpperCase() === team1Abbr?.toUpperCase()) return team1Logo
    if (abbr.toUpperCase() === team2Abbr?.toUpperCase()) return team2Logo
    // Try to get from getTeamLogo function if provided
    if (getTeamLogo && getMascotName) {
      const mascot = getMascotName(abbr, teamsData)
      return getTeamLogo(mascot || abbr, teamsData)
    }
    return null
  }, [team1Abbr, team2Abbr, team1Logo, team2Logo, getTeamLogo, getMascotName, teamsData])

  // Get running score from the play data (already calculated from full game scoring summary)
  const getRunningScore = useCallback((upToIndex) => {
    const currentPlay = playsWithVideo[upToIndex]
    if (!currentPlay) return { score1: 0, score2: 0 }

    // Use pre-calculated running scores if available (includes ALL scoring plays from the game)
    if (currentPlay.runningPlayerScore !== undefined && currentPlay.runningOpponentScore !== undefined) {
      return {
        score1: currentPlay.runningPlayerScore,
        score2: currentPlay.runningOpponentScore
      }
    }

    // Fallback to old calculation for backwards compatibility (single game mode).
    // Tid-based when team1Tid/team2Tid are passed in; falls back to abbr compare
    // for legacy callers that only know abbrs.
    let score1 = 0
    let score2 = 0

    const t1Tid = team1Tid != null ? Number(team1Tid) : null
    const t2Tid = team2Tid != null ? Number(team2Tid) : null
    const t1Abbr = (t1Tid != null && teamsData?.[t1Tid]?.abbr) || team1Abbr
    const t2Abbr = (t2Tid != null && teamsData?.[t2Tid]?.abbr) || team2Abbr
    const t1AbbrU = t1Abbr?.toUpperCase()
    const t2AbbrU = t2Abbr?.toUpperCase()

    for (let i = 0; i <= upToIndex; i++) {
      const play = playsWithVideo[i]
      if (!play) continue

      // Map play.team (abbr string) → tid via this game's two teams when
      // both tids are known. Compare tids if possible; fall back to abbr
      // compare for legacy single-tid / no-tid callers.
      const playUpper = play.team?.toUpperCase()
      let isTeam1
      if (t1Tid != null && t2Tid != null && t1AbbrU && t2AbbrU) {
        const playTid = playUpper === t1AbbrU ? t1Tid : (playUpper === t2AbbrU ? t2Tid : null)
        isTeam1 = playTid != null ? playTid === t1Tid : (playUpper === t1AbbrU)
      } else {
        isTeam1 = playUpper === team1Abbr?.toUpperCase()
      }

      let points = 0
      if (play.scoreType?.includes('TD')) {
        points = 6
        if (play.patResult === 'Made XP') points += 1
        else if (play.patResult === 'Converted 2PT') points += 2
      } else if (play.scoreType === 'Field Goal') {
        points = 3
      } else if (play.scoreType === 'Safety') {
        points = 2
      }

      if (isTeam1) score1 += points
      else score2 += points
    }

    return { score1, score2 }
  }, [playsWithVideo, team1Abbr, team2Abbr, team1Tid, team2Tid, teamsData])

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Close game dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (gameDropdownRef.current && !gameDropdownRef.current.contains(event.target)) {
        setShowGameDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Handle timer for auto-advance
  useEffect(() => {
    if (!isOpen || !isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }

    timerRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          // Auto-advance to next
          if (currentIndex < totalPlays - 1) {
            setCurrentIndex(currentIndex + 1)
            return PLAY_DURATION
          } else {
            // End of playlist
            setIsPlaying(false)
            return 0
          }
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isOpen, isPlaying, currentIndex, totalPlays])

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(startIndex)
      setIsPlaying(true)
      setTimeRemaining(PLAY_DURATION)
      setAppliedResumeOffset(resumeOffsetSec || 0)
    }
  }, [isOpen, startIndex, resumeOffsetSec])

  // Reset timer when changing plays — also clear the resume offset so only
  // the first play we opened on gets seeked.
  useEffect(() => {
    setTimeRemaining(PLAY_DURATION)
    setAppliedResumeOffset(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex])

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      setIsPlaying(true)
    }
  }

  const handleNext = () => {
    if (currentIndex < totalPlays - 1) {
      setCurrentIndex(currentIndex + 1)
      setIsPlaying(true)
    }
  }

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying)
  }

  if (!isOpen || totalPlays === 0) return null

  const runningScore = getRunningScore(currentIndex)
  const isPassingTD = currentPlay?.scoreType === 'Passing TD'

  // Get embed URL via the legacy getEmbedUrl path for ALL sources
  // (YouTube, Twitch, direct video, etc.). The modal is a dedicated
  // full-screen video-viewing context, so the brief YouTube intro
  // chrome is acceptable here — much less visually intrusive at full
  // size than in a tiny inline tile. The inline tile sidesteps this
  // by rendering a static thumbnail and deferring playback to this
  // modal entirely.
  const embedData = getEmbedUrl(currentPlay?.videoLink, { controls: 1 })
  const isDirectVideo = embedData && typeof embedData === 'object' && embedData.type === 'video'
  let embedUrl = isDirectVideo ? null : embedData
  if (embedUrl && appliedResumeOffset > 0) {
    try {
      const u = new URL(embedUrl)
      const currentStart = parseInt(u.searchParams.get('start') || '0', 10) || 0
      const currentEnd = u.searchParams.get('end')
      const nextStart = currentStart + Math.floor(appliedResumeOffset)
      if (currentEnd != null) {
        const endNum = parseInt(currentEnd, 10)
        if (Number.isFinite(endNum) && nextStart >= endNum) {
          u.searchParams.delete('end')
        }
      }
      u.searchParams.set('start', String(nextStart))
      embedUrl = u.toString()
    } catch {
      // Non-URL (Streamable/Vimeo embeds); fall through without a
      // timestamp — video will just restart, same as before.
    }
  }

  // Get player data for images
  const scorerPlayer = findPlayer(currentPlay?.scorer)
  const passerPlayer = findPlayer(currentPlay?.passer)

  // Get team logos + abbrs for the score row. Prefer per-play values from
  // gameInfo so a player who switched teams shows their correct team for
  // each year's highlights — the static team1* props reflect only the
  // page's "current year" team, which would mis-label prior-year clips.
  const team1LogoUrl = currentPlay?.gameInfo?.playerTeamLogo || team1Logo
  const team1AbbrForAlt = currentPlay?.gameInfo?.playerTeamAbbr || team1Abbr
  const team2LogoUrl = currentPlay?.gameInfo?.opponentLogo || team2Logo

  const progressPct = totalPlays > 0 ? ((currentIndex + 1) / totalPlays) * 100 : 0

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-[9999] p-2 sm:p-4"
      style={{ margin: 0 }}
      onClick={onClose}
    >
      <div
        className="bg-surface-1 rounded-xl shadow-2xl w-full max-w-7xl h-[94dvh] flex flex-col border border-surface-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header — title, counter, filters, close */}
        <div className="flex items-center gap-3 px-4 h-12 border-b border-surface-4 bg-surface-2 flex-shrink-0">
          <h3 className="text-sm sm:text-base font-semibold text-white truncate">
            {customTitle || 'Scoring Highlights'}
          </h3>
          <span className="text-xs text-txt-muted whitespace-nowrap tabular-nums">
            {currentIndex + 1} / {totalPlays}
          </span>

          <div className="flex-1" />

          {seasons.length > 1 && (
            <select
              value={currentPlay?.gameInfo?.year || ''}
              onChange={(e) => jumpToSeason(e.target.value)}
              className="px-2.5 py-1 bg-surface-3 text-white rounded-md text-xs border border-surface-4 hover:border-surface-5 focus:border-surface-5 focus:outline-none"
              aria-label="Season"
            >
              {seasons.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          )}

          {games.length > 1 && (
            <div className="relative" ref={gameDropdownRef}>
              <button
                onClick={() => setShowGameDropdown(!showGameDropdown)}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-3 text-white rounded-md text-xs border border-surface-4 hover:border-surface-5 focus:outline-none focus:border-surface-5 max-w-[220px]"
              >
                {currentPlay?.gameInfo?.opponentLogo && (
                  <img
                    src={currentPlay.gameInfo.opponentLogo}
                    alt=""
                    className="w-3.5 h-3.5 object-contain flex-shrink-0"
                  />
                )}
                <span className="flex-1 text-left truncate">
                  {currentPlay?.gameInfo
                    ? `W${currentPlay.gameInfo.week} vs ${currentPlay.gameInfo.opponent}`
                    : 'Select game'}
                </span>
                <svg className="w-3 h-3 flex-shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showGameDropdown && (
                <div className="absolute right-0 top-full mt-1 min-w-[260px] bg-surface-3 border border-surface-4 rounded-lg shadow-xl max-h-72 overflow-y-auto z-50">
                  {games.map(game => {
                    // Same tid-prefer-then-abbr logic as the dedup key.
                    const oppKey = game.opponentTid != null
                      ? `tid:${game.opponentTid}`
                      : `abbr:${game.opponent}`
                    const isActive =
                      currentPlay?.gameInfo?.year === game.year &&
                      currentPlay?.gameInfo?.week === game.week &&
                      ((game.opponentTid != null && Number(currentPlay?.gameInfo?.opponentTid) === Number(game.opponentTid)) ||
                       (game.opponentTid == null && currentPlay?.gameInfo?.opponent === game.opponent))
                    return (
                      <button
                        key={`${game.year}-${game.week}-${oppKey}`}
                        onClick={() => {
                          jumpToGame(`${game.year}|||${game.week}|||${oppKey}`)
                          setShowGameDropdown(false)
                        }}
                        className={`flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors text-left ${
                          isActive ? 'bg-surface-4 text-white' : 'text-white hover:bg-surface-4'
                        }`}
                      >
                        {game.opponentLogo && (
                          <img
                            src={game.opponentLogo}
                            alt=""
                            className="w-4 h-4 object-contain flex-shrink-0"
                          />
                        )}
                        <span className="truncate">{game.label}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <button
            aria-label="Close"
            onClick={onClose}
            className="p-1 -mr-1 hover:bg-surface-3 rounded-md transition-colors"
          >
            <svg className="w-5 h-5 text-txt-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Video — fills all remaining space */}
        <div className="relative bg-black flex-1 min-h-0 overflow-hidden">
          {isDirectVideo ? (
            <video
              key={currentIndex}
              src={embedData.url}
              className="w-full h-full"
              autoPlay
              controls
            />
          ) : embedUrl ? (
            <iframe
              key={currentIndex}
              src={embedUrl}
              className="w-full h-full"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={`Scoring play ${currentIndex + 1}`}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-txt-muted">
              <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <p className="text-lg mb-2">Unsupported video format</p>
              <a
                href={currentPlay?.videoLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-txt-primary hover:text-txt-secondary underline"
              >
                Open in new tab
              </a>
            </div>
          )}

        </div>

        {/* Progress bar between video and footer */}
        <div className="h-0.5 bg-surface-3 flex-shrink-0 relative">
          <div
            className="h-full bg-surface-3 transition-all duration-300 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Footer — play info + controls + score. Single row on desktop;
            on mobile the play info takes its own full-width row above the
            controls/score so it stops getting starved and truncated. */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-2.5 bg-surface-2 flex-shrink-0">
          {/* Play info (left). Picture + names link to the player page when
              we have a pid AND pathPrefix; without pathPrefix (e.g. embedded
              in a context with no router prefix) we fall back to plain text. */}
          {(() => {
            // Picture defaults to scorer; falls back to passer. The link
            // target should match whichever player is actually being shown.
            const picturePlayer = scorerPlayer?.pictureUrl ? scorerPlayer : (passerPlayer?.pictureUrl ? passerPlayer : null)
            const goToPlayer = (p) => {
              if (!p?.pid || !pathPrefix) return
              navigate(`${pathPrefix}/player/${p.pid}`)
              onClose?.()
            }
            const NameLink = ({ player, label }) => {
              if (player?.pid && pathPrefix) {
                return (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); goToPlayer(player) }}
                    className="hover:text-white hover:underline transition-colors cursor-pointer"
                  >
                    {label}
                  </button>
                )
              }
              return <span>{label}</span>
            }
            return (
              <div className="flex items-center gap-2.5 min-w-0 w-full sm:flex-1">
                {picturePlayer?.pictureUrl && (
                  picturePlayer.pid && pathPrefix ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); goToPlayer(picturePlayer) }}
                      className="flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden bg-surface-3 hidden sm:block ring-1 ring-transparent hover:ring-[var(--surface-5)]/60 transition-all cursor-pointer"
                      title={`View ${picturePlayer.name}`}
                      aria-label={`View ${picturePlayer.name}`}
                    >
                      <img
                        src={proxyImageUrl(picturePlayer.pictureUrl, 300)}
                        alt={picturePlayer.name}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ) : (
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden bg-surface-3 hidden sm:block">
                      <img
                        src={proxyImageUrl(picturePlayer.pictureUrl, 300)}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm leading-tight">
                    <span className="text-white font-semibold truncate">
                      {currentPlay?.scoreType}
                      {currentPlay?.yards && ` ${currentPlay.yards} yd`}
                    </span>
                    {currentPlay?.patResult && (
                      <span className="text-txt-muted text-xs hidden sm:inline whitespace-nowrap">
                        ({currentPlay.patResult})
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-txt-muted truncate mt-0.5">
                    <span className="tabular-nums">Q{currentPlay?.quarter} {currentPlay?.timeLeft}</span>
                    {' '}
                    {isPassingTD && currentPlay?.passer ? (
                      <>
                        <NameLink player={passerPlayer} label={currentPlay.passer} />
                        {' → '}
                        <NameLink player={scorerPlayer} label={currentPlay.scorer} />
                      </>
                    ) : (
                      <NameLink player={scorerPlayer} label={currentPlay?.scorer} />
                    )}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* On mobile, controls + score share a justify-between row; on
              desktop `sm:contents` dissolves this wrapper so they sit as
              direct children of the footer flex row (unchanged layout). */}
          <div className="flex items-center justify-between gap-3 w-full sm:contents">
          {/* Controls (center) */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              aria-label="Previous play"
              className={`flex items-center justify-center w-9 h-9 rounded-lg transition-colors ${
                currentIndex === 0
                  ? 'text-txt-muted/40 cursor-not-allowed'
                  : 'text-white hover:bg-surface-3'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <button
              onClick={handlePlayPause}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-surface-3 text-white hover:bg-surface-3 active:scale-95 transition-all flex-shrink-0 shadow-lg shadow-black/20"
              title={isPlaying ? 'Pause auto-advance' : 'Resume auto-advance'}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            <button
              onClick={handleNext}
              disabled={currentIndex === totalPlays - 1}
              aria-label="Next play"
              className={`flex items-center justify-center w-9 h-9 rounded-lg transition-colors ${
                currentIndex === totalPlays - 1
                  ? 'text-txt-muted/40 cursor-not-allowed'
                  : 'text-white hover:bg-surface-3'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Running score (right) — links to the game */}
          {(() => {
            const canLinkToGame = !!(currentPlay?.gameInfo?.gameId && pathPrefix)
            const scoreInner = (
              <>
                {team1LogoUrl && (
                  <img src={team1LogoUrl} alt={team1AbbrForAlt} className="w-5 h-5 sm:w-6 sm:h-6 object-contain" />
                )}
                <span className="text-white font-bold text-base sm:text-lg tabular-nums">
                  {runningScore.score1}
                </span>
                <span className="text-txt-muted text-xs">–</span>
                <span className="text-white font-bold text-base sm:text-lg tabular-nums">
                  {runningScore.score2}
                </span>
                {team2LogoUrl && (
                  <img src={team2LogoUrl} alt={currentPlay?.gameInfo?.opponent || team2Abbr} className="w-5 h-5 sm:w-6 sm:h-6 object-contain" />
                )}
              </>
            )

            if (!canLinkToGame) {
              return (
                <div className="flex-shrink-0 flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg bg-surface-3/60">
                  {scoreInner}
                </div>
              )
            }

            return (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  navigate(`${pathPrefix}/game/${currentPlay.gameInfo.gameId}`)
                }}
                title="View game details"
                aria-label="View game details"
                className="group flex-shrink-0 flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg bg-surface-3/60 hover:bg-surface-3/20 ring-1 ring-transparent hover:ring-[var(--surface-5)]/50 transition-colors focus:outline-none focus:ring-[var(--surface-5)] cursor-pointer"
              >
                {scoreInner}
                <svg
                  className="w-3.5 h-3.5 text-txt-muted group-hover:text-txt-primary transition-colors ml-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )
          })()}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
