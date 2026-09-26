import express from 'express';
import { upload } from '../../../../middleware/upload.js';
import {
    listAddressesController,
    addAddressController,
    updateAddressController,
    deleteAddressController,
    setDefaultAddressController
} from '../controllers/userAddress.controller.js';
import {
    getCurrentUserProfileController,
    updateCurrentUserProfileController,
    uploadCurrentUserProfileImageController,
    deleteCurrentUserProfileController
} from '../controllers/userProfile.controller.js';
import {
    getUserWalletController,
    createWalletTopupOrderController,
    verifyWalletTopupPaymentController
} from '../controllers/userWallet.controller.js';
import {
    getUserReferralDetailsController,
    getUserReferralStatsController
} from '../controllers/userReferral.controller.js';
import {
    createSafetyEmergencyReportController,
    listMySafetyEmergencyReportsController
} from '../controllers/userSafetyEmergency.controller.js';
import {
    createSupportTicketController,
    listMySupportTicketsController
} from '../controllers/supportTicket.controller.js';
import {
    importContactsController,
    updatePermissionStatusController
} from '../controllers/userContact.controller.js';
import { getMutualUsersController } from '../controllers/userMutual.controller.js';

import {
    submitRoleRequestController,
    listMyRoleRequestsController,
    updateRoleRequestController,
    deleteRoleRequestController
} from '../controllers/userRoleRequest.controller.js';

import membershipUserRoutes from '../../membership/routes/membership.user.routes.js';
import diningUserRoutes from '../../dining/routes/userDining.routes.js';

const router = express.Router();

// Dining table bookings (Bearer USER)
router.use('/dining', diningUserRoutes);

// Customer memberships (Bearer USER)
router.use('/memberships', membershipUserRoutes);

router.get('/profile', getCurrentUserProfileController);
router.patch('/profile', updateCurrentUserProfileController);
router.delete('/profile', deleteCurrentUserProfileController);
router.post('/profile/profile-image', upload.single('file'), uploadCurrentUserProfileImageController);

// Customer Role Requests
router.post('/role-requests', submitRoleRequestController);
router.get('/role-requests', listMyRoleRequestsController);
router.patch('/role-requests/:id', updateRoleRequestController);
router.delete('/role-requests/:id', deleteRoleRequestController);

// Wallet (Bearer USER)
router.get('/wallet', getUserWalletController);
router.post('/wallet/topup/order', createWalletTopupOrderController);
router.post('/wallet/topup/verify', verifyWalletTopupPaymentController);

// Referral stats (Bearer USER)
router.get('/referrals/stats', getUserReferralStatsController);
router.get('/referrals/details', getUserReferralDetailsController);

// Safety / Emergency reports (Bearer USER)
router.post('/safety-emergency-reports', createSafetyEmergencyReportController);
router.get('/safety-emergency-reports', listMySafetyEmergencyReportsController);

// Support tickets (Bearer USER)
router.post('/support/ticket', createSupportTicketController);
router.get('/support/my-tickets', listMySupportTicketsController);

router.get('/addresses', listAddressesController);
router.post('/addresses', addAddressController);
router.patch('/addresses/:addressId', updateAddressController);
router.delete('/addresses/:addressId', deleteAddressController);
router.patch('/addresses/:addressId/default', setDefaultAddressController);

import { getMembersLeaderboardController } from '../controllers/userLeaderboard.controller.js';

// Contacts Sync & Permission Status routes (Bearer USER)
router.post('/contacts/import', importContactsController);
router.patch('/contacts/permission-status', updatePermissionStatusController);
router.get('/contacts/mutual', getMutualUsersController);

// Members leaderboard (Bearer USER)
router.get('/members/leaderboard', getMembersLeaderboardController);

export default router;
