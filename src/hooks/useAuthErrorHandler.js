import { useState, useCallback } from 'react'
import { isAuthError } from '../utils/authErrors'

/**
 * Standard auth-error machinery for sheet-driven modals. Replaces the
 * `[showAuthError, setShowAuthError, retryCount, setRetryCount]` quad
 * + the catch-block string-match boilerplate that was scattered across
 * 29 modals and 70+ catch blocks. Subtle drift between copies (some
 * matched extra strings, one had retry-loop protection, one didn't
 * pass `onRefresh` to AuthErrorModal) was already causing real bugs.
 *
 * Usage in a modal:
 *
 *   const auth = useAuthErrorHandler()
 *
 *   try { await readSheet() }
 *   catch (err) {
 *     if (!auth.handleError(err)) toast.error('Sync failed')
 *   }
 *
 *   <AuthErrorModal
 *     isOpen={auth.showAuthError}
 *     onClose={auth.closeAuthError}
 *     onRefresh={auth.retry}
 *   />
 *
 *   // For useEffect-driven sheet creation, depend on auth.retryCount:
 *   useEffect(() => { ... }, [auth.retryCount, ...])
 *
 * Returns:
 *   showAuthError    — boolean; whether the AuthErrorModal should be open
 *   closeAuthError() — closes the modal
 *   retry()          — bumps retryCount; pass as `onRefresh` so a
 *                      successful re-auth re-runs the failed effect
 *   retryCount       — depend on this in retry-able effects
 *   handleError(err) — opens the modal if `err` is auth-related,
 *                      returns true if it was. Caller decides what to
 *                      do with non-auth errors (typically toast).
 */
export function useAuthErrorHandler() {
  const [showAuthError, setShowAuthError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  const closeAuthError = useCallback(() => setShowAuthError(false), [])
  const retry = useCallback(() => setRetryCount(c => c + 1), [])

  const handleError = useCallback((err) => {
    if (isAuthError(err)) {
      setShowAuthError(true)
      return true
    }
    return false
  }, [])

  return {
    showAuthError,
    closeAuthError,
    retry,
    retryCount,
    handleError,
    // Direct setters for the rare modal that needs to force-open or
    // suppress the dialog outside the handleError flow.
    setShowAuthError,
    setRetryCount,
  }
}
