import crypto from 'crypto';
import mongoose from 'mongoose';
import { FoodOrder } from '../../../modules/food/orders/models/order.model.js';
import { UserSubscription } from '../../../modules/food/user/models/userSubscription.model.js';
import { SubscriptionPlan } from '../../../modules/food/admin/models/subscriptionPlan.model.js';
import * as foodTransactionService from '../../../modules/food/orders/services/foodTransaction.service.js';
import { config } from '../../../config/env.js';
import { logger } from '../../../utils/logger.js';
import { ProcessedWebhookEvent } from '../models/processedWebhookEvent.model.js';
import dayjs from 'dayjs';
import { OnboardingPaymentLog } from '../../../modules/common/models/onboardingPaymentLog.model.js';
import { processOrderPostPaymentFulfillment } from '../../../modules/food/orders/services/order.service.js';

import { UserMembership } from '../../../modules/food/membership/models/userMembership.model.js';
import { activateMembershipForPayment } from '../../../modules/food/membership/services/membership.service.js';
import * as walletService from '../../../modules/food/subscriptions/services/wallet.service.js';
import { invalidateSubscriptionStatsCache } from '../../../modules/food/admin/utils/subscriptionStatsCache.js';
import { sendNotificationToOwners } from '../../../core/notifications/firebase.service.js';

/**
 * Centralized Cashfree Webhook Handler (Core Layer).
 * Manages atomic updates for order payments and refunds across all modules.
 */
