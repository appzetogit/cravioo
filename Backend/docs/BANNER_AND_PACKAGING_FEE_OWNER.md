# Restaurant Banners & Packaging Fee Owner — API Reference for Flutter

This document covers two independent backend features added for the restaurant
and admin panels. Both are already live on the web admin/restaurant panels —
this doc is for implementing the equivalent screens in the Flutter apps
(Cravioo_restaurent, Cravioo_user).

**Revision note:** this version adds the fixes found during a full
end-to-end verification pass after the initial release — a banner-upload
hang on oversize files, banners not surviving a page refresh, banners not
showing on the customer app, and packaging fee still leaking into a few
restaurant-side screens and the restaurant's own POS billing when
admin-owned. All of those are now fixed server-side (see the per-section
notes below) — nothing here requires a Flutter-side workaround, just making
sure the Flutter apps trust the now-corrected server fields rather than
re-deriving their own totals from raw `pricing.packagingFee`.

---

## 1. Restaurant Banners

### What it is
Restaurants can upload banner images shown in the customer-facing restaurant
page's scrolling hero gallery (the same carousel that shows cover/menu
images). Unlike Cover Images / Menu Images, banners need **no admin
approval** — they go live the moment the restaurant uploads them.

A restaurant can upload as many banners as it wants (soft cap: 20, oldest
truncated past that).

### Data model
New field on the restaurant document:

```json
"banners": ["https://.../banner1.webp", "https://.../banner2.webp"]
```

Plain array of image URL strings — same shape as `coverImages` and
`menuImages`.

### Endpoints (restaurant app auth — Bearer token, role RESTAURANT, outlet must be approved)

#### Upload banners
```
POST /food/restaurant/profile/banners
Content-Type: multipart/form-data
Field: files (one or more image files, field name "files" repeated per file)
```

Response:
```json
{
  "success": true,
  "message": "Banners uploaded successfully",
  "data": {
    "banners": [
      { "url": "https://.../banner1.webp", "publicId": null },
      { "url": "https://.../banner2.webp", "publicId": null }
    ]
  }
}
```

This call only **uploads and appends** — it already persists to the
restaurant's `banners` array server-side in the same request. No second call
needed to save.

#### Delete a banner
There's no dedicated delete endpoint. Delete by sending the restaurant's
full remaining banner URL list (after removing the one you want gone) to the
generic profile-update endpoint:

```
PATCH /food/restaurant/profile
Content-Type: application/json
Body: { "banners": ["https://.../remaining1.webp", "https://.../remaining2.webp"] }
```

Response: `{ "success": true, "data": { "restaurant": { ...full restaurant doc... } } }`

#### Read current banners
```
GET /food/restaurant/current
```
Returns the full restaurant profile, including `banners: [...]`.

### Customer-facing display
No new endpoint needed — the existing public restaurant-detail endpoint
(`GET /food/restaurant/restaurants/:id`) already returns `banners` on the
restaurant object (no select/projection was limiting it). The Flutter user
app's restaurant-detail screen should fold `banners` into its hero image
carousel, in this order:

```
coverImages → banners → menuImages → profileImage
```
(dedupe by URL, same as the existing gallery-building logic.)

### Validation / limits
- Max 20 banners kept per restaurant (oldest truncated silently if exceeded via the upload endpoint; via the PATCH path, whatever array you send is kept as-is up to 20).
- Each file ≤ 5MB (global upload middleware limit), standard image types.
- No approval workflow — banner changes are visible to customers instantly.
- **A file over 5MB now returns an immediate `400` with `{"message": "File size too large. Maximum 5MB allowed per file."}`.** (Earlier builds let an oversize file hang the request with no response until the client's own timeout fired — fixed; Flutter should treat any `LIMIT_FILE_SIZE`-style 400 here as "pick a smaller image," not retry.)
- Storage is local disk on the server (served back at `https://cravioo.in/uploads/...`), not Cloudinary — URLs returned are already final, no separate CDN step.

---

## 2. Packaging Fee Owner (per restaurant)

### What it is
Packaging fee itself is unchanged — it's still set **per food item** by
admin (existing "Packaging Fee" admin page, unchanged, no Flutter impact
there).

What's new: admin can now choose, **per restaurant**, who actually keeps
that packaging fee money at settlement time:
- `restaurant` (default, unchanged existing behavior) — restaurant earns it.
- `admin` — the **customer still pays the exact same packaging fee** on
  their bill, nothing changes for the customer. But the money goes to the
  platform instead of the restaurant. The restaurant panel must stop
  showing/counting packaging fee entirely for that restaurant's orders.

This is a per-restaurant switch, not per-item — one restaurant is either
fully "restaurant-owned" or fully "admin-owned" for packaging fee across all
its orders.

### Data model

New field on the restaurant document:
```json
"packagingFeeOwner": "restaurant" | "admin"
```

New field on an order's pricing object (`FoodOrder.pricing` /
`calculateOrder` response):
```json
"pricing": {
  ...
  "packagingFee": 16.95,
  "packagingFeeOwner": "restaurant" | "admin",
  ...
}
```

