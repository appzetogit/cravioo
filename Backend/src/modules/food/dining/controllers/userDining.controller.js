import { sendResponse } from '../../../../utils/response.js';
import {
    createDiningBooking,
    listUserDiningBookings,
    getUserDiningBooking,
    cancelUserDiningBooking,
    rateDiningBooking
} from '../services/diningBooking.service.js';
import {
    validateDiningBookingCreate,
    validateDiningBookingListQuery,
    validateDiningBookingCancel,
    validateDiningBookingRating
} from '../validators/dining.validator.js';

const userId = (req) => req.user?.userId;

export const createDiningBookingController = async (req, res, next) => {
    try {
        const payload = validateDiningBookingCreate(req.body);
        const booking = await createDiningBooking(userId(req), payload);
        return sendResponse(
            res,
            201,
            booking.status === 'confirmed'
                ? 'Your table is confirmed'
                : 'Booking request sent to the restaurant',
            booking
        );
    } catch (error) {
        next(error);
    }
};

export const listMyDiningBookingsController = async (req, res, next) => {
    try {
        const query = validateDiningBookingListQuery(req.query);
        const data = await listUserDiningBookings(userId(req), query);
        return sendResponse(res, 200, 'Bookings fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

export const getMyDiningBookingController = async (req, res, next) => {
    try {
        const data = await getUserDiningBooking(userId(req), req.params.id);
        return sendResponse(res, 200, 'Booking fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

export const cancelMyDiningBookingController = async (req, res, next) => {
    try {
        const payload = validateDiningBookingCancel(req.body);
        const data = await cancelUserDiningBooking(userId(req), req.params.id, payload);
        return sendResponse(res, 200, 'Booking cancelled successfully', data);
    } catch (error) {
        next(error);
    }
};

export const rateMyDiningBookingController = async (req, res, next) => {
    try {
        const payload = validateDiningBookingRating(req.body);
        const data = await rateDiningBooking(userId(req), req.params.id, payload);
        return sendResponse(res, 200, 'Thanks for your feedback', data);
    } catch (error) {
        next(error);
    }
};
