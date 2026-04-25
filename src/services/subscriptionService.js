/**
 * Subscription Service
 *
 * Handles premium subscription operations:
 * - Fetch user subscription status from Firestore
 * - Create Stripe checkout / portal sessions (auth-verified)
 * - Admin grant / revoke premium (server-gated to admin email)
 * - Delete account (cancels Stripe sub, wipes Firestore data, deletes Auth)
 */

import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '../config/firebase';

// ─────────────────────────────────────────────────────────────────────
// Subscription state reads
// ─────────────────────────────────────────────────────────────────────

export async function getUserSubscription(userId) {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) return userDoc.data();
    return null;
  } catch (error) {
    console.error('[Subscription] Error fetching user subscription:', error);
    return null;
  }
}

export function subscribeToUserSubscription(userId, callback) {
  const userRef = doc(db, 'users', userId);
  return onSnapshot(userRef, (snap) => {
    callback(snap.exists() ? snap.data() : null);
  }, (error) => {
    console.error('[Subscription] Error subscribing to updates:', error);
    callback(null);
  });
}

// How long after a payment failure (past_due) we still treat the user as
// premium. Stripe retries failed payments for ~3 weeks; this grace lets
// a transient card decline self-heal without bricking the user immediately.
const PAST_DUE_GRACE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Check if user has an active premium subscription.
 * Honors a 7-day grace window on past_due so a single failed renewal
 * doesn't lock the user out while Stripe is still retrying.
 */
export function isPremiumSubscription(subscriptionData) {
  if (!subscriptionData) return false;

  const { tier, subscriptionStatus, currentPeriodEnd, updatedAt } = subscriptionData;
  if (tier !== 'premium') return false;

  // active / trialing → premium until period end
  if (subscriptionStatus === 'active' || subscriptionStatus === 'trialing') {
    if (currentPeriodEnd) {
      const endDate = currentPeriodEnd.toDate ? currentPeriodEnd.toDate() : new Date(currentPeriodEnd);
      if (endDate < new Date()) return false;
    }
    return true;
  }

  // past_due → grace period from when it transitioned to past_due
  if (subscriptionStatus === 'past_due') {
    const ref = updatedAt?.toDate ? updatedAt.toDate() : (updatedAt ? new Date(updatedAt) : null);
    if (!ref) return true; // no anchor → grant grace until next event
    return (Date.now() - ref.getTime()) < PAST_DUE_GRACE_MS;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────
// Auth helper for API calls
// ─────────────────────────────────────────────────────────────────────

/**
 * Returns Authorization header value for the current user's API calls,
 * or throws if no signed-in user / token is available.
 */
async function authHeader() {
  const user = getAuth().currentUser;
  if (!user) throw new Error('Not signed in');
  const token = await user.getIdToken();
  return `Bearer ${token}`;
}

// Wrapper that POSTs JSON to an API route with the auth header attached
// and parses errors uniformly.
async function postAuthed(path, body = {}) {
  const auth = await authHeader();
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: auth,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    let msg = `Request to ${path} failed (${response.status})`;
    try { msg = JSON.parse(text).error || msg; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  return response.json();
}

const isLocalDev = () =>
  import.meta.env.DEV ||
  window.location.hostname === 'localhost' ||
  window.location.hostname.includes('replit');

// ─────────────────────────────────────────────────────────────────────
// Stripe checkout & portal
// ─────────────────────────────────────────────────────────────────────

export async function createCheckoutSession() {
  if (isLocalDev()) {
    throw new Error('Stripe checkout is only available in production. Deploy to Vercel to test payments.');
  }
  const { url } = await postAuthed('/api/create-checkout-session');
  return url;
}

export async function createPortalSession() {
  if (isLocalDev()) {
    throw new Error('Stripe portal is only available in production. Deploy to Vercel to manage subscriptions.');
  }
  const { url } = await postAuthed('/api/create-portal-session');
  return url;
}

export async function redirectToCheckout() {
  const url = await createCheckoutSession();
  window.location.href = url;
}

export async function redirectToPortal() {
  const url = await createPortalSession();
  window.location.href = url;
}

// ─────────────────────────────────────────────────────────────────────
// Admin (gated server-side to the admin email allowlist)
// ─────────────────────────────────────────────────────────────────────

export async function adminGrantPremium() {
  return postAuthed('/api/admin/grant-premium', { action: 'grant' });
}

export async function adminRevokePremium() {
  return postAuthed('/api/admin/grant-premium', { action: 'revoke' });
}

// ─────────────────────────────────────────────────────────────────────
// Account deletion (Stripe cancel + Firestore wipe + Auth delete)
// ─────────────────────────────────────────────────────────────────────

/**
 * Permanently delete the signed-in user's account.
 * Caller must pass their own email as confirmEmail; the server checks it
 * matches the verified token's email before proceeding.
 */
export async function deleteAccount(confirmEmail) {
  return postAuthed('/api/account/delete', { confirmEmail });
}
