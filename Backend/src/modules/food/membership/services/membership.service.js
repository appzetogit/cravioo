import mongoose from 'mongoose';
import dayjs from 'dayjs';
import { MembershipPlan } from '../models/membershipPlan.model.js';
import { UserMembership, MEMBERSHIP_STATUS } from '../models/userMembership.model.js';
import { FoodUser } from '../../../../core/users/user.model.js';
import { ValidationError, NotFoundError } from '../../../../core/auth/errors.js';
import { logger } from '../../../../utils/logger.js';
import {
    createRazorpayOrder,
    fetchRazorpayPayment,
    getRazorpayKeyId,
    initiateRazorpayRefund,
    isRazorpayConfigured,
    verifyPaymentSignature
} from '../../orders/helpers/razorpay.helper.js';

const DURATION_UNITS = ['DAY', 'WEEK', 'MONTH', 'YEAR'];
const EXPIRING_SOON_DAYS = 7;
const MAX_LIST_LIMIT = 100;
const MAX_BENEFITS = 20;
/** Statuses for which the customer actually paid. */
const PAID_STATUSES = [
    MEMBERSHIP_STATUS.ACTIVE,
    MEMBERSHIP_STATUS.EXPIRED,
    MEMBERSHIP_STATUS.CANCELLED,
    MEMBERSHIP_STATUS.REFUNDED
];
const REVENUE_IF_NOT_REFUNDED = { $cond: [{ $eq: ['$status', MEMBERSHIP_STATUS.REFUNDED] }, 0, '$amountPaid'] };

const toObjectId = (value, label = 'id') => {
    if (!value || !mongoose.Types.ObjectId.isValid(String(value))) {
        throw new ValidationError(`Invalid ${label}`);
    }
    return new mongoose.Types.ObjectId(String(value));
};

const optionalObjectId = (value) =>
    value && mongoose.Types.ObjectId.isValid(String(value)) ? new mongoose.Types.ObjectId(String(value)) : null;

const daysBetween = (from, to) =>
    Math.max(0, Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000));

// ---------------------------------------------------------------------------
// Plans (admin)
// ---------------------------------------------------------------------------

function normalizePlanPayload(body = {}) {
    const name = String(body.name || '').trim();
    if (!name) throw new ValidationError('Plan name is required');
    if (name.length > 80) throw new ValidationError('Plan name is too long');

    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 1) throw new ValidationError('Price must be at least ₹1');

    const durationValue = Number(body.durationValue);
    if (!Number.isInteger(durationValue) || durationValue < 1 || durationValue > 999) {
        throw new ValidationError('Duration must be a whole number of at least 1');
    }
    const durationUnit = String(body.durationUnit || '').toUpperCase();
    if (!DURATION_UNITS.includes(durationUnit)) {
        throw new ValidationError('Duration unit must be DAY, WEEK, MONTH or YEAR');
    }

    const benefits = (Array.isArray(body.benefits) ? body.benefits : [])
        .map((b) => String(b || '').trim())
        .filter(Boolean)
        .slice(0, MAX_BENEFITS);

    return {
        name,
        description: String(body.description || '').trim().slice(0, 500),
        price: Math.round(price * 100) / 100,
        durationValue,
        durationUnit,
        benefits,
        sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0
    };
}

export async function createPlan(body) {
    const plan = await MembershipPlan.create({ ...normalizePlanPayload(body), isActive: body?.isActive !== false });
    return plan.toObject();
}

export async function updatePlan(id, body) {
    const plan = await MembershipPlan.findOneAndUpdate(
        { _id: toObjectId(id, 'plan id'), isDeleted: false },
        { $set: normalizePlanPayload(body) },
        { new: true }
    ).lean();
    if (!plan) throw new NotFoundError('Membership plan not found');
    return plan;
}

export async function setPlanActive(id, isActive) {
    const plan = await MembershipPlan.findOneAndUpdate(
        { _id: toObjectId(id, 'plan id'), isDeleted: false },
        { $set: { isActive: Boolean(isActive) } },
        { new: true }
    ).lean();
    if (!plan) throw new NotFoundError('Membership plan not found');
    return plan;
}

/** Soft delete; existing memberships keep running on their purchase snapshot. */
export async function deletePlan(id) {
    const plan = await MembershipPlan.findOneAndUpdate(
        { _id: toObjectId(id, 'plan id'), isDeleted: false },
        { $set: { isDeleted: true, isActive: false } },
        { new: true }
    ).lean();
    if (!plan) throw new NotFoundError('Membership plan not found');
    return { id: String(plan._id) };
}

