import crypto from 'crypto';

import { config } from '../../../../config/env.js';

const APP_ID = config.cashfreeAppId || process.env.CASHFREE_APP_ID || '';
const SECRET_KEY = config.cashfreeSecretKey || process.env.CASHFREE_SECRET_KEY || '';
const API_VERSION = config.cashfreeApiVersion || '2025-01-01';
const BASE_URL =
    (config.cashfreeEnv || 'sandbox') === 'production'
        ? 'https://api.cashfree.com/pg'
        : 'https://sandbox.cashfree.com/pg';

export function isCashfreeConfigured() {
    return Boolean(APP_ID && SECRET_KEY);
}

export function getCashfreeAppId() {
    return APP_ID;
}

function authHeaders(extra = {}) {
    return {
        'Content-Type': 'application/json',
        'x-client-id': APP_ID,
        'x-client-secret': SECRET_KEY,
        'x-api-version': API_VERSION,
        ...extra,
    };
}

async function cashfreeRequest(method, path, body) {
    if (!isCashfreeConfigured()) {
        throw new Error('Cashfree is not configured on this server');
    }
    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: authHeaders(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const message = data?.message || data?.error_description || `Cashfree API error (${res.status})`;
        const err = new Error(message);
        err.statusCode = res.status;
        err.response = data;
        throw err;
    }
    return data;
}

/**
 * Create a Cashfree order. `orderAmount` is in RUPEES (major unit) - unlike Razorpay,
 * Cashfree's API takes decimal rupee amounts directly, never paise.
 * `orderId` is caller-supplied (our own internal order id), Cashfree does not generate it.
 */
export function createCashfreeOrder({
    orderId,
    orderAmount,
    currency = 'INR',
    customerId,
    customerPhone,
    customerEmail,
    customerName,
    orderNote,
    returnUrl,
    notifyUrl,
    paymentMethods,
    orderMeta = {},
    orderTags,
}) {
    return cashfreeRequest('POST', '/orders', {
        order_id: orderId,
        order_amount: Number(orderAmount),
        order_currency: currency,
        customer_details: {
            customer_id: String(customerId || orderId),
            customer_phone: customerPhone ? String(customerPhone).replace(/\D/g, '').slice(-10) : '9999999999',
            customer_email: customerEmail || 'customer@example.com',
            customer_name: customerName || 'Customer',
        },
        order_meta: {
            ...(returnUrl ? { return_url: returnUrl } : {}),
            ...(notifyUrl ? { notify_url: notifyUrl } : {}),
            ...(paymentMethods ? { payment_methods: paymentMethods } : {}),
            ...orderMeta,
        },
        // Cashfree's equivalent of Razorpay order "notes" - round-trips to the webhook
        // as data.order.order_tags, so callers can carry custom metadata (e.g. { type, ownerId }).
        ...(orderTags ? { order_tags: orderTags } : {}),
        order_note: orderNote || undefined,
    });
}

/** Fetch a Cashfree order's current status (order_status: ACTIVE/PAID/EXPIRED/TERMINATED). */
export function fetchCashfreeOrder(orderId) {
    if (!orderId) throw new Error('orderId is required');
    return cashfreeRequest('GET', `/orders/${encodeURIComponent(orderId)}`);
}

/** Fetch all payment attempts for an order (array), authoritative source for payment_status. */
export function fetchCashfreeOrderPayments(orderId) {
    if (!orderId) throw new Error('orderId is required');
    return cashfreeRequest('GET', `/orders/${encodeURIComponent(orderId)}/payments`);
}

/**
 * Cashfree never hands the client a signature to verify like Razorpay does - the only
 * trustworthy way to confirm a payment is to ask Cashfree's server directly. This is the
 * drop-in replacement for `verifyPaymentSignature` used at every call site: instead of
 * checking a client-supplied signature, it re-fetches the order/payment from Cashfree.
 */
