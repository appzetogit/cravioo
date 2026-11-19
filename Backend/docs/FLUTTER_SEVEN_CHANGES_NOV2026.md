# Flutter Implementation Guide — November 2026 Changes

This covers 7 changes shipped to the web app (user, admin, restaurant panels) that the
Flutter apps (Cravioo_user, Cravioo_restaurent, Cravioo_delivery if relevant) need to
mirror for parity. All backend API changes are additive/backward-compatible — existing
fields are unchanged, only new fields were added.

---

## 1. Dynamic hero banners (user app home screen)

No backend change. The banner API already existed:

```
GET /api/food/hero-banners/public?zoneId=<id>
```

Returns admin-configured banners (image + title/subtitle/action per banner). The web app
previously overrode this with hardcoded static images — that override has been removed.

**Flutter action:** If the Flutter home screen also hardcodes banner images/text, replace
with a call to the above endpoint and render whatever images/text admin configured. No
fallback/default banner text should be overlaid on top of the image.

---

## 2. No default placeholder images

No backend change — this was a frontend-only fix (web app stopped forcing a placeholder
URL into the image array when a food item/restaurant has no photo).

**Flutter action:** When `food.image`, `food.images`, `restaurant.profileImage`, etc. are
empty/null, render an empty/neutral section (e.g. a plain gray box) instead of any
hardcoded placeholder asset or third-party placeholder URL.

---

## 3. Admin-level restaurant online/offline override

**New restaurant field:** `adminForcedOffline` (boolean, default `false`).

This is **separate** from the existing `isAcceptingOrders` field (the restaurant's own
toggle). Both are returned on every restaurant payload (list, detail, current-profile):

```json
{
  "isAcceptingOrders": true,
  "adminForcedOffline": false,
  ...
}
```

**Availability logic (apply BOTH checks):**
- If `adminForcedOffline === true` → restaurant is offline/unavailable, **regardless** of
  `isAcceptingOrders`. Do not allow ordering. Show as closed/unavailable in restaurant
  lists and detail pages.
- Else, fall back to existing `isAcceptingOrders` + outlet-timings logic as before.

**Order creation enforcement (backend, already live):** `POST /api/food/orders` (create)
and the pricing/calculate endpoint now reject orders with:
```json
{ "success": false, "message": "This restaurant is currently unavailable." }
```
when `adminForcedOffline` is true, and:
```json
{ "success": false, "message": "Restaurant not accepting orders." }
```
when `isAcceptingOrders` is false. Flutter should handle these error messages gracefully
(same as any other order-validation error) even if the UI already prevented the order
attempt.

**Restaurant app (Cravioo_restaurent) action:** On the restaurant's own online/offline
toggle screen, if `adminForcedOffline === true`:
- Disable the toggle (restaurant cannot turn itself back online).
- Show a message like "Your restaurant has been turned offline by admin. Contact support."
- This does not change the restaurant's own `isAcceptingOrders` value — it's purely an
  override on top.

**No new endpoint needed on the restaurant app side** — just read `adminForcedOffline` from
the existing "get current restaurant" response and react to it as above.

---

## 4. Food item display order within a category

**New food item field:** `sortOrder` (number, nullable, default `null`).

Returned on every menu item in the restaurant menu response:
```json
{
  "id": "...",
  "name": "...",
  "sortOrder": 1,
  ...
}
```

**Sort behavior (already applied server-side, no client sort needed for the standard menu
endpoints):** Within each category section, items with a lower `sortOrder` show first.
Items with `sortOrder: null` sort after all items that have an explicit value, and among
themselves fall back to newest-created-first (unchanged legacy behavior).

**Flutter action (restaurant app, item create/edit screen):** Add a "Display Order" number
input (optional) when creating/editing a food item. Send it as `sortOrder` in the
create/update food item request body:
```
POST /api/food/restaurant/foods           { ..., "sortOrder": 1 }
PATCH /api/food/restaurant/foods/:id      { ..., "sortOrder": 1 }
```
Leaving it blank should send `null` (not `0`).

Category ordering itself is unchanged — categories already sorted by their own
`sortOrder` field before this change.

---

## 5. "Under 149" tab label

