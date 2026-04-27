import Stripe from 'stripe';
import { db, FieldValue } from './_firebaseAdmin.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Stripe sends raw body; signature verification needs it un-parsed.
export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// Subscription statuses we treat as actively paid. Includes past_due so a
// single transient card decline doesn't immediately demote a user mid-
// dunning. The client-side check applies its own grace window on top.
const PAID_STATUSES = new Set(['active', 'trialing', 'past_due']);

const tierFromStatus = (status) => (PAID_STATUSES.has(status) ? 'premium' : 'free');

const tsFromUnix = (unix) => (unix ? new Date(unix * 1000) : null);

/**
 * Find the user doc to update for a given Stripe event. Tries (in order):
 *   1. metadata.firebaseUserId on the subscription / object (set at
 *      checkout time so it's available before the customer is linked)
 *   2. stripeCustomerId field on the users collection
 *
 * Returns null if no match.
 */
async function findUserRefForCustomer({ customerId, metadataUid }) {
  if (metadataUid) {
    const ref = db.collection('users').doc(metadataUid);
    return ref;
  }
  if (customerId) {
    const snap = await db.collection('users')
      .where('stripeCustomerId', '==', customerId)
      .limit(1)
      .get();
    if (!snap.empty) return snap.docs[0].ref;
  }
  return null;
}

/**
 * Append a record to the audit log so we can debug delivery issues
 * without re-reading Stripe. Best-effort — do not fail the webhook over
 * a log write.
 */