export async function verifyCashfreeOrderPaid(orderId) {
    const payments = await fetchCashfreeOrderPayments(orderId);
    const successfulPayment = Array.isArray(payments)
        ? payments.find((p) => String(p.payment_status).toUpperCase() === 'SUCCESS')
        : null;
    if (successfulPayment) {
        return { paid: true, payment: successfulPayment };
    }
    const order = await fetchCashfreeOrder(orderId).catch(() => null);
    return { paid: String(order?.order_status).toUpperCase() === 'PAID', payment: null, order };
}

/**
 * Verify a Cashfree webhook's signature. Per Cashfree docs: base64(HMAC-SHA256(timestamp + rawBody, secretKey)).
 * `rawBody` MUST be the exact raw request body string/buffer, never a re-serialized parsed object.
 */
export function verifyCashfreeWebhookSignature(rawBody, signature, timestamp) {
    if (!SECRET_KEY || !signature || !timestamp) return false;
    const signedPayload = `${timestamp}${rawBody}`;
    const expected = crypto.createHmac('sha256', SECRET_KEY).update(signedPayload).digest('base64');
    try {
        return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
    } catch {
        return false;
    }
}

/** Create a Cashfree Payment Link (used for QR / COD online-collection, mirrors Razorpay Payment Links). */
export function createCashfreePaymentLink({
    linkId,
    amount,
    currency = 'INR',
    description,
    customerName,
    customerEmail,
    customerPhone,
    returnUrl,
    notifyUrl,
}) {
    return cashfreeRequest('POST', '/links', {
        link_id: linkId,
        link_amount: Number(amount),
        link_currency: currency,
        link_purpose: description || `Order ${linkId}`,
        customer_details: {
            customer_name: customerName || 'Customer',
            customer_email: customerEmail || 'customer@example.com',
            customer_phone: customerPhone ? String(customerPhone).replace(/\D/g, '').slice(-10) : '9999999999',
        },
        link_meta: {
            ...(returnUrl ? { return_url: returnUrl } : {}),
            ...(notifyUrl ? { notify_url: notifyUrl } : {}),
            upi_intent: true,
        },
        link_notify: { send_sms: false, send_email: false },
    });
}

/** Fetch a Cashfree Payment Link's current status (link_status: ACTIVE/PAID/EXPIRED). */
export function fetchCashfreePaymentLink(linkId) {
    if (!linkId) throw new Error('linkId is required');
    return cashfreeRequest('GET', `/links/${encodeURIComponent(linkId)}`);
}

/** Create a recurring Subscription Plan (PERIODIC). `recurringAmount` is in rupees. */
export function createCashfreePlan({ planId, planName, recurringAmount, maxAmount, intervals = 1, intervalType = 'MONTH', maxCycles, note }) {
    return cashfreeRequest('POST', '/plans', {
        plan_id: planId,
        plan_name: planName,
        plan_type: 'PERIODIC',
        plan_currency: 'INR',
        plan_recurring_amount: Number(recurringAmount),
        plan_max_amount: Number(maxAmount ?? recurringAmount),
        plan_intervals: Number(intervals) || 1,
        plan_interval_type: String(intervalType).toUpperCase(),
        ...(maxCycles ? { plan_max_cycles: Number(maxCycles) } : {}),
        plan_note: note || undefined,
    });
}

/**
 * Create a Subscription (mandate) against an existing plan. Returns `subscription_session_id`,
 * which the frontend passes to the Cashfree JS SDK's checkout() to collect customer authorization
 * (eNACH/UPI Autopay), the equivalent of Razorpay's subscription checkout.
 */
