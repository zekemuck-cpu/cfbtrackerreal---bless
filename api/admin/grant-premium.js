import { db, FieldValue } from '../_firebaseAdmin.js';
import { verifyAdmin } from '../_verifyAuth.js';

/**
 * Admin-only: grant or revoke a 30-day developer premium pass on the caller's
 * own user doc. Gated to the email allowlist in _verifyAuth.js so a
 * compromised non-admin token can't escalate.
 *
 * Body: { action: 'grant' | 'revoke' }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const decoded = await verifyAdmin(req, res);
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
