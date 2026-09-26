import { sendResponse } from '../../../../utils/response.js';
import {
    validateSetFoodPackagingDto,
    validateBulkSetFoodPackagingDto,
} from '../validators/foodPackaging.validator.js';
import * as foodPackagingService from '../services/foodPackaging.service.js';

export const listFoodsForPackagingController = async (req, res, next) => {
    try {
        const data = await foodPackagingService.listFoodsForPackaging(req.query || {});
        return sendResponse(res, 200, 'Food items fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

export const setFoodPackagingController = async (req, res, next) => {
    try {
        const body = validateSetFoodPackagingDto(req.body);
        const data = await foodPackagingService.setFoodPackaging(req.params.id, body);
        return sendResponse(res, 200, 'Packaging fee updated successfully', data);
    } catch (error) {
        next(error);
    }
};

export const bulkSetFoodPackagingController = async (req, res, next) => {
    try {
        const body = validateBulkSetFoodPackagingDto(req.body);
        const data = await foodPackagingService.bulkSetFoodPackaging(body);
        return sendResponse(res, 200, `Packaging fee applied to ${data.modified} food item(s)`, data);
    } catch (error) {
        next(error);
    }
};