export const handleCashfreeWebhook = async (req, res) => {
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];
    const secret = config.cashfreeWebhookSecret;

    // 1. Verify signature using the raw body buffer: base64(HMAC-SHA256(timestamp + rawBody, secret))
    if (!signature || !timestamp || !secret || !req.rawBody) {
        logger.warn('Cashfree Webhook: Missing signature/timestamp or rawBody buffer.');
        return res.status(400).send('Invalid signature');
    }

    const signedPayload = `${timestamp}${req.rawBody}`;
    const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('base64');
    let validSignature = false;
    try {
        validSignature = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
    } catch {
        validSignature = false;
    }
    if (!validSignature) {
        logger.warn('Cashfree Webhook: Signature verification failed.');
        return res.status(400).send('Invalid signature');
    }

    const { type, data } = req.body || {};
    logger.info(`Cashfree Webhook Received: ${type}`);

    try {
        // --- 🟢 Handle Payment Success ---
        if (type === 'PAYMENT_SUCCESS_WEBHOOK') {
            const orderObj = data?.order || {};
            const paymentObj = data?.payment || {};
            const cfOrderId = orderObj.order_id;
            const cfPaymentId = paymentObj.cf_payment_id;
            const orderTags = orderObj.order_tags || {};

            // 📂 CASE M: Customer membership purchase (resolved by Cashfree order id)
            if (cfOrderId && (await UserMembership.exists({ cashfreeOrderId: cfOrderId }))) {
                try {
                    const result = await activateMembershipForPayment({
                        cashfreeOrderId: cfOrderId,
                        cashfreePaymentId: cfPaymentId,
                        amount: Number(paymentObj.payment_amount)
                    });
                    logger.info(`Webhook [PAYMENT_SUCCESS_WEBHOOK]: membership order=${cfOrderId} activated=${result.activated}`);
                } catch (err) {
                    logger.error(`Webhook membership activation error: ${err.message}`);
                    return res.status(500).json({ status: 'retry' });
                }
                return res.status(200).json({ status: 'ok' });
            }

            // 📂 CASE A-1: Subscription Wallet Topup
            if (orderTags.type === 'subscription_wallet_topup') {
                logger.info(`Webhook [PAYMENT_SUCCESS_WEBHOOK]: Processing Subscription Wallet Topup`);
                try {
                    await walletService.verifyTopup({
                        payment: paymentObj,
                        order: orderObj,
                        orderTags,
                    });
                } catch (err) {
                    logger.error(`Webhook Topup Error: ${err.message}`);
                    // We don't return 4xx here because we want Cashfree to stop retrying if it's a code error,
                    // but verifyTopup handles its own idempotency.
                }
                return res.status(200).json({ status: 'ok' });
            }

            // 📂 CASE A-2: Subscription One-Time Payment (Day Plan)
            if (orderTags.type === 'subscription') {
                logger.info(`Webhook [PAYMENT_SUCCESS_WEBHOOK]: Processing One-Time Subscription payment`);
                const { planId, restaurantId, deliveryBoyId, userType } = orderTags;

                const plan = await SubscriptionPlan.findById(planId);
                if (plan) {
                    const expiryDate = dayjs().add(plan.durationValue, plan.durationUnit.toLowerCase()).toDate();

                    const ownerFilters = [
                        restaurantId ? { restaurantId: new mongoose.Types.ObjectId(restaurantId) } : null,
                        deliveryBoyId ? { deliveryBoyId: new mongoose.Types.ObjectId(deliveryBoyId) } : null
                    ].filter(Boolean);

                    const doc = await UserSubscription.findOne({
                        $or: ownerFilters,
                        planId: plan._id,
                        status: { $in: ['pending', 'failed', 'active', 'grace'] }
                    }).sort({ createdAt: -1 }).lean();

                    if (!doc) {
                        logger.error(`Webhook [PAYMENT_SUCCESS_WEBHOOK]: Subscription doc not found for activation`, {
                            planId: String(plan._id),
                            restaurantId,
                            deliveryBoyId,
                            userType
                        });
                        return res.status(200).json({ status: 'ok' });
                    }

                    await UserSubscription.updateOne(
                        { _id: doc._id, cashfreePaymentId: { $ne: cfPaymentId } },
                        {
                            $set: {
                                userType,
                                restaurantId: restaurantId ? new mongoose.Types.ObjectId(restaurantId) : null,
                                deliveryBoyId: deliveryBoyId ? new mongoose.Types.ObjectId(deliveryBoyId) : null,
                                cashfreePaymentId: cfPaymentId,
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
                    invalidateSubscriptionStatsCache();
                }
                return res.status(200).json({ status: 'ok' });
            }

            // 📂 CASE B: Regular Food Order
            // Atomic update to mark as paid if not already
            const order = await FoodOrder.findOneAndUpdate(
                {
                    "payment.cashfree.orderId": cfOrderId,
                    "payment.status": { $ne: 'paid' }
                },
                {
                    $set: {
                        "payment.status": 'paid',
                        "payment.cashfree.paymentId": cfPaymentId
                    }
                },
                { new: true }
            );

            if (order) {
                try {
                    await foodTransactionService.updateTransactionStatus(order._id, 'captured', {
                        status: 'captured',
                        cashfreePaymentId: cfPaymentId,
                        note: 'Payment status synced via Webhook (PAYMENT_SUCCESS_WEBHOOK)'
                    });
                    await processOrderPostPaymentFulfillment(order, { notifyCustomer: false });
                } catch (ledgerErr) {
                    logger.error(`Webhook Ledger Error (Order ${order.orderId}): ${ledgerErr.message}`);
                    return res.status(500).json({ message: 'Ledger sync failed; retrying webhook' });
                }
                logger.info(`Webhook [PAYMENT_SUCCESS_WEBHOOK]: Synced Order ${order.orderId} (Status=paid)`);
            } else {
                const existingPaidOrder = await FoodOrder.findOne({
                    "payment.cashfree.orderId": cfOrderId,
                    "payment.status": 'paid',
                });

                if (existingPaidOrder) {
                    try {
                        await foodTransactionService.updateTransactionStatus(existingPaidOrder._id, 'captured', {
                            status: 'captured',
                            cashfreePaymentId: cfPaymentId,
                            note: 'Payment status re-synced via Webhook retry (PAYMENT_SUCCESS_WEBHOOK)',
                        });
                        await processOrderPostPaymentFulfillment(existingPaidOrder, { notifyCustomer: false });
                        logger.info(`Webhook [PAYMENT_SUCCESS_WEBHOOK]: Re-synced paid Order ${existingPaidOrder.orderId} on retry`);
                    } catch (retryLedgerErr) {
                        logger.error(`Webhook Retry Ledger Error (Order ${existingPaidOrder.orderId}): ${retryLedgerErr.message}`);
                        return res.status(500).json({ message: 'Ledger sync failed; retrying webhook' });
                    }
                } else {
                    logger.warn(`Webhook [PAYMENT_SUCCESS_WEBHOOK]: Order not found for CF-Order: ${cfOrderId}`);
                }
            }

            // 📂 CASE C: Onboarding Payment
            const onboardingLog = await OnboardingPaymentLog.findOneAndUpdate(
                {
                    cashfreeOrderId: cfOrderId,
                    status: { $ne: 'success' }
                },
                {
                    $set: {
                        status: 'success',
                        cashfreePaymentId: cfPaymentId,
                    }
                },
                { new: true }
            );

            if (onboardingLog) {
                logger.info(`Webhook [PAYMENT_SUCCESS_WEBHOOK]: Synced Onboarding Payment Log for Order ${cfOrderId} (Status=success)`);
            }
        }

        // --- 🔴 Handle Refund ---
        if (type === 'REFUND_STATUS_WEBHOOK' || type === 'AUTO_REFUND_STATUS_WEBHOOK') {
            const refundObj = data?.refund || data?.auto_refund || {};
            const cfOrderId = refundObj.order_id;
            const cfRefundId = refundObj.cf_refund_id;
            const refundStatus = String(refundObj.refund_status || '').toUpperCase();
            const refundAmount = Number(refundObj.refund_amount || 0);

            if (refundStatus === 'SUCCESS') {
                const order = await FoodOrder.findOneAndUpdate(
                    {
                        "payment.cashfree.orderId": cfOrderId,
                        "payment.refund.status": { $ne: 'processed' }
                    },
                    {
                        $set: {
                            "payment.status": 'refunded',
                            "payment.refund": {
                                status: 'processed',
                                amount: refundAmount,
                                refundId: cfRefundId,
                                processedAt: new Date()
                            }
                        }
                    },
                    { new: true }
                );

                if (order) {
                    logger.info(`Webhook [${type}]: Synced Order ${order.orderId} (Refunded)`);
                } else {
                    logger.warn(`Webhook [${type}]: Order not found or already refunded for CF-Order: ${cfOrderId}`);
                }
            }
        }

        // --- 🔴 Handle Payment Failed / User Dropped ---
        if (type === 'PAYMENT_FAILED_WEBHOOK' || type === 'PAYMENT_USER_DROPPED_WEBHOOK') {
            const orderObj = data?.order || {};
            const paymentObj = data?.payment || {};
            const cfOrderId = String(orderObj?.order_id || '').trim();
            const cfPaymentId = String(paymentObj?.cf_payment_id || '').trim();
            const failureReason = String(paymentObj?.payment_message || '').trim() || 'Payment failed';

            if (cfOrderId) {
                const order = await FoodOrder.findOneAndUpdate(
                    {
                        'payment.cashfree.orderId': cfOrderId,
                        'payment.status': { $nin: ['paid', 'refunded', 'cancelled', 'failed'] },
                    },
                    {
                        $set: {
                            'payment.status': 'failed',
                            ...(cfPaymentId ? { 'payment.cashfree.paymentId': cfPaymentId } : {}),
                        },
                    },
                    { new: true },
                );

                if (order) {
                    try {
                        await foodTransactionService.updateTransactionStatus(order._id, 'failed', {
                            status: 'failed',
                            cashfreePaymentId: cfPaymentId || undefined,
                            note: `Payment failed via webhook: ${failureReason}`,
                        });
                    } catch (txnErr) {
                        logger.error(`Webhook payment-failed transaction sync failed for ${order.orderId}: ${txnErr?.message || txnErr}`);
                    }

                    try {
                        await sendNotificationToOwners(
                            [{ ownerType: 'USER', ownerId: order.userId }],
                            {
                                title: 'Payment Failed',
                                body: `Payment failed for Order #${order.orderId}. Please retry checkout.`,
                                data: {
                                    type: 'payment_failed',
                                    orderId: String(order.orderId),
                                    orderMongoId: String(order._id),
                                    reason: failureReason,
                                },
                            },
                        );
                    } catch (notifyErr) {
                        logger.warn(`Webhook payment-failed notify failed: ${notifyErr?.message || notifyErr}`);
                    }

                    logger.info(`Webhook [${type}]: Marked Order ${order.orderId} as failed`);
                } else {
                    logger.warn(`Webhook [${type}]: Order not found or not eligible for failure update: ${cfOrderId}`);
                }
            } else {
                logger.warn(`Webhook [${type}]: Missing cashfree order id`);
            }
        }

        // --- 🔄 Handle Subscription Events (Recurring) ---
        if (type === 'SUBSCRIPTION_STATUS_CHANGED' || type === 'SUBSCRIPTION_PAYMENT_SUCCESS' || type === 'SUBSCRIPTION_AUTH_STATUS') {
            const subDetails = data?.subscription_details || {};
            const cfSubId = subDetails.subscription_id || data?.subscription_id;

            if (cfSubId) {
                const eventId = String(req.headers['x-webhook-id'] || req.body?.event_time || '').trim();
                const bodyHash = crypto.createHash('sha256').update(req.rawBody).digest('hex');
                const dedupeKey = eventId ? `cashfree:${type}:${eventId}` : `cashfree:${type}:${bodyHash}`;

                const existingEvent = await ProcessedWebhookEvent.findOne({ dedupeKey }).select({ _id: 1 }).lean();
                if (existingEvent) {
                    logger.info(`Webhook [${type}]: Duplicate delivery skipped`, { dedupeKey, cfSubId });
                    return res.status(200).json({ status: 'ok' });
                }

                const now = new Date();

                const subscriptionDoc = await UserSubscription.findOne({ cashfreeSubscriptionId: cfSubId })
                    .populate('planId')
                    .exec();

                if (!subscriptionDoc) {
                    logger.error(`Webhook [${type}]: Pending subscription not found`, { cfSubId });
                    return res.status(200).json({ status: 'ok' });
                }

                const plan = subscriptionDoc.planId;
                if (!plan) {
                    logger.error(`Webhook [${type}]: Subscription plan not found for subscription`, { cfSubId, subscriptionId: String(subscriptionDoc._id) });
                    return res.status(200).json({ status: 'ok' });
                }

                const unit = String(plan.durationUnit || '').toLowerCase();
                const value = Number(plan.durationValue || 0);
                if (!unit || !value) {
                    logger.error(`Webhook [${type}]: Invalid plan duration`, { cfSubId, unit, value });
                    return res.status(200).json({ status: 'ok' });
                }

                const subscriptionStatus = String(subDetails.subscription_status || '').toUpperCase();

                // Mandate authorized / first activation.
                if (type === 'SUBSCRIPTION_AUTH_STATUS' || subscriptionStatus === 'ACTIVE') {
                    const startDate = now;
                    const expiryDate = dayjs(startDate).add(value, unit).toDate();

                    const updateFields = {
                        status: 'active',
                        startDate,
                        expiryDate,
                        lastRenewedAt: startDate,
                        renewalCount: 0,
                        gracePeriodUntil: null,
                        purchasedPlanName: plan.name,
                        purchasedPrice: plan.price,
                        purchasedDuration: plan.durationValue,
                        purchasedDurationType: plan.durationUnit,
                        'metadata.lastProcessedEventKey': dedupeKey,
                        'metadata.lastProcessedEventType': type,
                        'metadata.lastProcessedAt': now
                    };

                    if (!subscriptionDoc.cancelAtCycleEnd) {
                        updateFields.autoRenew = true;
                        updateFields.cancelAt = null;
                        updateFields.cancelAtCycleEnd = false;
                    }

                    const result = await UserSubscription.updateOne(
                        { _id: subscriptionDoc._id, 'metadata.lastProcessedEventKey': { $ne: dedupeKey } },
                        { $set: updateFields }
                    );

                    if (result.modifiedCount > 0) {
                        try {
                            await ProcessedWebhookEvent.create({
                                source: 'cashfree',
                                dedupeKey,
                                eventId,
                                eventType: type,
                                entityType: 'subscription',
                                entityId: cfSubId,
                                bodyHash
                            });
                        } catch (e) {
                            if (e?.code !== 11000) logger.error(`Webhook [${type}]: Failed to record dedupe`, { error: e?.message });
                        }
                        logger.info(`Webhook [${type}]: Activated subscription`, { cfSubId, expiryDate });
                        invalidateSubscriptionStatsCache();
                    } else {
                        logger.info(`Webhook [${type}]: Already processed`, { dedupeKey, cfSubId });
                    }
                }

                // Recurring charge succeeded.
                if (type === 'SUBSCRIPTION_PAYMENT_SUCCESS') {
                    const base = subscriptionDoc.expiryDate && subscriptionDoc.expiryDate > now ? subscriptionDoc.expiryDate : now;
                    const expiryDate = dayjs(base).add(value, unit).toDate();

                    const updateFields = {
                        status: 'active',
                        expiryDate,
                        lastRenewedAt: now,
                        gracePeriodUntil: null,
                        purchasedPlanName: plan.name,
                        purchasedPrice: plan.price,
                        purchasedDuration: plan.durationValue,
                        purchasedDurationType: plan.durationUnit,
                        'metadata.lastProcessedEventKey': dedupeKey,
                        'metadata.lastProcessedEventType': type,
                        'metadata.lastProcessedAt': now
                    };

                    if (!subscriptionDoc.cancelAtCycleEnd) {
                        updateFields.autoRenew = true;
                        updateFields.cancelAt = null;
                        updateFields.cancelAtCycleEnd = false;
                    }

                    const result = await UserSubscription.updateOne(
                        { _id: subscriptionDoc._id, 'metadata.lastProcessedEventKey': { $ne: dedupeKey } },
                        {
                            $set: updateFields,
                            $inc: { renewalCount: 1 }
                        }
                    );

                    if (result.modifiedCount > 0) {
                        try {
                            await ProcessedWebhookEvent.create({
                                source: 'cashfree',
                                dedupeKey,
                                eventId,
                                eventType: type,
                                entityType: 'subscription',
                                entityId: cfSubId,
                                bodyHash
                            });
                        } catch (e) {
                            if (e?.code !== 11000) logger.error(`Webhook [${type}]: Failed to record dedupe`, { error: e?.message });
                        }
                        logger.info(`Webhook [${type}]: Renewal applied`, { cfSubId, expiryDate });
                        invalidateSubscriptionStatsCache();
                    } else {
                        logger.info(`Webhook [${type}]: Already processed`, { dedupeKey, cfSubId });
                    }
                }

                // Subscription cancelled on Cashfree's side (mandate revoked, etc).
                if (type === 'SUBSCRIPTION_STATUS_CHANGED' && subscriptionStatus === 'CANCELLED') {
                    const result = await UserSubscription.updateOne(
                        { _id: subscriptionDoc._id, 'metadata.lastProcessedEventKey': { $ne: dedupeKey } },
                        {
                            $set: {
                                autoRenew: false,
                                cancelAt: now,
                                cancelAtCycleEnd: true,
                                'metadata.lastProcessedEventKey': dedupeKey,
                                'metadata.lastProcessedEventType': type,
                                'metadata.lastProcessedAt': now
                            }
                        }
                    );

                    if (result.modifiedCount > 0) {
                        try {
                            await ProcessedWebhookEvent.create({
                                source: 'cashfree',
                                dedupeKey,
                                eventId,
                                eventType: type,
                                entityType: 'subscription',
                                entityId: cfSubId,
                                bodyHash
                            });
                        } catch (e) {
                            if (e?.code !== 11000) logger.error(`Webhook [${type}]: Failed to record dedupe`, { error: e?.message });
                        }
                        logger.info(`Webhook [${type}]: Cancel applied`, { cfSubId });
                    } else {
                        logger.info(`Webhook [${type}]: Already processed`, { dedupeKey, cfSubId });
                    }
                }

                // Plan exhausted all cycles.
                if (type === 'SUBSCRIPTION_STATUS_CHANGED' && subscriptionStatus === 'COMPLETED') {
                    const result = await UserSubscription.updateOne(
                        { _id: subscriptionDoc._id, 'metadata.lastProcessedEventKey': { $ne: dedupeKey } },
                        {
                            $set: {
                                status: 'expired',
                                autoRenew: false,
                                'metadata.lastProcessedEventKey': dedupeKey,
                                'metadata.lastProcessedEventType': type,
                                'metadata.lastProcessedAt': now
                            }
                        }
                    );

                    if (result.modifiedCount > 0) {
                        try {
                            await ProcessedWebhookEvent.create({
                                source: 'cashfree',
                                dedupeKey,
                                eventId,
                                eventType: type,
                                entityType: 'subscription',
                                entityId: cfSubId,
                                bodyHash
                            });
                        } catch (e) {
                            if (e?.code !== 11000) logger.error(`Webhook [${type}]: Failed to record dedupe`, { error: e?.message });
                        }
                        logger.info(`Webhook [${type}]: Completed -> expired`, { cfSubId });
                        invalidateSubscriptionStatsCache();
                    } else {
                        logger.info(`Webhook [${type}]: Already processed`, { dedupeKey, cfSubId });
                    }
                }
            }
        }

        res.status(200).json({ status: 'ok' });
    } catch (err) {
        logger.error(`Cashfree Webhook Logic Error: ${err.message}`);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
