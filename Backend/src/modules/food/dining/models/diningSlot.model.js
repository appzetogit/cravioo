import mongoose from 'mongoose';

const slotSchema = new mongoose.Schema(
    {
        // 24h "HH:mm"
        startTime: { type: String, required: true, trim: true },
        endTime: { type: String, required: true, trim: true },
        // Seats bookable in this slot. 0/undefined => fall back to active table seats.
        capacity: { type: Number, default: 0, min: 0, max: 5000 },
        isActive: { type: Boolean, default: true }
    },
    { _id: false }
);

/**
 * Weekly dining availability: one document per (restaurant, dayOfWeek).
 * dayOfWeek follows JS getDay(): 0 = Sunday .. 6 = Saturday.
 */
const foodDiningSlotSchema = new mongoose.Schema(
    {
        restaurantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required: true,
            index: true
        },
        dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
        isOpen: { type: Boolean, default: true },
        slots: { type: [slotSchema], default: [] }
    },
    {
        collection: 'food_dining_slots',
        timestamps: true
    }
);

foodDiningSlotSchema.index({ restaurantId: 1, dayOfWeek: 1 }, { unique: true });

export const FoodDiningSlot = mongoose.model(
    'FoodDiningSlot',
    foodDiningSlotSchema,
    'food_dining_slots'
);

/**
 * Date-level override (holiday / private event): dining is fully closed that day.
 * `date` is stored as a UTC midnight day key so lookups are exact-match.
 */
const foodDiningBlockedDateSchema = new mongoose.Schema(
    {
        restaurantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required: true,
            index: true
        },
        date: { type: Date, required: true },
        reason: { type: String, trim: true, default: '', maxlength: 200 }
    },
    {
        collection: 'food_dining_blocked_dates',
        timestamps: true
    }
);

foodDiningBlockedDateSchema.index({ restaurantId: 1, date: 1 }, { unique: true });

export const FoodDiningBlockedDate = mongoose.model(
    'FoodDiningBlockedDate',
    foodDiningBlockedDateSchema,
    'food_dining_blocked_dates'
);
