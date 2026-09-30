import { getRestaurantTaxesReport, listSharedTaxesReports } from '../../admin/services/taxesReport.service.js';

/** GET /restaurant/orders/tax-report?startDate=&endDate= - the logged-in restaurant's own taxes report (self-serve, any period). */
export async function getMyTaxesReportController(req, res, next) {
    try {
        const restaurantId = req.user.userId;
        const data = await getRestaurantTaxesReport(restaurantId, req.query || {});
        res.status(200).json({ success: true, message: 'Taxes report fetched successfully', data });
    } catch (error) {
        next(error);
    }
}

/** GET /restaurant/orders/tax-report/shared - periods the admin has explicitly shared with this restaurant. */
export async function getMySharedTaxesReportsController(req, res, next) {
    try {
        const restaurantId = req.user.userId;
        const data = await listSharedTaxesReports(restaurantId);
        res.status(200).json({ success: true, message: 'Shared taxes reports fetched successfully', data });
    } catch (error) {
        next(error);
    }
}
