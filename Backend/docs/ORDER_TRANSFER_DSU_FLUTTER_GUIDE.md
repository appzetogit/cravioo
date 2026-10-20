# Order Transfer (DSU) — Flutter Implementation Guide

This document is for the Flutter delivery-partner app team. It explains the
**Order Transfer / DSU** feature end to end: what it is, the exact REST APIs,
the exact Socket.IO events, the screens you need to build, and the edge cases
you must handle. Backend is already fully implemented and deployed to the
Node/Express + MongoDB backend used by the existing web delivery app
(DeliveryV2). This guide describes the **contract** your Flutter app must
implement against — you do not need to touch any backend code.

---

## 1. What is Order Transfer (DSU)?

Normally one delivery partner (let's call them **D1**) accepts an order from
a restaurant, picks it up, and delivers it to the customer end-to-end.

**Order Transfer** lets D1 hand an *already-picked-up* order off to a second,
nearby delivery partner (**D2**) while D1 is still on the way to the
customer — before the customer drop-OTP step. D2 then finishes the delivery:
reaches the customer, takes the customer's OTP, collects payment, and
completes the order.

This is **opt-in per admin-configured zone**. If the zone an order belongs to
doesn't have Order Transfer enabled, none of this applies and the order
behaves exactly as it does today.

### Why this exists
- Lets a DSU partner "mop up" an order from a busy D1 who is going a
  different direction than the customer, improving delivery speed.
- D1 doesn't lose anything — they still get their full normal delivery
  earning for the order (see **Section 6: Earnings & Wallet**).
- D2 earns a flat, zone-configured "DSU charge" instead of the normal
  delivery earning, because they only do a portion of the delivery.

---

## 2. Roles: Normal vs DSU driver

Every delivery partner document now has a `driverRoles` array:

```json
"driverRoles": ["normal"]       // default — unchanged for existing accounts
"driverRoles": ["dsu"]          // only receives transfer offers, not restaurant pickups
"driverRoles": ["normal", "dsu"] // receives BOTH restaurant-pickup offers and transfer offers
```

- **`normal`**: receives restaurant-pickup offers exactly like today
  (`new_order_available` socket event). No change in behavior.
- **`dsu`**: additionally receives **transfer offers**
  (`new_transfer_order_available` socket event) whenever a nearby D1 initiates
  a handoff. A `dsu`-only partner gets **no** restaurant pickup offers.
- A partner can hold both roles and will receive both kinds of offers.

### Where to let the driver pick their role
Add a role selector in:
1. **Onboarding/registration form** — send `driverRoles: ["normal"]` or
   `["normal", "dsu"]` (array) as part of the registration payload.
2. **Profile settings screen** (post-onboarding) — allow changing it any time
   via `PATCH /profile/details`.

### API — Update driver role (post-onboarding)
```
PATCH /api/v1/food/delivery/profile/details
Authorization: Bearer <delivery_access_token>
Content-Type: application/json

{
  "driverRoles": ["normal", "dsu"]
}
```
Response:
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": { "partner": { "...": "...", "driverRoles": ["normal", "dsu"] } }
}
```
Valid values inside the array: `"normal"`, `"dsu"` only. At least one is
required — sending an empty array is rejected with a 400.

### API — Set role during registration
`POST /api/v1/food/delivery/register` (multipart form, existing endpoint) —
just add a `driverRoles` field (JSON array or repeated form field, both are
accepted) alongside the existing registration fields. If omitted, the backend
defaults to `["normal"]`, so **you are not required to add this to
registration immediately** — it can ship later as a profile-only toggle
without breaking anything.

---

## 3. The two different "driver experiences" you must build

Because a partner can be `normal`, `dsu`, or both, your app's **active trip
screen** must now branch into two shapes depending on *how* the current
active order was obtained:

| | D1 (normal pickup) | D2 (received via transfer) |
|---|---|---|
| How they got the order | Accepted `new_order_available` offer | Accepted `new_transfer_order_available` offer |
| Restaurant accept/pickup screens | Yes — full existing flow | **Skipped entirely** — order arrives already in `picked_up` state |
| Map polyline shown | Rider → Restaurant → Customer | Rider's current location → Customer (no restaurant leg) |
| Customer OTP step | Yes (if they complete it) | Yes — always, this is D2's job |
| Payment collection | Yes (if they complete it) | Yes — always, this is D2's job |
| "Transfer this order?" button shown | Yes, just before the Verify & Complete step | **No** — an order can only be transferred once |
| Earning | Full normal `riderEarning` | Zone's flat `dsuTransferCharge` amount |

You can distinguish which case you're in by checking the order's `transfer`
object (see Section 5) and/or a `tripType` field that becomes `"transferred"`
once a transfer has completed for that order — more on this in Section 7.

---

## 4. Full lifecycle, step by step

```
D1 flow:                                           D2 flow:
─────────                                          ─────────
1. Accept order from restaurant (existing)
2. Reach pickup, confirm pickup (existing)
3. En route to customer...
4. [NEW] Before "Verify & Complete", driver sees
   a "Transfer this order?" button
