import { sendResponse } from '../../../../utils/response.js';
import { listDiningCategories } from '../services/diningCatalog.service.js';
import {
    getDiningProfileByRestaurant,
    submitDiningProfile,
    updateDiningProfileSettings
} from '../services/diningProfile.service.js';
import {
    getWeeklySlots,
    saveWeeklySlots,
    listBlockedDates,
    addBlockedDate,
    removeBlockedDate,
    listDiningTables,
    createDiningTable,
    updateDiningTable,
    deleteDiningTable,
    getTableSummary,
    getAvailabilityForDate
} from '../services/diningAvailability.service.js';
import {
    listRestaurantDiningBookings,
    getRestaurantDiningBooking,
    updateRestaurantDiningBookingStatus,
    getRestaurantDiningStats
} from '../services/diningBooking.service.js';
import {
    validateDiningProfileSubmit,
    validateDiningProfileSettings,
    validateDiningWeeklySlots,
    validateDiningBlockedDate,
    validateDiningTableCreate,
    validateDiningTableUpdate,
    validateDiningBookingListQuery,
    validateDiningBookingStatus,
    validateDiningAvailabilityQuery
} from '../validators/dining.validator.js';

const restaurantId = (req) => req.user?.userId;

/* -------------------------------- Profile -------------------------------- */

export const getMyDiningProfileController = async (req, res, next) => {
    try {
        const profile = await getDiningProfileByRestaurant(restaurantId(req), { includeReview: true });
        const categories = await listDiningCategories();
        return sendResponse(res, 200, 'Dining profile fetched successfully', {
            profile,
            availableCategories: categories
        });
    } catch (error) {
        next(error);
    }
};

export const submitMyDiningProfileController = async (req, res, next) => {
    try {
        const payload = validateDiningProfileSubmit(req.body);
        const profile = await submitDiningProfile(restaurantId(req), payload, req.files);
        return sendResponse(res, 200, 'Dining request submitted successfully', profile);
    } catch (error) {
        next(error);
    }
};

export const updateMyDiningSettingsController = async (req, res, next) => {
    try {
        const payload = validateDiningProfileSettings(req.body);
        const profile = await updateDiningProfileSettings(restaurantId(req), payload);
        return sendResponse(res, 200, 'Dining settings updated successfully', profile);
    } catch (error) {
        next(error);
    }
};

export const getMyDiningDashboardController = async (req, res, next) => {
    try {
        const id = restaurantId(req);
        const [profile, stats, tableSummary] = await Promise.all([
            getDiningProfileByRestaurant(id, { includeReview: true }),
            getRestaurantDiningStats(id),
            getTableSummary(id)
        ]);
        return sendResponse(res, 200, 'Dining dashboard fetched successfully', {
            profile,
            stats,
            tables: tableSummary
        });
    } catch (error) {
        next(error);
    }
};

/* --------------------------------- Slots -------------------------------- */

export const getMyDiningSlotsController = async (req, res, next) => {
    try {
        const id = restaurantId(req);
        const [days, blockedDates] = await Promise.all([
            getWeeklySlots(id),
            listBlockedDates(id)
        ]);
        return sendResponse(res, 200, 'Dining slots fetched successfully', { days, blockedDates });
    } catch (error) {
        next(error);
    }
};

export const saveMyDiningSlotsController = async (req, res, next) => {
    try {
        const payload = validateDiningWeeklySlots(req.body);
        const days = await saveWeeklySlots(restaurantId(req), payload);
        return sendResponse(res, 200, 'Dining slots updated successfully', { days });
    } catch (error) {
        next(error);
    }
};

export const addMyDiningBlockedDateController = async (req, res, next) => {
    try {
        const payload = validateDiningBlockedDate(req.body);
        const created = await addBlockedDate(restaurantId(req), payload);
        return sendResponse(res, 201, 'Date blocked successfully', created);
    } catch (error) {
        next(error);
    }
};

export const removeMyDiningBlockedDateController = async (req, res, next) => {
    try {
        const result = await removeBlockedDate(restaurantId(req), req.params.id);
        return sendResponse(res, 200, 'Blocked date removed successfully', result);
    } catch (error) {
        next(error);
    }
};

/* -------------------------------- Tables -------------------------------- */

export const listMyDiningTablesController = async (req, res, next) => {
    try {
        const id = restaurantId(req);
        const [items, summary] = await Promise.all([listDiningTables(id), getTableSummary(id)]);
        return sendResponse(res, 200, 'Dining tables fetched successfully', { items, summary });
    } catch (error) {
        next(error);
    }
};

export const createMyDiningTableController = async (req, res, next) => {
    try {
        const payload = validateDiningTableCreate(req.body);
        const created = await createDiningTable(restaurantId(req), payload);
        return sendResponse(res, 201, 'Table added successfully', created);
    } catch (error) {
        next(error);
    }
};

export const updateMyDiningTableController = async (req, res, next) => {
    try {
        const payload = validateDiningTableUpdate(req.body);
        const updated = await updateDiningTable(restaurantId(req), req.params.id, payload);
        return sendResponse(res, 200, 'Table updated successfully', updated);
    } catch (error) {
        next(error);
    }
};

export const deleteMyDiningTableController = async (req, res, next) => {
    try {
        const result = await deleteDiningTable(restaurantId(req), req.params.id);
        return sendResponse(res, 200, 'Table deleted successfully', result);
    } catch (error) {
        next(error);
    }
};

/* ------------------------------- Bookings ------------------------------- */

export const listMyDiningBookingsController = async (req, res, next) => {
    try {
        const query = validateDiningBookingListQuery(req.query);
        const data = await listRestaurantDiningBookings(restaurantId(req), query);
        return sendResponse(res, 200, 'Dining bookings fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

export const getMyDiningBookingController = async (req, res, next) => {
    try {
        const data = await getRestaurantDiningBooking(restaurantId(req), req.params.id);
        return sendResponse(res, 200, 'Dining booking fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

export const updateMyDiningBookingStatusController = async (req, res, next) => {
    try {
        const payload = validateDiningBookingStatus(req.body);
        const updated = await updateRestaurantDiningBookingStatus(
            restaurantId(req),
            req.params.id,
            payload
        );
        return sendResponse(res, 200, 'Booking updated successfully', updated);
    } catch (error) {
        next(error);
    }
};

export const getMyDiningAvailabilityController = async (req, res, next) => {
    try {
        const query = validateDiningAvailabilityQuery(req.query);
        const data = await getAvailabilityForDate(restaurantId(req), query);
        return sendResponse(res, 200, 'Availability fetched successfully', data);
    } catch (error) {
        next(error);
    }
};
