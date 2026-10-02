import { SubscriptionPlan } from '../../admin/models/subscriptionPlan.model.js';
import { UserSubscription } from '../../user/models/userSubscription.model.js';
import * as cashfreeHelper from '../../orders/helpers/cashfree.helper.js';
import { ValidationError, NotFoundError } from '../../../../core/auth/errors.js';
import mongoose from 'mongoose';
import dayjs from 'dayjs';
import crypto from 'crypto';
import { invalidateSubscriptionStatsCache } from '../../admin/utils/subscriptionStatsCache.js';

export async function initiatePurchase(userId, userType, { planId }) {
    const plan = await SubscriptionPlan.findOne({ _id: planId, isDeleted: false, isActive: true });
    if (!plan) throw new NotFoundError('Subscription plan not found or inactive');

    if (plan.userType !== userType) {
        throw new ValidationError('Plan mismatch for user role');
    }

    const restaurantId = userType === 'RESTAURANT' ? userId : null;
    const deliveryBoyId = userType === 'DELIVERY_PARTNER' ? userId : null;
    const ownerFilter = userType === 'RESTAURANT' ? { restaurantId } : { deliveryBoyId };

    // 1. Check if already has an active subscription
    const existing = await UserSubscription.findOne({
        ...ownerFilter,
        status: { $in: ['active', 'grace'] }
    });
    if (existing) throw new ValidationError('You already have an active subscription');

    const PENDING_REUSE_MS = 30 * 60 * 1000;
    const lockWindowMs = 2 * 60 * 1000;
    const lockWaitMs = 5 * 1000;
    const lockPollMs = 250;
    const nowMs = Date.now();

    const getPendingForPlan = async () => {
        return UserSubscription.findOne({ ...ownerFilter, planId: plan._id, status: 'pending' })
            .sort({ createdAt: -1 })
            .exec();
    };

    let pendingDoc = await getPendingForPlan();
    if (pendingDoc?.createdAt) {
        const ageMs = nowMs - new Date(pendingDoc.createdAt).getTime();
        if (ageMs < PENDING_REUSE_MS) {
            if (plan.paymentType === 'ONE_TIME') {
                const pendingOrderId = pendingDoc?.metadata?.cashfreeOrderId;
                const pendingAmount = pendingDoc?.metadata?.cashfreeOrderAmount;
                const pendingSessionId = pendingDoc?.metadata?.cashfreePaymentSessionId;
                if (pendingOrderId && pendingAmount) {
                    return {
                        orderId: pendingOrderId,
                        amount: pendingAmount,
                        paymentSessionId: pendingSessionId,
                        appId: cashfreeHelper.getCashfreeAppId()
                    };
                }
            } else {
                if (pendingDoc?.cashfreeSubscriptionId) {
                    return {
                        subscriptionId: pendingDoc.cashfreeSubscriptionId,
                        subscriptionSessionId: pendingDoc?.metadata?.cashfreeSubscriptionSessionId,
                        appId: cashfreeHelper.getCashfreeAppId()
                    };
                }
            }
        }
    }

    if (!pendingDoc) {
        try {
            pendingDoc = await UserSubscription.create({
                planId: plan._id,
                userType,
                restaurantId,
                deliveryBoyId,
                status: 'pending',
                metadata: {}
            });
        } catch (e) {
            if (e?.code === 11000) {
                pendingDoc = await getPendingForPlan();
            } else {
                throw e;
            }
        }
    }

    if (!pendingDoc) {
        throw new ValidationError('Unable to create purchase intent');
    }

    const lockId = crypto.randomBytes(16).toString('hex');
    const lockUntil = new Date(Date.now() + lockWindowMs);

    const lockResult = await UserSubscription.updateOne(
        {
            _id: pendingDoc._id,
            status: 'pending',
            planId: plan._id,
            $or: [
                { 'metadata.purchaseLockUntil': { $exists: false } },
                { 'metadata.purchaseLockUntil': null },
                { 'metadata.purchaseLockUntil': { $lt: new Date() } }
            ]
        },
        {
            $set: {
                'metadata.purchaseLockId': lockId,
                'metadata.purchaseLockUntil': lockUntil
            }
        }
    );

    if (lockResult.modifiedCount === 0) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < lockWaitMs) {
            const fresh = await getPendingForPlan();
            if (fresh) {
                if (plan.paymentType === 'ONE_TIME') {
                    const pendingOrderId = fresh?.metadata?.cashfreeOrderId;
                    const pendingAmount = fresh?.metadata?.cashfreeOrderAmount;
                    const pendingSessionId = fresh?.metadata?.cashfreePaymentSessionId;
                    if (pendingOrderId && pendingAmount) {
                        return {
                            orderId: pendingOrderId,
                            amount: pendingAmount,
                            paymentSessionId: pendingSessionId,
                            appId: cashfreeHelper.getCashfreeAppId()
                        };
                    }
                } else {
                    if (fresh?.cashfreeSubscriptionId) {
                        return {
                            subscriptionId: fresh.cashfreeSubscriptionId,
                            subscriptionSessionId: fresh?.metadata?.cashfreeSubscriptionSessionId,
                            appId: cashfreeHelper.getCashfreeAppId()
                        };
                    }
                }
            }
            await new Promise((r) => setTimeout(r, lockPollMs));
        }
        throw new ValidationError('Purchase is already in progress. Please retry.');
    }

    let cashfreeData = {};

    // 2. Handle One-Time vs Recurring
    if (plan.paymentType === 'ONE_TIME') {
        const order = await cashfreeHelper.createCashfreeOrder({
            orderId: String(pendingDoc._id),
            orderAmount: plan.price,
            currency: 'INR',
            customerId: String(userId),
        });

        // 📂 CRITICAL: Create PENDING subscription record for One-Time too (idempotency)
        await UserSubscription.updateOne(
            { _id: pendingDoc._id, status: 'pending', planId: plan._id, 'metadata.purchaseLockId': lockId },
            {
                $set: {
                    cashfreePaymentId: null,
                    'metadata.cashfreeOrderId': order.order_id,
                    'metadata.cashfreeOrderAmount': order.order_amount,
                    'metadata.cashfreePaymentSessionId': order.payment_session_id,
                },
                $unset: {
                    'metadata.purchaseLockId': 1,
                    'metadata.purchaseLockUntil': 1
                }
            }
        );

        cashfreeData = {
            orderId: order.order_id,
            amount: order.order_amount,
            paymentSessionId: order.payment_session_id,
            appId: cashfreeHelper.getCashfreeAppId()
        };
    } else {
        if (!plan.cashfreePlanId) {
            throw new ValidationError('This recurring plan is not configured for payments yet');
        }
        const subscriptionId = `sub_${String(pendingDoc._id)}`;
        const sub = await cashfreeHelper.createCashfreeSubscription({
            subscriptionId,
            planId: plan.cashfreePlanId,
            authorizationAmount: plan.price,
        });

        // 📂 CRITICAL: Create PENDING subscription record for Recurring
        await UserSubscription.updateOne(
            { _id: pendingDoc._id, status: 'pending', planId: plan._id, 'metadata.purchaseLockId': lockId },
            {
                $set: {
                    cashfreeSubscriptionId: sub.subscription_id,
                    'metadata.cashfreeSubscriptionId': sub.subscription_id,
                    'metadata.cashfreeSubscriptionSessionId': sub.subscription_session_id,
                },
                $unset: {
                    'metadata.purchaseLockId': 1,
                    'metadata.purchaseLockUntil': 1
                }
            }
        );

        cashfreeData = {
            subscriptionId: sub.subscription_id,
            subscriptionSessionId: sub.subscription_session_id,
            appId: cashfreeHelper.getCashfreeAppId()
        };
    }

    return cashfreeData;
}

