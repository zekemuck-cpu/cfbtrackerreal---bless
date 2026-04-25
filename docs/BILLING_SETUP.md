# Billing & Premium-Tier Setup

End-to-end setup notes for the paid (Premium) tier. Read top-to-bottom on first
deploy; afterwards skim only the section you're touching.

## Required environment variables

Set these in **Vercel** (Project → Settings → Environment Variables) for
both Production and Preview environments.

| Name | Where it comes from | Used by |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys (Secret key) | `/api/*` |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Developers → Webhooks → endpoint → Signing secret | `/api/webhook` |
| `STRIPE_PRICE_ID` | Stripe Dashboard → Products → \$4.99/mo Price → API ID (`price_...`) | `/api/create-checkout-session` |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Console → Project settings → Service accounts → Generate new private key. Paste the **entire JSON** as a single-line string. | All `/api/*` |
| `NEXT_PUBLIC_APP_URL` | `https://dynastytracker.vercel.app` (or your custom domain) | Checkout redirect URLs |

## Stripe webhook endpoint

In the Stripe Dashboard → Developers → Webhooks → **Add endpoint**:

- **Endpoint URL**: `https://dynastytracker.vercel.app/api/webhook`
- **Events to send** (subscribe exactly these — extras are harmless but unused):
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
  - `charge.refunded`
  - `charge.dispute.created`
  - `customer.deleted`

After saving, copy the **Signing secret** into `STRIPE_WEBHOOK_SECRET`.

## Firestore security rules — required for launch

The rules file is `firestore.rules` (committed to repo). They enforce that
only premium users can write to cloud dynasties, that only the owner can
read them (or anyone if the dynasty is public), and that the `users` doc
is server-controlled for subscription fields.

Deploy with:

```bash
npm install -g firebase-tools           # one-time, if not installed
firebase login                          # one-time, browser auth
firebase deploy --only firestore:rules  # from repo root
```

The repo's `.firebaserc` already pins the project to `cfbtracker-200ab`.

To validate rules before deploy, paste `firestore.rules` into
[Firebase Rules Playground](https://console.firebase.google.com/project/cfbtracker-200ab/firestore/rules)
and test reads/writes against a few dynasty docs.

## Admin allowlist

The "Dev Tools" panel on the Account page (Grant/Revoke Premium for free,
no Stripe charge) is gated to a hard-coded email allowlist. The current
allowlist lives in two places — they MUST stay in sync:

1. Server: `api/_verifyAuth.js` → `ADMIN_EMAILS`
2. Client: `src/pages/Account.jsx` → `ADMIN_EMAILS`

Currently: `alex.guess1999@gmail.com`.

The server check is the security boundary. The client one is a UX nicety
so non-admins don't see an inert panel.

## Local development

Stripe checkout and the customer portal don't work on `localhost` because
they need a public Vercel URL for redirects. The client-side
`subscriptionService` blocks these flows on localhost with a clear error.

To test premium-only features locally:

1. Sign in with `alex.guess1999@gmail.com`
2. Account page → Dev Tools → Show → **Grant Premium (Dev)**

This calls `/api/admin/grant-premium`, which still needs to run on a
deployed Vercel preview (admin SDK requires server runtime). Easiest:
push a branch, hit the preview URL, grant from there. The Firestore
write propagates to localhost via the real-time listener.

## Webhook event log / observability

Every webhook delivery is recorded in the `webhookEvents` collection
(server-only, not readable by clients). Each doc is keyed by Stripe event
ID with: `type`, `created`, `receivedAt`, `status`, plus
`error` if processing failed. Use this collection to debug delivery
issues without re-reading Stripe's logs.

Idempotency: the webhook checks `webhookEvents/{eventId}.status` before
processing and skips re-deliveries. Out-of-order delivery is handled by
comparing `event.created` against `users/{uid}.lastStripeEventCreated` —
older events are skipped to prevent stale state from overwriting newer
state.

## Account deletion

Users can self-delete from Account → Danger Zone → Delete Account. The
flow:

1. Confirm dialog
2. Calls `/api/account/delete` with the user's email as `confirmEmail`
3. Server cancels the active Stripe subscription (if any)
4. Server deletes all Firestore data owned by the user (`users/{uid}` +
   their `dynasties/*` and subcollections)
5. Server deletes the Firebase Auth account
6. Client signs out and redirects home

Best-effort: if the Stripe cancel fails, Firestore + Auth deletion still
proceed. The webhook will reconcile if Stripe ever fires the cancellation
later.

## Subscription cancellation → cloud data flow

When Stripe sends `customer.subscription.deleted` (or any event that
demotes the user — refund, dispute, customer.deleted), the webhook sets
`pendingDowngrade: true` on the user doc.

On next sign-in, `DynastyContext` picks up the flag and:

1. Migrates every cloud dynasty to local IndexedDB (copy + delete from
   Firestore)
2. Reloads the dynasty list
3. Toasts "Premium ended — N dynasties copied to this device"
4. Clears the `pendingDowngrade` flag

If migration fails partway, the flag stays set and the migration retries
on the next session. Firestore rules allow READ access to a user's own
dynasties even when not premium specifically so this migration works.