Web-only text fix — the bottom nav tab already correctly said "Under 149" in the web
app's component. **If the Flutter app's own bottom navigation bar shows a different label
(e.g. "Under 250") for this tab, update it to "Under 149"** — this is purely a client-side
string, no backend/API change involved.

---

## 6. 15-day recycle bin for deleted restaurants/food items

**New fields:**
- `FoodRestaurant.deletedAt` (date, nullable) — set when admin soft-deletes a restaurant.
- `FoodItem.isDeleted` (boolean, default `false`) and `FoodItem.deletedAt` (date, nullable)
  — food items are now soft-deleted, not hard-deleted.

**Behavior change:** Deleting a restaurant or food item via the admin panel no longer
removes it immediately — it's hidden from all customer/restaurant-facing menus, search,
and listings (via `isDeleted`/`deletedAt` filtering already applied server-side), but the
underlying record persists for 15 days and can be restored by admin. After 15 days it is
permanently purged.

**Flutter action:** None required unless the Flutter admin app also has a delete-food or
delete-restaurant flow — if so:
- Update any "delete" confirmation copy from "cannot be undone" to mention the 15-day
  recycle bin / restore window.
- A deleted food item will simply stop appearing in `GET` menu/list responses — no new
  flutter-side filtering needed, the backend already excludes soft-deleted items.
- Restore (if the Flutter admin app needs it) uses the existing reactivate endpoint:
  ```
  POST /api/food/admin/deleted-accounts/:id/reactivate
  Body: { "role": "Food Item" }   // new role value, in addition to existing
                                   // "User" | "Restaurant" | "Delivery Boy"
  ```
  And listing deleted items:
  ```
  GET /api/food/admin/deleted-accounts
  ```
  now also returns entries with `"role": "Food Item"` in the same array shape as
  existing roles (`id`, `name`, `detail`, `deletedAt`, etc.).

---

## 7. Per-restaurant GST exemption

**New restaurant field:** `gstApplicable` (boolean, default `true`).

When `gstApplicable === false` for a restaurant, that restaurant's food items are GST
(tax) **exempt**. The backend order pricing calculation now returns `0` for food GST on
that restaurant's orders — the other GST components (platform fee GST, packaging fee GST)
are unaffected and still apply normally if configured.

**Pricing response fields (unchanged shape, values differ when exempt):**
```json
{
  "pricing": {
    "tax": 12.5,            // combined: foodGst + platformFeeGst + packagingFeeGst
    "foodGst": 0,            // 0 for an exempt restaurant, normal amount otherwise
    "foodGstRate": 0,        // 0 for an exempt restaurant
    "foodGstApplicable": false,  // NEW — explicit flag, use this to decide whether to render the row at all
    "platformFeeGst": ...,
    "packagingFeeGst": ...
  }
}
```

**Flutter action (user app — cart/checkout/order details screens):**
- When showing a GST/tax breakdown, check `foodGstApplicable` (or simply `foodGst > 0`) —
  if false/zero, **do not render the "GST on food items" row at all** (not even as ₹0).
  Other GST rows (platform fee GST, packaging fee GST) should still render normally if
  their amounts are nonzero — this is per-component, not all-or-nothing.
- The combined `pricing.tax` total already reflects the correct combined amount — no
  separate calculation needed on the client, just read it as before.

**No action needed** for restaurants where `gstApplicable` is `true` (default) — flow is
unchanged.

**Admin app (if Flutter has one):** No specific UI requirement unless you want to expose
the per-restaurant GST toggle there too — it's controlled via:
```
PATCH /api/food/admin/restaurants/:id/gst-applicable
Body: { "gstApplicable": true | false }
```

---

## Summary of new/changed fields at a glance

| Model | Field | Type | Notes |
|---|---|---|---|
| FoodRestaurant | `adminForcedOffline` | boolean | admin kill switch, independent of `isAcceptingOrders` |
| FoodRestaurant | `gstApplicable` | boolean (default `true`) | per-restaurant GST exemption |
| FoodRestaurant | `deletedAt` | date, nullable | recycle-bin timestamp |
| FoodItem | `sortOrder` | number, nullable | manual display order within category |
| FoodItem | `isDeleted` / `deletedAt` | boolean / date | soft-delete, recycle bin |
| Order pricing | `foodGstApplicable` | boolean | explicit flag for hiding the GST row in UI |

No existing field was renamed or removed; all changes are additive.
