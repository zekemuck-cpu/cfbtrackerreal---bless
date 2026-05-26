import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * Clean YouTube embed — no YouTube branding visible.
 *
 * How it stays clean:
 *   • controls=0 hides YouTube's playback chrome (progress bar, play
 *     button, scrub handle, settings, fullscreen, share, CC).
 *   • The IFrame Player API tracks the play state. When the video is
 *     NOT actively playing (loading, paused, ended), we render an
 *     opaque black cover with our own play/replay button. That cover
 *     hides every YouTube overlay that surfaces in those states:
 *     channel name + avatar, the big YT play button, "Watch on
 *     YouTube" badge, end-screen related-video grid.
 *   • During playback the cover is gone, so the video is unobstructed.
 *     Click anywhere on the video while playing → pause.
 *   • Our own thin progress bar sits at the bottom (pointer-events:none
 *     so it doesn't capture clicks). Nothing to hover over → YouTube
 *     never gets a reason to surface chrome.
 *
 * Why this approach over scaling/cropping: scale + overflow:hidden
 * loses 15-25% of the actual video pixels to hide chrome at the
 * edges. Sports plays don't survive that well. State-driven covers
 * preserve every pixel.
 */

let ytApiPromise = null
function loadYTApi() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (ytApiPromise) return ytApiPromise
  ytApiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT)
      return
    }
    // YouTube fires a single global callback when the IFrame API is
    // ready. Compose with any previous one in case another consumer
    // already registered.
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

// How long to keep our opaque black cover up AFTER YouTube reports
// the PLAYING state, before revealing the iframe. YouTube's intro
// chrome (channel name + avatar overlay, share button, central
// pause icon, "Watch on YouTube" badge) is shown by the player as
// it initializes and during the first ~1-2 seconds of playback —
// controls=0 doesn't hide this initial chrome, only the bottom
// playback chrome. By holding the cover up past the chrome-fade
// window, the user only ever sees clean video, never YT branding.
const COVER_HOLD_MS_AFTER_PLAYING = 1500

