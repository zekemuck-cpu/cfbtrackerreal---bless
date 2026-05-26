import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * Clean YouTube embed — no YouTube branding visible.
 *
 * How it stays clean:
 *   • controls=0 hides YouTube's bottom playback chrome.
 *   • A CSS clip-path on the iframe wrapper physically removes the
 *     two regions where YT's remaining chrome surfaces: the top strip
 *     (channel-name + avatar overlay, big play button on first frame)
 *     and the bottom-right corner ("Watch on YouTube" badge). These
 *     regions are clipped from initial render — there's no timing
 *     window where they're visible.
 *   • pointer-events:none on the iframe means YT never receives a
 *     mouseover, so it never decides to surface its hover chrome
 *     during playback either.
 *   • Our own overlay buttons handle play/pause via the IFrame API.
 *
 * Why clip-path over scaling: scaling losses pixels evenly around the
 * edge, including the bottom-left and middle areas where the play
 * actually happens in football clips. Clip-path is region-specific —
 * we lose a strip at the top (mostly sky/scoreboard) and the bottom-
 * right corner (often empty sideline), and the live action stays at
 * 1:1 pixel scale.
 */

// Clip-path polygon describing the visible region of the iframe.
// Removes the top 14% (channel-name overlay band) and the bottom-
// right corner (25% wide × 14% tall — large enough to swallow the
// "Watch on YouTube" badge at typical aspect ratios).
const IFRAME_CLIP_PATH = 'polygon(0% 14%, 100% 14%, 100% 86%, 75% 86%, 75% 100%, 0% 100%)'

let ytApiPromise = null
function loadYTApi() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (ytApiPromise) return ytApiPromise
  ytApiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT)
      return
    }
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      try { previous?.() } catch {}
      resolve(window.YT)
    }
    if (!document.querySelector('script[data-yt-iframe-api]')) {
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      tag.async = true
      tag.setAttribute('data-yt-iframe-api', 'true')
      document.body.appendChild(tag)
    }
  })
  return ytApiPromise
}

export default function YouTubePlayer({
  videoId,
  startSec = 0,
  endSec = null,
  className = '',
  resetKey,
}) {
  const containerRef = useRef(null)
  const playerRef = useRef(null)
  const [state, setState] = useState('loading')
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let cancelled = false
    let progressTimer

    loadYTApi().then((YT) => {
      if (cancelled || !containerRef.current) return

      const player = new YT.Player(containerRef.current, {
        videoId,
        height: '100%',
        width: '100%',
        playerVars: {
          autoplay: 1,
          mute: 1,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          start: startSec,
          end: endSec || undefined,
          fs: 0,
          iv_load_policy: 3,
          playsinline: 1,
          disablekb: 1,
        },
        events: {
          onReady: (e) => {
            if (cancelled) return
            playerRef.current = e.target
            // Disable pointer events on the iframe itself so YT never
            // sees a mouseover and never surfaces hover chrome.
            try {
              const iframe = e.target.getIframe?.()
              if (iframe) iframe.style.pointerEvents = 'none'
            } catch {}
            try { e.target.playVideo() } catch {}
          },
          onStateChange: (e) => {
            if (cancelled) return
            const PS = window.YT?.PlayerState
            if (!PS) return
            if (e.data === PS.PLAYING) setState('playing')
            else if (e.data === PS.PAUSED) setState('paused')
            else if (e.data === PS.ENDED) setState('ended')
            else if (e.data === PS.CUED) setState('paused')
          },
        },
      })

      progressTimer = setInterval(() => {
        const p = playerRef.current
        if (!p || !p.getCurrentTime || !p.getDuration) return
        try {
          const cur = p.getCurrentTime()
          const dur = p.getDuration()
          if (!Number.isFinite(cur) || !Number.isFinite(dur) || dur <= 0) return
          const clipStart = startSec || 0
          const clipEnd = endSec || dur
          const span = Math.max(clipEnd - clipStart, 0.25)
          const rel = Math.min(Math.max((cur - clipStart) / span, 0), 1)
          setProgress(rel)
        } catch {}
      }, 250)
    }).catch(() => {})

    return () => {
      cancelled = true
      clearInterval(progressTimer)
      try { playerRef.current?.destroy?.() } catch {}
      playerRef.current = null
    }
  }, [videoId, startSec, endSec, resetKey])

  const play = useCallback(() => {
    const p = playerRef.current
    if (!p) return
    try {
      if (state === 'ended') p.seekTo(startSec || 0, true)
      p.playVideo()
    } catch {}
  }, [state, startSec])

  const pause = useCallback(() => {
    const p = playerRef.current
    if (!p) return
    try { p.pauseVideo() } catch {}
  }, [])

  const isPlaying = state === 'playing'
  const showCover = !isPlaying

  return (
    <div className={`absolute inset-0 bg-black overflow-hidden ${className}`}>
      {/* IFrame wrapper. The clip-path on this div removes the top
          channel-name strip and the bottom-right WoY-badge corner
          from the visible area. It's applied from initial render so
          there's no flash of unclipped YT chrome during player
          startup. The iframe (created by YT.Player) inherits the
          clip as a child of this clipped wrapper. */}
      <div
        className="absolute inset-0"
        style={{ clipPath: IFRAME_CLIP_PATH }}
      >
        <div ref={containerRef} className="w-full h-full" />
      </div>

      {/* Click-to-pause surface during playback. Transparent so the
          (already clipped) video shows through; covers the whole
          frame so a click anywhere on the video pauses. Routed
          through our state machine so we know about it. */}
      {isPlaying && (
        <button
          type="button"
          onClick={pause}
          aria-label="Pause"
          className="absolute inset-0 z-10 bg-transparent focus:outline-none cursor-pointer"
        />
      )}

      {/* Opaque cover for every non-playing state. With clip-path
          handling chrome during playback, the cover only needs to
          show a single state at a time (loading spinner, play button
          on pause, replay button at end). */}
      {showCover && (
        <button
          type="button"
          onClick={state === 'loading' ? undefined : play}
          aria-label={state === 'ended' ? 'Replay' : state === 'paused' ? 'Play' : 'Loading'}
          className="absolute inset-0 z-10 bg-black flex items-center justify-center focus:outline-none cursor-pointer"
          disabled={state === 'loading'}
        >
          {state === 'loading' ? (
            <svg className="w-8 h-8 text-white/60 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <div className="bg-white/15 ring-1 ring-white/25 rounded-full w-16 h-16 flex items-center justify-center transition-transform hover:scale-105">
              {state === 'ended' ? (
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : (
                <svg className="w-7 h-7 text-white" style={{ marginLeft: '3px' }} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </div>
          )}
        </button>
      )}

      {/* Custom progress bar at the bottom. The clip-path on the
          iframe wrapper doesn't touch this element — it sits at
          z-20 above everything. */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10 pointer-events-none z-20">
        <div
          className="h-full bg-white/85 transition-all duration-200"
          style={{ width: `${Math.min(progress * 100, 100)}%` }}
        />
      </div>
    </div>
  )
}
