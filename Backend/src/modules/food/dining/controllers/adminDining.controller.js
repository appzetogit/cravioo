import { sendResponse } from '../../../../utils/response.js';
import {
    listDiningCategories,
    createDiningCategory,
    updateDiningCategory,
    deleteDiningCategory,
    listDiningBanners,
    createDiningBanner,
    updateDiningBanner,
    deleteDiningBanner
} from '../services/diningCatalog.service.js';
import {
    listDiningProfilesForAdmin,
    getDiningProfileForAdmin,
    reviewDiningProfile,
    getAdminDiningOverview
} from '../services/diningProfile.service.js';
import {
    listAdminDiningBookings,
    getAdminDiningBooking
} from '../services/diningBooking.service.js';
import { getWeeklySlots, listDiningTables } from '../services/diningAvailability.service.js';
import {
    validateDiningCategoryCreate,
    validateDiningCategoryUpdate,
    validateDiningBannerCreate,
    validateDiningBannerUpdate,
    validateDiningProfileListQuery,
    validateDiningProfileReview,
    validateDiningBookingListQuery
} from '../validators/dining.validator.js';

/* ------------------------------ Categories ------------------------------ */

export const listDiningCategoriesController = async (req, res, next) => {
    try {
        const items = await listDiningCategories({ includeInactive: true, withCounts: true });
        return sendResponse(res, 200, 'Dining categories fetched successfully', { items });
    } catch (error) {
        next(error);
    }
};

export const createDiningCategoryController = async (req, res, next) => {
    try {
        const payload = validateDiningCategoryCreate(req.body);
        const created = await createDiningCategory(payload, req.file);
        return sendResponse(res, 201, 'Dining category created successfully', created);
    } catch (error) {
        next(error);
    }
};

export const updateDiningCategoryController = async (req, res, next) => {
    try {
        const payload = validateDiningCategoryUpdate(req.body);
        const updated = await updateDiningCategory(req.params.id, payload, req.file);
        return sendResponse(res, 200, 'Dining category updated successfully', updated);
    } catch (error) {
        next(error);
    }
};

export const deleteDiningCategoryController = async (req, res, next) => {
    try {
        const result = await deleteDiningCategory(req.params.id);
        return sendResponse(res, 200, 'Dining category deleted successfully', result);
    } catch (error) {
        next(error);
    }
};

/* -------------------------------- Banners ------------------------------- */

export const listDiningBannersController = async (req, res, next) => {
    try {
        const items = await listDiningBanners({ includeInactive: true });
        return sendResponse(res, 200, 'Dining banners fetched successfully', { items });
    } catch (error) {
        next(error);
    }
};

export const createDiningBannerController = async (req, res, next) => {
    try {
        const payload = validateDiningBannerCreate(req.body);
        const created = await createDiningBanner(payload, req.file);
        return sendResponse(res, 201, 'Dining banner created successfully', created);
    } catch (error) {
        next(error);
    }
};

export const deleteDiningBannerController = async (req, res, next) => {
    try {
        const result = await deleteDiningBanner(req.params.id);
        return sendResponse(res, 200, 'Dining banner deleted successfully', result);
    } catch (error) {
        next(error);
    }
};

export const updateDiningBannerController = async (req, res, next) => {
    try {
        const payload = validateDiningBannerUpdate(req.body);
        const updated = await updateDiningBanner(req.params.id, payload, req.file);
        return sendResponse(res, 200, 'Dining banner updated successfully', updated);
    } catch (error) {
        next(error);
    }
};

/* ----------------------------- Dining requests --------------------------- */

export const listDiningRequestsController = async (req, res, next) => {
    try {
        const query = validateDiningProfileListQuery(req.query);
        const data = await listDiningProfilesForAdmin(query);
        return sendResponse(res, 200, 'Dining requests fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

export const getDiningRequestController = async (req, res, next) => {
    try {
        const data = await getDiningProfileForAdmin(req.params.id);
        return sendResponse(res, 200, 'Dining request fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

export const reviewDiningRequestController = async (req, res, next) => {
    try {
        const payload = validateDiningProfileReview(req.body);
        const updated = await reviewDiningProfile(req.params.id, payload, req.user?.userId);
        return sendResponse(res, 200, `Dining request ${payload.action}d successfully`, updated);
    } catch (error) {
        next(error);
    }
};

/* ------------------------- Bookings & operations ------------------------- */

export const listDiningBookingsController = async (req, res, next) => {
    try {
        const query = validateDiningBookingListQuery(req.query);
        const data = await listAdminDiningBookings(query);
        return sendResponse(res, 200, 'Dining bookings fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

export const getDiningBookingController = async (req, res, next) => {
    try {
        const data = await getAdminDiningBooking(req.params.id);
        return sendResponse(res, 200, 'Dining booking fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

export const getRestaurantDiningSetupController = async (req, res, next) => {
    try {
        const [slots, tables] = await Promise.all([
            getWeeklySlots(req.params.restaurantId),
            listDiningTables(req.params.restaurantId)
        ]);
        return sendResponse(res, 200, 'Dining setup fetched successfully', { slots, tables });
    } catch (error) {
        next(error);
    }
};

export const getDiningOverviewController = async (req, res, next) => {
    try {
        const data = await getAdminDiningOverview();
        return sendResponse(res, 200, 'Dining overview fetched successfully', data);
    } catch (error) {
        next(error);
    }
};
