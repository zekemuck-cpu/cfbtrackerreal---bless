import Stripe from 'stripe';
import { db } from './_firebaseAdmin.js';
import { verifyAuth } from './_verifyAuth.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // The portal session lets the user view payment methods and cancel.
  // Without auth, anyone who knew another user's uid could open their
  // billing portal. We use the verified uid only.
  const decoded = await verifyAuth(req, res);
  if (!decoded) return;
  const userId = decoded.uid;

  try {
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userDoc.data();
    const customerId = userData.stripeCustomerId;

    if (!customerId) {
      return res.status(400).json({ error: 'User has no subscription' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://dynastytracker.vercel.app'}/`,
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Error creating portal session:', error);
    return res.status(500).json({ error: error.message });
  }
}
