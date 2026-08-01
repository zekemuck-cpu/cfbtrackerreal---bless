import Stripe from 'stripe';
import { verifyAuth } from './_verifyAuth.js';
import { db } from './_firebaseAdmin.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Statuses that count as a live, premium-granting subscription. Mirrors
// PAID_STATUSES in webhook.js.
const PAID_STATUSES = new Set(['active', 'trialing', 'past_due']);

// current_period_end moved onto subscription items in recent Stripe API
// versions (basil/clover + stripe SDK v20). Read top-level, fall back to
// the first item. Mirrors subPeriodEndUnix in webhook.js.
const subPeriodEnd = (sub) => {
  const unix = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end ?? null;
  return unix ? new Date(unix * 1000) : null;
};

/**
 * POST /api/confirm-checkout  { sessionId?: string }
 *
 * Called by the client when the user returns from Stripe checkout
 * (?payment=success&session_id=...). Verifies the caller's Firebase token,
 * confirms the checkout/subscription state DIRECTLY with Stripe, and writes
 * the same premium fields the webhook writes.
 *
 * Why this exists: during beta, users paid and never received premium
 * because activation depended entirely on webhook delivery. This endpoint
 * makes the success-return path self-sufficient — if the webhook also
 * lands, the writes are identical and idempotent.
 *
 * Security: uid comes from the verified token only. When a sessionId is
 * supplied, the session's metadata.firebaseUserId must match the caller —
 * you cannot confirm someone else's checkout onto your account. Without a
 * sessionId we fall back to the caller's own stored stripeCustomerId, so
 * there is nothing to spoof.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const decoded = await verifyAuth(req, res);
  if (!decoded) return;
  const userId = decoded.uid;

  const { sessionId } = req.body || {};

  try {
    const userRef = db.collection('users').doc(userId);
    let customerId = (await userRef.get()).data()?.stripeCustomerId || null;

    // Prefer the checkout session: it works even if the stripeCustomerId
    // write at checkout-creation time failed, and it pins the confirmation
    // to a checkout this exact user initiated.
    if (sessionId && typeof sessionId === 'string') {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.metadata?.firebaseUserId !== userId) {
        return res.status(403).json({ error: 'This checkout does not belong to your account.' });
      }
      customerId = session.customer || customerId;
    }

    if (!customerId) {
      return res.status(404).json({ error: 'No Stripe customer on this account.' });
    }

    // Read live subscription state from Stripe and pick the newest paid one.
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 20,
    });
    const liveSub = subs.data
      .filter((s) => PAID_STATUSES.has(s.status))
      .sort((a, b) => b.created - a.created)[0] || null;

    if (!liveSub) {
      // Paid checkout with no subscription yet is a transient state (or the
      // payment actually failed / was for something else). Tell the client
      // to retry shortly rather than writing anything.
      return res.status(202).json({ pending: true });
    }

    await userRef.set({
      tier: 'premium',
      stripeCustomerId: customerId,
      subscriptionId: liveSub.id,
      subscriptionStatus: liveSub.status,
      currentPeriodEnd: subPeriodEnd(liveSub),
      cancelAtPeriodEnd: liveSub.cancel_at_period_end || false,
      cancelAt: liveSub.cancel_at ? new Date(liveSub.cancel_at * 1000) : null,
      pendingDowngrade: false,
      updatedAt: new Date(),
    }, { merge: true });

    console.log(`[confirm-checkout] user ${userId} → premium (${liveSub.id}, ${liveSub.status})`);
    return res.status(200).json({ ok: true, status: liveSub.status });
  } catch (error) {
    console.error('[confirm-checkout] failed:', error);
    return res.status(500).json({ error: 'Could not confirm your subscription. Please try again.' });
  }
}
