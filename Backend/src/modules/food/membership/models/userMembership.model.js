import mongoose from 'mongoose';

export const MEMBERSHIP_STATUS = Object.freeze({
    PENDING: 'pending',
    ACTIVE: 'active',
    EXPIRED: 'expired',
    CANCELLED: 'cancelled',
    REFUNDED: 'refunded',
    FAILED: 'failed'
});

const userMembershipSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodUser', required: true, index: true },
        planId: { type: mongoose.Schema.Types.ObjectId, ref: 'MembershipPlan', required: true },

        // Snapshot of the plan at purchase time so later plan edits never change past records.
        planName: { type: String, required: true },
        durationValue: { type: Number, required: true },
        durationUnit: { type: String, enum: ['DAY', 'WEEK', 'MONTH', 'YEAR'], required: true },
        benefits: { type: [String], default: [] },
        amountPaid: { type: Number, required: true, min: 0 },
        currency: { type: String, default: 'INR' },

        status: {
            type: String,
            enum: Object.values(MEMBERSHIP_STATUS),
            default: MEMBERSHIP_STATUS.PENDING,
            index: true
        },
        startDate: { type: Date, default: null },
        expiryDate: { type: Date, default: null },

        razorpayOrderId: { type: String },
        razorpayPaymentId: { type: String },
        paidAt: { type: Date, default: null },

        cancelledAt: { type: Date, default: null },
        cancelledBy: { type: mongoose.Schema.Types.ObjectId, default: null },
        cancelReason: { type: String, default: '' },
        refundId: { type: String, default: null },
        refundedAt: { type: Date, default: null },
        failureReason: { type: String, default: '' }
    },
    { collection: 'food_user_memberships', timestamps: true }
);

userMembershipSchema.index({ razorpayOrderId: 1 }, { unique: true, sparse: true });
userMembershipSchema.index({ razorpayPaymentId: 1 }, { unique: true, sparse: true });
userMembershipSchema.index({ userId: 1, status: 1, expiryDate: 1 });
userMembershipSchema.index({ status: 1, expiryDate: 1 });
userMembershipSchema.index({ paidAt: -1 });
// A user can hold only one active membership at a time.
userMembershipSchema.index(
    { userId: 1 },
    { unique: true, partialFilterExpression: { status: MEMBERSHIP_STATUS.ACTIVE } }
);

export const UserMembership = mongoose.model('UserMembership', userMembershipSchema, 'food_user_memberships');
