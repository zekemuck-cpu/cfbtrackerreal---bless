import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, userEmail } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      // Pass Firebase userId in metadata so we can link payment to user
      metadata: {
        firebaseUserId: userId,
      },
      customer_email: userEmail || undefined,
      // Where to redirect after payment
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://dynastytracker.vercel.app'}/?payment=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://dynastytracker.vercel.app'}/?payment=canceled`,
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return res.status(500).json({ error: error.message });
  }
}