export function createCashfreeSubscription({ subscriptionId, planId, customerName, customerEmail, customerPhone, authorizationAmount, returnUrl, firstChargeTime }) {
    return cashfreeRequest('POST', '/subscriptions', {
        subscription_id: subscriptionId,
        customer_details: {
            customer_name: customerName || 'Customer',
            customer_email: customerEmail || 'customer@example.com',
            customer_phone: customerPhone ? String(customerPhone).replace(/\D/g, '').slice(-10) : '9999999999',
        },
        plan_details: { plan_id: planId },
        authorization_details: {
            authorization_amount: Number(authorizationAmount) || 1,
            authorization_amount_refund: true,
            payment_methods: ['upi', 'card', 'enach'],
        },
        subscription_meta: {
            ...(returnUrl ? { return_url: returnUrl } : {}),
        },
        ...(firstChargeTime ? { subscription_first_charge_time: firstChargeTime } : {}),
    });
}

/** Fetch a subscription's current status/details. */
export function fetchCashfreeSubscription(subscriptionId) {
    if (!subscriptionId) throw new Error('subscriptionId is required');
    return cashfreeRequest('GET', `/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

/** Convenience check mirroring `verifySubscriptionSignature` - is the mandate authorized/active? */
export async function verifyCashfreeSubscriptionActive(subscriptionId) {
    const sub = await fetchCashfreeSubscription(subscriptionId);
    const status = String(sub?.subscription_status || '').toUpperCase();
    return { active: status === 'ACTIVE', subscription: sub };
}

/** Cancel / pause / activate an existing subscription. `action`: 'CANCEL' | 'PAUSE' | 'ACTIVATE'. */
export function manageCashfreeSubscription(subscriptionId, action, actionDetails) {
    return cashfreeRequest('POST', `/subscriptions/${encodeURIComponent(subscriptionId)}/manage`, {
        subscription_id: subscriptionId,
        action,
        ...(actionDetails ? { action_details: actionDetails } : {}),
    });
}

export function cancelCashfreeSubscription(subscriptionId) {
    return manageCashfreeSubscription(subscriptionId, 'CANCEL');
}

/**
 * Initiate a refund for an order. `amount` is in RUPEES (matches the old `initiateRazorpayRefund`
 * call-site contract so callers barely need to change). Idempotent via a stable `refund_id` derived
 * from the caller's idempotency key (or orderId+amount) so retries never double-refund.
 */
export async function initiateCashfreeRefund(orderId, amount, options = {}) {
    if (!isCashfreeConfigured()) {
        throw new Error('Cashfree is not configured on this server');
    }
    const idempotencyKey = options?.idempotencyKey ? String(options.idempotencyKey).trim().slice(0, 40) : '';
    const refundId =
        idempotencyKey ||
        crypto
            .createHash('sha1')
            .update(`${orderId}:${Math.round(Number(amount) * 100)}`)
            .digest('hex')
            .slice(0, 40);

    try {
        const refund = await cashfreeRequest('POST', `/orders/${encodeURIComponent(orderId)}/refunds`, {
            refund_amount: Number(amount),
            refund_id: refundId,
            refund_note: options?.notes?.reason || 'Order cancelled by system flow',
        });
        return {
            success: true,
            refundId: refund.cf_refund_id || refund.refund_id,
            status: refund.refund_status || 'PENDING',
            raw: refund,
        };
    } catch (err) {
        // Duplicate refund_id = already refunded; treat as success (same semantics as the old Razorpay helper).
        const msg = String(err?.response?.message || err?.message || '');
        const alreadyRefunded = /duplicate|already.*refund/i.test(msg);
        if (alreadyRefunded) {
            try {
                const existing = await fetchCashfreeRefund(orderId, refundId);
                return { success: true, refundId: existing.cf_refund_id || existing.refund_id, status: existing.refund_status || 'processed', raw: existing };
            } catch {
                // fall through to failure below
            }
        }
        console.error(`Cashfree Refund API Failure [OrderId: ${orderId}]:`, err?.message || err);
        return {
            success: false,
            error: err?.message || 'Cashfree refund API error',
            status: 'failed',
        };
    }
}

export function fetchCashfreeRefund(orderId, refundId) {
    return cashfreeRequest('GET', `/orders/${encodeURIComponent(orderId)}/refunds/${encodeURIComponent(refundId)}`);
}