export async function verifyPurchase(userId, userType, data) {
    const { cashfreeOrderId, cashfreeSubscriptionId } = data;

    // Cashfree never hands the client a signature to verify (unlike Razorpay) - the only
    // trustworthy confirmation is asking Cashfree's server directly.
    let verified = false;
    let cashfreePaymentId = null;
    if (cashfreeSubscriptionId) {
        const { active } = await cashfreeHelper.verifyCashfreeSubscriptionActive(cashfreeSubscriptionId);
        verified = active;
    } else if (cashfreeOrderId) {
        const { paid, payment } = await cashfreeHelper.verifyCashfreeOrderPaid(cashfreeOrderId);
        verified = paid;
        cashfreePaymentId = payment?.cf_payment_id || null;
    }

    if (!verified) throw new ValidationError('Payment verification failed');

    // Perform direct DB update to activate the subscription immediately (local/fallback bypass)
    const restaurantId = userType === 'RESTAURANT' ? userId : null;
    const deliveryBoyId = userType === 'DELIVERY_PARTNER' ? userId : null;
    const ownerFilter = userType === 'RESTAURANT' ? { restaurantId } : { deliveryBoyId };

    let query = { ...ownerFilter };
    if (cashfreeOrderId) {
        query['metadata.cashfreeOrderId'] = cashfreeOrderId;
    } else if (cashfreeSubscriptionId) {
        query.cashfreeSubscriptionId = cashfreeSubscriptionId;
    }

    const doc = await UserSubscription.findOne(query).populate('planId');
    if (doc) {
        const plan = doc.planId;
        if (plan) {
            const expiryDate = dayjs().add(plan.durationValue, plan.durationUnit.toLowerCase()).toDate();

            if (cashfreeOrderId) {
                await UserSubscription.updateOne(
                    { _id: doc._id },
                    {
                        $set: {
                            cashfreePaymentId,
                            startDate: new Date(),
                            expiryDate,
                            status: 'active',
                            purchasedPlanName: plan.name,
                            purchasedPrice: plan.price,
                            purchasedDuration: plan.durationValue,
                            purchasedDurationType: plan.durationUnit
                        }
                    }
                );
            } else {
                await UserSubscription.updateOne(
                    { _id: doc._id },
                    {
                        $set: {
                            status: 'active',
                            startDate: new Date(),
                            expiryDate,
                            lastRenewedAt: new Date(),
                            renewalCount: 0,
                            autoRenew: true,
                            gracePeriodUntil: null,
                            cancelAt: null,
                            cancelAtCycleEnd: false,
                            purchasedPlanName: plan.name,
                            purchasedPrice: plan.price,
                            purchasedDuration: plan.durationValue,
                            purchasedDurationType: plan.durationUnit
                        }
                    }
                );
            }
        }
        invalidateSubscriptionStatsCache();
    }

    return { verified: true };
}

