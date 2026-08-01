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

    // Cancel by ENUMERATING the customer's subscriptions rather than
    // trusting a stored subscriptionId — that id can be missing or stale
    // (e.g. nulled by customer.deleted), which would otherwise leave a
    // paying user billed after deletion (audit H4). Fall back to the
    // stored id only if we have no customer to list from.
    const toCancel = new Set();
    if (customerId) {
      try {
        const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
        for (const s of subs.data) {
          if (s.status !== 'canceled' && s.status !== 'incomplete_expired') toCancel.add(s.id);
        }
      } catch (e) {
        console.warn('[account/delete] stripe.subscriptions.list:', e.message);
        result.errors.push(`stripe_list: ${e.message}`);
      }
    }
    if (subscriptionId) toCancel.add(subscriptionId);

    if (toCancel.size > 0) {
      let canceled = 0;
      for (const subId of toCancel) {
        try {
          await stripe.subscriptions.cancel(subId);
          canceled++;
        } catch (e) {
          // Already canceled / not found is fine; the webhook reconciles.
          console.warn('[account/delete] stripe.subscriptions.cancel:', e.message);
          result.errors.push(`stripe_cancel ${subId}: ${e.message}`);
        }
      }
      result.stripe = `canceled ${canceled}/${toCancel.size}`;
    } else {
      result.stripe = customerId ? 'no_active_subscriptions' : 'no_stripe_link';
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
      // Delete ALL known subcollections first. Missing any of these
      // orphans user data after a "permanent" delete (audit H4) — keep
      // this list in sync with the subcollections in firestore.rules.
      for (const sub of ['players', 'games', 'seasons', 'weekRecaps', 'socialFeed', 'socialCharacters', 'invites']) {
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
  if (result.errors.length) {
    console.error('[account/delete] completed with errors:', result.errors);
  }
  // Return step statuses but NOT the raw internal error strings (audit M6).
  const { errors, ...safe } = result;
  return res.status(ok ? 200 : 500).json({ ok, ...safe });
}
