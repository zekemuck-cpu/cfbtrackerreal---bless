# Stripe + Vercel Configuration Playbook (for Claude Chrome Extension)

> **Goal:** the app's domain just changed from `https://dynastytracker.vercel.app` to **`https://dynastytracker.app`**. The webhook URL, the redirect URLs, and a Vercel env var all need to be updated. Stripe also needs a few extra event types subscribed.
>
> This is a step-by-step playbook for a Claude Chrome extension agent to execute. The user is logged into Stripe and Vercel in their browser already. The agent should follow each section in order, top to bottom. **Do not skip steps. After each section, verify the success condition before moving on.**

---

## Section 1: Update the Stripe webhook endpoint URL

**What this fixes:** Stripe is currently sending payment events to the old Vercel URL. After the domain change, the old URL still works but redirects, which can cause webhook signature failures. We point Stripe directly at the new domain.

### Steps

1. **Navigate** to: `https://dashboard.stripe.com/webhooks`
   - You should see a page titled "Webhooks" with a list of existing endpoints.

2. **Find and click the row** that points to a URL containing `dynastytracker.vercel.app`. The endpoint URL ends with `/api/webhook`. Clicking the row opens the endpoint detail page.

3. On the endpoint detail page, **click the "..." menu (three dots)** in the top-right corner of the endpoint card, then **click "Update details"**.
   - A modal or panel opens with the editable webhook fields.

4. In the **"Endpoint URL"** field:
   - **Clear** the existing value.
   - **Type** exactly: `https://dynastytracker.app/api/webhook`

5. **Click "Update endpoint"** (or "Save" — whichever is the primary save button).
   - You should see a success message and the endpoint URL on the page should now read `https://dynastytracker.app/api/webhook`.

### Verification

- The endpoint detail page header shows the new URL with `dynastytracker.app` (no `vercel.app` anywhere).
- ✅ If yes, proceed to Section 2.
- ❌ If you see an error, **stop and report it back to the user**. Do not retry destructively.

---

## Section 2: Subscribe the webhook to all required Stripe events

**What this fixes:** the codebase handles 9 Stripe event types. The webhook may only be subscribed to 4 of them. The other 5 just silently log "unhandled" — fine for stability, but they're features the user is paying for (refund handling, dispute handling, etc.).

### Steps

1. **You should still be on the same webhook endpoint detail page.** If not, navigate to `https://dashboard.stripe.com/webhooks` and click the `dynastytracker.app` endpoint.

2. Find the **"Listening to N events"** section (it lists every event the endpoint receives).

3. **Click "Update details"** (same three-dot menu, "Update details" option) again.

4. Find the **"Events to send"** section. There may be a search/filter input above the event list.

5. **Make sure ALL of the following events are checked.** Some may already be checked from before — leave them checked. Check any that are unchecked. Check the boxes for:

   ```
   checkout.session.completed
   customer.subscription.created
   customer.subscription.updated
   customer.subscription.deleted
   invoice.payment_succeeded
   invoice.payment_failed
   charge.refunded
   charge.dispute.created
   customer.deleted
   ```

   **Tip:** type the event name into the search box, the matching row will appear, click its checkbox. Repeat for each.

6. **Click "Update endpoint"** (or "Save").

### Verification

- Back on the endpoint detail page, the "Listening to" line should show **9 events** and the listed events should match the 9 above.
- ✅ If yes, proceed to Section 3.
- ❌ If a count of 9 is not shown, repeat step 5 carefully. If you can't get there, report which events are missing.

---

## Section 3: Update the Vercel `NEXT_PUBLIC_APP_URL` env var

**What this fixes:** when a user finishes a Stripe checkout, Stripe redirects them back to a URL the server passes in. That URL is built from `NEXT_PUBLIC_APP_URL`. If this is still set to the old `vercel.app` domain, paying users land on the wrong host post-checkout. Code fall-through defaults are now `dynastytracker.app`, but the env var must be updated for cleanliness and future reliability.

### Steps