5. Taps it → app sends current GPS lat/lng to
   POST /transfer/initiate
      │
      ├─ Backend finds online DSU-role partners
      │  within the zone's configured radius of
      │  D1's current location
      │
      ├─ If NONE found → initiate returns
      │  eligible:false. D1 just continues the
      │  normal flow (Verify & Complete) — nothing
      │  is blocked, nothing changes.
      │
      └─ If found → offer is broadcast over socket
         to those DSU partners                     1. Partner is idle/online, holding no
                                                        active trip, role includes "dsu"
                                                     2. Receives socket event
                                                        new_transfer_order_available
                                                     3. Shows "Incoming transfer" screen
                                                        (similar to a normal order offer,
                                                        but NO restaurant leg)
                                                     4. Taps Accept →
                                                        POST /transfer/accept
                                                            │
6. D1 receives socket event transfer_accepted            │
   containing a 4-digit handover OTP                     │
7. App shows this OTP full-screen to D1                  │
   ("Share this code with the other driver")             │
8. D1 physically hands the bag/order to D2                │
                                                     5. D2 asks D1 for the OTP, types it in
                                                        POST /transfer/verify
                                                            │
   ◄───────────────────────────────────────────────────────┘
9. Backend verifies OTP:
   - Order ownership (dispatch.deliveryPartnerId)
     switches from D1 to D2
   - D1 is credited their FULL normal riderEarning
     right now (not at final delivery)
   - D2 is credited the zone's dsuTransferCharge
     right now
   - order.transfer.status becomes "completed"
10. D1 receives socket event transfer_completed →
    app clears D1's active trip, shows a success
    toast, D1 is free to take new orders.           6. D2's app receives the full order object
                                                        (via the accept response) and drops
                                                        straight into "en route to customer"
                                                        state — NO restaurant pickup UI.
                                                     7. D2 reaches customer, takes customer's
                                                        OTP (existing drop-OTP flow, UNCHANGED),
                                                        collects payment (existing flow,
                                                        UNCHANGED), completes delivery
                                                        (existing flow, UNCHANGED).