New fields on the settlement transaction (`FoodTransaction.amounts`) —
admin-reporting only, not needed by Flutter:
```json
"amounts": {
  ...
  "restaurantPackagingFeeShare": 16.95,
  "adminPackagingFeeShare": 0,
  ...
}
```

### What does NOT change
- Customer's order total, packaging fee line, and GST breakdown are
  **identical regardless of owner**. Checkout/cart screens in the user app
  need **zero changes**.
- Admin's per-item packaging fee amount/GST-rate setup is unchanged.

### What the Restaurant Flutter app must change

Check `order.pricing.packagingFeeOwner` (or equivalently, the restaurant's
own `packagingFeeOwner` field — they'll always agree for that restaurant's
own orders):

- If `"restaurant"` (default): show the "Packaging fee" bill line and
  include it in "Restaurant Earning" exactly as today.
- If `"admin"`: **hide the "Packaging fee" line entirely** and **exclude it
  from Restaurant Earning / order gross**. The restaurant should not see or
  count this money anywhere in its panel — not on the order detail screen,
  not in the earnings/finance summary, not in payout totals, not in a
  new-order popup/notification, not in the restaurant's own POS printout.

The backend already pre-zeroes this server-side for every surface the
restaurant app reads, so Flutter just needs to stop rendering the
packaging-fee UI block when the payload field comes back as `0` / owner is
`admin` — no client-side math needed, the server already did it. Confirmed
zeroed server-side on:
- `GET /food/restaurant/orders/:id` → `pricing.packagingFeeOwner` +
  `pricing.packagingFee`
- `GET /food/restaurant/orders` (list) → same per-order `pricing` fields
- `GET /food/restaurant/finance` → per-order `packagingFee`/`restaurantGross`
- New-order push/socket payload → `pricing.packagingFeeOwner` present, same
  rule applies if the Flutter app computes its own "what you'll earn" total
  from the raw `pricing` object instead of trusting a pre-computed field
- The restaurant's own PetPooja POS billing (`packing_charges`) — zeroed
  server-side before being sent to PetPooja, so the restaurant's own POS
  receipt/till never shows packaging money it won't actually receive. No
  Flutter action needed here, informational only.

### What the Admin Flutter app (if any) must change
If there's an admin Flutter app with a restaurant-commission or
packaging-fee screen, add a toggle per restaurant: "Packaging Fee Goes To:
Restaurant / Admin", calling:

```
PATCH /food/admin/restaurants/:id
Content-Type: application/json
Body: { "packagingFeeOwner": "restaurant" | "admin" }
```

(Same endpoint used for commission/pricing-model updates — send only the
fields you're changing.)

Add this toggle to **both** screens if the admin app has two separate flows
for "first-time set commission for a restaurant" and "edit an existing
restaurant's commission" (the web admin panel does, and both now carry this
toggle) — don't put it in only one of them.

Dashboard stats endpoint (`GET /food/admin/dashboard-stats`) now also
returns:
```json
"packagingFee": {
  "restaurantShare": 1234.50,
  "adminShare": 89.00,
  "total": 1323.50
}
```

### Settlement math (for reference, no Flutter action needed)
- Packaging fee is GST-inclusive. Its GST portion **always** goes to the
  platform (unchanged, regardless of owner).
- Its net portion goes to `restaurantShare` when owner is `restaurant`
  (unchanged default), or to `platformNetProfit` when owner is `admin`.
- Partial refunds scale `restaurantPackagingFeeShare` /
  `adminPackagingFeeShare` proportionally along with every other settled
  amount — no special refund handling needed on the client.

---

## Summary of endpoints touched/added

| Method | Path | Purpose | New? |
|---|---|---|---|
| POST | `/food/restaurant/profile/banners` | Upload banner image(s) | New |
| PATCH | `/food/restaurant/profile` | Now also accepts `banners: string[]` | Extended |
| GET | `/food/restaurant/current` | Now also returns `banners` | Extended |
| GET | `/food/restaurant/restaurants/:id` (public) | Now also returns `banners` | Extended |
| PATCH | `/food/admin/restaurants/:id` | Now also accepts `packagingFeeOwner` | Extended |
| GET | `/food/admin/restaurants` | Now also returns `packagingFeeOwner` | Extended |
| POST | `/food/order/calculate`, order creation | `pricing.packagingFeeOwner` added to response | Extended |
| GET | `/food/restaurant/orders/:id` | `pricing.packagingFeeOwner` added; packaging fields pre-zeroed for admin-owned restaurants | Extended |
| GET | `/food/restaurant/orders` (list) | Same `pricing.packagingFeeOwner`/`packagingFee` handling as the single-order endpoint | Extended |
| GET | `/food/restaurant/finance` | Per-order `packagingFee`/`restaurantGross` pre-zeroed for admin-owned restaurants | Extended |
| GET | `/food/admin/dashboard-stats` | New `packagingFee: {restaurantShare, adminShare, total}` block | Extended |
| GET | `/food/admin/reports/restaurants` | New `packagingFeeOwner`, `restaurantPackagingFeeShare`, `adminPackagingFeeShare` per restaurant row | Extended |
| — | Restaurant's own PetPooja POS payload (`packing_charges`) | Zeroed when that restaurant's `packagingFeeOwner` is `'admin'` | Extended |
