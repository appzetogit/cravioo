import { getRestaurantTaxesReport, getAdminTaxesReport, shareRestaurantTaxesReport } from '../services/taxesReport.service.js';

/** GET /reports/restaurant-taxes?restaurantId=&startDate=&endDate= - per-order report for one restaurant (admin view). */
export async function getRestaurantTaxesReportAdmin(req, res, next) {
    try {
        const { restaurantId } = req.query || {};
        if (!restaurantId) {
            return res.status(400).json({ success: false, message: 'restaurantId is required' });
        }
        const data = await getRestaurantTaxesReport(restaurantId, req.query || {});
        res.status(200).json({ success: true, message: 'Restaurant taxes report fetched successfully', data });
    } catch (error) {
        next(error);
    }
}

/** GET /reports/admin-taxes?startDate=&endDate=&restaurantId= - admin-only cross-restaurant report. */
export async function getAdminTaxesReportController(req, res, next) {
    try {
        const data = await getAdminTaxesReport(req.query || {});
        res.status(200).json({ success: true, message: 'Admin taxes report fetched successfully', data });
    } catch (error) {
        next(error);
    }
}

/** POST /reports/restaurant-taxes/share - body: { restaurantId, startDate, endDate }. Makes this period visible in the restaurant's own panel. */
export async function shareRestaurantTaxesReportController(req, res, next) {
    try {
        const { restaurantId } = req.body || {};
        if (!restaurantId) {
            return res.status(400).json({ success: false, message: 'restaurantId is required' });
        }
        const data = await shareRestaurantTaxesReport(restaurantId, req.body || {}, req.user?.userId);
        res.status(201).json({ success: true, message: 'Taxes report shared with restaurant successfully', data });
    } catch (error) {
        next(error);
    }
}
