import Stripe from 'stripe';
import { verifyAuth } from './_verifyAuth.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
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
      customer_email: userEmail || undefined,
      // Pass the uid through to the success URL so the client can poll for
      // the webhook-applied premium status on return.
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://dynastytracker.app'}/?payment=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://dynastytracker.app'}/?payment=canceled`,
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return res.status(500).json({ error: error.message });
  }
}
