import Stripe from 'stripe';
import { db, adminAuth } from '../_firebaseAdmin.js';
import { verifyAuth } from '../_verifyAuth.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Permanently delete the caller's account.
 *
 * Steps (in order, with each step's failure NOT blocking the next when safe):
 *   1. Cancel the active Stripe subscription, if any
 *   2. Delete the user's Firestore data (user doc + all dynasties + their
 *      subcollections)
 *   3. Delete the Firebase Auth account
 *
 * The order matters: Stripe first (so a user can't be billed for a
 * deleted account), Firestore second (so we don't leave orphans), Auth
 * last (so token verification still works through the earlier steps).
 *
 * Body: optional { confirmEmail: '<email matching auth>' } as an extra
 * gate — we won't proceed unless the body's confirmEmail matches the
 * verified token's email. Defends against accidental double-clicks/CSRF.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const decoded = await verifyAuth(req, res);
  if (!decoded) return;
  const userId = decoded.uid;
  const userEmail = (decoded.email || '').toLowerCase();

  const { confirmEmail } = req.body || {};
  if (!confirmEmail || String(confirmEmail).toLowerCase() !== userEmail) {
    return res.status(400).json({
      error: 'confirmEmail does not match the authenticated email',
    });
  }

  const result = { stripe: 'skipped', firestore: 'skipped', auth: 'skipped', errors: [] };

  // 1. Cancel Stripe subscription if present
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.exists ? userDoc.data() : null;
    const subscriptionId = userData?.subscriptionId;
    const customerId = userData?.stripeCustomerId;

    if (subscriptionId) {
      try {
        await stripe.subscriptions.cancel(subscriptionId);
        result.stripe = 'subscription_canceled';
      } catch (e) {
        // Already canceled / not found is fine. Other errors we log and
        // continue — Stripe state we can't sync to here gets handled by
        // the customer.subscription.deleted webhook arriving later.
        console.warn('[account/delete] stripe.subscriptions.cancel:', e.message);
        result.stripe = 'cancel_failed_continuing';
        result.errors.push(`stripe: ${e.message}`);
      }
    } else if (customerId) {
      result.stripe = 'no_subscription_only_customer';
    } else {
      result.stripe = 'no_stripe_link';
    }
  } catch (e) {
    console.warn('[account/delete] could not read user doc for stripe step:', e.message);
    result.errors.push(`firestore_read_for_stripe: ${e.message}`);
  }

  // 2. Delete Firestore data — user doc and all dynasties owned by them
  //    (with their subcollections). This is best-effort; orphans are far
  //    less harmful than a half-deleted account.
  try {
    // Delete dynasties owned by this user
    const dynastiesSnap = await db.collection('dynasties').where('userId', '==', userId).get();
    let dynastiesDeleted = 0;
    for (const dynastyDoc of dynastiesSnap.docs) {
      // Delete known subcollections first
      for (const sub of ['players', 'games']) {
        const subSnap = await dynastyDoc.ref.collection(sub).get();
        if (subSnap.empty) continue;
        // Batch in chunks of 400 to stay under Firestore's 500-op limit.
        for (let i = 0; i < subSnap.docs.length; i += 400) {
          const batch = db.batch();
          subSnap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      }
      await dynastyDoc.ref.delete();
      dynastiesDeleted++;
    }

    // Delete user doc
    await db.collection('users').doc(userId).delete();

    result.firestore = `ok (dynasties: ${dynastiesDeleted})`;
  } catch (e) {
    console.error('[account/delete] firestore cleanup failed:', e.message);
    result.firestore = 'failed';
    result.errors.push(`firestore: ${e.message}`);
  }

  // 3. Delete the Firebase Auth account last. After this, the user's ID
  //    token can no longer authenticate.
  try {
    await adminAuth().deleteUser(userId);
    result.auth = 'deleted';
  } catch (e) {
    console.error('[account/delete] auth deletion failed:', e.message);
    result.auth = 'failed';
    result.errors.push(`auth: ${e.message}`);
  }

  const ok = result.auth === 'deleted' && result.firestore.startsWith('ok');
  return res.status(ok ? 200 : 500).json({ ok, ...result });
}