1. **Navigate** to the Vercel project page: `https://vercel.com/dashboard`
   - Click the project named **`cfbtrackerreal`** (or whatever the project for this app is — there should be only one likely match).

2. **Click "Settings"** in the project's tab bar (near the top of the page).

3. **Click "Environment Variables"** in the left sidebar.

4. **Find the row where the Key is `NEXT_PUBLIC_APP_URL`**. Hover over the row.

5. **Click the "..." (three dots) menu** at the right end of the row, then **click "Edit"**.

6. In the value field:
   - **Clear** the existing value.
   - **Type** exactly: `https://dynastytracker.app`
   - **Important:** do NOT include a trailing slash. Just `https://dynastytracker.app`.

7. Make sure the **environment scope** is set to **Production** AND **Preview** (both checkboxes ticked). If "Development" is also there, leave it unchecked or matching the existing setting.

8. **Click "Save"**.
   - The value in the env var list should now show `https://dynastytracker.app`.

9. **Trigger a redeploy** so the new env var takes effect:
   - Click **"Deployments"** in the project's tab bar.
   - Find the most recent deployment (top of the list, the one tagged "Production").
   - Click the **"..." (three dots) menu** on that row.
   - Click **"Redeploy"**.
   - When the modal asks if you want to use existing build cache, **leave the checkbox at its default** and click **"Redeploy"**.

### Verification

- The env var page shows `NEXT_PUBLIC_APP_URL = https://dynastytracker.app` for Production + Preview.
- A new deployment is building or building/ready in Deployments.
- ✅ If yes, proceed to Section 4.
- ❌ If "Edit" isn't available or the variable doesn't exist, **stop and report**. The user may need to add it as a new variable.

---

## Section 4: Verify the live deploy

**What this checks:** that everything works end-to-end after the domain switch.

### Steps

1. Wait for the new Vercel deployment to finish. Status should be **Ready** with a green check.

2. **Navigate** to `https://dynastytracker.app/account` in a fresh tab. The user should already be signed in.

3. The page should load with no errors. If logged in as `alex.guess1999@gmail.com`, the "Dev Tools" panel should be visible at the bottom.

4. **Optional smoke test (only run if the user explicitly approves a real charge):**
   - On a non-admin test account, click "Upgrade to Premium" → should redirect to a `checkout.stripe.com` URL.
   - Cancel the checkout — should return to `https://dynastytracker.app/?payment=canceled`. The host should be `dynastytracker.app`, not `vercel.app`.

### Verification

- ✅ Account page loads on the new domain.
- ✅ Stripe checkout redirects use the new domain.
- Done. Report success back to the user.

---

## Things to watch for / common gotchas

- **If the Stripe webhook page asks you to "click to reveal" or re-authenticate the signing secret:** do NOT click that. We are not changing the webhook secret. Only the URL and event subscription list.
- **If Vercel asks "Did you mean to redeploy?"** answer Yes. The env var change does not auto-trigger a redeploy.
- **If you accidentally delete the webhook endpoint instead of editing it:** stop and tell the user. The user will need to recreate it and copy the new signing secret into Vercel as `STRIPE_WEBHOOK_SECRET`. This is recoverable but takes the user's hands.

## What to NOT do

- **Do NOT touch any other env vars** in Vercel (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `FIREBASE_SERVICE_ACCOUNT`). These are sensitive secrets.
- **Do NOT change the webhook signing secret** in Stripe.
- **Do NOT rotate any API keys.**
- **Do NOT click "Send test event"** — it can fire a real test charge if misconfigured.
- **Do NOT delete the existing webhook endpoint** — only edit its URL.

## Final report format

When done, reply to the user with:

```
✅ Stripe webhook URL updated to https://dynastytracker.app/api/webhook
✅ Stripe webhook subscribed to 9 events: <list>
✅ Vercel NEXT_PUBLIC_APP_URL updated to https://dynastytracker.app
✅ Vercel redeploy triggered: <deployment URL or status>
✅ Account page loads on new domain
```

If any step failed or was skipped, say so explicitly and quote the exact error message you saw.
