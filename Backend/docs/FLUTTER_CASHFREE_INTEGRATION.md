# Cashfree Payment Integration — Flutter Implementation Guide

This document covers **every** place Cashfree online payment is used across the Cravioo
platform (web app today), so the Flutter apps (Cravioo_user, Cravioo_restaurent,
Cravioo_delivery) can implement the equivalent flow natively.

**Payment gateway:** Cashfree (live/production mode, no other gateway is used anywhere
in this system — any old Razorpay references you may see in legacy code/docs are dead,
non-functional leftovers).

---

## 0. Before you start

### Cashfree Flutter SDK
Use Cashfree's official Flutter package (`cashfree_pg` or the current recommended
package from Cashfree's own Flutter docs). All the flows below give you a
`paymentSessionId` from our backend — that value is Cashfree's own
`payment_session_id` field returned by their `/pg/orders` API, and it plugs directly
into the Flutter SDK's native checkout call. No backend changes are needed on our side
to support Flutter specifically — the session id works identically whether it's consumed
by our web JS SDK or your native SDK.

### Environment
- Cashfree is running in **production mode** (live, real money) — set your Flutter
  SDK's environment to `PRODUCTION` to match, not `SANDBOX`.
- There is no separate "test mode" currently configured on the backend. If you need to
  test your Flutter integration without charging real money, coordinate with us first —
  we'd need to temporarily point a build at sandbox credentials.