async function logEvent(event, status, extra = {}) {
  try {
    await db.collection('webhookEvents').doc(event.id).set({
      type: event.type,
      created: tsFromUnix(event.created),
      receivedAt: FieldValue.serverTimestamp(),
      status,
      livemode: event.livemode || false,
      ...extra,
    }, { merge: true });
  } catch (e) {
    console.warn('[Webhook] log write failed:', e.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let event;
  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('[Webhook] signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  console.log(`[Webhook] received ${event.type} id=${event.id}`);

  // Idempotency: Stripe redelivers events on transient errors and may
  // deliver them out of order. Track by event.id; skip if we've already
  // succeeded once. Use a transaction so concurrent deliveries don't
  // double-process.
  const eventRef = db.collection('webhookEvents').doc(event.id);
  let alreadyProcessed = false;
  try {
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(eventRef);
      if (existing.exists && existing.data()?.status === 'processed') {
        alreadyProcessed = true;
        return;
      }
      tx.set(eventRef, {
        type: event.type,
        created: tsFromUnix(event.created),
        receivedAt: FieldValue.serverTimestamp(),
        status: 'processing',
        livemode: event.livemode || false,
      }, { merge: true });
    });
  } catch (e) {
    console.warn('[Webhook] idempotency tx failed (continuing):', e.message);
  }
  if (alreadyProcessed) {
    console.log(`[Webhook] duplicate event ${event.id}, skipping`);
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {

      // ─── Subscription lifecycle ─────────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object;
        const firebaseUserId = session.metadata?.firebaseUserId;
        const customerId = session.customer;
        const subscriptionId = session.subscription;

        if (!firebaseUserId) {
          console.warn('[Webhook] checkout.session.completed without firebaseUserId metadata');
          await logEvent(event, 'skipped_no_uid');
          break;
        }

        // Pull subscription detail to populate accurate fields.
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);

        await db.collection('users').doc(firebaseUserId).set({
          tier: tierFromStatus(subscription.status),
          stripeCustomerId: customerId,
          subscriptionId,
          subscriptionStatus: subscription.status,
          currentPeriodEnd: tsFromUnix(subscription.current_period_end),
          cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
          cancelAt: tsFromUnix(subscription.cancel_at),
          pendingDowngrade: false, // re-subscribed
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        console.log(`[Webhook] user ${firebaseUserId} → premium`);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const metadataUid = subscription.metadata?.firebaseUserId;

        const userRef = await findUserRefForCustomer({ customerId, metadataUid });
        if (!userRef) {
          console.warn(`[Webhook] ${event.type}: no matching user for customer ${customerId}`);
          await logEvent(event, 'skipped_no_user');
          break;
        }

        // Out-of-order protection: ignore an event older than the last
        // we processed for this user. Prevents a stale "active" event
        // arriving after a "deleted" event from re-promoting the user.
        const userSnap = await userRef.get();
        const userData = userSnap.data() || {};
        const lastProcessed = userData.lastStripeEventCreated;
        const lastProcessedMs = lastProcessed?.toMillis ? lastProcessed.toMillis() : (lastProcessed?._seconds * 1000);
        if (lastProcessedMs && lastProcessedMs > event.created * 1000) {
          console.log(`[Webhook] ${event.type} older than last processed; skipping`);
          await logEvent(event, 'skipped_stale');
          break;
        }

        // Don't clobber a manual beta/dev grant. While Stripe checkout
        // is disabled (beta phase), users with _devGranted: true got
        // their premium from the self-grant flow, NOT from this Stripe
        // subscription. If we're cleaning up an old paid sub for a
        // user who has since moved to a beta grant, the Stripe webhook
        // would otherwise overwrite their tier back to whatever Stripe
        // reports.
        if (userData._devGranted) {
          console.log(`[Webhook] ${event.type}: user ${userRef.id} has _devGranted, skipping Stripe state write`);
          await logEvent(event, 'skipped_dev_granted');
          break;
        }

        await userRef.set({
          tier: tierFromStatus(subscription.status),
          stripeCustomerId: customerId,
          subscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
          currentPeriodEnd: tsFromUnix(subscription.current_period_end),
          cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
          cancelAt: tsFromUnix(subscription.cancel_at),
          // Clear pendingDowngrade if user is back to paid; set it if not.
          pendingDowngrade: !PAID_STATUSES.has(subscription.status),
          lastStripeEventCreated: tsFromUnix(event.created),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        console.log(`[Webhook] ${event.type}: user ${userRef.id} status=${subscription.status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const metadataUid = subscription.metadata?.firebaseUserId;

        const userRef = await findUserRefForCustomer({ customerId, metadataUid });
        if (!userRef) {
          console.warn(`[Webhook] subscription.deleted: no matching user for customer ${customerId}`);
          await logEvent(event, 'skipped_no_user');
          break;
        }

        // Same _devGranted guard as the .updated path: don't downgrade
        // a user who has moved to a beta grant. Their premium source is
        // no longer this Stripe sub.
        const userSnap = await userRef.get();
        const userData = userSnap.data() || {};
        if (userData._devGranted) {
          console.log(`[Webhook] subscription.deleted: user ${userRef.id} has _devGranted, skipping downgrade`);
          await logEvent(event, 'skipped_dev_granted');
          break;
        }

        await userRef.set({
          tier: 'free',
          subscriptionStatus: 'canceled',
          cancelAtPeriodEnd: false,
          cancelAt: null,
          // Flag so the client can auto-export cloud dynasties to local
          // storage on next login.
          pendingDowngrade: true,
          lastStripeEventCreated: tsFromUnix(event.created),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        console.log(`[Webhook] subscription canceled: user ${userRef.id}`);
        break;
      }

      // ─── Payment health ──────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const userRef = await findUserRefForCustomer({ customerId });
        if (!userRef) { await logEvent(event, 'skipped_no_user'); break; }

        await userRef.set({
          subscriptionStatus: 'past_due',
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        console.log(`[Webhook] payment failed: user ${userRef.id}`);
        break;
      }

      case 'invoice.payment_succeeded': {
        // Re-confirm premium status after a successful payment, in case
        // we drifted (e.g. a past_due that recovered).
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const subscriptionId = invoice.subscription;
        if (!subscriptionId) break;

        const userRef = await findUserRefForCustomer({ customerId });
        if (!userRef) { await logEvent(event, 'skipped_no_user'); break; }

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await userRef.set({
          tier: tierFromStatus(subscription.status),
          subscriptionStatus: subscription.status,
          currentPeriodEnd: tsFromUnix(subscription.current_period_end),
          pendingDowngrade: false,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        console.log(`[Webhook] payment succeeded: user ${userRef.id} status=${subscription.status}`);
        break;
      }

      // ─── Refunds & disputes ─────────────────────────────────────────
      case 'charge.refunded': {
        // Full refund → revoke premium immediately. Partial refund → log
        // and leave subscription alone (Stripe doesn't auto-cancel on
        // partial refunds).
        const charge = event.data.object;
        const customerId = charge.customer;
        const fullRefund = charge.amount_refunded === charge.amount;

        const userRef = await findUserRefForCustomer({ customerId });
        if (!userRef) { await logEvent(event, 'skipped_no_user'); break; }

        // Don't clobber a beta self-grant when refunding a (separate)
        // old Stripe charge.
        const userSnap = await userRef.get();
        if (userSnap.data()?._devGranted) {
          console.log(`[Webhook] charge.refunded: user ${userRef.id} has _devGranted, skipping`);
          await logEvent(event, 'skipped_dev_granted');
          break;
        }

        if (fullRefund) {
          await userRef.set({
            tier: 'free',
            subscriptionStatus: 'refunded',
            pendingDowngrade: true,
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          console.log(`[Webhook] full refund: user ${userRef.id} → free`);
        } else {
          console.log(`[Webhook] partial refund: user ${userRef.id}, no tier change`);
        }
        break;
      }

      case 'charge.dispute.created': {
        // A dispute (chargeback) is destructive — the bank has reversed
        // funds. Treat like a refund: revoke premium and flag for
        // migration. Stripe will fire customer.subscription.deleted
        // separately if Stripe Radar auto-cancels.
        const dispute = event.data.object;
        const charge = await stripe.charges.retrieve(dispute.charge);
        const customerId = charge.customer;

        const userRef = await findUserRefForCustomer({ customerId });
        if (!userRef) { await logEvent(event, 'skipped_no_user'); break; }

        // Disputes from a stranger shouldn't reach a beta-granted user
        // either — defensive consistency with the refund path.
        const userSnap = await userRef.get();
        if (userSnap.data()?._devGranted) {
          console.log(`[Webhook] dispute.created: user ${userRef.id} has _devGranted, skipping`);
          await logEvent(event, 'skipped_dev_granted');
          break;
        }

        await userRef.set({
          tier: 'free',
          subscriptionStatus: 'disputed',
          pendingDowngrade: true,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        console.log(`[Webhook] dispute opened: user ${userRef.id} → free`);
        break;
      }

      // ─── Customer cleanup ───────────────────────────────────────────
      case 'customer.deleted': {
        const customer = event.data.object;
        const userRef = await findUserRefForCustomer({ customerId: customer.id });
        if (!userRef) { await logEvent(event, 'skipped_no_user'); break; }

        await userRef.set({
          tier: 'free',
          subscriptionStatus: 'canceled',
          stripeCustomerId: null,
          subscriptionId: null,
          cancelAtPeriodEnd: false,
          cancelAt: null,
          pendingDowngrade: true,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        console.log(`[Webhook] stripe customer deleted: user ${userRef.id}`);
        break;
      }

      default:
        console.log(`[Webhook] unhandled event type: ${event.type}`);
        await logEvent(event, 'unhandled');
        return res.status(200).json({ received: true, unhandled: true });
    }

    await logEvent(event, 'processed');
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[Webhook] handler error:', error.message, error.stack);
    await logEvent(event, 'error', { error: error.message });
    return res.status(500).json({ error: 'Webhook handler failed', message: error.message });
  }
}
