import mongoose from 'mongoose';
import { FoodItem } from '../models/food.model.js';
import { ValidationError, NotFoundError } from '../../../../core/auth/errors.js';

const MAX_LIST_LIMIT = 100;

const presentFood = (doc) => ({
    id: String(doc._id),
    name: doc.name,
    image: doc.image || doc.images?.[0] || '',
    foodType: doc.foodType,
    price: Number(doc.price) || 0,
    restaurantId: doc.restaurantId?._id ? String(doc.restaurantId._id) : String(doc.restaurantId || ''),
    restaurantName: doc.restaurantId?.restaurantName || '',
    packagingFee: Number(doc.packagingFee) || 0,
    packagingFeeGstRate: Number(doc.packagingFeeGstRate) || 0,
});

/**
 * Food items for the admin's per-item packaging fee screen. Every approved/available food
 * item is listed (not just ones already priced) so admin can find and set packaging on any
 * of them, individually or in bulk.
 */
export async function listFoodsForPackaging(query = {}) {
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), MAX_LIST_LIMIT);
    const skip = (page - 1) * limit;

    const filter = {};
    if (query.restaurantId && mongoose.Types.ObjectId.isValid(String(query.restaurantId))) {
        filter.restaurantId = new mongoose.Types.ObjectId(String(query.restaurantId));
    }
    const search = String(query.search || '').trim();
    if (search) {
        filter.name = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    }
    if (query.onlyWithPackaging === 'true') {
        filter.packagingFee = { $gt: 0 };
    } else if (query.onlyWithoutPackaging === 'true') {
        filter.$or = [{ packagingFee: { $exists: false } }, { packagingFee: { $lte: 0 } }];
    }

    const [docs, total] = await Promise.all([
        FoodItem.find(filter)
            .select('name image images foodType price restaurantId packagingFee packagingFeeGstRate')
            .populate({ path: 'restaurantId', select: 'restaurantName' })
            .sort({ name: 1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        FoodItem.countDocuments(filter),
    ]);

    return {
        items: docs.map(presentFood),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
    };
}

export async function setFoodPackaging(foodId, { packagingFee, packagingFeeGstRate }) {
    if (!foodId || !mongoose.Types.ObjectId.isValid(String(foodId))) {
        throw new ValidationError('Invalid food item id');
    }
    const updated = await FoodItem.findByIdAndUpdate(
        foodId,
        { $set: { packagingFee, packagingFeeGstRate } },
        { new: true }
    )
        .select('name packagingFee packagingFeeGstRate')
        .lean();
    if (!updated) {
        throw new NotFoundError('Food item not found');
    }
    return presentFood(updated);
}

/** Applies the same packaging fee/GST to every selected food item in one write. */
export async function bulkSetFoodPackaging({ itemIds, packagingFee, packagingFeeGstRate }) {
    const ids = itemIds.map((id) => new mongoose.Types.ObjectId(id));
    const result = await FoodItem.updateMany(
        { _id: { $in: ids } },
        { $set: { packagingFee, packagingFeeGstRate } }
    );
    return {
        matched: result.matchedCount ?? result.n ?? 0,
        modified: result.modifiedCount ?? result.nModified ?? 0,
    };
}
