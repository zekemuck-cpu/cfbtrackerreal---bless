import { useState, useEffect, useRef } from 'react'
import { getEmbedUrl } from './ScoringHighlightsModal'

const PLAY_DURATION = 30

/**
 * Compact inline scoring-highlights player. Lives in a fixed 16:9 card and
 * auto-advances through the playlist at PLAY_DURATION seconds per clip. The
 * "expand" button hands off to the full ScoringHighlightsModal at the same
 * index so the user picks up where they were.
 */
export default function InlineScoringHighlights({
  scoringPlays,
  onExpand,
  team1Abbr,
  team2Abbr,
  startIndex = 0,
}) {
  const playsWithVideo = (scoringPlays || []).filter(p => p.videoLink)
  const total = playsWithVideo.length
  const initialIndex = total > 0 ? Math.max(0, Math.min(startIndex, total - 1)) : 0
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [isPlaying, setIsPlaying] = useState(true)
  const [timeRemaining, setTimeRemaining] = useState(PLAY_DURATION)
  const timerRef = useRef(null)

  // Reset timer when changing plays
  useEffect(() => { setTimeRemaining(PLAY_DURATION) }, [currentIndex])

  // Auto-advance timer
  useEffect(() => {
    if (!isPlaying || total === 0) {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }
    timerRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          if (currentIndex < total - 1) {
            setCurrentIndex(i => i + 1)
            return PLAY_DURATION
          }
          setIsPlaying(false)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [isPlaying, currentIndex, total])

  if (total === 0) return null

  const currentPlay = playsWithVideo[currentIndex]
  const embedData = getEmbedUrl(currentPlay?.videoLink)
  const isDirect = embedData && typeof embedData === 'object' && embedData.type === 'video'
  const embedUrl = isDirect ? null : embedData

  const goPrev = () => { if (currentIndex > 0) { setCurrentIndex(i => i - 1); setIsPlaying(true) } }
  const goNext = () => { if (currentIndex < total - 1) { setCurrentIndex(i => i + 1); setIsPlaying(true) } }
  const togglePlay = () => setIsPlaying(p => !p)

  const progressPct = ((currentIndex + 1) / total) * 100

  // Compact caption — Q, time, scoreType, yards
  const caption = (() => {
    if (!currentPlay) return ''
    const bits = []
    if (currentPlay.quarter && currentPlay.timeLeft) {
      bits.push(`Q${currentPlay.quarter} ${currentPlay.timeLeft}`)
    }
    if (currentPlay.scoreType) {
      let s = currentPlay.scoreType
      if (currentPlay.yards) s += ` · ${currentPlay.yards} yd`
      bits.push(s)
    }
    const scorer = currentPlay.scorer
    const passer = currentPlay.passer
    if (scorer) {
      bits.push(passer && currentPlay.scoreType?.includes('Passing') ? `${passer} → ${scorer}` : scorer)
    }
    return bits.join(' · ')
  })()

  return (
    <div className="rounded-lg overflow-hidden bg-surface-2 ring-1 ring-surface-3/60">
      {/* Video — 16:9 */}
      <div className="relative w-full aspect-video bg-black">
        {isDirect ? (
          <video key={currentIndex} src={embedData.url} className="absolute inset-0 w-full h-full" autoPlay muted controls />
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
          <div className="absolute inset-0 flex items-center justify-center text-xs text-txt-muted">
            Unsupported video format
          </div>
        )}

        {/* Expand button (top-right) */}
        {onExpand && (
          <button
            type="button"
            onClick={() => onExpand(currentIndex)}
            aria-label="Expand highlights"
            title="Expand"
            className="absolute top-2 right-2 z-10 w-7 h-7 rounded-md bg-black/70 backdrop-blur flex items-center justify-center text-white/90 hover:bg-black/85 hover:text-white transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-surface-3">
        <div className="h-full bg-blue-500 transition-all duration-300 ease-out" style={{ width: `${progressPct}%` }} />
      </div>

      {/* Caption + controls */}
      <div className="px-3 py-2 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.14em] text-txt-muted tabular-nums">
            Play {currentIndex + 1} / {total}
          </div>
          <div className="text-[12px] text-txt-primary truncate mt-0.5">{caption}</div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={goPrev}
            disabled={currentIndex === 0}
            aria-label="Previous play"
            className="w-7 h-7 rounded-md flex items-center justify-center text-txt-secondary hover:text-txt-primary hover:bg-surface-3 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pause auto-advance' : 'Resume auto-advance'}
            title={isPlaying ? 'Pause auto-advance' : 'Resume auto-advance'}
            className="w-7 h-7 rounded-md flex items-center justify-center text-blue-400 hover:text-blue-300 hover:bg-surface-3 transition-colors"
          >
            {isPlaying ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <button
            onClick={goNext}
            disabled={currentIndex === total - 1}
            aria-label="Next play"
            className="w-7 h-7 rounded-md flex items-center justify-center text-txt-secondary hover:text-txt-primary hover:bg-surface-3 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