```

**Important:** everything from step 6 onward for D2 (reached-drop, customer
OTP, payment collection, complete-delivery) reuses the **exact same existing
APIs** your app already calls for a normal delivery
(`/reached-drop`, `/verify-drop-otp`, `/collect/cash`, `/collect/qr`,
`/complete`). You do not need any new code there — only the *entry point*
into that flow is different for D2 (no restaurant pickup screens beforehand).

---

## 5. Data model — `order.transfer` object

Every order document now carries a `transfer` object (always present, even
when no transfer ever happens — `status` will just be `"none"`). This object
is returned on every order-fetching endpoint you already use
(`GET /orders/current`, `GET /orders/:orderId`, accept/pickup/complete
responses, and the `order_status_update` socket event).

```jsonc
"transfer": {
  "status": "none",       // "none" | "offered" | "accepted" | "verified" | "completed" | "cancelled"
  "fromPartnerId": null,  // ObjectId or populated {_id, name, phone, rating, totalRatings} — D1
  "toPartnerId": null,    // same shape — D2
  "handoverLocation": {   // GeoJSON Point — only present once a transfer was offered
    "type": "Point",
    "coordinates": [77.5946, 12.9716]   // [lng, lat]
  },
  "offeredAt": null,
  "acceptedAt": null,
  "verifiedAt": null,
  "completedAt": null,
  "d2Payout": {            // D2's earning for this transfer — only present/meaningful once completed
    "amount": 20,
    "settled": true,
    "settledAt": "2026-10-20T10:15:00.000Z"
  }
}
```

**Note:** the raw `transferOtp` (D1's handover code) is **never** included in
any API response you fetch by polling — it is only ever delivered to D1 via
the `transfer_accepted` socket event (see Section 8). This is intentional
(same pattern as the existing customer drop-OTP, which is also never
returned from a GET call).

When `transfer.status` is `"verified"` or `"completed"`, the order's
`tripType` field (on the detail/trip DTOs) is automatically set to
`"transferred"` — a cheap way to detect "this is a transferred order" without
inspecting the whole `transfer` object, if you just need a flag.

---

## 6. Earnings & Wallet — exactly how money moves

This is the most important section to get right, because the earnings model
is **not** "split the delivery fee" — it is two **separate, full** payouts:

| Who | Gets paid | How much | When |
|---|---|---|---|
| **D1** | Their full normal delivery earning (`riderEarning`) — exactly as if they had delivered the whole order themselves | Same `riderEarning` value shown on the order before any transfer happened | The moment D2 verifies the handover OTP (`/transfer/verify` succeeds) |
| **D2** | The zone's flat `dsuTransferCharge` (set by admin per zone, shown to the customer as a checkout line item) | Whatever the admin configured for that zone | Same moment — the handover OTP verify |

- D1 does **not** get anything extra or less because they transferred —
  their earning is identical to a normal full delivery.
- D2 does **not** get the normal `riderEarning` for this order at all — when
  D2 later calls `/complete`, the backend's payout job is a no-op for the
  rider-earning category (idempotency check sees D1 already claimed it) and
  D2's DSU earning was already paid at transfer-verify time. **You don't need
  to do anything special here** — just call `/complete` normally like any
  other order; the backend handles not double-paying.
- Both credits show up as normal wallet transactions on each partner's
  `GET /wallet` / `GET /earnings` response, with distinguishable
  `description` text:
  - D1's row: `"Order <id> - delivery earning"`
  - D2's row: `"Order <id> - DSU transfer earning"`
- If you show a transaction-type badge/icon in your wallet screen, you can
  use the transaction `category` field (`delivery_earning` vs
  `dsu_transfer_earning`) to differentiate them, same as you'd do for any
  other existing category (e.g. `settlement_payout`, `adjustment`).

**You do not need to build any new payout UI.** Your existing wallet/earnings
screens that render a list of transactions will automatically show these new
rows — just make sure your transaction-type label mapping gracefully falls
back to showing the raw `description` text for a `category` value it doesn't
specifically recognize (so new categories never show up blank).

---

## 7. API Reference

All endpoints below require the existing delivery auth header:
```
Authorization: Bearer <delivery_access_token>
```
Base path: `https://<api-host>/api/v1/food/delivery`

### 7.1 `POST /orders/:orderId/transfer/initiate` — D1 offers the order

Call this when D1 taps "Transfer this order?" (your new button, placed right
next to / instead of the existing "Verify & Complete" button, shown only
while the order is in the `picked_up` / "on the way to drop" phase and has
not already been transferred).

**Request:**
```json
{
  "lat": 12.9716,
  "lng": 77.5946
}
```
`lat`/`lng` = D1's current GPS position (use your existing live-location
value, same one you already send for location tracking).

**Success response (DSU partners found):**
```json
{
  "success": true,
  "message": "Transfer offered to nearby partners",
  "data": {
    "eligible": true,
    "offeredCount": 3,
    "radiusMeters": 500
  }
}
```
→ Show a "Waiting for a DSU partner to accept…" screen. Offer a "Cancel and
deliver it myself" button at all times (see Section 9, Edge Cases).

**Success response (no DSU partners nearby / feature not eligible):**
```json
{
  "success": true,
  "message": "No nearby DSU partners found",
  "data": {
    "eligible": false,
    "reason": "No DSU delivery partners available nearby. Continue delivering this order yourself.",
    "radiusMeters": 500
  }
}
```
→ Show this message briefly, then dismiss the sheet and let D1 continue the
normal "Verify & Complete" flow. **This is not an error** — treat it as a
normal, expected outcome.

