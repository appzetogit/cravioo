// Self-check for per-food-item packaging fee/GST summing (replaces the old global packaging
// fee). Run: node scripts/test-item-packaging-fee.mjs
import assert from 'node:assert/strict';
import { computeItemsPackagingTotals } from '../src/modules/food/shared/feeGst.util.js';

// 2x item @ ₹10 packaging incl. 18% GST, 1x item @ ₹5 no GST, 1 non-food line ignored.
const items = [
    { type: 'food', quantity: 2, packagingFee: 10, packagingFeeGstRate: 18 },
    { type: 'food', quantity: 1, packagingFee: 5, packagingFeeGstRate: 0 },
    { type: 'quick', quantity: 3, packagingFee: 100 }, // not a food line -> excluded
];

const r = computeItemsPackagingTotals(items);
assert.equal(r.gross, 25); // (2*10) + (1*5)
assert.equal(r.net, 21.95);
assert.equal(r.gst, 3.05);
assert.equal(r.ratePct, 12.2); // blended, display only

// Items with no packaging fee set contribute nothing.
assert.deepEqual(
    computeItemsPackagingTotals([{ type: 'food', quantity: 1 }]),
    { gross: 0, net: 0, gst: 0, ratePct: 0 },
);

console.log('item packaging fee: all checks passed');
