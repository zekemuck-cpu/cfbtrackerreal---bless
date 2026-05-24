import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext'

// 30 seconds is the cap on how long we wait for the OAuth popup before
// giving up and offering the user a sign-out escape hatch. Mobile
// browsers occasionally open the OAuth popup in a hidden tab the user
// can't see, or silently swallow it without firing
// `auth/popup-blocked` — without a timeout the modal sat on its
// "REFRESHING" spinner forever (one beta tester reported it stuck for
// minutes on iOS).
const REFRESH_TIMEOUT_MS = 30000

// firstTime=true → shows "Connect Google" copy instead of "Session Expired".
// Pass it when the user has never authenticated with Google at all (e.g. they
// opened a sheet modal without being signed in), so the message doesn't
// confusingly say their session "expired" when nothing ever existed.
export default function AuthErrorModal({ isOpen, onClose, onRefresh, firstTime = false }) {
  const { refreshSession, signOut } = useAuth()
  const [refreshing, setRefreshing] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)

  if (!isOpen) return null

  const handleRefresh = async () => {
    setRefreshing(true)
    setErrorMsg(null)
    try {
      // Race the actual refresh against a timeout so the modal can't
      // get stuck in the "Refreshing" state if the popup never settles.
      const refreshPromise = refreshSession()
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Timed out — the sign-in popup may have been blocked.')),
          REFRESH_TIMEOUT_MS
        )
      )
      const success = await Promise.race([refreshPromise, timeoutPromise])
      if (success && onRefresh) {
        await onRefresh()
      }
      onClose()
    } catch (error) {
      console.error('Failed to refresh session:', error)
      const code = error?.code
      let msg
      if (code === 'auth/popup-blocked') {
        msg = 'Your browser blocked the sign-in popup. Allow popups for this site and try again, or use Sign Out & Sign In Again below.'
      } else if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        msg = 'Sign-in popup was closed before it finished. Try again, or use Sign Out & Sign In Again below.'
      } else if (error?.message?.includes('Timed out')) {
        msg = 'The sign-in popup didn\'t respond in time. On mobile it may have opened in a hidden tab — try Sign Out & Sign In Again below.'
      } else {
        msg = error?.message || 'Refresh failed. Try Sign Out & Sign In Again below.'
      }
      setErrorMsg(msg)
    } finally {
      setRefreshing(false)
    }
  }

  // Last-resort recovery: blow away the session entirely and force a
  // fresh sign-in. The page reload puts us back at the entry-point
  // sign-in screen with no half-stuck auth state.
  const handleSignOut = async () => {
    setSigningOut(true)
    setErrorMsg(null)
    try {
      await signOut()
    } catch (error) {
      console.error('Sign-out failed:', error)
    } finally {
      // Reload regardless — even if signOut throws, we want the user
      // off this stuck modal and back to a clean state.
      window.location.reload()
    }
  }

  const busy = refreshing || signingOut

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[10000] p-4 modal-backdrop-in"
      style={{ margin: 0 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <div
        className="modal-panel-in relative w-full max-w-md overflow-hidden rounded-xl"
        style={{
          backgroundColor: 'var(--surface-2)',
          border: '1px solid var(--rule-soft)',
          boxShadow: '0 30px 60px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.02) inset'
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-5">
          {/* Eyebrow */}
          <div
            className="text-[10px] font-bold uppercase text-txt-tertiary"
            style={{ letterSpacing: '2.5px' }}
          >
            Authentication
          </div>

          {/* Title */}
          <h2
            className="font-black leading-none mt-1 text-txt-primary"
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: '2rem',
              letterSpacing: '1.5px'
            }}
          >
            {firstTime ? 'Google Sign-In Required' : 'Session Expired'}
          </h2>

          {/* Message */}
          <p className="text-sm text-txt-secondary mt-3 leading-relaxed">
            {firstTime
              ? 'Schedule and roster entry use Google Sheets. Connect your Google account to get started — it only takes a moment.'
              : 'Your Google sign-in has expired. Refresh your session to continue editing.'}
          </p>

          {/* Inline error — surfaces popup-blocked, timeout, etc. so the
              user can act on what actually went wrong instead of staring
              at a spinner. */}
          {errorMsg && (
            <p
              className="text-xs mt-4 leading-relaxed px-3 py-2 rounded-md"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--accent-error, #ef4444) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent-error, #ef4444) 35%, transparent)',
                color: 'var(--accent-error, #ef4444)'
              }}
            >
              {errorMsg}
            </p>
          )}

          {/* Buttons */}
          <div className="flex flex-col gap-2 mt-6">
            <button
              onClick={handleRefresh}
              disabled={busy}
              className="w-full py-3 rounded-lg font-bold uppercase tracking-wider text-xs transition-all hover:opacity-90 active:translate-y-px disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{
                backgroundColor: 'var(--text-primary)',
                color: 'var(--surface-1)',
                letterSpacing: '2px'
              }}
            >
              {refreshing ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Refreshing
                </>
              ) : (
                firstTime ? 'Connect with Google' : 'Refresh Session'
              )}
            </button>

            {/* Recovery escape hatch — appears once a refresh has been
                attempted, so it's only in the way after the easy path
                has already failed. */}
            {errorMsg && (
              <button
                onClick={handleSignOut}
                disabled={busy}
                className="w-full py-3 rounded-lg font-bold uppercase tracking-wider text-xs transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{
                  backgroundColor: 'var(--surface-3)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--surface-5)',
                  letterSpacing: '2px'
                }}
              >
                {signingOut ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Signing Out
                  </>
                ) : (
                  'Sign Out & Sign In Again'
                )}
              </button>
            )}

            <button
              onClick={onClose}
              disabled={busy}
              className="w-full py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-surface-3 border border-surface-4 text-txt-secondary hover:text-txt-primary hover:bg-surface-4 transition-colors disabled:opacity-40"
              style={{ letterSpacing: '2px' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
