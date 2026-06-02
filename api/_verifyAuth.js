import { adminAuth } from './_firebaseAdmin.js';

/**
 * Verify a Firebase ID token from the Authorization header.
 * Returns the decoded token (uid, email, etc.) on success.
 * Sends a 401 response and returns null on failure — caller should `return`
 * immediately when this returns null.
 *
 * Usage:
 *   const decoded = await verifyAuth(req, res);
 *   if (!decoded) return;
 *   const uid = decoded.uid;
 */
export async function verifyAuth(req, res) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return null;
  }
  const idToken = match[1];

  try {
    const decoded = await adminAuth().verifyIdToken(idToken);
    return decoded;
  } catch (err) {
    console.error('[verifyAuth] Token verification failed:', err.message);
    res.status(401).json({ error: 'Invalid or expired auth token' });
    return null;
  }
}

// The Google account(s) permitted to call admin-only endpoints (e.g.
// orphan recovery, anything destructive). Hard-coded here (not env) so
// it's auditable in source. Token email comes from Firebase, not the
// request body, so this can't be spoofed.
export const ADMIN_EMAILS = new Set(['alex.guess1999@gmail.com']);

// Emails permitted to self-grant a free 30-day premium pass. Used while
// the app is in beta and Stripe checkout is disabled — users email the
// dev, the dev adds them here, they self-grant from the Account page.
// Includes ADMIN_EMAILS implicitly (admins can do everything beta can).
// Keep alphabetised for easy auditing when the list grows.
export const BETA_GRANT_EMAILS = new Set([
  'alabamaprince@gmail.com',
  'skater1932@gmail.com',
  'zekemuck@gmail.com',
  'couchcoach16@gmail.com',
  'paul.540909@gmail.com',
]);

/**
 * Verify auth AND that the verified email is on the admin allowlist.
 * Sends 401/403 on failure and returns null.
 */
export async function verifyAdmin(req, res) {
  const decoded = await verifyAuth(req, res);
  if (!decoded) return null;
  if (!decoded.email || !ADMIN_EMAILS.has(decoded.email.toLowerCase())) {
    res.status(403).json({ error: 'Admin access required' });
    return null;
  }
  return decoded;
}

/**
 * Verify auth AND that the verified email is allowed to self-grant a
 * beta premium pass. Admins are implicitly allowed.
 * Sends 401/403 on failure and returns null.
 */
export async function verifyBetaGrant(req, res) {
  const decoded = await verifyAuth(req, res);
  if (!decoded) return null;
  const email = decoded.email?.toLowerCase();
  if (!email || (!BETA_GRANT_EMAILS.has(email) && !ADMIN_EMAILS.has(email))) {
    res.status(403).json({ error: 'Beta access required. Email the dev to be added to the allowlist.' });
    return null;
  }
  return decoded;
}
