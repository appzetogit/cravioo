// Self-check for the 2-slab cumulative delivery pricing (slab 1 = flat base, slab 2 = per-km
// beyond it) and the admin commission split. Run: node scripts/test-cumulative-delivery-fee.mjs
import assert from 'node:assert/strict';
import { resolveUserDeliveryFee, calculateRiderEarning } from '../src/modules/food/shared/delivery-fee.util.js';
import { validateFeeSettingsUpsertDto } from '../src/modules/food/admin/validators/feeSettings.validator.js';

const feeSettings = {
    deliveryFeeRanges: [
        { min: 0, max: 3, fee: 30 },
        { min: 3, max: 7, fee: 5 }, // per-km rate beyond slab 1
    ],
    deliveryCommissionPct: 10,
};

// Within slab 1: flat ₹30, rider gets 30 - 10% = 27.
assert.equal(resolveUserDeliveryFee(feeSettings, { distanceKm: 2 }).deliveryFee, 30);
assert.equal(calculateRiderEarning(feeSettings, 2), 27);

// 5km = 3km @ slab1's flat ₹30 + 2km @ ₹5/km = 40; rider gets 40 - 10% = 36, admin keeps 4.
assert.equal(resolveUserDeliveryFee(feeSettings, { distanceKm: 5 }).deliveryFee, 40);
assert.equal(calculateRiderEarning(feeSettings, 5), 36);

// Beyond slab 2's own max, its per-km rate keeps applying (open-ended — nowhere else to go).
assert.equal(resolveUserDeliveryFee(feeSettings, { distanceKm: 10 }).deliveryFee, 30 + 7 * 5);

// Not exactly 2 ranges (0 or 1 configured) -> falls back to plain flat-fee-per-range (unaffected).
const single = { deliveryFeeRanges: [{ min: 0, max: 5, fee: 20 }] };
assert.equal(resolveUserDeliveryFee(single, { distanceKm: 3 }).deliveryFee, 20);

// Server rejects a 3rd range.
assert.throws(
    () => validateFeeSettingsUpsertDto({
        deliveryFeeRanges: [{ min: 0, max: 3, fee: 30 }, { min: 3, max: 7, fee: 5 }, { min: 7, max: 12, fee: 8 }],
    }),
    /At most 2 delivery fee ranges/
);

console.log('cumulative delivery fee: all checks passed');
