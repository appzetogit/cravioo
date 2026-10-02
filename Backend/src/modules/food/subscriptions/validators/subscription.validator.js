import { z } from 'zod';
import { ValidationError } from '../../../../core/auth/errors.js';

const purchaseSubscriptionSchema = z.object({
    planId: z.string().min(1, 'Plan ID is required')
});

// Cashfree never hands the client a signature - verification happens by re-fetching
// the order/subscription status from Cashfree's server, so only an id is needed here.
const verifyPurchaseSchema = z.object({
    cashfreeOrderId: z.string().optional(),
    cashfreeSubscriptionId: z.string().optional(),
}).refine((data) => data.cashfreeOrderId || data.cashfreeSubscriptionId, {
    message: 'cashfreeOrderId or cashfreeSubscriptionId is required',
});

export function validatePurchaseSubscriptionDto(body) {
    const result = purchaseSubscriptionSchema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }
    return result.data;
}

export function validateVerifyPurchaseDto(body) {
    const result = verifyPurchaseSchema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }
    return result.data;
}
