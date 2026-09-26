// Self-check for the "Free Delivery" coupon type: no subtotal discount, and the admin
// offer validator forces restaurant scope + a single use per user + both dates.
// Run: node scripts/test-free-delivery-coupon.mjs
import assert from 'node:assert/strict';
import { calculateDiscountFromCoupon, normalizeDiscountType } from '../src/modules/food/shared/coupon.util.js';
import { validateCreateOfferDto } from '../src/modules/food/admin/validators/offer.validator.js';

assert.equal(normalizeDiscountType('free-delivery'), 'free-delivery');
assert.equal(calculateDiscountFromCoupon({ discountType: 'free-delivery' }, 500), 0);

const restaurantId = '507f1f77bcf86cd799439011';
const dto = validateCreateOfferDto({
    couponCode: 'FREEDEL10',
    discountType: 'free-delivery',
    restaurantId,
    startDate: '2026-10-01',
    endDate: '2026-10-31',
});
assert.equal(dto.discountValue, 0);
assert.equal(dto.restaurantScope, 'selected');
assert.equal(dto.perUserLimit, 1);

assert.throws(
    () => validateCreateOfferDto({ couponCode: 'X', discountType: 'free-delivery', restaurantId }),
    /Start date and end date are required/
);
assert.throws(
    () => validateCreateOfferDto({ couponCode: 'X', discountType: 'free-delivery', startDate: '2026-10-01', endDate: '2026-10-31' }),
    /restaurantId is required/
);

console.log('free delivery coupon: all checks passed');
