export const DEFAULT_RESTAURANT_COMMISSION_PERCENTAGE = 15;

export const DEFAULT_RESTAURANT_COMMISSION_RATE =
  DEFAULT_RESTAURANT_COMMISSION_PERCENTAGE / 100;

/**
 * Resolves restaurant commission percentage.
 * - null / undefined / NaN / empty → default 15%
 * - explicit 0 → 0% (negotiated zero commission)
 */
export function resolveRestaurantCommissionPercentage(value) {
  if (value === null || value === undefined || value === '') {
    return DEFAULT_RESTAURANT_COMMISSION_PERCENTAGE;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return DEFAULT_RESTAURANT_COMMISSION_PERCENTAGE;
  }
  return num;
}

/** Is this restaurant on the user-commission pricing model (customer pays a markup, restaurant keeps full price)? */
export function isUserCommissionRestaurant(restaurant) {
  return restaurant?.pricingModel === 'userCommission';
}

/** 0-100 markup % customers pay on top of the listed item price for user-commission restaurants. */
export function resolveUserCommissionPercentage(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

/**
 * Applies the user-commission markup to a base item price when the restaurant
 * is on that pricing model. No-op (returns basePrice unchanged) for restaurants
 * on the default 'commission' model — never touches restaurant-owner-facing views.
 */
export function applyUserCommissionMarkup(basePrice, restaurant) {
  const price = Number(basePrice) || 0;
  if (!isUserCommissionRestaurant(restaurant)) return price;
  const pct = resolveUserCommissionPercentage(restaurant?.userCommissionPercentage);
  if (pct <= 0) return price;
  return Math.round(price * (1 + pct / 100) * 100) / 100;
}
