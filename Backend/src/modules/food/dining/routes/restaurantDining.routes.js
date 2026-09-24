import express from 'express';
import { upload } from '../../../../middleware/upload.js';
import { sendError } from '../../../../utils/response.js';
import * as diningController from '../controllers/restaurantDining.controller.js';

const router = express.Router();

/**
 * Dining request images. Cover is mandatory on first submit, gallery holds the
 * ambience shots and menuImages is optional.
 */
const diningUpload = (req, res, next) => {
    upload.fields([
        { name: 'coverImage', maxCount: 1 },
        { name: 'gallery', maxCount: 10 },
        { name: 'menuImages', maxCount: 10 }
    ])(req, res, (err) => {
        if (!err) return next();
        if (err?.code === 'LIMIT_FILE_SIZE') {
            return sendError(res, 400, 'Each image must be 5MB or smaller');
        }
        if (err?.code === 'LIMIT_UNEXPECTED_FILE') {
            return sendError(res, 400, 'Only coverImage, gallery and menuImages uploads are allowed');
        }
        return sendError(res, 400, err.message || 'Failed to upload dining images');
    });
};

// ----- Dining request / profile -----
router.get('/profile', diningController.getMyDiningProfileController);
router.post('/profile', diningUpload, diningController.submitMyDiningProfileController);
router.patch('/settings', diningController.updateMyDiningSettingsController);
router.get('/dashboard', diningController.getMyDiningDashboardController);

// ----- Availability (weekly slots + blocked dates) -----
router.get('/slots', diningController.getMyDiningSlotsController);
router.put('/slots', diningController.saveMyDiningSlotsController);
router.post('/blocked-dates', diningController.addMyDiningBlockedDateController);
router.delete('/blocked-dates/:id', diningController.removeMyDiningBlockedDateController);
router.get('/availability', diningController.getMyDiningAvailabilityController);

// ----- Tables -----
router.get('/tables', diningController.listMyDiningTablesController);
router.post('/tables', diningController.createMyDiningTableController);
router.patch('/tables/:id', diningController.updateMyDiningTableController);
router.delete('/tables/:id', diningController.deleteMyDiningTableController);

// ----- Bookings -----
router.get('/bookings', diningController.listMyDiningBookingsController);
router.get('/bookings/:id', diningController.getMyDiningBookingController);
router.patch('/bookings/:id/status', diningController.updateMyDiningBookingStatusController);

export default router;
