import { db, FieldValue } from '../_firebaseAdmin.js';
import { verifyBetaGrant } from '../_verifyAuth.js';

/**
 * Self-grant or revoke a 30-day premium pass on the CALLER's own user
 * doc. Gated to BETA_GRANT_EMAILS (and admins, who are a superset) in
 * _verifyAuth.js, so a random user can't escalate themselves. Only the
 * verified token's uid is written — never anything from the request
 * body — so an attacker can't grant someone else premium either.
 *
 * Body: { action: 'grant' | 'revoke' }
 */
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
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      await userRef.set({
        tier: 'premium',
        subscriptionStatus: 'active',
        currentPeriodEnd: thirtyDaysFromNow,
        _devGranted: true,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      return res.status(200).json({ ok: true, action: 'granted', expiresAt: thirtyDaysFromNow });
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
    console.error('[admin/grant-premium] failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