export async function getActiveSubscription(userId, userType) {
    const query = { status: { $in: ['active', 'grace'] } };
    if (userType === 'RESTAURANT') {
        query.restaurantId = userId;
    } else {
        query.deliveryBoyId = userId;
    }

    return UserSubscription.findOne(query).populate('planId').lean();
}

export async function cancelAutoRenew(userId, userType) {
    const query = { status: 'active' };
    if (userType === 'RESTAURANT') {
        query.restaurantId = userId;
    } else {
        query.deliveryBoyId = userId;
    }

    // 1. Fetch only the subscription with status === "active" for the user. Do NOT fetch subscriptions in grace status.
    const sub = await UserSubscription.findOne(query);

    if (!sub) {
        throw new ValidationError('No active subscription found. Cancellation is only allowed for active subscriptions.');
    }

    // 2. Validate subscription type (recurring only; has cashfreeSubscriptionId and is not a one-time plan; throw validation error otherwise).
    if (!sub.cashfreeSubscriptionId) {
        throw new ValidationError('This plan does not support recurring billing auto-renewal.');
    }

    // 3. Validate that cancelAtCycleEnd is not already true.
    if (sub.cancelAtCycleEnd) {
        throw new ValidationError('Auto-renewal is already cancelled for this subscription.');
    }

    // 4. Cancel the mandate on Cashfree's side (access still continues until expiryDate, same as before).
    await cashfreeHelper.cancelCashfreeSubscription(sub.cashfreeSubscriptionId);

    // 5. Perform an immediate MongoDB update: set autoRenew = false, cancelAtCycleEnd = true, and cancelAt = new Date().
    sub.autoRenew = false;
    sub.cancelAtCycleEnd = true;
    sub.cancelAt = new Date();
    await sub.save();

    return sub;
}
