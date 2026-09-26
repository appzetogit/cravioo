const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Splits a customer-facing fee that already INCLUDES GST into its net and GST parts.
 *   gross 20, rate 18%  ->  gst 3.05, net 16.95  (net + gst === gross exactly)
 * Rate 0 / missing keeps the fee untouched, so existing behaviour is unchanged until admin sets a rate.
 */
export function splitInclusiveGst(gross, ratePct) {
    const g = Math.max(0, round2(gross || 0));
    const rate = Number(ratePct);
    if (!(g > 0) || !Number.isFinite(rate) || rate <= 0) {
        return { gross: g, gst: 0, net: g, ratePct: Number.isFinite(rate) && rate > 0 ? rate : 0 };
    }
    const gst = round2(g - g / (1 + rate / 100));
    return { gross: g, gst, net: round2(g - gst), ratePct: rate };
}

/**
 * Sums per-item packaging fee × quantity across food line items — packaging fee/GST are set
 * per food item now, not globally (each item.packagingFee / item.packagingFeeGstRate is
 * resolved from its Food document; see applyServerFoodItemPricing). Each item's own
 * GST-inclusive fee is split at its own rate first, then the net/gst parts are summed —
 * mathematically identical to splitting one combined amount when all rates match, and
 * correct per line when they don't.
 */
export function computeItemsPackagingTotals(items = []) {
    let gross = 0;
    let net = 0;
    let gst = 0;
    for (const item of Array.isArray(items) ? items : []) {
        if (item?.type !== 'food') continue; // packaging fee is a food-item concept only
        const unitFee = Number(item.packagingFee) || 0;
        if (unitFee <= 0) continue;
        const qty = Math.max(1, Number(item.quantity) || 1);
        const lineGross = round2(unitFee * qty);
        const split = splitInclusiveGst(lineGross, item.packagingFeeGstRate);
        gross = round2(gross + split.gross);
        net = round2(net + split.net);
        gst = round2(gst + split.gst);
    }
    // Blended rate for display only — the amounts above are already computed per item/rate.
    const ratePct = gross > 0 ? round2((gst / gross) * 100) : 0;
    return { gross, net, gst, ratePct };
}

export { round2 };
