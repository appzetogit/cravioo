import mongoose from 'mongoose';

/**
 * A record of "admin shared this taxes report period with this restaurant".
 * Stores only the pointer (which period, when, by whom) - not a data snapshot.
 * Delivered orders are immutable once completed, so the restaurant's own panel
 * recomputes the exact same numbers on demand via getRestaurantTaxesReport,
 * keeping this collection tiny and always in sync with real order data.
 */
const restaurantTaxesReportShareSchema = new mongoose.Schema(
    {
        restaurantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required: true,
            index: true
        },
        startDate: { type: Date, default: null },
        endDate: { type: Date, default: null },
        sharedByAdminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodAdmin',
            default: null
        }
    },
    {
        collection: 'food_restaurant_taxes_report_shares',
        timestamps: true
    }
);

restaurantTaxesReportShareSchema.index({ restaurantId: 1, createdAt: -1 });

export const FoodRestaurantTaxesReportShare = mongoose.model(
    'FoodRestaurantTaxesReportShare',
    restaurantTaxesReportShareSchema,
    'food_restaurant_taxes_report_shares'
);
