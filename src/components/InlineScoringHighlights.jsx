import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { getEmbedUrl } from './ScoringHighlightsModal'

const PLAY_DURATION = 30

/**
 * Compact inline scoring-highlights player.
 *
 * The iframe is rendered once inside a React portal to document.body and
 * repositioned via CSS between two modes:
 *   - inline: tracks a slot div in the parent layout (position: fixed, coords
 *     updated on scroll/resize)
 *   - expanded: fills the viewport with a backdrop
 *
 * Because the iframe DOM node is never remounted, toggling between modes
 * does NOT restart the video. Clicking expand animates the frame from the
 * inline rect out to fullscreen without interrupting playback.
 *
 * When an `onExpand` prop is provided, the widget defers to the caller and
 * the internal expand mode is not used (legacy behavior — some pages still
 * open the full ScoringHighlightsModal instead).
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
  const [internalExpanded, setInternalExpanded] = useState(false)
  const [hasMeasured, setHasMeasured] = useState(false)
  const slotRef = useRef(null)
  const containerRef = useRef(null)
  const timerRef = useRef(null)
  const expandedRef = useRef(false)
  expandedRef.current = internalExpanded && !onExpand

  // Track the slot's viewport rect and mutate the portal container's style
  // DIRECTLY via a ref (no React state). State-based updates lag a paint
  // behind scroll events; writing to element.style inside the scroll handler
  // keeps the iframe glued to the slot in lockstep with the browser's
  // scroll. Expanded mode takes over with fixed viewport coords.
  useLayoutEffect(() => {
    const slot = slotRef.current
    if (!slot) return
    let measured = false
    const apply = () => {
      const container = containerRef.current
      if (!container) return
      if (expandedRef.current) return
      const r = slot.getBoundingClientRect()
      container.style.top = `${r.top}px`
      container.style.left = `${r.left}px`
      container.style.width = `${r.width}px`
      container.style.height = `${r.height}px`
      if (!measured) {
        measured = true
        setHasMeasured(true)
      }
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(slot)
    window.addEventListener('scroll', apply, true)
    window.addEventListener('resize', apply)
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', apply, true)
      window.removeEventListener('resize', apply)
    }
  }, [])

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

  // Escape collapses when in internal-expand mode
  useEffect(() => {
    if (!internalExpanded) return
    const onKey = (e) => { if (e.key === 'Escape') setInternalExpanded(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [internalExpanded])

  if (total === 0) return null

  const currentPlay = playsWithVideo[currentIndex]
  const embedData = getEmbedUrl(currentPlay?.videoLink)
  const isDirect = embedData && typeof embedData === 'object' && embedData.type === 'video'
  const embedUrl = isDirect ? null : embedData

  const goPrev = () => { if (currentIndex > 0) { setCurrentIndex(i => i - 1); setIsPlaying(true) } }
  const goNext = () => { if (currentIndex < total - 1) { setCurrentIndex(i => i + 1); setIsPlaying(true) } }
  const togglePlay = () => setIsPlaying(p => !p)

  const useInternalExpand = !onExpand
  const isExpanded = useInternalExpand && internalExpanded

  const handleExpandClick = () => {
    if (onExpand) onExpand(currentIndex)
    else setInternalExpanded(v => !v)
  }

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

  // Container style for the portal'd iframe. In inline mode the top/left/
  // width/height values are written directly to the DOM by the useLayoutEffect
  // scroll handler (skipping React state prevents scroll-lag), so we only
  // seed the initial values here. Expanded mode overrides with viewport
  // coords — those react to `isExpanded` and are fine to drive via React
  // since expansion happens once per click.
  const containerStyle = isExpanded
    ? { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999 }
    : {
        position: 'fixed',
        zIndex: 30,
        top: 0, left: 0, width: 0, height: 0,
        visibility: hasMeasured ? 'visible' : 'hidden',
      }

  const videoNode = isDirect ? (
    <video
      key={currentIndex}
      src={embedData.url}
      className="absolute inset-0 w-full h-full"
      autoPlay
      muted
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
    <div className="absolute inset-0 flex items-center justify-center text-xs text-txt-muted">
      Unsupported video format
    </div>
  )

  const controlsNode = (size = 'sm') => {
    const btnSize = size === 'lg' ? 'w-9 h-9' : 'w-7 h-7'
    const iconSize = size === 'lg' ? 'w-4 h-4' : 'w-4 h-4'
    const btnBase = size === 'lg'
      ? 'rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center text-white disabled:opacity-30'
      : 'rounded-md flex items-center justify-center text-txt-secondary hover:text-txt-primary hover:bg-surface-3 disabled:opacity-30 disabled:hover:bg-transparent transition-colors'
    const playColor = size === 'lg'
      ? 'rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center text-white'
      : 'rounded-md flex items-center justify-center text-blue-400 hover:text-blue-300 hover:bg-surface-3 transition-colors'
    return (
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button
          onClick={goPrev}
          disabled={currentIndex === 0}
          aria-label="Previous play"
          className={`${btnSize} ${btnBase}`}
        >
          <svg className={iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pause auto-advance' : 'Resume auto-advance'}
          title={isPlaying ? 'Pause auto-advance' : 'Resume auto-advance'}
          className={`${btnSize} ${playColor}`}
        >
          {isPlaying ? (
            <svg className={iconSize} fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
            </svg>
          ) : (
            <svg className={`${iconSize} ml-0.5`} fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <button
          onClick={goNext}
          disabled={currentIndex === total - 1}
          aria-label="Next play"
          className={`${btnSize} ${btnBase}`}
        >
          <svg className={iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <>
      {/* Inline chrome — stays in document flow; slot reserves the video's
          16:9 area, progress bar and caption/controls sit below. The actual
          iframe is rendered in a portal and painted on top of the slot. */}
      <div className="rounded-lg overflow-hidden bg-surface-2 ring-1 ring-surface-3/60">
        <div ref={slotRef} className="relative w-full aspect-video bg-black" />
        <div className="h-0.5 bg-surface-3">
          <div className="h-full bg-blue-500 transition-all duration-300 ease-out" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="px-3 py-2 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.14em] text-txt-muted tabular-nums">
              Play {currentIndex + 1} / {total}
            </div>
            <div className="text-[12px] text-txt-primary truncate mt-0.5">{caption}</div>
          </div>
          {controlsNode('sm')}
        </div>
      </div>

      {/* Portal'd player — one iframe, repositioned between inline and
          expanded modes so playback never restarts. */}
      {createPortal(
        <>
          {isExpanded && (
            <div
              onClick={() => setInternalExpanded(false)}
              className="fixed inset-0 bg-black/85 z-[9998] transition-opacity"
              aria-hidden
            />
          )}
          <div
            ref={containerRef}
            style={containerStyle}
            className={isExpanded ? 'p-4 md:p-10' : ''}
          >
            <div className="relative w-full h-full bg-black overflow-hidden rounded-lg">
              {videoNode}

              {/* Expand / close button */}
              <button
                type="button"
                onClick={handleExpandClick}
                aria-label={isExpanded ? 'Collapse' : 'Expand highlights'}
                title={isExpanded ? 'Close' : 'Expand'}
                className="absolute top-2 right-2 z-10 w-8 h-8 rounded-md bg-black/70 backdrop-blur flex items-center justify-center text-white/90 hover:bg-black/85 hover:text-white transition-colors"
              >
                {isExpanded ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                )}
              </button>

              {/* Expanded overlay chrome (caption + playback controls) */}
              {isExpanded && (
                <div className="absolute left-0 right-0 bottom-0 px-4 pt-10 pb-4 bg-gradient-to-t from-black/90 via-black/60 to-transparent z-10">
                  <div className="flex items-center gap-3 max-w-5xl mx-auto">
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] uppercase tracking-widest text-white/60 tabular-nums">
                        Play {currentIndex + 1} / {total}
                      </div>
                      <div className="text-sm text-white truncate mt-0.5">{caption}</div>
                    </div>
                    {controlsNode('lg')}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  )
}
