import mongoose from 'mongoose';

const foodGourmetRestaurantSchema = new mongoose.Schema(
    {
        restaurantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required: true
        },
        tags: {
            type: [String],
            default: []
        },
        // Discriminates which admin-curated rail this entry belongs to. Kept on the
        // same collection (instead of a separate Trending model) since Top 10 and
        // Trending Now are identical in shape - only the list they populate differs.
        type: {
            type: String,
            enum: ['top10', 'trending'],
            default: 'top10',
            index: true
        },
        // Zone this entry should be shown in. null = show in every zone (global),
        // matching the same single-zone convention used by hero banners.
        zoneId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodZone',
            default: null
        },
        priority: {
            type: Number,
            default: 0,
            index: true
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true
        }
    },
    {
        collection: 'food_gourmet_restaurants',
        timestamps: true
    }
);

foodGourmetRestaurantSchema.index({ restaurantId: 1, type: 1 });
foodGourmetRestaurantSchema.index({ isActive: 1, type: 1, priority: 1 });

export const FoodGourmetRestaurant = mongoose.model('FoodGourmetRestaurant', foodGourmetRestaurantSchema, 'food_gourmet_restaurants');

