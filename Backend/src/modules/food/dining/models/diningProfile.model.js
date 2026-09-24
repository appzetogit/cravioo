import mongoose from 'mongoose';

export const DINING_PROFILE_STATUSES = ['draft', 'pending', 'approved', 'rejected', 'suspended'];

const imageSchema = new mongoose.Schema(
    {
        url: { type: String, required: true, trim: true },
        publicId: { type: String, trim: true, default: '' },
        caption: { type: String, trim: true, default: '', maxlength: 120 }
    },
    { _id: false }
);

const statusHistorySchema = new mongoose.Schema(
    {
        status: { type: String, enum: DINING_PROFILE_STATUSES, required: true },
        note: { type: String, trim: true, default: '' },
        byRole: { type: String, trim: true, default: '' },
        byId: { type: mongoose.Schema.Types.ObjectId },
        at: { type: Date, default: Date.now }
    },
    { _id: false }
);

/**
 * One dining profile per restaurant. Created by the restaurant from its own panel
 * (never during onboarding) and reviewed by admin. Dining features unlock for the
 * restaurant only once `status === 'approved'`.
 */
const foodDiningProfileSchema = new mongoose.Schema(
    {
        restaurantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required: true,
            unique: true,
            index: true
        },
        status: { type: String, enum: DINING_PROFILE_STATUSES, default: 'pending', index: true },

        // Request details (shown to admin in the request list)
        categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FoodDiningCategory', index: true }],
        about: { type: String, required: true, trim: true, maxlength: 2000 },
        cuisines: [{ type: String, trim: true, maxlength: 60 }],
        amenities: [{ type: String, trim: true, maxlength: 60 }],
        costForTwo: { type: Number, required: true, min: 0 },
        seatingCapacity: { type: Number, required: true, min: 1 },
        contactName: { type: String, required: true, trim: true, maxlength: 120 },
        contactPhone: { type: String, required: true, trim: true, maxlength: 20 },
        coverImage: { type: imageSchema, required: true },
        gallery: {
            type: [imageSchema],
            default: [],
            validate: {
                validator: (v) => Array.isArray(v) && v.length >= 1 && v.length <= 10,
                message: 'Between 1 and 10 gallery images are required'
            }
        },
        menuImages: { type: [imageSchema], default: [] },

        // Booking configuration (restaurant editable after approval)
        bookingWindowDays: { type: Number, default: 30, min: 1, max: 90 },
        slotDurationMins: { type: Number, default: 60, min: 15, max: 240 },
        maxGuestsPerBooking: { type: Number, default: 12, min: 1, max: 50 },
        minAdvanceMins: { type: Number, default: 30, min: 0, max: 1440 },
        autoConfirm: { type: Boolean, default: false },
        isOnline: { type: Boolean, default: true, index: true },

        // Denormalized for fast public listing/search
        restaurantName: { type: String, trim: true, default: '' },
        city: { type: String, trim: true, default: '', index: true },
        zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodZone', index: true },
        location: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: { type: [Number], default: undefined }
        },
        ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
        ratingCount: { type: Number, default: 0, min: 0 },
        totalBookings: { type: Number, default: 0, min: 0 },

        rejectionReason: { type: String, trim: true, default: '' },
        submittedAt: { type: Date, default: Date.now },
        reviewedAt: { type: Date },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        statusHistory: { type: [statusHistorySchema], default: [] }
    },
    {
        collection: 'food_dining_profiles',
        timestamps: true
    }
);

foodDiningProfileSchema.index({ status: 1, createdAt: -1 });
foodDiningProfileSchema.index({ status: 1, isOnline: 1, city: 1 });
foodDiningProfileSchema.index({ location: '2dsphere' }, { sparse: true });

export const FoodDiningProfile = mongoose.model(
    'FoodDiningProfile',
    foodDiningProfileSchema,
    'food_dining_profiles'
);
