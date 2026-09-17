import { sendResponse } from '../../../../utils/response.js';
import { listDiningCategories, listDiningBanners } from '../services/diningCatalog.service.js';
import {
    listPublicDiningRestaurants,
    getPublicDiningRestaurant
} from '../services/diningPublic.service.js';
import { getAvailabilityForDate } from '../services/diningAvailability.service.js';
import {
    validateDiningPublicListQuery,
    validateDiningAvailabilityQuery
} from '../validators/dining.validator.js';

export const listPublicDiningCategoriesController = async (req, res, next) => {
    try {
        const items = await listDiningCategories({ withCounts: true });
        return sendResponse(res, 200, 'Dining categories fetched successfully', { items });
    } catch (error) {
        next(error);
    }
};

export const listPublicDiningBannersController = async (req, res, next) => {
    try {
        const items = await listDiningBanners({ placement: req.query?.placement });
        return sendResponse(res, 200, 'Dining banners fetched successfully', { items });
    } catch (error) {
        next(error);
    }
};

export const listPublicDiningRestaurantsController = async (req, res, next) => {
    try {
        const query = validateDiningPublicListQuery(req.query);
        const data = await listPublicDiningRestaurants(query);
        return sendResponse(res, 200, 'Dining restaurants fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

export const getPublicDiningRestaurantController = async (req, res, next) => {
    try {
        const data = await getPublicDiningRestaurant(req.params.restaurantId);
        return sendResponse(res, 200, 'Dining details fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

export const getPublicDiningAvailabilityController = async (req, res, next) => {
    try {
        const query = validateDiningAvailabilityQuery(req.query);
        const data = await getAvailabilityForDate(req.params.restaurantId, query);
        return sendResponse(res, 200, 'Availability fetched successfully', data);
    } catch (error) {
        next(error);
    }
};