**Error responses** (4xx, show `message` as a toast and dismiss the sheet):
- `400` — order isn't eligible (already delivered/cancelled, zone doesn't
  have Order Transfer enabled, a transfer is already in progress for this
  order, or `lat`/`lng` missing).
- `403` — order isn't assigned to the calling partner.
- `404` — order not found.

---

### 7.2 `POST /orders/:orderId/transfer/accept` — D2 accepts the offer

Call this when D2 taps "Accept" on the incoming transfer-offer screen.

**Request:** empty body (`{}`).

**Success response:**
```json
{
  "success": true,
  "message": "Transfer accepted",
  "data": {
    "order": { "...": "full order object, same shape as GET /orders/:orderId response" }
  }
}
```
At this point the order is **not yet** D2's — ownership only switches after
the OTP is verified in step 7.3. Keep D2 in a "waiting for handover" state
(showing distance/ETA to D1's `transfer.handoverLocation`) until the
`transfer_completed` socket event or a successful `/transfer/verify` call.

**Error responses:**
- `400` — the offer is no longer available (already claimed by another
  partner, or expired).
- `403` — this partner was never offered this transfer.
- `404` — order not found.

On a `400`/`403` here, just drop the offer silently (another DSU partner won
the race) — no need to show an alarming error, a simple "Offer no longer
available" toast is enough.

---

### 7.3 `POST /orders/:orderId/transfer/verify` — D2 verifies D1's handover OTP

Call this when D2, after physically receiving the order from D1, enters the
4-digit code D1 read out to them.

**Request:**
```json
{
  "otp": "4821"
}
```

**Success response:**
```json
{
  "success": true,
  "message": "Transfer verified",
  "data": {
    "order": { "...": "full order object — dispatch.deliveryPartnerId is now D2" }
  }
}
```
On success:
- D2's app should immediately treat this as "my active order now" — drop
  straight into the existing en-route-to-customer UI (no restaurant pickup
  screens). The returned `order` object has everything you need: customer
  address/location, items, pricing, etc. — identical shape to any other
  active-trip order.
- D1's app (listening on socket, see Section 8) will independently be
  notified via `transfer_completed` and should clear its own active trip at
  that point — **D2 does not need to tell D1 anything directly**, the
  backend handles notifying both sides.

**Error responses:**
- `400` — invalid/expired OTP, or there's no pending transfer to verify
  (show "Invalid handover OTP. Ask the other delivery partner for the
  code." — let D2 retry).
- `403` — this transfer wasn't accepted by the calling partner (shouldn't
  normally happen in the UI flow, but handle it defensively).
- `404` — order not found.

---

### 7.4 Everything else is unchanged

Once D2 owns the order (after 7.3 succeeds), continue using your **existing,
already-implemented** endpoints exactly as you do for a normal order:

```
PATCH /orders/:orderId/reached-drop
POST  /orders/:orderId/verify-drop-otp
POST  /orders/:orderId/collect/qr
POST  /orders/:orderId/collect/cash
PATCH /orders/:orderId/complete
GET   /orders/:orderId/route
```

No request/response shape changes on any of these for the transfer case.

---

## 8. Socket.IO events

You already maintain a Socket.IO connection to the delivery namespace for
`new_order_available`, `order_status_update`, etc. The following **new**
events are emitted on that same connection — no new connection/room setup
needed, you're already joined to room `delivery:<yourPartnerId>`.

| Event | Who receives it | When | Payload |
|---|---|---|---|
| `new_transfer_order_available` | DSU-role partners near D1 | D1 calls `/transfer/initiate` and partners are found | see below |
| `play_notification_sound` | Same partners | Same moment (standard sound-ping pattern you already handle) | `{ audience: "delivery", type: "new_transfer_order_available", orderId, orderMongoId }` |
| `transfer_accepted` | D1 only | D2 calls `/transfer/accept` | see below |
| `transfer_offer_closed` | Every other DSU partner who was offered but didn't accept | Same moment as above | `{ orderMongoId, orderId }` — dismiss their offer screen if still showing it |
| `transfer_completed` | D1 only | D2 calls `/transfer/verify` successfully | `{ orderMongoId, orderId }` — clear D1's active trip now |
| `order_transferred` | The **customer's** app (not relevant to your Flutter driver app, listed here for completeness) | Same moment | — |

### `new_transfer_order_available` payload
```json
{
  "orderMongoId": "671234abc...",
  "orderId": "ORD-10234",
  "pickupLocation": { "lat": 12.9716, "lng": 77.5946 },
  "itemsCount": 3,
  "dsuTransferCharge": 20,
  "paymentMethod": "cash",
  "pickupDistanceMeters": 340
}
```
- `pickupLocation` = D1's current location (where the physical handover will
  happen) — show this on a small map preview like you do for restaurant
  pickup offers.
