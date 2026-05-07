// Centralized auth-error classification for the Google Sheets +
// Google Drive flows. Replaces a sprawling pile of
// `error.message?.includes('OAuth') || error.message?.includes('access token')`
// substring checks that lived in ~70 catch blocks across ~29 modals,
// each with subtle drift (some also looked for 'expired', some for
// 'authentication', some for 'token'). One typo in the thrown
// message would have silently broken every one of them.
//
// New code throws `OAuthError`. Old code (and any third-party error
// shape we haven't migrated) is still classified correctly via
// substring fallback in `isAuthError`.

/**
 * Thrown when an OAuth access token is missing, expired, or rejected
 * by Google. Carries an `isAuthError = true` marker so consumers can
 * test it without `instanceof` (which doesn't survive bundler chunk
 * boundaries reliably).
 *
 * Optional `cause` follows the standard Error options API so the
 * underlying network/Firestore error stays attached for logging.
 */
export class OAuthError extends Error {
  constructor(message = 'OAuth access token not found or expired', { cause } = {}) {
    super(message)
    this.name = 'OAuthError'
    this.isAuthError = true
    if (cause) this.cause = cause
  }
}

/**
 * True when the given error represents an expired/invalid Google
 * OAuth session. The hook + every modal-side catch block routes
 * through this — never re-implement the substring matching inline.
 *
 * Order of checks:
 *   1. Typed marker (`error.isAuthError === true`) — the path new code
 *      should take.
 *   2. `instanceof OAuthError` — for completeness, even though the
 *      marker covers the common case.
 *   3. Legacy substring matching — covers errors thrown by code we
 *      haven't migrated yet, plus Firestore / Google API errors that
 *      surface "401", "unauthenticated", "invalid_token", etc.
 */
export function isAuthError(error) {
  if (!error) return false
  if (error.isAuthError === true) return true
  if (error instanceof OAuthError) return true

  const code = String(error.code || '').toLowerCase()
  if (code === 'unauthenticated' || code === 'permission-denied' && /token|auth/.test(String(error.message || ''))) {
    // permission-denied is overloaded — only treat it as auth when the
    // message names a token/auth issue. A Firestore rules rejection
    // should NOT route through the auth-error UI.
    return true
  }

  const msg = String(error.message || '').toLowerCase()
  if (!msg) return false

  return msg.includes('oauth')
      || msg.includes('access token')
      || msg.includes('access_token')
      || msg.includes('unauthenticated')
      || msg.includes('invalid_token')
      || msg.includes('invalid grant')
      || (msg.includes('token') && (msg.includes('expired') || msg.includes('invalid')))
      || msg.includes('401')
      || msg.includes('user not authenticated')
}
