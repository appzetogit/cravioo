import mongoose from 'mongoose';

/**
 * Admin-managed dining categories (e.g. Fine Dining, Rooftop, Cafe, Buffet).
 * Restaurants pick from this list while raising a dining request; users use it to filter.
 * Image is mandatory — the user app renders these as image tiles.
 */
const foodDiningCategorySchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 120 },
        nameNormalized: { type: String, trim: true, lowercase: true },
        description: { type: String, trim: true, default: '', maxlength: 500 },
        image: { type: String, required: true, trim: true },
        imagePublicId: { type: String, trim: true, default: '' },
        sortOrder: { type: Number, default: 0, index: true },
        isActive: { type: Boolean, default: true, index: true }
    },
    {
        collection: 'food_dining_categories',
        timestamps: true
    }
);

foodDiningCategorySchema.index({ isActive: 1, sortOrder: 1 });
foodDiningCategorySchema.index({ nameNormalized: 1 }, { unique: true });

foodDiningCategorySchema.pre('validate', function normalizeName(next) {
    if (this.name) {
        this.nameNormalized = String(this.name).trim().toLowerCase();
    }
    next();
});

export const FoodDiningCategory = mongoose.model(
    'FoodDiningCategory',
    foodDiningCategorySchema,
    'food_dining_categories'
);
