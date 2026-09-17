import mongoose from 'mongoose';

/**
 * Dining banners are fully admin-owned: admin adds as many as needed and controls
 * visibility with `isActive` alone — there is no start/end scheduling. The user app
 * renders every active banner ordered by `sortOrder`.
 */
const foodDiningBannerSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true, maxlength: 120 },
        subtitle: { type: String, trim: true, default: '', maxlength: 200 },
        image: { type: String, required: true, trim: true },
        imagePublicId: { type: String, trim: true, default: '' },
        ctaText: { type: String, trim: true, default: '', maxlength: 60 },
        link: { type: String, trim: true, default: '', maxlength: 500 },
        sortOrder: { type: Number, default: 0, index: true },
        isActive: { type: Boolean, default: true, index: true }
    },
    {
        collection: 'food_dining_banners',
        timestamps: true
    }
);

foodDiningBannerSchema.index({ isActive: 1, sortOrder: 1, createdAt: 1 });

export const FoodDiningBanner = mongoose.model(
    'FoodDiningBanner',
    foodDiningBannerSchema,
    'food_dining_banners'
);
