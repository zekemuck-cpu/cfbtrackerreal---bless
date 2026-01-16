/**
 * Subscription Service
 *
 * Handles premium subscription operations:
 * - Fetch user subscription status from Firestore
 * - Create Stripe checkout sessions
 * - Manage subscription portal
 */

import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Get user's subscription data from Firestore
 * @param {string} userId - Firebase user ID
 * @returns {Promise<Object|null>} User subscription data
 */
export async function getUserSubscription(userId) {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      return userDoc.data();
    }
    return null;
  } catch (error) {
    console.error('[Subscription] Error fetching user subscription:', error);
    return null;
  }
}

/**
 * Subscribe to real-time subscription updates
 * @param {string} userId - Firebase user ID
 * @param {Function} callback - Called with subscription data on changes
 * @returns {Function} Unsubscribe function
 */
export function subscribeToUserSubscription(userId, callback) {
  const userRef = doc(db, 'users', userId);

  return onSnapshot(userRef, (doc) => {
    if (doc.exists()) {
      callback(doc.data());
    } else {
      callback(null);
    }
  }, (error) => {
    console.error('[Subscription] Error subscribing to updates:', error);
    callback(null);
  });
}

/**
 * Check if user has an active premium subscription
 * @param {Object} subscriptionData - User subscription data from Firestore
 * @returns {boolean}
 */
export function isPremiumSubscription(subscriptionData) {
  if (!subscriptionData) return false;

  const { tier, subscriptionStatus, currentPeriodEnd } = subscriptionData;

  // Check if tier is premium and subscription is active
  if (tier !== 'premium') return false;

  // Check subscription status
  const activeStatuses = ['active', 'trialing'];
  if (!activeStatuses.includes(subscriptionStatus)) return false;

  // Check if subscription hasn't expired
  if (currentPeriodEnd) {
    const endDate = currentPeriodEnd.toDate ? currentPeriodEnd.toDate() : new Date(currentPeriodEnd);
    if (endDate < new Date()) return false;
  }

  return true;
}

/**
 * Create a Stripe checkout session for upgrading to premium
 * @param {string} userId - Firebase user ID
 * @param {string} userEmail - User's email (optional, for prefilling)
 * @returns {Promise<string>} Checkout URL to redirect to
 */
export async function createCheckoutSession(userId, userEmail) {
  try {
    const response = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, userEmail }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create checkout session');
    }

    const { url } = await response.json();
    return url;
  } catch (error) {
    console.error('[Subscription] Error creating checkout session:', error);
    throw error;
  }
}

/**
 * Create a Stripe customer portal session for managing subscription
 * @param {string} userId - Firebase user ID
 * @returns {Promise<string>} Portal URL to redirect to
 */
export async function createPortalSession(userId) {
  try {
    const response = await fetch('/api/create-portal-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create portal session');
    }

    const { url } = await response.json();
    return url;
  } catch (error) {
    console.error('[Subscription] Error creating portal session:', error);
    throw error;
  }
}

/**
 * Redirect to Stripe checkout for premium upgrade
 * @param {string} userId - Firebase user ID
 * @param {string} userEmail - User's email
 */
export async function redirectToCheckout(userId, userEmail) {
  const url = await createCheckoutSession(userId, userEmail);
  window.location.href = url;
}

/**
 * Redirect to Stripe customer portal for subscription management
 * @param {string} userId - Firebase user ID
 */
export async function redirectToPortal(userId) {
  const url = await createPortalSession(userId);
  window.location.href = url;
}