### Universal rule: never trust client-side payment success
For every flow below, Cashfree's SDK (web or Flutter) tells you the checkout UI was
closed — it does **not** hand you a cryptographic signature proving payment succeeded.
**Always** call the matching backend "verify" endpoint after checkout closes, and treat
that server response (which itself re-checks with Cashfree's server) as the only source
of truth. Never mark an order/payment "successful" in the UI just because the SDK
`doPayment()`/checkout call returned without an error.

### Universal rule: poll verify for UPI/QR payments
If the user pays via UPI/QR (as opposed to card/netbanking), Cashfree's checkout can
report back to the SDK **before** the customer has actually completed the payment on
their UPI app — the UPI session itself stays valid for ~5 minutes server-side, independent
of whatever your checkout UI does. If you call verify-payment exactly once immediately
and it says "not paid yet," **do not treat that as a final failure** — poll it a few more
times with a short delay before giving up. The web app does this as: every 4 seconds, up
to 30 attempts (~2 minutes) for food order payments. **We recommend Flutter use this same
poll pattern on every single payment flow below**, not just food orders — some of our own
backend flows (wallet top-up, membership) don't poll yet, and that's a known gap on our
side, not something to copy.

---

## 1. Food order checkout (Cravioo_user)

**Base path:** `/api/v1/food/orders`, Bearer token (USER role).

### Step 1 — Preview pricing (optional, for showing the cart total before placing order)
```
POST /api/v1/food/orders/calculate
```
Same request shape as order creation below; returns a `pricing` object without creating
an order or payment session. Use this to show the live cart total as items/address/coupon
change.

### Step 2 — Create the order + payment session
```
POST /api/v1/food/orders
```
Request body includes cart items, delivery address, `paymentMethod: "cashfree"`, optional
coupon code, etc. — same shape your team already has from the existing order-creation
integration (this isn't new).

Response (`data.data`):
```json
{
  "order": { "...": "full order object" },
  "cashfree": {
    "appId": "your-cashfree-app-id",
    "orderId": "FOD-XXXXXX",
    "paymentSessionId": "session_xxxxxxxxxxxx",
    "amount": 228.00,
    "currency": "INR"
  }
}
```
- `cashfree.amount` is the **authoritative, final total** the customer will be charged —
  it already includes every fee (delivery, platform, packaging, GST, DSU/order-transfer
  charge if applicable, minus any discount). Display this exact number, don't recompute
  it client-side.
- `cashfree.paymentSessionId` → pass this straight into the Cashfree Flutter SDK's
  checkout call.
- An order document is created in `payment.status = "created"` (not yet paid) at this
  point — it stays invisible to the restaurant until payment is verified as paid (see
  Step 4).

### Step 3 — Open Cashfree checkout
Use the Flutter SDK's native checkout with `paymentSessionId` from Step 2.

### Step 4 — Verify payment
```
POST /api/v1/food/orders/verify-payment
Body: { "orderId": "<order._id from Step 2>", "cashfreeOrderId": "<cashfree.orderId from Step 2>" }
```
- Poll this every ~4 seconds, up to ~30 times (~2 minutes), especially for UPI/QR — see
  the universal polling rule above.
- Success response marks the order as paid and triggers restaurant notification,
  invoice, etc. — nothing further needed from the app besides updating your own UI.
- If every poll attempt fails after the full window, call the cancel endpoint (Step 5)
  and show the user a clear "payment failed" message — don't leave them on a frozen
  "processing" screen.

### Step 5 — Cancel (if payment fails/times out/user backs out)
```
PATCH /api/v1/food/orders/:orderId/cancel
Body: { "reason": "Payment Failed" | "Payment Cancelled", "refundTo"?: "wallet" | "gateway" }
```
- `refundTo` only matters if the order was actually paid already (rare at this stage —
  normally the order here was never paid, so no refund is triggered, it's just marked
  cancelled).
- Also call this if your app's own checkout UI gets stuck/closes unexpectedly without a
  clean success/fail signal — don't leave an order sitting in `created` state
  indefinitely from the app's perspective. (Backend also auto-expires these after 15
  minutes via a background job either way, so this isn't strictly required for
  correctness, just better UX.)

### Refunds
100% automatic/server-driven. If a paid order is later cancelled (by user, restaurant, or
admin), the refund is initiated automatically by the backend and tracked via webhook —
Flutter never calls a refund endpoint directly. Just read `order.payment.refund.status`
(`processed` / `failed` / unset) from the order object to show refund status in order
history/details.

---

## 2. Wallet recharge (Cravioo_user)

**Base path:** `/api/v1/food/user/wallet`, Bearer token (USER role).

### Create payment session
```
POST /api/v1/food/user/wallet/topup/order
Body: { "amount": 500 }
```
Response:
```json
{ "cashfree": { "appId": "...", "orderId": "...", "paymentSessionId": "...", "amount": 500, "currency": "INR" } }
```

### Verify + credit wallet
```
POST /api/v1/food/user/wallet/topup/verify
Body: { "cashfreeOrderId": "<from create response>" }
```
The wallet is credited with the amount **Cashfree itself reports** as paid (not the
amount your app sends), so there's no risk of a mismatch — but there's currently **no
polling built into this endpoint's typical usage on web** (single verify call). **We
recommend Flutter poll this one too**, same 4s/~2min pattern as food orders, especially
if you offer UPI/QR as a payment option for wallet top-up.

---

## 3. Membership purchase (Cravioo_user)

**Base path:** `/api/v1/food/user/memberships`, Bearer token (USER role).

### Create payment session
```
POST /api/v1/food/user/memberships/order
Body: { "planId": "<membership plan id>" }
```
Response:
```json
{
  "membershipId": "...",
  "planName": "...",
  "cashfree": { "appId": "...", "orderId": "...", "paymentSessionId": "...", "amount": 199, "currency": "INR" }
}
```
Amount is the plan's fixed price (`plan.price`) — not user-editable.

### Verify + activate
```
POST /api/v1/food/user/memberships/verify
Body: { "cashfreeOrderId": "<from create response>" }
```
Backend cross-checks the paid amount against the plan price before activating (rejects
with `amount_mismatch` if they don't match — shouldn't normally happen since the amount
isn't user-controlled, but it's there as a safety check). Same polling recommendation
applies for UPI/QR.

---

## 4. Restaurant / Delivery Partner subscription (Cravioo_restaurent, Cravioo_delivery)

**Base path:** `/api/v1/food/subscriptions`, Bearer token (RESTAURANT or DELIVERY_PARTNER
role — same endpoint serves both).

### Create payment session
```
POST /api/v1/food/subscriptions/purchase
Body: { "planId": "<subscription plan id>" }
```
**Response shape depends on the plan type** — check `plan.paymentType` before deciding
which Cashfree SDK method to call:

- **One-time plan** → flat response (no `cashfree` wrapper):
  ```json
  { "orderId": "...", "amount": 999, "paymentSessionId": "...", "appId": "..." }
  ```
  Use the normal Cashfree checkout/order-payment SDK call.

- **Recurring plan** → different shape:
  ```json
  { "subscriptionId": "...", "subscriptionSessionId": "...", "appId": "..." }
  ```
  Use Cashfree's **native subscription/mandate SDK method** (not the regular one-time
  checkout call) — `subscriptionSessionId` is a different kind of session specifically
  for recurring mandates. Check Cashfree's Flutter SDK docs for the subscription-specific
  method name.

### Verify
```
POST /api/v1/food/subscriptions/verify
Body: { "cashfreeOrderId": "..." }   // for one-time
   or: { "cashfreeSubscriptionId": "..." }   // for recurring
```
Exactly one of the two fields is required, matching whichever flow you used to create it.

### Subscription wallet top-up (separate from the above)
Same role gate, separate endpoints:
```
POST /api/v1/food/subscriptions/wallet/topup
POST /api/v1/food/subscriptions/wallet/verify
```
Same create → checkout → verify pattern as the main subscription flow.

---

## 5. Restaurant / Seller / Delivery Partner onboarding fee (all three apps, signup flow)

**Base path:** `/api/v1/common/onboarding-fees` — **public, no auth required** (this
happens during signup, before the user has an account/token).

