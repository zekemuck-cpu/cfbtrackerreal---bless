import { db, FieldValue } from '../../_firebaseAdmin.js';
import { verifyBetaGrant } from '../../_verifyAuth.js';

/**
 * Self-grant or revoke a premium pass on the CALLER's own user doc.
 * Gated to BETA_GRANT_EMAILS (and admins, who are a superset) in
 * _verifyAuth.js, so a random user can't escalate themselves. Only the
 * verified token's uid is written — never anything from the request
 * body — so an attacker can't grant someone else premium either.
 *
 * Post-beta: the allowlist is down to the LIFETIME_FREE_EMAILS accounts,
 * whose grants run ~100 years (grant once, never again). Everyone else
 * pays via Stripe. Any remaining beta 30-day grants simply expire.
 *
 * Body: { action: 'grant' | 'revoke' }
 */

// Accounts that are never charged — the owner and permanent comps. Grants
// for these run ~100 years. Keep lowercase.
const LIFETIME_FREE_EMAILS = new Set([
  'alex.guess1999@gmail.com',
  'zekemuck@gmail.com',
]);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const decoded = await verifyBetaGrant(req, res);
  if (!decoded) return;

  const { action } = req.body || {};
  if (action !== 'grant' && action !== 'revoke') {
    return res.status(400).json({ error: 'action must be "grant" or "revoke"' });
  }

  try {
    const userRef = db.collection('users').doc(decoded.uid);

    if (action === 'grant') {
      const isLifetime = LIFETIME_FREE_EMAILS.has((decoded.email || '').toLowerCase());
      const expiresAt = new Date();
      if (isLifetime) {
        expiresAt.setFullYear(expiresAt.getFullYear() + 100);
      } else {
        expiresAt.setDate(expiresAt.getDate() + 30);
      }

      await userRef.set({
        tier: 'premium',
        subscriptionStatus: 'active',
        currentPeriodEnd: expiresAt,
        _devGranted: true,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      return res.status(200).json({ ok: true, action: 'granted', lifetime: isLifetime, expiresAt });
    }

    // revoke
    await userRef.set({
      tier: 'free',
      subscriptionStatus: null,
      currentPeriodEnd: null,
      _devGranted: false,
      pendingDowngrade: true,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return res.status(200).json({ ok: true, action: 'revoked' });
  } catch (err) {
    // Log details server-side, return a generic message (audit M6).
    console.error('[admin/grant-premium] failed:', err);
    return res.status(500).json({ error: 'Grant failed — check server logs.' });
  }
}
