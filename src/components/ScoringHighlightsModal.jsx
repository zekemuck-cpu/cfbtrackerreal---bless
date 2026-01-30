import { useState, useEffect, useRef, useCallback } from 'react'
import ReactPlayer from 'react-player'

const PLAY_DURATION = 30 // seconds per play before auto-advance

export default function ScoringHighlightsModal({
  isOpen,
  onClose,
  scoringPlays,
  team1Abbr,
  team2Abbr,
  team1Score,
  team2Score
}) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const [timeRemaining, setTimeRemaining] = useState(PLAY_DURATION)
  const [isReady, setIsReady] = useState(false)
  const [hasError, setHasError] = useState(false)
  const timerRef = useRef(null)
  const playerRef = useRef(null)

  // Filter to only plays with video links
  const playsWithVideo = scoringPlays?.filter(p => p.videoLink) || []
  const currentPlay = playsWithVideo[currentIndex]
  const totalPlays = playsWithVideo.length

  // Calculate running score up to current play
  const getRunningScore = useCallback((upToIndex) => {
    let score1 = 0
    let score2 = 0

    for (let i = 0; i <= upToIndex; i++) {
      const play = playsWithVideo[i]
      if (!play) continue

      const isTeam1 = play.team?.toUpperCase() === team1Abbr?.toUpperCase()
      let points = 0

      // Calculate points for this play
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

  // Handle timer for auto-advance
  useEffect(() => {
    if (!isOpen || !isPlaying || !isReady || hasError) {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }

    timerRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          // Auto-advance to next
          if (currentIndex < totalPlays - 1) {
            setCurrentIndex(currentIndex + 1)
            setIsReady(false)
            setHasError(false)
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
  }, [isOpen, isPlaying, isReady, hasError, currentIndex, totalPlays])

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0)
      setIsPlaying(true)
      setTimeRemaining(PLAY_DURATION)
      setIsReady(false)
      setHasError(false)
    }
  }, [isOpen])

  // Reset timer when changing plays
  useEffect(() => {
    setTimeRemaining(PLAY_DURATION)
    setIsReady(false)
    setHasError(false)
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

  const handleReady = () => {
    setIsReady(true)
    setHasError(false)
  }

  const handleError = () => {
    setHasError(true)
    setIsReady(false)
  }

  if (!isOpen || totalPlays === 0) return null

  const runningScore = getRunningScore(currentIndex)
  const isPassingTD = currentPlay?.scoreType === 'Passing TD'

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-80 flex items-center justify-center z-[9999] p-4"
      style={{ margin: 0 }}
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-gray-700"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800">
          <h3 className="text-lg font-bold text-white">Scoring Highlights</h3>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">
              Play {currentIndex + 1} of {totalPlays}
            </span>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Video Player */}
        <div className="relative bg-black aspect-video">
          {!hasError ? (
            <ReactPlayer
              ref={playerRef}
              url={currentPlay?.videoLink}
              playing={isPlaying}
              controls={true}
              width="100%"
              height="100%"
              onReady={handleReady}
              onError={handleError}
              config={{
                youtube: {
                  playerVars: {
                    modestbranding: 1,
                    rel: 0
                  }
                }
              }}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
              <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-lg mb-2">Unable to load video</p>
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

          {/* Loading overlay */}
          {!isReady && !hasError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="w-12 h-12 border-4 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
            </div>
          )}

          {/* Timer indicator */}
          {isReady && isPlaying && (
            <div className="absolute top-4 right-4 bg-black/70 px-3 py-1 rounded-full">
              <span className="text-white text-sm font-mono">{timeRemaining}s</span>
            </div>
          )}
        </div>

        {/* Play Info */}
        <div className="px-4 py-3 bg-gray-800 border-t border-gray-700">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="text-gray-400">
              Q{currentPlay?.quarter} | {currentPlay?.timeLeft}
            </span>
            <span className="text-white font-semibold">
              {currentPlay?.scoreType}
              {currentPlay?.yards && ` - ${currentPlay.yards} yds`}
            </span>
            {currentPlay?.patResult && (
              <span className="text-gray-400">({currentPlay.patResult})</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm">
            <span className="text-gray-300">
              {isPassingTD && currentPlay?.passer ? (
                <>{currentPlay.passer} to {currentPlay.scorer}</>
              ) : (
                currentPlay?.scorer
              )}
            </span>
            <span className="text-white font-bold">
              {team1Abbr} {runningScore.score1} - {team2Abbr} {runningScore.score2}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 px-4 py-4 bg-gray-900 border-t border-gray-700">
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              currentIndex === 0
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Prev
          </button>

          <button
            onClick={handlePlayPause}
            className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-600 text-white hover:bg-blue-500 transition-colors"
          >
            {isPlaying ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <button
            onClick={handleNext}
            disabled={currentIndex === totalPlays - 1}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              currentIndex === totalPlays - 1
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
          >
            Next
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 px-4 pb-4 bg-gray-900">
          {playsWithVideo.map((_, idx) => (
            <button
              key={idx}
              onClick={() => {
                setCurrentIndex(idx)
                setIsPlaying(true)
              }}
              className={`w-2 h-2 rounded-full transition-colors ${
                idx === currentIndex
                  ? 'bg-blue-500'
                  : idx < currentIndex
                  ? 'bg-green-500'
                  : 'bg-gray-600 hover:bg-gray-500'
              }`}
              title={`Play ${idx + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
