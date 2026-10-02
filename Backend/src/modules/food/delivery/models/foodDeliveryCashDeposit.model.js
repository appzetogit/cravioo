import mongoose from 'mongoose';

const foodDeliveryCashDepositSchema = new mongoose.Schema({
    deliveryPartnerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FoodDeliveryPartner',
        required: true,
        index: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'cashfree', 'razorpay', 'upi', 'bank_transfer'],
        default: 'cash'
    },
    depositType: {
        type: String,
        enum: ['online', 'admin_bank', 'admin_upi', 'admin_qr'],
        default: 'online'
    },
    paymentProof: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['Pending', 'Completed', 'Failed'],
        default: 'Pending',
        index: true
    },

    cashfreeOrderId: {
        type: String,
        default: ''
    },
    cashfreePaymentId: {
        type: String,
        default: null
    },
    // Legacy, read-only going forward - kept so historical deposits still load correctly.
    razorpayOrderId: {
        type: String,
        default: ''
    },
    razorpayPaymentId: {
        type: String,
        default: null
    },
    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    adminNote: String,

}, {
    collection: 'food_delivery_cash_deposits',
    timestamps: true
});

foodDeliveryCashDepositSchema.index({ createdAt: -1 });

// One deposit per Cashfree payment / order — skips blanks (manual deposits)
foodDeliveryCashDepositSchema.index(
    { cashfreePaymentId: 1 },
    {
        unique: true,
        name: 'uniq_cashfreePaymentId_nonzero',
        partialFilterExpression: {
            cashfreePaymentId: { $type: 'string', $gt: '' },
        },
    }
);
foodDeliveryCashDepositSchema.index(
    { cashfreeOrderId: 1 },
    {
        unique: true,
        name: 'uniq_cashfreeOrderId_nonzero',
        partialFilterExpression: {
            cashfreeOrderId: { $type: 'string', $gt: '' },
        },
    }
);
// Legacy indexes, kept for historical records only.
foodDeliveryCashDepositSchema.index(
    { razorpayPaymentId: 1 },
    {
        unique: true,
        name: 'uniq_razorpayPaymentId_nonzero',
        partialFilterExpression: {
            razorpayPaymentId: { $type: 'string', $gt: '' },
        },
    }
);
foodDeliveryCashDepositSchema.index(
    { razorpayOrderId: 1 },
    {
        unique: true,
        name: 'uniq_razorpayOrderId_nonzero',
        partialFilterExpression: {
            razorpayOrderId: { $type: 'string', $gt: '' },
        },
    }
);

export const FoodDeliveryCashDeposit = mongoose.model(
    'FoodDeliveryCashDeposit',
    foodDeliveryCashDepositSchema,
    'food_delivery_cash_deposits'
);

let depositIndexPromise = null;

/**
 * autoIndex may be off in production — ensure unique payment keys exist.
 */
export async function ensureCashDepositIdempotencyIndexes() {
    if (depositIndexPromise) return depositIndexPromise;
    depositIndexPromise = (async () => {
        try {
            await FoodDeliveryCashDeposit.createIndexes();
        } catch (err) {
            depositIndexPromise = null;
            throw err;
        }
    })();
    return depositIndexPromise;
}
