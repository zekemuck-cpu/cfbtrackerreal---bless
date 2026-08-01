/**
 * Single source of truth for the premium paywall + displayed pricing.
 *
 * ── Launch switch ───────────────────────────────────────────────────────
 * PAYWALL_ENABLED === false  → BETA MODE (the current, default state):
 *   premium is free. Real Stripe checkout UI is hidden everywhere; the
 *   beta-free messaging + the BETA_GRANT_EMAILS self-grant path stay active.
 *   Nobody is charged.
 *
 * PAYWALL_ENABLED === true   → LIVE MODE: real Stripe checkout buttons show
 *   on Home + Account at the price below.
 *
 * It reads the host env var VITE_PAYWALL_ENABLED, so you flip it at launch
 * from Vercel WITHOUT a code change (set VITE_PAYWALL_ENABLED=true and
 * redeploy). Unset/anything-but-"true" keeps beta mode.
 *
 * The earlier beta failure ("paid but no premium", double charges) is
 * fixed in code, not by this flag:
 *   - /api/create-checkout-session now refuses to double-subscribe an
 *     already-subscribed customer and self-heals their premium fields.
 *   - /api/confirm-checkout applies premium directly from Stripe state on
 *     the ?payment=success return, so activation no longer depends on
 *     webhook delivery.
 *
 * ── Launch checklist (docs/BILLING_SETUP.md has the full version) ───────
 *   1. In Stripe, create the $2.50/mo recurring price; point STRIPE_PRICE_ID
 *      (host env) at it. The price below is DISPLAY ONLY.
 *   2. Confirm host env: STRIPE_SECRET_KEY, STRIPE_PRICE_ID,
 *      STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_APP_URL; register the webhook
 *      endpoint (/api/webhook) with live keys and VERIFY a test event
 *      shows up in the webhookEvents collection (this silently failing is
 *      the leading suspect for the beta charges-without-premium).
 *   3. Set VITE_PAYWALL_ENABLED=true and redeploy.
 *   4. Refund the beta-era duplicate charges from the Stripe dashboard.
 */
export const PAYWALL_ENABLED = import.meta.env.VITE_PAYWALL_ENABLED === 'true'

// Display strings only — keep in sync with the Stripe price (STRIPE_PRICE_ID).
// Editing these does NOT change what Stripe charges. The live Stripe price
// is $2.50/mo (price_1Tu0KYQO5bMQje6XvpnRobeP), so these must read $2.50.
export const PREMIUM_PRICE = '$2.50'
export const PREMIUM_PRICE_PER_MO = '$2.50 / mo'
