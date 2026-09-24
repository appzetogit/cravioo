import mongoose from 'mongoose';

export const DINING_BOOKING_STATUSES = [
    'pending',
    'confirmed',
    'seated',
    'completed',
    'cancelled',
    'rejected',
    'no_show'
];

/** Statuses that still hold seats for a slot. */
export const DINING_ACTIVE_BOOKING_STATUSES = ['pending', 'confirmed', 'seated'];

const bookingHistorySchema = new mongoose.Schema(
    {
        status: { type: String, enum: DINING_BOOKING_STATUSES, required: true },
        note: { type: String, trim: true, default: '' },
        byRole: { type: String, trim: true, default: '' },
        byId: { type: mongoose.Schema.Types.ObjectId },
        at: { type: Date, default: Date.now }
    },
    { _id: false }
);

const bookedTableSchema = new mongoose.Schema(
    {
        tableId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodDiningTable' },
        name: { type: String, trim: true, default: '' },
        seats: { type: Number, default: 0 }
    },
    { _id: false }
);

const foodDiningBookingSchema = new mongoose.Schema(
    {
        bookingCode: { type: String, required: true, unique: true, trim: true, uppercase: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        restaurantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required: true,
            index: true
        },
        diningProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodDiningProfile', index: true },

        // Day key at UTC midnight + "HH:mm" slot bounds; bookingAt is the exact instant (IST-derived).
        bookingDate: { type: Date, required: true, index: true },
        slotStart: { type: String, required: true, trim: true },
        slotEnd: { type: String, required: true, trim: true },
        bookingAt: { type: Date, required: true, index: true },

        guests: { type: Number, required: true, min: 1, max: 50 },
        tables: { type: [bookedTableSchema], default: [] },

        guestName: { type: String, required: true, trim: true, maxlength: 120 },
        guestPhone: { type: String, required: true, trim: true, maxlength: 20 },
        occasion: { type: String, trim: true, default: '', maxlength: 60 },
        specialRequest: { type: String, trim: true, default: '', maxlength: 500 },

        status: { type: String, enum: DINING_BOOKING_STATUSES, default: 'pending', index: true },
        statusHistory: { type: [bookingHistorySchema], default: [] },
        cancelledBy: { type: String, enum: ['user', 'restaurant', 'admin', ''], default: '' },
        cancelReason: { type: String, trim: true, default: '', maxlength: 300 },

        // Denormalized snapshot so history stays readable if the outlet changes later.
        restaurantName: { type: String, trim: true, default: '' },
        restaurantImage: { type: String, trim: true, default: '' },
        restaurantAddress: { type: String, trim: true, default: '' },

        rating: { type: Number, min: 1, max: 5 },
        review: { type: String, trim: true, default: '', maxlength: 500 },
        ratedAt: { type: Date }
    },
    {
        collection: 'food_dining_bookings',
        timestamps: true
    }
);

foodDiningBookingSchema.index({ restaurantId: 1, bookingDate: 1, status: 1 });
foodDiningBookingSchema.index({ restaurantId: 1, bookingDate: 1, slotStart: 1, status: 1 });
foodDiningBookingSchema.index({ userId: 1, createdAt: -1 });
foodDiningBookingSchema.index({ status: 1, bookingAt: 1 });

export const FoodDiningBooking = mongoose.model(
    'FoodDiningBooking',
    foodDiningBookingSchema,
    'food_dining_bookings'
);
