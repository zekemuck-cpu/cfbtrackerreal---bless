import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'

const PLAY_DURATION = 30 // seconds per play before auto-advance

// Extract video embed URL from various platforms
function getEmbedUrl(url) {
  if (!url) return null

  console.log('getEmbedUrl received URL:', url)

  // YouTube: youtu.be/VIDEO_ID?t=SECONDS or youtube.com/watch?v=VIDEO_ID&t=SECONDS
  const youtubeShortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)(?:\?t=(\d+))?/)
  if (youtubeShortMatch) {
    const startTime = youtubeShortMatch[2]
    const embedUrl = startTime
      ? `https://www.youtube-nocookie.com/embed/${youtubeShortMatch[1]}?autoplay=1&mute=1&start=${startTime}`
      : `https://www.youtube-nocookie.com/embed/${youtubeShortMatch[1]}?autoplay=1&mute=1`
    console.log('Generated YouTube embed URL:', embedUrl)
    return embedUrl
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
  const [dropdownOpenUpward, setDropdownOpenUpward] = useState(false)
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

  // Check if dropdown should open upward to avoid overflow
  useEffect(() => {
    if (showGameDropdown && gameDropdownRef.current) {
      const dropdownButton = gameDropdownRef.current.querySelector('button')
      if (dropdownButton) {
        const rect = dropdownButton.getBoundingClientRect()
        const viewportHeight = window.innerHeight
        const spaceBelow = viewportHeight - rect.bottom
        const estimatedDropdownHeight = Math.min(games.length * 40, 240) // 40px per item, max 240px (max-h-60)

        // Open upward if not enough space below
        setDropdownOpenUpward(spaceBelow < estimatedDropdownHeight + 20)
      }
    }
  }, [showGameDropdown, games.length])

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

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-80 flex items-center justify-center z-[9999] p-4"
      style={{ margin: 0 }}
      onClick={onClose}
    >
      <div
        className="bg-surface-1 rounded-xl shadow-2xl w-full max-w-6xl max-h-[92dvh] flex flex-col border border-surface-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-4 bg-surface-2 flex-shrink-0">
          <h3 className="text-lg font-bold text-white">{customTitle || 'Scoring Highlights'}</h3>
          <div className="flex items-center gap-4">
            <span className="text-sm text-txt-muted">
              Play {currentIndex + 1} of {totalPlays}
            </span>
            <button aria-label="Close"
              onClick={onClose}
              className="p-1 hover:bg-surface-3 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6 text-txt-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Video Player — 16:9 so the panel only takes the height the video needs */}
        <div className="relative bg-black w-full aspect-video overflow-hidden flex-shrink-0">
          {isDirectVideo ? (
            <video
              key={currentIndex}
              src={embedData.url}
              className="absolute inset-0 w-full h-full"
              autoPlay
              controls
            />
          ) : embedUrl ? (
            <iframe
              key={currentIndex}
              src={embedUrl}
              className="absolute inset-0 w-full h-full"
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

          {/* Timer indicator */}
          {isPlaying && (
            <div className="absolute top-4 left-4 bg-black/70 px-3 py-1 rounded-full z-10">
              <span className="text-white text-sm font-mono">{timeRemaining}s</span>
            </div>
          )}
        </div>

        {/* Play Info */}
        <div className="px-4 py-2 bg-surface-2 border-t border-surface-4 flex-shrink-0">
          <div className="flex items-start gap-3">
            {/* Player image */}
            {(scorerPlayer?.pictureUrl || passerPlayer?.pictureUrl) && (
              <div className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-surface-3">
                <img
                  src={scorerPlayer?.pictureUrl || passerPlayer?.pictureUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Play details */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="text-txt-muted">
                  Q{currentPlay?.quarter} | {currentPlay?.timeLeft}
                </span>
                <span className="text-white font-semibold">
                  {currentPlay?.scoreType}
                  {currentPlay?.yards && ` - ${currentPlay.yards} yds`}
                </span>
                {currentPlay?.patResult && (
                  <span className="text-txt-muted">({currentPlay.patResult})</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm">
                <span className="text-txt-muted">
                  {isPassingTD && currentPlay?.passer ? (
                    <>{currentPlay.passer} to {currentPlay.scorer}</>
                  ) : (
                    currentPlay?.scorer
                  )}
                </span>
              </div>
            </div>

            {/* Running Score with logos */}
            <div
              className="flex-shrink-0 flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={(e) => {
                if (currentPlay?.gameInfo?.gameId && pathPrefix) {
                  e.stopPropagation()
                  navigate(`${pathPrefix}/game/${currentPlay.gameInfo.gameId}`)
                }
              }}
              title={currentPlay?.gameInfo?.gameId ? "View game details" : undefined}
            >
              {team1LogoUrl && (
                <img src={team1LogoUrl} alt={team1Abbr} className="w-6 h-6 object-contain" />
              )}
              <span className="text-white font-bold text-lg">
                {runningScore.score1}
              </span>
              <span className="text-txt-muted">-</span>
              <span className="text-white font-bold text-lg">
                {runningScore.score2}
              </span>
              {team2LogoUrl && (
                <img src={team2LogoUrl} alt={currentPlay?.gameInfo?.opponent || team2Abbr} className="w-6 h-6 object-contain" />
              )}
            </div>
          </div>
        </div>

        {/* Navigation Filters */}
        {(seasons.length > 1 || games.length > 1) && (
          <div className="flex flex-wrap items-center justify-center gap-3 px-4 py-2 bg-surface-2 border-t border-surface-4 flex-shrink-0">
            {seasons.length > 1 && (
              <div className="flex items-center gap-2">
                <label className="text-sm text-txt-muted font-medium">Season:</label>
                <select
                  value={currentPlay?.gameInfo?.year || ''}
                  onChange={(e) => jumpToSeason(e.target.value)}
                  className="px-3 py-1.5 bg-surface-3 text-white rounded-lg text-sm border border-surface-4 focus:border-blue-500 focus:outline-none"
                >
                  {seasons.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            )}
            {games.length > 1 && (
              <div className="flex items-center gap-2 relative" ref={gameDropdownRef}>
                <label className="text-sm text-txt-muted font-medium">Game:</label>
                <div className="relative">
                  <button
                    onClick={() => setShowGameDropdown(!showGameDropdown)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-surface-3 text-white rounded-lg text-sm border border-surface-4 hover:border-blue-500 focus:outline-none focus:border-blue-500 min-w-[200px]"
                  >
                    {currentPlay?.gameInfo?.opponentLogo && (
                      <img
                        src={currentPlay.gameInfo.opponentLogo}
                        alt={currentPlay.gameInfo.opponent}
                        className="w-4 h-4 object-contain"
                      />
                    )}
                    <span className="flex-1 text-left truncate">
                      {currentPlay?.gameInfo ? `${currentPlay.gameInfo.year} Week ${currentPlay.gameInfo.week} vs ${currentPlay.gameInfo.opponent}` : 'Select game'}
                    </span>
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showGameDropdown && (
                    <div className={`absolute left-0 w-full bg-surface-3 border border-surface-4 rounded-lg shadow-lg max-h-60 overflow-y-auto z-50 ${
                      dropdownOpenUpward ? 'bottom-full mb-1' : 'top-full mt-1'
                    }`}>
                      {games.map(game => (
                        <button
                          key={`${game.year}-${game.week}-${game.opponent}`}
                          onClick={() => {
                            jumpToGame(`${game.year}|||${game.week}|||${game.opponent}`)
                            setShowGameDropdown(false)
                          }}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-white hover:bg-surface-4 transition-colors text-left"
                        >
                          {game.opponentLogo && (
                            <img
                              src={game.opponentLogo}
                              alt={game.opponent}
                              className="w-4 h-4 object-contain flex-shrink-0"
                            />
                          )}
                          <span className="truncate">{game.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Controls + Progress */}
        <div className="flex items-center justify-center gap-3 px-4 py-2 bg-surface-1 border-t border-surface-4 flex-shrink-0">
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              currentIndex === 0
                ? 'bg-surface-3 text-txt-muted cursor-not-allowed'
                : 'bg-surface-3 text-white hover:bg-surface-4'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Prev
          </button>

          <button
            onClick={handlePlayPause}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-blue-600 text-white hover:bg-blue-500 transition-colors flex-shrink-0"
            title={isPlaying ? 'Pause auto-advance' : 'Resume auto-advance'}
          >
            {isPlaying ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <button
            onClick={handleNext}
            disabled={currentIndex === totalPlays - 1}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              currentIndex === totalPlays - 1
                ? 'bg-surface-3 text-txt-muted cursor-not-allowed'
                : 'bg-surface-3 text-white hover:bg-surface-4'
            }`}
          >
            Next
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {totalPlays > 1 && totalPlays <= 40 && (
            <div className="hidden sm:flex items-center gap-1.5 ml-2 max-w-[45%] overflow-x-auto">
              {playsWithVideo.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setCurrentIndex(idx)
                    setIsPlaying(true)
                  }}
                  className={`w-1.5 h-1.5 rounded-full transition-colors flex-shrink-0 ${
                    idx === currentIndex
                      ? 'bg-blue-500'
                      : idx < currentIndex
                      ? 'bg-green-500'
                      : 'bg-surface-4 hover:bg-surface-5'
                  }`}
                  title={`Play ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
