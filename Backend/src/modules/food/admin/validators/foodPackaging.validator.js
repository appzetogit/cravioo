import { z } from 'zod';
import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';

const MAX_BULK_ITEMS = 500;

const packagingFieldsSchema = z.object({
    packagingFee: z.number().min(0),
    packagingFeeGstRate: z.number().min(0).max(100).optional().default(0),
});

const normalizePackagingBody = (body = {}) => ({
    packagingFee: Number(body?.packagingFee),
    packagingFeeGstRate: body?.packagingFeeGstRate !== undefined && body?.packagingFeeGstRate !== null && body?.packagingFeeGstRate !== ''
        ? Number(body.packagingFeeGstRate)
        : 0,
});

/** Single food item packaging fee update. */
export const validateSetFoodPackagingDto = (body) => {
    const result = packagingFieldsSchema.safeParse(normalizePackagingBody(body));
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }
    return result.data;
};

/** Bulk-apply the same packaging fee/GST to many food items at once. */
export const validateBulkSetFoodPackagingDto = (body) => {
    const itemIds = Array.isArray(body?.itemIds) ? body.itemIds.map((id) => String(id || '').trim()) : [];
    if (itemIds.length === 0) {
        throw new ValidationError('Select at least one food item');
    }
    if (itemIds.length > MAX_BULK_ITEMS) {
        throw new ValidationError(`Cannot update more than ${MAX_BULK_ITEMS} food items at once`);
    }
    const validIds = itemIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
        throw new ValidationError('No valid food items selected');
    }

    const fields = validateSetFoodPackagingDto(body);
    return { itemIds: [...new Set(validIds)], ...fields };
};