export default function YouTubePlayer({
  videoId,
  startSec = 0,
  endSec = null,
  className = '',
  // Reset key — bump from parent to remount the player (e.g. when
  // changing plays in a scoring-highlight reel). React's `key` prop
  // achieves the same and is preferred from outside; this is here so
  // we can also re-init internally if needed.
  resetKey,
}) {
  const containerRef = useRef(null)
  const playerRef = useRef(null)
  // Player state machine:
  //   loading — API still booting OR player constructed but not yet ready
  //   playing — actively playing
  //   paused  — user paused, or buffering pause
  //   ended   — clip reached endSec or natural end
  const [state, setState] = useState('loading')
  // Whether the cover has been lifted for the current playing window.
  // Reset to false whenever state leaves 'playing'; set to true after
  // the chrome-fade delay so the cover only lifts when the iframe is
  // safe to reveal.
  const [coverLifted, setCoverLifted] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let cancelled = false
    let progressTimer

    loadYTApi().then((YT) => {
      if (cancelled || !containerRef.current) return

      // YT.Player REPLACES the target element with an iframe. The
      // wrapping div stays, the inner placeholder div is swapped out.
      //
      // IMPORTANT: height/width must be '100%' here. Without them, YT
      // sets the iframe to its default 640x390 pixels, and any tile
      // narrower than 640px ends up showing a clipped, zoomed-in
      // portion of the video (the iframe is bigger than the container
      // and overflow:hidden trims it). 100% lets the iframe fluidly
      // match whatever size the outer aspect-video wrapper resolves to.
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
          // playlist trick: setting playlist=videoId enables seamless
          // loop if we ever want it; harmless without `loop=1`.
        },
        events: {
          onReady: (e) => {
            if (cancelled) return
            playerRef.current = e.target
            // CRITICAL: disable pointer events on the iframe itself.
            // Without this, YouTube's player JS detects mousemove
            // events inside the iframe and surfaces hover chrome
            // (channel-name overlay, share button, "Watch on YouTube"
            // badge, central pause icon) regardless of controls=0.
            // With pointer-events: none, YT never sees a mouseover
            // and never decides to surface its chrome. Our overlay
            // buttons above the iframe handle all play/pause input
            // via the IFrame API directly.
            try {
              const iframe = e.target.getIframe?.()
              if (iframe) iframe.style.pointerEvents = 'none'
            } catch {}
            // Autoplay is muted so it works without user gesture.
            try { e.target.playVideo() } catch {}
          },
          onStateChange: (e) => {
            if (cancelled) return
            const PS = window.YT?.PlayerState
            if (!PS) return
            if (e.data === PS.PLAYING) setState('playing')
            else if (e.data === PS.PAUSED) setState('paused')
            else if (e.data === PS.ENDED) setState('ended')
            else if (e.data === PS.BUFFERING) {/* keep prior state */}
            else if (e.data === PS.CUED) setState('paused')
          },
        },
      })

      // Poll player time for the custom progress bar. 250ms is smooth
      // enough for a slim 4px bar without thrashing rerenders.
      progressTimer = setInterval(() => {
        const p = playerRef.current
        if (!p || !p.getCurrentTime || !p.getDuration) return
        try {
          const cur = p.getCurrentTime()
          const dur = p.getDuration()
          if (!Number.isFinite(cur) || !Number.isFinite(dur) || dur <= 0) return
          // Progress relative to our clip window (start..end), not the
          // full source video, so a 30-second highlight reads as
          // 0 → 100% across its duration rather than e.g. 5% → 7% of
          // a 10-minute source.
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
      if (state === 'ended') {
        // Reset to clip start when replaying from the end overlay.
        p.seekTo(startSec || 0, true)
      }
      p.playVideo()
    } catch {}
  }, [state, startSec])

  const pause = useCallback(() => {
    const p = playerRef.current
    if (!p) return
    try { p.pauseVideo() } catch {}
  }, [])

  // Cover-lift timing. When we enter the 'playing' state, hold the
  // cover up for the chrome-fade window so YT's intro overlay is
  // never visible to the user. Any non-playing state immediately
  // brings the cover back up (no fade — user wants instant feedback
  // on pause/end).
  useEffect(() => {
    if (state === 'playing') {
      const t = setTimeout(() => setCoverLifted(true), COVER_HOLD_MS_AFTER_PLAYING)
      return () => clearTimeout(t)
    }
    setCoverLifted(false)
  }, [state])

  // The iframe is only revealed when both: state is 'playing' AND the
  // chrome-fade delay has elapsed. Every other case shows our opaque
  // cover.
  const isPlayingClean = state === 'playing' && coverLifted
  const showCover = !isPlayingClean

  // Which icon to render inside the cover. While we're waiting for
  // playback to truly start (loading or post-PLAYING chrome-fade
  // window), show a spinner so the user knows it's working — not the
  // play button, which would suggest the video is paused awaiting
  // input. Paused state gets a play button; ended state gets a
  // replay icon.
  const coverMode = state === 'paused'
    ? 'play'
    : state === 'ended'
    ? 'replay'
    : 'loading' // 'loading' state OR 'playing' but cover not yet lifted

  return (
    <div className={`absolute inset-0 bg-black overflow-hidden ${className}`}>
      {/* IFrame target. YT.Player replaces this placeholder div with
          its iframe on mount; the absolutely-positioned wrapper keeps
          the layout slot reserved either way. */}
      <div className="absolute inset-0">
        <div ref={containerRef} className="w-full h-full" />
      </div>

      {/* Click-to-pause surface during clean playback. Transparent so
          the video shows through; covers the whole frame so a click
          anywhere on the video pauses (mirrors what YouTube's own
          controls=0 click-to-toggle would do, but routed through our
          state machine so we know about it). Explicit z-10 is belt-
          and-suspenders alongside the iframe's pointer-events:none —
          if one fails, the other still keeps YT chrome out. */}
      {isPlayingClean && (
        <button
          type="button"
          onClick={pause}
          aria-label="Pause"
          className="absolute inset-0 z-10 bg-transparent focus:outline-none cursor-pointer"
        />
      )}

      {/* Opaque cover for every non-clean-playing state — load, post-
          PLAYING chrome-fade window, paused, ended. Fully opaque
          black surface that hides YouTube's intro chrome (channel
          name + avatar, share button, central pause icon, "Watch on
          YouTube" badge) and end-screen completely. */}
      {showCover && (
        <button
          type="button"
          onClick={coverMode === 'loading' ? undefined : play}
          aria-label={coverMode === 'replay' ? 'Replay' : coverMode === 'play' ? 'Play' : 'Loading'}
          className="absolute inset-0 z-10 bg-black flex items-center justify-center focus:outline-none cursor-pointer"
          disabled={coverMode === 'loading'}
        >
          {coverMode === 'loading' ? (
            <svg className="w-8 h-8 text-white/60 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <div className="bg-white/15 ring-1 ring-white/25 rounded-full w-16 h-16 flex items-center justify-center transition-transform hover:scale-105">
              {coverMode === 'replay' ? (
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

      {/* Thin custom progress bar, bottom edge. pointer-events:none so
          clicks pass through to the play/pause surface above. */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10 pointer-events-none">
        <div
          className="h-full bg-white/85 transition-all duration-200"
          style={{ width: `${Math.min(progress * 100, 100)}%` }}
        />
      </div>
    </div>
  )
}