export async function listPlansAdmin() {
    const now = new Date();
    const [plans, stats] = await Promise.all([
        MembershipPlan.find({ isDeleted: false }).sort({ sortOrder: 1, price: 1 }).lean(),
        UserMembership.aggregate([
            { $match: { status: { $in: PAID_STATUSES } } },
            {
                $group: {
                    _id: '$planId',
                    sold: { $sum: 1 },
                    active: {
                        $sum: {
                            $cond: [
                                { $and: [{ $eq: ['$status', MEMBERSHIP_STATUS.ACTIVE] }, { $gt: ['$expiryDate', now] }] },
                                1,
                                0
                            ]
                        }
                    }
                }
            }
        ])
    ]);
    const byPlan = new Map(stats.map((s) => [String(s._id), s]));
    return plans.map((p) => ({
        ...p,
        soldCount: byPlan.get(String(p._id))?.sold || 0,
        activeCount: byPlan.get(String(p._id))?.active || 0
    }));
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Flip memberships whose time is up to `expired`. Reads never depend on this; it keeps labels accurate. */
export async function expireDueMemberships(now = new Date(), userId = null) {
    const res = await UserMembership.updateMany(
        { status: MEMBERSHIP_STATUS.ACTIVE, expiryDate: { $lte: now }, ...(userId ? { userId } : {}) },
        { $set: { status: MEMBERSHIP_STATUS.EXPIRED } }
    );
    return res.modifiedCount || 0;
}

/** True when the user currently holds a paid, unexpired membership. */
export async function isUserActiveMember(userId) {
    const uid = optionalObjectId(userId);
    if (!uid) return false;
    const found = await UserMembership.exists({
        userId: uid,
        status: MEMBERSHIP_STATUS.ACTIVE,
        expiryDate: { $gt: new Date() }
    });
    return Boolean(found);
}

const presentMembership = (m, now = new Date()) => {
    const running = m.status === MEMBERSHIP_STATUS.ACTIVE && m.expiryDate;
    return {
        id: String(m._id),
        planId: String(m.planId),
        planName: m.planName,
        durationValue: m.durationValue,
        durationUnit: m.durationUnit,
        benefits: m.benefits || [],
        amountPaid: m.amountPaid,
        status: running && new Date(m.expiryDate) <= now ? MEMBERSHIP_STATUS.EXPIRED : m.status,
        startDate: m.startDate,
        expiryDate: m.expiryDate,
        daysRemaining: running ? daysBetween(now, m.expiryDate) : 0,
        paidAt: m.paidAt,
        razorpayPaymentId: m.razorpayPaymentId || null,
        createdAt: m.createdAt
    };
};

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

export async function listPublicPlans() {
    return MembershipPlan.find({ isDeleted: false, isActive: true })
        .sort({ sortOrder: 1, price: 1 })
        .select('name description price durationValue durationUnit benefits')
        .lean();
}

export async function getMyMembership(userId) {
    const uid = toObjectId(userId, 'user id');
    const now = new Date();
    await expireDueMemberships(now, uid);

    const [current, history] = await Promise.all([
        UserMembership.findOne({ userId: uid, status: MEMBERSHIP_STATUS.ACTIVE, expiryDate: { $gt: now } }).lean(),
        UserMembership.find({ userId: uid, status: { $in: PAID_STATUSES } })
            .sort({ paidAt: -1 })
            .limit(20)
            .lean()
    ]);

    return {
        current: current ? presentMembership(current, now) : null,
        history: history.map((m) => presentMembership(m, now))
    };
}

export async function createMembershipOrder(userId, planId) {
    const uid = toObjectId(userId, 'user id');
    const plan = await MembershipPlan.findOne({
        _id: toObjectId(planId, 'plan id'),
        isDeleted: false,
        isActive: true
    }).lean();
    if (!plan) throw new NotFoundError('Membership plan is not available');

    if (!isRazorpayConfigured()) {
        throw new ValidationError('Online payments are currently unavailable. Please try again later.');
    }
    if (await isUserActiveMember(uid)) {
        throw new ValidationError('You already have an active membership');
    }

    // Abandon any earlier unpaid attempt so only one pending order exists per user.
    await UserMembership.updateMany(
        { userId: uid, status: MEMBERSHIP_STATUS.PENDING },
        { $set: { status: MEMBERSHIP_STATUS.FAILED, failureReason: 'superseded_by_new_attempt' } }
    );

    const amountPaise = Math.round(plan.price * 100);
    let order;
    try {
        order = await createRazorpayOrder(amountPaise, 'INR', `membership_${String(uid).slice(-8)}_${Date.now()}`);
    } catch (error) {
        logger.error(`Membership Razorpay order failed: ${error?.description || error?.message}`);
        throw new Error(error?.description || error?.message || 'Failed to create payment order');
    }

    const membership = await UserMembership.create({
        userId: uid,
        planId: plan._id,
        planName: plan.name,
        durationValue: plan.durationValue,
        durationUnit: plan.durationUnit,
        benefits: plan.benefits || [],
        amountPaid: plan.price,
        status: MEMBERSHIP_STATUS.PENDING,
        razorpayOrderId: String(order.id)
    });

    return {
        membershipId: String(membership._id),
        planName: plan.name,
        razorpay: {
            key: getRazorpayKeyId(),
            orderId: String(order.id),
            amount: Number(order.amount) || amountPaise,
            currency: order.currency || 'INR'
        }
    };
}

/**
 * Idempotently turns a pending membership into an active one once payment is confirmed.
 * Safe to call from both the client verify call and the webhook.
 */
export async function activateMembershipForPayment({ razorpayOrderId, razorpayPaymentId, amountPaise }) {
    const membership = await UserMembership.findOne({ razorpayOrderId: String(razorpayOrderId) }).lean();
    if (!membership) return { activated: false, reason: 'not_found' };

    if (membership.status === MEMBERSHIP_STATUS.ACTIVE && membership.razorpayPaymentId === String(razorpayPaymentId)) {
        return { activated: true, membership, alreadyActive: true };
    }
    if (amountPaise != null && Math.round(membership.amountPaid * 100) !== Number(amountPaise)) {
        logger.error(`Membership amount mismatch order=${razorpayOrderId}`);
        return { activated: false, reason: 'amount_mismatch' };
    }
    // A superseded/failed attempt can still be paid at Razorpay; honour a genuine capture.
    const activatable = [MEMBERSHIP_STATUS.PENDING, MEMBERSHIP_STATUS.FAILED];
    if (!activatable.includes(membership.status)) {
        return { activated: false, reason: `status_${membership.status}` };
    }

    const startDate = new Date();
    const expiryDate = dayjs(startDate).add(membership.durationValue, membership.durationUnit.toLowerCase()).toDate();

    try {
        const activated = await UserMembership.findOneAndUpdate(
            { _id: membership._id, status: { $in: activatable } },
            {
                $set: {
                    status: MEMBERSHIP_STATUS.ACTIVE,
                    razorpayPaymentId: String(razorpayPaymentId),
                    paidAt: startDate,
                    startDate,
                    expiryDate,
                    failureReason: ''
                }
            },
            { new: true }
        ).lean();
        // null means a concurrent call (client verify vs webhook) already activated it.
        return { activated: true, membership: activated || (await UserMembership.findById(membership._id).lean()) };
    } catch (error) {
        if (error?.code !== 11000) throw error;
        // The user already holds an active membership (duplicate payment): refund this one automatically.
        logger.warn(`Membership duplicate payment user=${membership.userId}; refunding`);
        await UserMembership.updateOne(
            { _id: membership._id },
            {
                $set: {
                    razorpayPaymentId: String(razorpayPaymentId),
                    paidAt: new Date(),
                    failureReason: 'duplicate_active_membership'
                }
            }
        ).catch(() => {});
        try {
            const refund = await initiateRazorpayRefund(razorpayPaymentId, membership.amountPaid, {
                idempotencyKey: `membership_dup_${membership._id}`,
                notes: { reason: 'Duplicate membership payment' }
            });
            await UserMembership.updateOne(
                { _id: membership._id },
                {
                    $set: {
                        status: MEMBERSHIP_STATUS.REFUNDED,
                        refundId: String(refund?.id || ''),
                        refundedAt: new Date()
                    }
                }
            );
        } catch (refundError) {
            logger.error(`Membership auto-refund failed: ${refundError?.message}`);
        }
        return { activated: false, reason: 'duplicate_active_membership' };
    }
}

export async function verifyMembershipPayment(userId, payload = {}) {
    const uid = toObjectId(userId, 'user id');
    const orderId = String(payload.razorpayOrderId || '').trim();
    const paymentId = String(payload.razorpayPaymentId || '').trim();
    const signature = String(payload.razorpaySignature || '').trim();
    if (!orderId || !paymentId || !signature) {
        throw new ValidationError('razorpayOrderId, razorpayPaymentId and razorpaySignature are required');
    }

    const membership = await UserMembership.findOne({ razorpayOrderId: orderId, userId: uid }).select('_id').lean();
    if (!membership) throw new NotFoundError('Membership order not found');

    if (!verifyPaymentSignature(orderId, paymentId, signature)) {
        throw new ValidationError('Payment verification failed');
    }

    const payment = await fetchRazorpayPayment(paymentId);
    if (String(payment?.order_id || '') !== orderId) throw new ValidationError('Payment order mismatch');
    if (String(payment?.status || '').toLowerCase() !== 'captured') throw new ValidationError('Payment not captured');

    const result = await activateMembershipForPayment({
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        amountPaise: Number(payment.amount)
    });
    if (!result.activated) {
        throw new ValidationError(
            result.reason === 'duplicate_active_membership'
                ? 'You already have an active membership. This payment will be refunded.'
                : 'Could not activate membership'
        );
    }
    return getMyMembership(uid);
}

/** Webhook: payment failed for a membership order. */
export async function markMembershipPaymentFailed(razorpayOrderId, reason = 'payment_failed') {
    await UserMembership.updateOne(
        { razorpayOrderId: String(razorpayOrderId), status: MEMBERSHIP_STATUS.PENDING },
        { $set: { status: MEMBERSHIP_STATUS.FAILED, failureReason: reason } }
    );
}

// ---------------------------------------------------------------------------
// Admin dashboard
// ---------------------------------------------------------------------------

const paidTotal = (extra = {}) => [
    { $match: { status: { $in: PAID_STATUSES }, paidAt: { $ne: null }, ...extra } },
    { $group: { _id: null, total: { $sum: '$amountPaid' }, count: { $sum: 1 } } }
];

export async function getMembershipDashboard() {
    const now = new Date();
    await expireDueMemberships(now);

    const startOfToday = dayjs(now).startOf('day').toDate();
    const startOfMonth = dayjs(now).startOf('month').toDate();
    const sixMonthsAgo = dayjs(now).startOf('month').subtract(5, 'month').toDate();
    const soon = dayjs(now).add(EXPIRING_SOON_DAYS, 'day').toDate();

    const [statusCounts, gross, today, month, refunded, perPlan, monthly, expiringSoon] = await Promise.all([
        UserMembership.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
        UserMembership.aggregate(paidTotal()),
        UserMembership.aggregate(paidTotal({ paidAt: { $gte: startOfToday } })),
        UserMembership.aggregate(paidTotal({ paidAt: { $gte: startOfMonth } })),
        UserMembership.aggregate([
            { $match: { status: MEMBERSHIP_STATUS.REFUNDED } },
            { $group: { _id: null, total: { $sum: '$amountPaid' } } }
        ]),
        UserMembership.aggregate([
            { $match: { status: { $in: PAID_STATUSES } } },
            {
                $group: {
                    _id: '$planId',
                    planName: { $last: '$planName' },
                    sold: { $sum: 1 },
                    active: { $sum: { $cond: [{ $eq: ['$status', MEMBERSHIP_STATUS.ACTIVE] }, 1, 0] } },
                    revenue: { $sum: REVENUE_IF_NOT_REFUNDED }
                }
            },
            { $sort: { revenue: -1 } }
        ]),
        UserMembership.aggregate([
            { $match: { status: { $in: PAID_STATUSES }, paidAt: { $gte: sixMonthsAgo } } },
            {
                $group: {
                    _id: { y: { $year: '$paidAt' }, m: { $month: '$paidAt' } },
                    revenue: { $sum: REVENUE_IF_NOT_REFUNDED },
                    sold: { $sum: 1 }
                }
            },
            { $sort: { '_id.y': 1, '_id.m': 1 } }
        ]),
        UserMembership.countDocuments({ status: MEMBERSHIP_STATUS.ACTIVE, expiryDate: { $gt: now, $lte: soon } })
    ]);

    const counts = Object.fromEntries(statusCounts.map((s) => [s._id, s.count]));
    const grossRevenue = gross[0]?.total || 0;
    const refundedAmount = refunded[0]?.total || 0;

    return {
        counts: {
            active: counts.active || 0,
            expired: counts.expired || 0,
            cancelled: counts.cancelled || 0,
            refunded: counts.refunded || 0,
            pending: counts.pending || 0,
            failed: counts.failed || 0,
            totalPurchases: gross[0]?.count || 0,
            expiringSoon
        },
        revenue: {
            gross: grossRevenue,
            refunded: refundedAmount,
            net: grossRevenue - refundedAmount,
            today: today[0]?.total || 0,
            thisMonth: month[0]?.total || 0
        },
        perPlan: perPlan.map((p) => ({
            planId: String(p._id),
            planName: p.planName,
            sold: p.sold,
            active: p.active,
            revenue: p.revenue
        })),
        monthly: monthly.map((m) => ({
            month: `${m._id.y}-${String(m._id.m).padStart(2, '0')}`,
            revenue: m.revenue,
            sold: m.sold
        })),
        expiringSoonDays: EXPIRING_SOON_DAYS
    };
}

export async function listMembershipsAdmin(query = {}) {
    const now = new Date();
    await expireDueMemberships(now);

    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), MAX_LIST_LIMIT);
    const status = String(query.status || '').toLowerCase();
    const search = String(query.search || '').trim();

    // Default view hides unpaid attempts; pending/failed can still be requested explicitly.
    let filter;
    if (status === 'expiring') {
        filter = {
            status: MEMBERSHIP_STATUS.ACTIVE,
            expiryDate: { $gt: now, $lte: dayjs(now).add(EXPIRING_SOON_DAYS, 'day').toDate() }
        };
    } else if (Object.values(MEMBERSHIP_STATUS).includes(status)) {
        filter = { status };
    } else {
        filter = { status: { $in: PAID_STATUSES } };
    }

    const planId = optionalObjectId(query.planId);
    if (planId) filter.planId = planId;

    if (query.fromDate || query.toDate) {
        const range = {};
        if (query.fromDate) range.$gte = new Date(`${query.fromDate}T00:00:00`);
        if (query.toDate) range.$lte = new Date(`${query.toDate}T23:59:59.999`);
        filter.createdAt = range;
    }

    if (search) {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const users = await FoodUser.find({
            $or: [
                { name: { $regex: escaped, $options: 'i' } },
                { phone: { $regex: escaped } },
                { email: { $regex: escaped, $options: 'i' } }
            ]
        })
            .select('_id')
            .limit(500)
            .lean();
        filter.$or = [
            { userId: { $in: users.map((u) => u._id) } },
            { razorpayPaymentId: { $regex: escaped, $options: 'i' } },
            { razorpayOrderId: { $regex: escaped, $options: 'i' } }
        ];
    }

    const [docs, total] = await Promise.all([
        UserMembership.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('userId', 'name phone email')
            .lean(),
        UserMembership.countDocuments(filter)
    ]);

    return {
        memberships: docs.map((m) => ({
            ...presentMembership(m, now),
            razorpayOrderId: m.razorpayOrderId || null,
            refundId: m.refundId || null,
            refundedAt: m.refundedAt || null,
            cancelledAt: m.cancelledAt || null,
            cancelReason: m.cancelReason || '',
            failureReason: m.failureReason || '',
            user: m.userId
                ? {
                      id: String(m.userId._id),
                      name: m.userId.name || '',
                      phone: m.userId.phone || '',
                      email: m.userId.email || ''
                  }
                : null
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1
    };
}

export async function cancelMembershipAdmin(id, adminId, reason = '') {
    const cancelled = await UserMembership.findOneAndUpdate(
        { _id: toObjectId(id, 'membership id'), status: MEMBERSHIP_STATUS.ACTIVE },
        {
            $set: {
                status: MEMBERSHIP_STATUS.CANCELLED,
                cancelledAt: new Date(),
                cancelledBy: optionalObjectId(adminId),
                cancelReason: String(reason || '').trim().slice(0, 300)
            }
        },
        { new: true }
    ).lean();
    if (!cancelled) throw new ValidationError('Only an active membership can be cancelled');
    return presentMembership(cancelled);
}

/** Refund the full amount to the customer's original payment method and end the membership. */
export async function refundMembershipAdmin(id, adminId, reason = '') {
    const membership = await UserMembership.findById(toObjectId(id, 'membership id')).lean();
    if (!membership) throw new NotFoundError('Membership not found');
    if (membership.status === MEMBERSHIP_STATUS.REFUNDED) throw new ValidationError('Membership is already refunded');
    if (!membership.razorpayPaymentId || !PAID_STATUSES.includes(membership.status)) {
        throw new ValidationError('No captured payment to refund for this membership');
    }

    const refund = await initiateRazorpayRefund(membership.razorpayPaymentId, membership.amountPaid, {
        idempotencyKey: `membership_refund_${membership._id}`,
        notes: { reason: reason || 'Membership refunded by admin', membershipId: String(membership._id) }
    });

    const updated = await UserMembership.findByIdAndUpdate(
        membership._id,
        {
            $set: {
                status: MEMBERSHIP_STATUS.REFUNDED,
                refundId: String(refund?.id || ''),
                refundedAt: new Date(),
                cancelledAt: membership.cancelledAt || new Date(),
                cancelledBy: optionalObjectId(adminId),
                cancelReason: String(reason || '').trim().slice(0, 300)
            }
        },
        { new: true }
    ).lean();
    return presentMembership(updated);
}
