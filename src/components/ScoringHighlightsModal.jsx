import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'

const PLAY_DURATION = 30 // seconds per play before auto-advance

// Extract video embed URL from various platforms.
// Exported so the inline highlights widget can reuse the same parsing.
export function getEmbedUrl(url) {
  if (!url) return null

  // YouTube: youtu.be/VIDEO_ID?t=SECONDS or youtube.com/watch?v=VIDEO_ID&t=SECONDS
  const youtubeShortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)(?:\?t=(\d+))?/)
  if (youtubeShortMatch) {
    const startTime = youtubeShortMatch[2]
    return startTime
      ? `https://www.youtube-nocookie.com/embed/${youtubeShortMatch[1]}?autoplay=1&mute=1&start=${startTime}`
      : `https://www.youtube-nocookie.com/embed/${youtubeShortMatch[1]}?autoplay=1&mute=1`
  }

  const youtubeLongMatch = url.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)(?:.*[&?]t=(\d+))?/)
  if (youtubeLongMatch) {
    const startTime = youtubeLongMatch[2]
    return startTime
      ? `https://www.youtube-nocookie.com/embed/${youtubeLongMatch[1]}?autoplay=1&mute=1&start=${startTime}`
      : `https://www.youtube-nocookie.com/embed/${youtubeLongMatch[1]}?autoplay=1&mute=1`
  }

  const youtubeEmbedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]+)/)
  if (youtubeEmbedMatch) {
    return url.includes('autoplay') ? url : `${url}${url.includes('?') ? '&' : '?'}autoplay=1`
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
  players,
  getTeamLogo,
  getMascotName,
  teamsData,
  customTitle,
  pathPrefix,
  startIndex = 0
}) {
  useBodyScrollLock(isOpen)
  const navigate = useNavigate()
  const [currentIndex, setCurrentIndex] = useState(startIndex)
  const [isPlaying, setIsPlaying] = useState(true)
  const [timeRemaining, setTimeRemaining] = useState(PLAY_DURATION)
  const [showGameDropdown, setShowGameDropdown] = useState(false)
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
        const key = `${play.gameInfo.year}-${play.gameInfo.week}-${play.gameInfo.opponent}`
        if (!seen.has(key)) {
          seen.add(key)
          uniqueGames.push({
            year: play.gameInfo.year,
            week: play.gameInfo.week,
            opponent: play.gameInfo.opponent,
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

  // Jump to first play of selected game
  const jumpToGame = (gameKey) => {
    const [year, week, opponent] = gameKey.split('|||')
    const index = playsWithVideo.findIndex(p =>
      p.gameInfo?.year === parseInt(year) &&
      p.gameInfo?.week === parseInt(week) &&
      p.gameInfo?.opponent === opponent
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

    // Fallback to old calculation for backwards compatibility (single game mode)
    let score1 = 0
    let score2 = 0

    for (let i = 0; i <= upToIndex; i++) {
      const play = playsWithVideo[i]
      if (!play) continue

      const isTeam1 = play.team?.toUpperCase() === team1Abbr?.toUpperCase()
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
  }, [playsWithVideo, team1Abbr])

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
    }
  }, [isOpen, startIndex])

  // Reset timer when changing plays
  useEffect(() => {
    setTimeRemaining(PLAY_DURATION)
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

  // Get embed URL
  const embedData = getEmbedUrl(currentPlay?.videoLink)
  const isDirectVideo = embedData && typeof embedData === 'object' && embedData.type === 'video'
  const embedUrl = isDirectVideo ? null : embedData

  // Get player data for images
  const scorerPlayer = findPlayer(currentPlay?.scorer)
  const passerPlayer = findPlayer(currentPlay?.passer)

  // Get team logos for score display
  const team1LogoUrl = team1Logo
  // For "All Games" mode, use the opponent logo from the current play's gameInfo
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
              className="px-2.5 py-1 bg-surface-3 text-white rounded-md text-xs border border-surface-4 hover:border-surface-5 focus:border-blue-500 focus:outline-none"
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
                className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-3 text-white rounded-md text-xs border border-surface-4 hover:border-surface-5 focus:outline-none focus:border-blue-500 max-w-[220px]"
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
                    const isActive =
                      currentPlay?.gameInfo?.year === game.year &&
                      currentPlay?.gameInfo?.week === game.week &&
                      currentPlay?.gameInfo?.opponent === game.opponent
                    return (
                      <button
                        key={`${game.year}-${game.week}-${game.opponent}`}
                        onClick={() => {
                          jumpToGame(`${game.year}|||${game.week}|||${game.opponent}`)
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
                className="text-blue-400 hover:text-blue-300 underline"
              >
                Open in new tab
              </a>
            </div>
          )}

          {/* Timer pill */}
          {isPlaying && (
            <div className="absolute top-3 left-3 bg-black/70 backdrop-blur px-2.5 py-0.5 rounded-full z-10 pointer-events-none">
              <span className="text-white text-xs font-mono tabular-nums">{timeRemaining}s</span>
            </div>
          )}
        </div>

        {/* Progress bar between video and footer */}
        <div className="h-0.5 bg-surface-3 flex-shrink-0 relative">
          <div
            className="h-full bg-blue-500 transition-all duration-300 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Footer — play info + controls + score in one row */}
        <div className="flex items-center gap-3 sm:gap-4 px-4 py-2.5 bg-surface-2 flex-shrink-0">
          {/* Play info (left) */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {(scorerPlayer?.pictureUrl || passerPlayer?.pictureUrl) && (
              <div className="flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden bg-surface-3 hidden sm:block">
                <img
                  src={scorerPlayer?.pictureUrl || passerPlayer?.pictureUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm leading-tight">
                <span className="text-white font-semibold truncate">
                  {currentPlay?.scoreType}
                  {currentPlay?.yards && ` · ${currentPlay.yards} yd`}
                </span>
                {currentPlay?.patResult && (
                  <span className="text-txt-muted text-xs hidden sm:inline whitespace-nowrap">
                    ({currentPlay.patResult})
                  </span>
                )}
              </div>
              <div className="text-xs text-txt-muted truncate mt-0.5">
                <span className="tabular-nums">Q{currentPlay?.quarter} {currentPlay?.timeLeft}</span>
                <span className="mx-1.5 opacity-50">·</span>
                {isPassingTD && currentPlay?.passer ? (
                  <>{currentPlay.passer} → {currentPlay.scorer}</>
                ) : (
                  currentPlay?.scorer
                )}
              </div>
            </div>
          </div>

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
              className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-600 text-white hover:bg-blue-500 active:scale-95 transition-all flex-shrink-0 shadow-lg shadow-blue-600/20"
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
                  <img src={team1LogoUrl} alt={team1Abbr} className="w-5 h-5 sm:w-6 sm:h-6 object-contain" />
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
                className="group flex-shrink-0 flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg bg-surface-3/60 hover:bg-blue-600/20 ring-1 ring-transparent hover:ring-blue-500/50 transition-colors focus:outline-none focus:ring-blue-500 cursor-pointer"
              >
                {scoreInner}
                <svg
                  className="w-3.5 h-3.5 text-txt-muted group-hover:text-blue-400 transition-colors ml-0.5"
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
    </div>,
    document.body
  )
}
