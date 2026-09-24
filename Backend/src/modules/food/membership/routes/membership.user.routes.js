import express from 'express';
import {
    listPublicPlansController,
    getMyMembershipController,
    createMembershipOrderController,
    verifyMembershipPaymentController
} from '../controllers/membership.controller.js';

const router = express.Router();

// Mounted under /food/user/memberships (Bearer USER)
router.get('/plans', listPublicPlansController);
router.get('/me', getMyMembershipController);
router.post('/order', createMembershipOrderController);
router.post('/verify', verifyMembershipPaymentController);

export default router;
