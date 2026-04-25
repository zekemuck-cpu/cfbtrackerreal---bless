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

// The single Google account permitted to call admin endpoints. Hard-coded
// here (not env) so it's auditable in source. Token email comes from
// Firebase, not the request body, so this can't be spoofed.
export const ADMIN_EMAILS = new Set(['alex.guess1999@gmail.com']);

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
