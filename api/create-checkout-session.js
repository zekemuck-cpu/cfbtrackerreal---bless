import Stripe from 'stripe';
import { verifyAuth } from './_verifyAuth.js';
import { db } from './_firebaseAdmin.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Resolve (or create) the ONE Stripe customer that belongs to this uid and
 * persist its id on the user doc. Pinning a single customer per uid is what
 * makes the webhook's customer->uid lookup reliable: without it, every
 * checkout minted a fresh customer, so invoice/charge/customer events could
 * resolve to the wrong user or none (audit C3). The customer also carries
 * firebaseUserId in metadata as a second mapping hint.
 */
async function getOrCreateCustomerId(userId, userEmail) {
  const userRef = db.collection('users').doc(userId);
  const stored = (await userRef.get()).data()?.stripeCustomerId || null;

  if (stored) {
    try {
      const existing = await stripe.customers.retrieve(stored);
      if (existing && !existing.deleted) return stored;
    } catch {
      // Stored id no longer resolves in Stripe — fall through and recreate.
    }
  }

  const customer = await stripe.customers.create({
    email: userEmail || undefined,
    metadata: { firebaseUserId: userId },
  });
  await userRef.set({ stripeCustomerId: customer.id }, { merge: true });
  return customer.id;
}

// Statuses that mean "this customer is already paying (or in dunning)" —
// creating ANOTHER checkout for them would double-charge. This is exactly
// what happened during beta: a user whose webhook-driven premium never
// applied kept re-running checkout and was charged three times for three
// parallel subscriptions.
const ALREADY_SUBSCRIBED_STATUSES = new Set(['active', 'trialing', 'past_due']);

// current_period_end moved onto subscription items in recent Stripe API
// versions (basil/clover + stripe SDK v20). Read top-level, fall back to
// the first item. Mirrors subPeriodEndUnix in webhook.js.
const subPeriodEnd = (sub) => {
  const unix = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end ?? null;
  return unix ? new Date(unix * 1000) : null;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify the caller's Firebase ID token. The uid we use to attribute
  // payment ALWAYS comes from the verified token — never from the request
  // body — so an attacker can't make someone else's account premium.
  const decoded = await verifyAuth(req, res);
  if (!decoded) return;
  const userId = decoded.uid;
  const userEmail = decoded.email;

  try {
    // Comped-user guard: an account with an active admin/dev premium grant
    // (_devGranted, no Stripe subscription) must never reach a paid checkout —
    // they'd be charged for something they already have free, and the
    // resulting Stripe subscription would then be ignored by the webhook's
    // dev-grant shield, leaving billing state drifted. The UI hides the
    // upgrade button for them, but guard the API too.
    const userSnap = await db.collection('users').doc(userId).get();
    const userData = userSnap.exists ? userSnap.data() : null;
    if (userData?._devGranted) {
      const endRaw = userData.currentPeriodEnd;
      const endMs = endRaw?.toMillis ? endRaw.toMillis()
        : (endRaw?.seconds ? endRaw.seconds * 1000
          : (endRaw ? new Date(endRaw).getTime() : null));
      if (endMs == null || endMs > Date.now()) {
        console.log(`[checkout] user ${userId} has an active free grant — no checkout created`);
        return res.status(200).json({ alreadySubscribed: true, comped: true });
      }
    }

    const customerId = await getOrCreateCustomerId(userId, userEmail);

    // Double-charge guard + self-heal: if this customer ALREADY has a live
    // subscription, do not open another checkout. Instead sync the
    // subscription's state onto the user doc (the same fields the webhook
    // writes) and tell the client — so an account whose payment went
    // through but whose premium never applied gets FIXED here rather than
    // charged again.
    const existingSubs = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 20,
    });
    const liveSub = existingSubs.data
      .filter((s) => ALREADY_SUBSCRIBED_STATUSES.has(s.status))
      .sort((a, b) => b.created - a.created)[0] || null;

    if (liveSub) {
      await db.collection('users').doc(userId).set({
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
      console.log(`[checkout] user ${userId} already subscribed (${liveSub.id}, ${liveSub.status}) — synced, no new checkout`);
      return res.status(200).json({ alreadySubscribed: true });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      // Pin the checkout to this uid's single Stripe customer.
      customer: customerId,
      // firebaseUserId is what the webhook uses to locate the Firestore doc.
      metadata: {
        firebaseUserId: userId,
      },
      // subscription_data.metadata so the same uid is on the subscription
      // object too — webhook events that don't include the checkout session
      // (e.g. customer.subscription.updated, customer.subscription.deleted)
      // still get a uid hint without relying on a stripeCustomerId lookup.
      subscription_data: {
        metadata: {
          firebaseUserId: userId,
        },
      },
      // {CHECKOUT_SESSION_ID} is filled in by Stripe. The client passes it
      // to /api/confirm-checkout on return, which applies premium directly
      // from Stripe's subscription state — so activation does NOT depend on
      // webhook delivery (the beta failure mode: users paid, the webhook
      // never landed, premium never applied).
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.dynastytracker.app'}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.dynastytracker.app'}/?payment=canceled`,
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    // Log details server-side; return a generic message (audit M6).
    console.error('Error creating checkout session:', error);
    return res.status(500).json({ error: 'Unable to start checkout. Please try again.' });
  }
}
