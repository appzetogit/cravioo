import express from 'express';
import { cacheResponse } from '../../../../middleware/cache.js';
import * as diningController from '../controllers/publicDining.controller.js';

const router = express.Router();

router.get('/categories', cacheResponse(600, 'dining_categories'), diningController.listPublicDiningCategoriesController);
router.get('/banners', cacheResponse(600, 'dining_banners'), diningController.listPublicDiningBannersController);

// Distance-sorted results are request-specific, so only the non-geo variant is cached.
router.get('/restaurants', (req, res, next) => {
    if (req.query?.lat != null && req.query?.lng != null) return next();
    return cacheResponse(120, 'dining_restaurants')(req, res, next);
}, diningController.listPublicDiningRestaurantsController);

router.get('/restaurants/:restaurantId', cacheResponse(300, 'dining_restaurant_detail'), diningController.getPublicDiningRestaurantController);

// Never cached: seat counts change with every booking.
router.get('/restaurants/:restaurantId/availability', diningController.getPublicDiningAvailabilityController);

export default router;
