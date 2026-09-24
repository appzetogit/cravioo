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

export { round2 };
