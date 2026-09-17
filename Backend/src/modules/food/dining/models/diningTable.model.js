import mongoose from 'mongoose';

export const DINING_TABLE_SECTIONS = ['indoor', 'outdoor', 'rooftop', 'private', 'bar', 'garden'];

/**
 * Physical table inventory for a dining-enabled restaurant.
 * Total seats across active tables act as the fallback capacity for any slot
 * that does not define its own capacity.
 */
const foodDiningTableSchema = new mongoose.Schema(
    {
        restaurantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required: true,
            index: true
        },
        name: { type: String, required: true, trim: true, maxlength: 60 },
        nameNormalized: { type: String, trim: true, lowercase: true },
        seats: { type: Number, required: true, min: 1, max: 50 },
        section: { type: String, enum: DINING_TABLE_SECTIONS, default: 'indoor', index: true },
        isActive: { type: Boolean, default: true, index: true },
        note: { type: String, trim: true, default: '', maxlength: 200 }
    },
    {
        collection: 'food_dining_tables',
        timestamps: true
    }
);

foodDiningTableSchema.index({ restaurantId: 1, nameNormalized: 1 }, { unique: true });
foodDiningTableSchema.index({ restaurantId: 1, isActive: 1 });

foodDiningTableSchema.pre('validate', function normalizeName(next) {
    if (this.name) {
        this.nameNormalized = String(this.name).trim().toLowerCase();
    }
    next();
});

export const FoodDiningTable = mongoose.model(
    'FoodDiningTable',
    foodDiningTableSchema,
    'food_dining_tables'
);
