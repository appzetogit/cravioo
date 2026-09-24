import { sendResponse } from '../../../../utils/response.js';
import * as membershipService from '../services/membership.service.js';

const handler = (message, fn) => async (req, res, next) => {
    try {
        return sendResponse(res, 200, message, await fn(req));
    } catch (error) {
        next(error);
    }
};

// Customer (Bearer USER)
export const listPublicPlansController = handler('Membership plans fetched successfully', () =>
    membershipService.listPublicPlans().then((plans) => ({ plans }))
);
export const getMyMembershipController = handler('Membership fetched successfully', (req) =>
    membershipService.getMyMembership(req.user?.userId)
);
export const createMembershipOrderController = handler('Membership order created', (req) =>
    membershipService.createMembershipOrder(req.user?.userId, req.body?.planId)
);
export const verifyMembershipPaymentController = handler('Membership activated successfully', (req) =>
    membershipService.verifyMembershipPayment(req.user?.userId, req.body || {})
);

// Admin
export const getDashboardController = handler('Membership dashboard fetched successfully', () =>
    membershipService.getMembershipDashboard()
);
export const listPlansAdminController = handler('Membership plans fetched successfully', () =>
    membershipService.listPlansAdmin().then((plans) => ({ plans }))
);
export const createPlanController = handler('Membership plan created successfully', (req) =>
    membershipService.createPlan(req.body || {})
);
export const updatePlanController = handler('Membership plan updated successfully', (req) =>
    membershipService.updatePlan(req.params.id, req.body || {})
);
export const setPlanStatusController = handler('Membership plan status updated', (req) =>
    membershipService.setPlanActive(req.params.id, req.body?.isActive)
);
export const deletePlanController = handler('Membership plan deleted successfully', (req) =>
    membershipService.deletePlan(req.params.id)
);
export const listMembershipsAdminController = handler('Memberships fetched successfully', (req) =>
    membershipService.listMembershipsAdmin(req.query || {})
);
export const cancelMembershipController = handler('Membership cancelled successfully', (req) =>
    membershipService.cancelMembershipAdmin(req.params.id, req.user?.userId, req.body?.reason)
);
export const refundMembershipController = handler('Membership refunded successfully', (req) =>
    membershipService.refundMembershipAdmin(req.params.id, req.user?.userId, req.body?.reason)
);
