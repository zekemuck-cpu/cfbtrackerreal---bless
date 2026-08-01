import { Component } from 'react'
import { useLocation } from 'react-router-dom'
import { isStaleChunkError, extractUrlFromError, reloadIfStale } from '../utils/chunkReload'

/**
 * Error boundary for lazy-loaded route content.
 *
 * Before this existed, a rejected route chunk import (stale hashed chunk
 * after a deploy, or a transient network blip) had no boundary to land in —
 * React unmounted the subtree and the page went permanently blank for the
 * session. Now:
 *
 *   - Chunk-load errors: kick off the probe-and-reload flow (reloads the
 *     tab if the chunk is genuinely stale from a new deploy) and show a
 *     "reload" card instead of a blank page.
 *   - Any other render crash: show a "try again / reload" card. Try Again
 *     just resets the boundary, which is enough for transient data races.
 *
 * The boundary auto-resets when the route pathname changes, so an error on
 * one page never blocks navigation to the others. Must render inside the
 * Router (it reads the location itself).
 */
class RouteErrorBoundaryInner extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('[RouteErrorBoundary]', error)
    if (isStaleChunkError(error)) {
      // Genuine stale chunk (new build deployed) → this reloads the tab.
      // Transient failure → probe passes, no reload; the card below stays
      // up and the Reload button recovers manually.
      reloadIfStale(extractUrlFromError(error))
    }
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const isChunk = isStaleChunkError(error)
    return (
      <div className="min-h-[50vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center rounded-xl border border-surface-4 bg-surface-2 p-6">
          <h2 className="text-lg font-bold text-txt-primary mb-2">
            {isChunk ? 'Update available' : 'Something went wrong'}
          </h2>
          <p className="text-sm text-txt-secondary mb-5">
            {isChunk
              ? 'This page could not load, usually because the app was just updated. Reload to get the latest version.'
              : 'This page hit an unexpected error. Your dynasty data is safe.'}
          </p>
          <div className="flex gap-3 justify-center">
            {!isChunk && (
              <button
                onClick={() => this.setState({ error: null })}
                className="px-4 py-2 rounded-lg bg-surface-3 hover:bg-surface-4 text-txt-primary text-sm font-semibold transition-colors"
              >
                Try Again
              </button>
            )}
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition-colors"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}

export default function RouteErrorBoundary({ children }) {
  const location = useLocation()
  return (
    <RouteErrorBoundaryInner resetKey={location.pathname}>
      {children}
    </RouteErrorBoundaryInner>
  )
}
