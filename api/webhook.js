import Stripe from 'stripe';
import { db } from './_firebaseAdmin.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Disable body parsing - we need the raw body for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper to get raw body
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let event;

  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers['stripe-signature'];

    // Verify webhook signature
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  console.log(`[Webhook] Received event: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const firebaseUserId = session.metadata?.firebaseUserId;
        const customerId = session.customer;
        const subscriptionId = session.subscription;

        console.log(`[Webhook] checkout.session.completed - userId: ${firebaseUserId}, customer: ${customerId}, subscription: ${subscriptionId}`);

        if (firebaseUserId) {
          console.log(`[Webhook] Retrieving subscription details...`);

          // Get subscription details
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          console.log(`[Webhook] Subscription status: ${subscription.status}`);

          console.log(`[Webhook] Updating Firestore for user ${firebaseUserId}...`);

          // Update user in Firestore
          await db.collection('users').doc(firebaseUserId).set({
            tier: 'premium',
            stripeCustomerId: customerId,
            subscriptionId: subscriptionId,
            subscriptionStatus: subscription.status,
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            updatedAt: new Date(),
          }, { merge: true });

          console.log(`[Webhook] Successfully updated user ${firebaseUserId} to premium`);
        } else {
          console.log(`[Webhook] WARNING: No firebaseUserId in session metadata`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        // Find user by Stripe customer ID
        const usersSnapshot = await db.collection('users')
          .where('stripeCustomerId', '==', customerId)
          .limit(1)
          .get();

        if (!usersSnapshot.empty) {
          const userDoc = usersSnapshot.docs[0];
          const isPremium = ['active', 'trialing'].includes(subscription.status);

          await userDoc.ref.update({
            tier: isPremium ? 'premium' : 'free',
            subscriptionStatus: subscription.status,
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            updatedAt: new Date(),
          });

          console.log(`[Webhook] Updated subscription for user ${userDoc.id}: ${subscription.status}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        // Find user by Stripe customer ID
        const usersSnapshot = await db.collection('users')
          .where('stripeCustomerId', '==', customerId)
          .limit(1)
          .get();

        if (!usersSnapshot.empty) {
          const userDoc = usersSnapshot.docs[0];

          await userDoc.ref.update({
            tier: 'free',
            subscriptionStatus: 'canceled',
            updatedAt: new Date(),
          });

          console.log(`[Webhook] Subscription canceled for user ${userDoc.id}`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        // Find user by Stripe customer ID
        const usersSnapshot = await db.collection('users')
          .where('stripeCustomerId', '==', customerId)
          .limit(1)
          .get();

        if (!usersSnapshot.empty) {
          const userDoc = usersSnapshot.docs[0];

          await userDoc.ref.update({
            subscriptionStatus: 'past_due',
            updatedAt: new Date(),
          });

          console.log(`[Webhook] Payment failed for user ${userDoc.id}`);
        }
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[Webhook] Error processing event:', error.message);
    console.error('[Webhook] Error stack:', error.stack);
    return res.status(500).json({ error: 'Webhook handler failed', message: error.message });
  }
}
