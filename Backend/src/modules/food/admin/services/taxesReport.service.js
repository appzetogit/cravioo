import mongoose from 'mongoose';
import { FoodOrder } from '../../orders/models/order.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodRestaurantTaxesReportShare } from '../models/restaurantTaxesReportShare.model.js';
import { ValidationError } from '../../../../core/auth/errors.js';

// Same "realized revenue" convention as the existing restaurant aggregate report
// (admin.service.js getRestaurantReport) - only delivered orders count, and only
// real food orders (excludes pure quick-commerce orders bundled as other types).
const FOOD_ORDER_TYPES = ['food', 'mixed'];
const REALIZED_STATUS = 'delivered';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function buildDateRangeFilter(query = {}) {
    const range = {};
    if (query.startDate) {
        const start = new Date(query.startDate);
        if (!Number.isNaN(start.getTime())) {
            start.setHours(0, 0, 0, 0);
            range.$gte = start;
        }
    }
    if (query.endDate) {
        const end = new Date(query.endDate);
        if (!Number.isNaN(end.getTime())) {
            end.setHours(23, 59, 59, 999);
            range.$lte = end;
        }
    }
    return Object.keys(range).length ? range : null;
}

/**
 * Per-order Taxes Report for ONE restaurant - shared by the admin panel (any restaurant)
 * and the restaurant panel (own orders only), so both sides always see identical numbers
 * built from the same pricing snapshot fields already stored per order.
 */
export async function getRestaurantTaxesReport(restaurantId, query = {}) {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) {
        throw new ValidationError('Invalid restaurant id');
    }

    const filter = {
        restaurantId,
        orderType: { $in: FOOD_ORDER_TYPES },
        orderStatus: REALIZED_STATUS,
    };
    const dateRange = buildDateRangeFilter(query);
    if (dateRange) filter.createdAt = dateRange;

    const [restaurant, orders] = await Promise.all([
        FoodRestaurant.findById(restaurantId).select('restaurantName restaurantId').lean(),
        FoodOrder.find(filter)
            .select('orderId pricing.subtotal pricing.restaurantCommission pricing.packagingFee pricing.total createdAt')
            .sort({ createdAt: 1 })
            .lean(),
    ]);

    const rows = orders.map((o) => ({
        orderId: o.orderId,
        date: o.createdAt,
        itemSubtotal: round2(o.pricing?.subtotal),
        commission: round2(o.pricing?.restaurantCommission),
        packagingFee: round2(o.pricing?.packagingFee),
        total: round2(o.pricing?.total),
    }));

    const totals = rows.reduce(
        (acc, r) => ({
            itemSubtotal: round2(acc.itemSubtotal + r.itemSubtotal),
            commission: round2(acc.commission + r.commission),
            packagingFee: round2(acc.packagingFee + r.packagingFee),
            total: round2(acc.total + r.total),
        }),
        { itemSubtotal: 0, commission: 0, packagingFee: 0, total: 0 }
    );

    return {
        restaurant: restaurant
            ? { id: restaurant._id, name: restaurant.restaurantName, code: restaurant.restaurantId }
            : null,
        period: { startDate: query.startDate || null, endDate: query.endDate || null },
        orders: rows,
        totals,
        totalOrders: rows.length,
        generatedAt: new Date(),
    };
}

/**
 * Cross-restaurant Taxes Report for the admin's own download - one row per order
 * (optionally scoped to one restaurant), with commission + platform fee revenue.
 */
export async function getAdminTaxesReport(query = {}) {
    const filter = {
        orderType: { $in: FOOD_ORDER_TYPES },
        orderStatus: REALIZED_STATUS,
    };
    if (query.restaurantId && mongoose.Types.ObjectId.isValid(query.restaurantId)) {
        filter.restaurantId = query.restaurantId;
    }
    const dateRange = buildDateRangeFilter(query);
    if (dateRange) filter.createdAt = dateRange;

    const orders = await FoodOrder.find(filter)
        .select('orderId restaurantId pricing.restaurantCommission pricing.platformFee pricing.total createdAt')
        .populate('restaurantId', 'restaurantName')
        .sort({ createdAt: 1 })
        .lean();

    const rows = orders.map((o) => ({
        restaurantName: o.restaurantId?.restaurantName || 'Unknown',
        orderId: o.orderId,
        date: o.createdAt,
        commissionRevenue: round2(o.pricing?.restaurantCommission),
        platformFeeRevenue: round2(o.pricing?.platformFee),
        total: round2(o.pricing?.total),
    }));

    const totals = rows.reduce(
        (acc, r) => ({
            commissionRevenue: round2(acc.commissionRevenue + r.commissionRevenue),
            platformFeeRevenue: round2(acc.platformFeeRevenue + r.platformFeeRevenue),
            total: round2(acc.total + r.total),
        }),
        { commissionRevenue: 0, platformFeeRevenue: 0, total: 0 }
    );

    return {
        period: { startDate: query.startDate || null, endDate: query.endDate || null },
        orders: rows,
        totals,
        totalOrders: rows.length,
        generatedAt: new Date(),
    };
}

/** Admin explicitly shares a Restaurant Taxes Report period with a restaurant - it then shows up in that restaurant's own panel. */
export async function shareRestaurantTaxesReport(restaurantId, query = {}, sharedByAdminId = null) {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) {
        throw new ValidationError('Invalid restaurant id');
    }
    const restaurant = await FoodRestaurant.findById(restaurantId).select('_id').lean();
    if (!restaurant) {
        throw new ValidationError('Restaurant not found');
    }

    const startDate = query.startDate ? new Date(query.startDate) : null;
    const endDate = query.endDate ? new Date(query.endDate) : null;
    const doc = await FoodRestaurantTaxesReportShare.create({
        restaurantId,
        startDate: startDate && !Number.isNaN(startDate.getTime()) ? startDate : null,
        endDate: endDate && !Number.isNaN(endDate.getTime()) ? endDate : null,
        sharedByAdminId: sharedByAdminId && mongoose.Types.ObjectId.isValid(sharedByAdminId) ? sharedByAdminId : null,
    });
    return doc.toObject();
}

/** Reports admin has shared with ONE restaurant - shown in that restaurant's own panel, newest first. */
export async function listSharedTaxesReports(restaurantId) {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) {
        throw new ValidationError('Invalid restaurant id');
    }
    const shares = await FoodRestaurantTaxesReportShare.find({ restaurantId })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();
    return shares.map((s) => ({
        id: s._id,
        startDate: s.startDate,
        endDate: s.endDate,
        sharedAt: s.createdAt,
    }));
}
