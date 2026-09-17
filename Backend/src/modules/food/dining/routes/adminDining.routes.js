import express from 'express';
import { upload } from '../../../../middleware/upload.js';
import { checkPermission } from '../../../../core/auth/auth.middleware.js';
import { invalidateCache } from '../../../../middleware/cache.js';
import * as diningController from '../controllers/adminDining.controller.js';

const router = express.Router();

const singleImage = upload.single('image');

/** Public dining reads are cached — drop them whenever admin changes the catalog. */
const invalidateDiningCaches = async (_req, _res, next) => {
    await invalidateCache('dining_categories:*');
    await invalidateCache('dining_banners:*');
    await invalidateCache('dining_restaurants:*');
    await invalidateCache('dining_restaurant_detail:*');
    next();
};

// ----- Overview -----
router.get(
    '/overview',
    checkPermission('food::dining_management::requests', 'view'),
    diningController.getDiningOverviewController
);

// ----- Dining categories (admin owns the catalog) -----
router.get(
    '/categories',
    checkPermission('food::dining_management::categories', 'view'),
    diningController.listDiningCategoriesController
);
router.post(
    '/categories',
    checkPermission('food::dining_management::categories', 'create'),
    singleImage,
    invalidateDiningCaches,
    diningController.createDiningCategoryController
);
router.patch(
    '/categories/:id',
    checkPermission('food::dining_management::categories', 'edit'),
    singleImage,
    invalidateDiningCaches,
    diningController.updateDiningCategoryController
);
router.delete(
    '/categories/:id',
    checkPermission('food::dining_management::categories', 'delete'),
    invalidateDiningCaches,
    diningController.deleteDiningCategoryController
);

// ----- Dining banners (admin-owned; visibility via isActive only) -----
router.get(
    '/banners',
    checkPermission('food::dining_management::banners', 'view'),
    diningController.listDiningBannersController
);
router.post(
    '/banners',
    checkPermission('food::dining_management::banners', 'create'),
    singleImage,
    invalidateDiningCaches,
    diningController.createDiningBannerController
);
router.patch(
    '/banners/:id',
    checkPermission('food::dining_management::banners', 'edit'),
    singleImage,
    invalidateDiningCaches,
    diningController.updateDiningBannerController
);
router.delete(
    '/banners/:id',
    checkPermission('food::dining_management::banners', 'delete'),
    invalidateDiningCaches,
    diningController.deleteDiningBannerController
);

// ----- Restaurant dining requests -----
router.get(
    '/requests',
    checkPermission('food::dining_management::requests', 'view'),
    diningController.listDiningRequestsController
);
router.get(
    '/requests/:id',
    checkPermission('food::dining_management::requests', 'view'),
    diningController.getDiningRequestController
);
router.patch(
    '/requests/:id/review',
    checkPermission('food::dining_management::requests', 'edit'),
    invalidateDiningCaches,
    diningController.reviewDiningRequestController
);

// ----- Booking history -----
router.get(
    '/bookings',
    checkPermission('food::dining_management::bookings', 'view'),
    diningController.listDiningBookingsController
);
router.get(
    '/bookings/:id',
    checkPermission('food::dining_management::bookings', 'view'),
    diningController.getDiningBookingController
);
router.get(
    '/restaurants/:restaurantId/setup',
    checkPermission('food::dining_management::bookings', 'view'),
    diningController.getRestaurantDiningSetupController
);

export default router;
