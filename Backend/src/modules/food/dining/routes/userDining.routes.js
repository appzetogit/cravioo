import express from 'express';
import * as diningController from '../controllers/userDining.controller.js';

const router = express.Router();

router.post('/bookings', diningController.createDiningBookingController);
router.get('/bookings', diningController.listMyDiningBookingsController);
router.get('/bookings/:id', diningController.getMyDiningBookingController);
router.patch('/bookings/:id/cancel', diningController.cancelMyDiningBookingController);
router.post('/bookings/:id/rating', diningController.rateMyDiningBookingController);

export default router;