- `dsuTransferCharge` = what D2 will earn if they accept and complete this
  (NOT the normal `riderEarning` — see Section 6).
- `pickupDistanceMeters` = how far D2 currently is from the handover point.
- This event can repeat/update if the search widens — treat a repeat event
  for the same `orderMongoId` as a refresh of the same visible offer, not a
  new one (same dedupe pattern you already use for `new_order_available`).

### `transfer_accepted` payload (sent to D1 only)
```json
{
  "orderMongoId": "671234abc...",
  "orderId": "ORD-10234",
  "toPartnerId": "66abc123...",
  "transferOtp": "4821",
  "message": "Share this OTP with the delivery partner taking over the order."
}
```
This is the **only** place the handover OTP is ever delivered. Show it
full-screen/prominently to D1 immediately (4 big digits, like your existing
customer-OTP display pattern), and keep showing it until `transfer_completed`
arrives.

---

## 9. Edge cases you must handle

1. **No DSU partner found.** `/transfer/initiate` returns
   `eligible: false`. Just let D1 continue the normal flow. Never block
   delivery completion on this feature.

2. **D1 cancels the search while waiting.** Give D1 a "Cancel and deliver it
   myself" button at all times during the "waiting for a DSU partner" state.
   There's no explicit "cancel transfer" API — simply dismiss your own UI
   state locally and let D1 proceed to the normal Verify & Complete flow. If
   a DSU partner accepts *after* D1 has already completed the delivery
   themselves, the backend's `/transfer/accept` and `/transfer/verify` calls
   will simply fail with a `400` (order already delivered) — handle that
   gracefully on D2's side with a "This order is no longer available" toast.

3. **Multiple DSU partners see the same offer.** Only one can accept
   (`/transfer/accept` is first-come-first-served; losers get a `400`). All
   other offered partners receive `transfer_offer_closed` — dismiss their
   offer screen when this arrives even if they hadn't acted yet.

4. **D2's offer expires.** Apply a client-side countdown (recommend 30
   seconds, same convention as your restaurant-offer countdown) and treat a
   timeout as a reject — no explicit "expire" API call needed, just stop
   showing the offer. If D2 doesn't act, D1 will eventually complete the
   order themselves (no automatic re-offer loop currently — this is a single
   broadcast, not a retrying hunt like restaurant dispatch).

5. **App killed/restarted mid-transfer.** On app relaunch, call
   `GET /orders/current` (your existing active-trip-recovery call) as usual.
   - If D1 killed the app after initiating but before D2 accepted: the
     active order will still show `transfer.status: "offered"`. Just resume
     your normal active-trip screen; there's no persistent "waiting" UI state
     to restore — if a DSU partner accepts later, D1 will still get the
     `transfer_accepted` socket event once reconnected. If the app is
     reconnecting to sockets properly (same as the rest of your existing
     flows), nothing extra needed.
   - If D2 killed the app after `/transfer/accept` but before `/transfer/verify`:
     recovery shows `transfer.status: "accepted"` with `transfer.toPartnerId`
     equal to D2's own id — resume the "enter handover OTP" screen.
   - If the transfer already completed while the app was closed: recovery
     naturally shows the order with `dispatch.deliveryPartnerId` as the
     recovering partner, in whatever delivery phase it's actually in — no
     special-casing needed, this looks just like any other active order.

6. **GPS not available when D1 taps "Transfer".** `/transfer/initiate`
   requires `lat`/`lng` — validate you have a recent location fix before
   enabling the button, or show "Waiting for your location…" and retry.

