import crypto from 'crypto';
import { FoodOrder } from '../../../modules/food/orders/models/order.model.js';
import * as foodTransactionService from '../../../modules/food/orders/services/foodTransaction.service.js';
import { config } from '../../../config/env.js';
import { logger } from '../../../utils/logger.js';
import { OnboardingPaymentLog } from '../../../modules/common/models/onboardingPaymentLog.model.js';
import { processOrderPostPaymentFulfillment } from '../../../modules/food/orders/services/order.service.js';

import { UserMembership } from '../../../modules/food/membership/models/userMembership.model.js';
import { activateMembershipForPayment } from '../../../modules/food/membership/services/membership.service.js';
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
            const pendingOnboardingLog = await OnboardingPaymentLog.findOne({
                cashfreeOrderId: cfOrderId,
                status: { $ne: 'success' }
            }).lean();

            if (pendingOnboardingLog) {
                const paidAmount = Number(paymentObj.payment_amount);
                const expectedAmount = Number(pendingOnboardingLog.amount);
                const amountOk = Number.isFinite(paidAmount) && Number.isFinite(expectedAmount) &&
                    Math.round(paidAmount * 100) === Math.round(expectedAmount * 100);

                if (!amountOk) {
                    logger.error(`Webhook [PAYMENT_SUCCESS_WEBHOOK]: Onboarding payment amount mismatch for CF-Order ${cfOrderId} — expected ${expectedAmount}, got ${paidAmount}`);
                } else {
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
            } else if (refundStatus === 'FAILED' || refundStatus === 'CANCELLED') {
                // Revert the optimistic "processed" write made when the refund was initiated,
                // so the order doesn't keep showing as refunded if Cashfree later rejects it
                // (e.g. bank account closed, card expired).
                const order = await FoodOrder.findOneAndUpdate(
                    {
                        "payment.cashfree.orderId": cfOrderId,
                        "payment.refund.refundId": cfRefundId
                    },
                    {
                        $set: {
                            "payment.refund.status": 'failed',
                            "payment.refund.failureReason": String(refundObj.refund_arn || refundObj.status_description || 'Refund failed at gateway'),
                        }
                    },
                    { new: true }
                );

                if (order) {
                    logger.error(`Webhook [${type}]: Refund FAILED for Order ${order.orderId} (CF-Refund: ${cfRefundId}) — needs manual follow-up`);
                } else {
                    logger.warn(`Webhook [${type}]: Order not found for failed refund, CF-Order: ${cfOrderId}, CF-Refund: ${cfRefundId}`);
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

        res.status(200).json({ status: 'ok' });
    } catch (err) {
        logger.error(`Cashfree Webhook Logic Error: ${err.message}`);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