### Check current fee
```
GET /api/v1/common/onboarding-fees/public
```
Response:
```json
{
  "RESTAURANT": { "price": 999, "isActive": true },
  "SELLER": { "price": 499, "isActive": true },
  "DELIVERY_PARTNER": { "price": 299, "isActive": true }
}
```
Only show/charge the onboarding fee step if `isActive` is true for that role.

### Create payment session
```
POST /api/v1/common/onboarding-fees/public/create-order
Body: { "role": "RESTAURANT" | "SELLER" | "DELIVERY_PARTNER", "name": "...", "phone": "...", "email"?: "..." }
```
Response (flat, no `cashfree` wrapper):
```json
{ "orderId": "...", "paymentSessionId": "...", "amount": 999, "currency": "INR", "appId": "...", "isMock": false, "alreadyPaid": false }
```

### ⚠️ Important gap — no verify endpoint exists for this flow
Unlike every other flow in this document, **onboarding fee payment is 100% webhook-driven
with no client-callable verify endpoint right now.** After the Cashfree checkout closes,
there's no API you can poll from the app to find out if the payment succeeded — the
backend finds out via webhook (server-to-server, automatic) and updates an internal
`OnboardingPaymentLog` record, but nothing currently exposes that status back to the
client app.

**What to do about this for now:** after checkout closes, show a "verifying your
payment..." state and either (a) poll your own backend's signup/onboarding status
endpoint if one already tells you "is this phone/email's onboarding fee paid" as part of
the normal signup flow, or (b) wait a few seconds and let the user proceed — the webhook
typically lands within a few seconds of a real payment. **Flag this to us if you need a
dedicated verify endpoint added for this flow** — it's a known limitation, not something
currently supported server-side, and we can add one on request.

---

## 6. Delivery partner cash deposit (Cravioo_delivery)

**Base path:** `/api/v1/food/delivery/wallet/deposit`, Bearer token (DELIVERY_PARTNER
role).

### Create payment session
```
POST /api/v1/food/delivery/wallet/deposit/order
Body: { "amount": 1000 }
```
Response:
```json
{ "cashfree": { "appId": "...", "orderId": "...", "paymentSessionId": "...", "amount": 1000, "currency": "INR" } }
```

### Verify + credit
```
POST /api/v1/food/delivery/wallet/deposit/verify
Body: { "cashfreeOrderId": "..." }
```
(The field name accepted is flexible — `cashfreeOrderId` or `cashfree_order_id` both
work, but use `cashfreeOrderId` for consistency with the other flows above.) Verification
always re-confirms the amount with Cashfree's own server regardless of what you send, so
there's no risk of amount tampering.

---

## 7. Webhook — backend-only, zero Flutter involvement

```
POST https://cravioo.in/api/v1/payments/webhook/cashfree
```
This is called directly by Cashfree's servers to our backend — it has nothing to do with
any client app. Documenting it here only so you understand *why* payment status updates
sometimes happen "automatically" in the background even without the app calling verify
(e.g. if a user closes the app mid-payment and later reopens it, the order may already
show as paid because the webhook already processed it server-side).

You do not need to implement anything for this — just be aware it exists and is the
reason server-side state can change independently of your app's own verify calls.

---

## Summary table

| Flow | App | Create endpoint | Verify endpoint | Amount source |
|---|---|---|---|---|
| Food order | User | `POST /food/orders` | `POST /food/orders/verify-payment` | `normalizedPricing.total` (server-computed, includes all fees) |
| Wallet top-up | User | `POST /food/user/wallet/topup/order` | `POST /food/user/wallet/topup/verify` | User-entered amount, credited as Cashfree-confirmed |
| Membership | User | `POST /food/user/memberships/order` | `POST /food/user/memberships/verify` | Fixed plan price |
| Subscription (one-time) | Restaurant/Delivery | `POST /food/subscriptions/purchase` | `POST /food/subscriptions/verify` (`cashfreeOrderId`) | Fixed plan price |
| Subscription (recurring) | Restaurant/Delivery | `POST /food/subscriptions/purchase` | `POST /food/subscriptions/verify` (`cashfreeSubscriptionId`) | Fixed plan price |
| Subscription wallet | Restaurant/Delivery | `POST /food/subscriptions/wallet/topup` | `POST /food/subscriptions/wallet/verify` | User-entered amount |
| Onboarding fee | All (signup) | `POST /common/onboarding-fees/public/create-order` | **None — webhook-only, gap flagged above** | Fixed role-based price |
| Delivery deposit | Delivery | `POST /food/delivery/wallet/deposit/order` | `POST /food/delivery/wallet/deposit/verify` | User-entered amount |

All `cashfree`-wrapped responses give the same 4 fields: `appId`, `orderId`,
`paymentSessionId`, `amount`, `currency` (`currency` is always `"INR"`). The flat-shaped
responses (subscription one-time, onboarding fee) give the same fields without the
wrapper object — just read them at the top level of the response instead.
