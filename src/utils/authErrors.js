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
 * Thrown when Google rejects a Sheets/Drive call for a NON-auth quota
 * reason — HTTP 429, or a 403 whose reason is rateLimitExceeded /
 * userRateLimitExceeded / quotaExceeded / storageQuotaExceeded.
 *
 * This is distinct from OAuthError on purpose: re-authenticating does
 * NOT fix a rate limit, so these must never route through the reauth
 * modal (which is why `isAuthError` stays false here). The common cause
 * is creating several sheets in quick succession — each sheet is a
 * handful of write calls and Google caps writes at ~60/user/minute.
 *
 * `retriable` is false for storageQuotaExceeded (a full Drive — waiting
 * won't help) and true for the transient per-minute rate limits.
 */
export class RateLimitError extends Error {
  constructor(message = 'Google is temporarily rate-limiting requests.', { retriable = true, cause } = {}) {
    super(message)
    this.name = 'RateLimitError'
    this.isRateLimitError = true
    this.retriable = retriable
    if (cause) this.cause = cause
  }
}

/** True when `error` is a Google rate-limit / quota rejection (429 or 403 quota). */
export function isRateLimitError(error) {
  if (!error) return false
  if (error.isRateLimitError === true) return true
  if (error instanceof RateLimitError) return true
  const msg = String(error.message || '').toLowerCase()
  if (!msg) return false
  return msg.includes('429')
      || msg.includes('rate limit')
      || msg.includes('ratelimitexceeded')
      || msg.includes('user rate limit')
      || msg.includes('quota exceeded')
      || msg.includes('quotaexceeded')
      || msg.includes('resource_exhausted')
}

/**
 * Map a sheet-operation error to a user-facing toast string. Used by the
 * sheet modals in their catch blocks AFTER `handleError` has already
 * routed genuine auth errors to the reauth modal — so this path must
 * NEVER tell the user to "refresh your session" (that advice is wrong
 * for a rate limit or a Drive-full error and was the dead end Skyler hit).
 *
 * `action` is the verb phrase for the fallback, e.g. 'create the sheet'.
 */
export function describeSheetError(error, action = 'create the sheet') {
  if (isRateLimitError(error)) {
    if (error?.retriable === false) {
      return 'Your Google Drive is full. Empty its trash or free up space, then try again.'
    }
    return 'Google is rate-limiting new sheets right now. Wait about a minute, then try again.'
  }
  const detail = String(error?.message || '').trim()
  // Opaque network errors ("Failed to fetch", "Load failed", "NetworkError")
  // carry no useful reason — give a connection nudge instead.
  if (!detail || /^(failed to fetch|networkerror|load failed)/i.test(detail)) {
    return `Could not ${action}. Check your connection and try again.`
  }
  // A request that aborted on our 30s timeout already carries a friendly
  // "...timed out... Try again." message — surface it verbatim.
  if (/timed out/i.test(detail)) return detail
  // The service throws "Failed to create sheet: <google reason>" etc. —
  // that already reads as a complete sentence, so show it as-is rather
  // than double-prefixing it with "Could not create the sheet:".
  if (/^failed to \w+/i.test(detail)) return detail.replace(/\.*$/, '.')
  // Surface any other real reason so a non-rate-limit failure is never a
  // dead end (e.g. a malformed-roster prefill bug shows its real message).
  return `Could not ${action}: ${detail}`
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
      // Google 403 "insufficient scopes" — the token is valid but was minted
      // WITHOUT the Sheets/Drive scope (e.g. the user granted access before the
      // scope was added). Re-authenticating re-mints a token WITH the scope, so
      // route it through the reauth flow instead of a dead-end "Failed to create
      // sheet" error that forces a manual sign-out/in.
      || msg.includes('insufficient authentication scopes')
      || msg.includes('insufficient permission')
      || msg.includes('access_token_scope_insufficient')
}