7. **Zone doesn't have Order Transfer enabled.** `/transfer/initiate`
   returns a `400` with message `"Order transfer is not enabled for this
   zone"`. **Recommendation:** rather than always showing the "Transfer this
   order?" button and handling this as an error, you can optionally hide the
   button entirely by checking if the order's zone supports it — but this
   requires an extra lookup. The simplest correct approach (what the
   reference web app does) is: **always show the button**, and if the call
   fails with this specific message, just show a brief toast and dismiss —
   treat it exactly like the "no DSU partners found" case from the driver's
   perspective (nothing to transfer to, continue normally).

8. **Driver has both `normal` and `dsu` roles and is mid-delivery on a normal
   order when a transfer offer comes in.** Transfer offers
   (`new_transfer_order_available`) are only sent to **online, idle** DSU
   partners (the backend filters candidates, but does not currently check
   "has no active order" — so as a safety measure on your client: if the
   partner already has an `activeOrder` set, **do not show** the incoming
   transfer offer screen, just ignore the socket event**.**) This mirrors how
   you likely already guard against showing a new restaurant-pickup offer
   while mid-trip.

---

## 10. Screens checklist for the Flutter team

- [ ] **Profile / Settings**: Add "Driver Role" selector — checkboxes for
      "Normal" and "DSU", calling `PATCH /profile/details` with
      `driverRoles`.
- [ ] **Active trip screen (D1 side)**: Add a secondary "Transfer this
      order?" button, visible only once the order is picked up and before
      Verify & Complete, and only if `transfer.status` is `"none"`.
- [ ] **Transfer offer bottom sheet (D1 side)**: states —
      `offer → searching → waiting → handover (show OTP) → done`, plus a
      `none_found` state and a cancel/skip option at every stage. See
      Section 4's lifecycle diagram for exact states and Section 7.1–7.3 for
      exact API calls per state transition.
- [ ] **Incoming transfer offer screen (D2 side)**: similar to your existing
      new-order offer card, but simpler — no restaurant info, just handover
      distance + `dsuTransferCharge` + a countdown + Accept/Reject.
- [ ] **Handover OTP entry screen (D2 side)**: 4-digit code entry, calls
      `/transfer/verify`, on success transitions straight into the existing
      "en route to customer" screen — **reuse your existing screen**, do not
      build a new one; the only difference is you skip the restaurant-pickup
      step.
- [ ] **Map polyline**: when the active order has `transfer.status` in
      `["verified", "completed"]` (i.e. you are D2 with a transferred
      order), draw the route from the driver's **current live GPS location**
      to the **customer's location** — there is no restaurant leg to draw.
      If you already compute polylines based on trip phase (e.g.
      "picked_up" phase = rider→customer), this is likely already correct
      with zero extra code, since a transferred order enters your app
      exactly at the "picked_up" phase.
- [ ] **Wallet/Earnings screen**: no new screen needed — just make sure your
      transaction list renders unrecognized `category` values using their
      raw `description` text instead of hiding/crashing (see Section 6).

---

## 11. Quick glossary

| Term | Meaning |
|---|---|
| **D1** | The delivery partner who originally accepted the order from the restaurant and initiates the transfer. |
| **D2** | The DSU partner who accepts the transfer and finishes the delivery. |
| **DSU** | "Delivery Service Unit" / DSU-role partner — a partner opted-in to receive transfer offers. |
| **Handover OTP / `transferOtp`** | The 4-digit code D1 shows and D2 types in, confirming the physical handoff. Different from the customer's drop-OTP. |
| **Zone** | Admin-configured delivery area. Order Transfer is enabled/disabled, and its radius + DSU charge are configured, per zone. |
| **`dsuTransferCharge`** | Flat ₹ amount, set by admin per zone, charged to the customer at checkout whenever the order's zone has Order Transfer enabled (charged regardless of whether a transfer actually happens), and paid out in full to D2 if a transfer does happen. |

---

*Questions about this contract should go to the backend team before you start
implementation — the REST/socket shapes above are final and already live in
the reference web delivery app (DeliveryV2), so you can also compare
behavior there if anything is ambiguous.*
