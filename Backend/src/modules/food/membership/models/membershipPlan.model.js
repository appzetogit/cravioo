import mongoose from 'mongoose';

const membershipPlanSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        description: { type: String, trim: true, default: '' },
        price: { type: Number, required: true, min: 1 },
        durationValue: { type: Number, required: true, min: 1 },
        durationUnit: { type: String, enum: ['DAY', 'WEEK', 'MONTH', 'YEAR'], required: true },
        benefits: { type: [String], default: [] },
        sortOrder: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true, index: true },
        isDeleted: { type: Boolean, default: false, index: true }
    },
    { collection: 'food_membership_plans', timestamps: true }
);

membershipPlanSchema.index({ isDeleted: 1, isActive: 1, sortOrder: 1, price: 1 });

export const MembershipPlan = mongoose.model('MembershipPlan', membershipPlanSchema, 'food_membership_plans');
