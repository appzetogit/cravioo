import { sendResponse, sendError } from '../../../../utils/response.js';
import { getRestaurantFinance, getRestaurantSubscriptionWallet } from '../services/restaurantFinance.service.js';
import { getWalletLedger } from '../../subscriptions/services/wallet.service.js';

const LEDGER_TYPE_LABELS = {
    TOPUP: 'Wallet Top-up',
    DAILY_DEDUCTION: 'Daily Pass',
    WEEKLY_SUBSCRIPTION: 'Weekly Subscription',
    MONTHLY_SUBSCRIPTION: 'Monthly Subscription',
    TRANSFER_TO_EARNING: 'Transfer to Earnings',
    REFUND: 'Refund',
};

export const getRestaurantFinanceController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        if (!restaurantId) return sendError(res, 401, 'Restaurant authentication required');

        const data = await getRestaurantFinance(restaurantId, req.query || {});
        return sendResponse(res, 200, 'Finance fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

export const getRestaurantSubscriptionWalletController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        if (!restaurantId) return sendError(res, 401, 'Restaurant authentication required');

        const data = await getRestaurantSubscriptionWallet(restaurantId);
        return sendResponse(res, 200, 'Subscription wallet fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

/**
 * Subscription "invoices" for the restaurant Payouts screen — backed by the same
 * subscription wallet ledger (top-ups, daily/weekly/monthly deductions, refunds) as
 * /subscriptions/wallet/ledger, just reshaped with invoice-friendly field names.
 */
export const getRestaurantSubscriptionInvoicesController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        if (!restaurantId) return sendError(res, 401, 'Restaurant authentication required');

        const { limit, page } = req.query || {};
        const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
        const parsedPage = Math.max(parseInt(page, 10) || 1, 1);

        const { history, pagination } = await getWalletLedger(restaurantId, 'RESTAURANT', {
            limit: parsedLimit,
            skip: (parsedPage - 1) * parsedLimit,
        });

        const invoices = history.map((entry) => ({
            id: String(entry._id),
            date: entry.createdAt,
            type: entry.type,
            label: LEDGER_TYPE_LABELS[entry.type] || entry.type,
            amount: entry.amount,
            balanceAfter: entry.afterBalance,
            referenceId: entry.referenceId || null,
        }));

        return sendResponse(res, 200, 'Subscription invoices fetched successfully', {
            invoices,
            pagination: {
                total: pagination.total,
                limit: parsedLimit,
                page: parsedPage,
                totalPages: Math.ceil(pagination.total / parsedLimit) || 1,
            },
        });
    } catch (error) {
        next(error);
    }
};

