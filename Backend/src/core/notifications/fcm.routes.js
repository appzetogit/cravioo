import express from 'express';
import { authMiddleware } from '../auth/auth.middleware.js';
import { sendError } from '../../utils/response.js';
import {
    removeFirebaseDeviceToken,
    sendTestNotification,
    upsertFirebaseDeviceToken
} from './firebase.service.js';
import { FoodUser } from '../users/user.model.js';
import { FoodRestaurant } from '../../modules/food/restaurant/models/restaurant.model.js';

const router = express.Router();

const getOwnerContext = (req) => ({
    ownerType: req.user?.role,
    ownerId: req.user?.userId
});

/**
 * A device token belongs to a person, not a single outlet - a multi-outlet owner
 * switches their active outlet but keeps the same phone/browser. Pushes for ANY of
 * their outlets are only sent to the outlet that owns the order (see
 * notifyRestaurantNewOrder), so the token must be saved/removed on every outlet of
 * the owner account, not just whichever one the session happens to be scoped to.
 */
const getFcmTargetOwnerIds = async (req) => {
    const activeId = String(req.user?.userId || '');
    if (req.user?.role !== 'RESTAURANT' || !req.user?.ownerId) return [activeId];
    try {
        const { getOwnerOutletIds } = await import(
            '../../modules/food/restaurant/services/restaurantOutlet.service.js'
        );
        const outletIds = await getOwnerOutletIds(req.user.ownerId);
        return outletIds.length ? outletIds : [activeId];
    } catch {
        return [activeId];
    }
};

// Public health check for fcm-tokens service
router.get('/check', (req, res) => {
    res.status(200).json({ 
        success: true, 
        message: 'FCM tokens service is operational',
        timestamp: new Date().toISOString(),
        endpoints: [
            '/save', '/mobile/save', '/remove', '/test',
            '/test-set-token/:phone/:token', '/test-get-token/:phone',
            '/restaurant-check/:phone', '/restaurant-test-push/:phone'
        ]
    });
});

// Temporary administrative test route to set token by phone
router.get('/test-set-token/:phone/:token', async (req, res, next) => {
    try {
        const { phone, token } = req.params;
        const user = await FoodUser.findOne({ phone: phone.trim() });
        if (!user) return res.status(404).json({ success: false, message: `User with phone ${phone} not found` });

        await upsertFirebaseDeviceToken({ 
            ownerType: 'USER', 
            ownerId: String(user._id), 
            token, 
            platform: 'mobile' 
        });

        return res.status(200).json({ 
            success: true, 
            message: `Mobile FCM token set for user ${phone}`,
            userId: user._id
        });
    } catch (error) {
        next(error);
    }
});

// Temporary administrative test route to get tokens by phone
router.get('/test-get-token/:phone', async (req, res, next) => {
    try {
        const { phone } = req.params;
        const user = await FoodUser.findOne({ phone: phone.trim() }).select('fcmTokens fcmTokenMobile');
        if (!user) return res.status(404).json({ success: false, message: `User with phone ${phone} not found` });

        return res.status(200).json({ 
            success: true, 
            data: {
                web: user.fcmTokens || [],
                mobile: user.fcmTokenMobile || []
            }
        });
    } catch (error) {
        next(error);
    }
});

const findRestaurantByPhone = (phone) => {
    const last10 = String(phone || '').replace(/\D/g, '').slice(-10);
    if (!last10) return null;
    return FoodRestaurant.findOne({
        $or: [{ ownerPhoneLast10: last10 }, { primaryContactNumberLast10: last10 }]
    }).select('restaurantName fcmTokens fcmTokenMobile');
};

// Diagnostic: confirm a restaurant's FCM mobile token is saved on this server (see
// Cravioo_Backend_FCM_Notification_Fix.md — used to verify a deploy actually took effect).
router.get('/restaurant-check/:phone', async (req, res, next) => {
    try {
        const { phone } = req.params;
        const restaurant = await findRestaurantByPhone(phone);
        if (!restaurant) {
            return res.status(404).json({ success: false, message: `Restaurant with phone ${phone} not found` });
        }

        const mobileTokens = Array.isArray(restaurant.fcmTokenMobile) ? restaurant.fcmTokenMobile : [];
        const webTokens = Array.isArray(restaurant.fcmTokens) ? restaurant.fcmTokens : [];
        return res.status(200).json({
            success: true,
            data: {
                restaurantId: restaurant._id,
                restaurantName: restaurant.restaurantName,
                mobileTokensCount: mobileTokens.length,
                webTokensCount: webTokens.length,
                hasMobileToken: mobileTokens.length > 0
            }
        });
    } catch (error) {
        next(error);
    }
});

// Diagnostic: send a real test push to the restaurant's saved token, without creating an order.
router.post('/restaurant-test-push/:phone', async (req, res, next) => {
    try {
        const { phone } = req.params;
        const restaurant = await findRestaurantByPhone(phone);
        if (!restaurant) {
            return res.status(404).json({ success: false, message: `Restaurant with phone ${phone} not found` });
        }

        const result = await sendTestNotification({ ownerType: 'RESTAURANT', ownerId: String(restaurant._id) });
        return res.status(200).json({
            success: true,
            message: 'Test notification sent to restaurant',
            data: { restaurantId: restaurant._id, restaurantName: restaurant.restaurantName, result }
        });
    } catch (error) {
        next(error);
    }
});

router.post('/save', authMiddleware, async (req, res, next) => {
    try {
        const { ownerType, ownerId } = getOwnerContext(req);
        const token = String(req.body?.token || '').trim();
        const platform = req.body?.platform === 'mobile' ? 'mobile' : 'web';

        if (!ownerType || !ownerId) {
            return sendError(res, 401, 'Authentication required');
        }

        const targetIds = await getFcmTargetOwnerIds(req);
        await Promise.all(
            targetIds.map((id) => upsertFirebaseDeviceToken({ ownerType, ownerId: id, token, platform })),
        );
        return res.status(200).json({
            success: true,
            message: 'FCM token saved',
            data: { ownerType, ownerId, platform, outletsUpdated: targetIds.length }
        });
    } catch (error) {
        next(error);
    }
});

router.post('/mobile/save', authMiddleware, async (req, res, next) => {
    try {
        const { ownerType, ownerId } = getOwnerContext(req);
        const token = String(req.body?.token || '').trim();

        if (!ownerType || !ownerId) {
            return sendError(res, 401, 'Authentication required');
        }

        if (!token) {
            return sendError(res, 400, 'FCM token is required');
        }

        const targetIds = await getFcmTargetOwnerIds(req);
        await Promise.all(
            targetIds.map((id) => upsertFirebaseDeviceToken({ ownerType, ownerId: id, token, platform: 'mobile' })),
        );
        return res.status(200).json({
            success: true,
            message: 'Mobile FCM token saved successfully',
            data: { ownerType, ownerId, platform: 'mobile', outletsUpdated: targetIds.length }
        });
    } catch (error) {
        next(error);
    }
});

const handleRemoveToken = async (req, res, next) => {
    try {
        const { ownerType, ownerId } = getOwnerContext(req);
        const token = String(req.params?.token || req.body?.token || '').trim();
        const platform = req.body?.platform === 'mobile' ? 'mobile' : req.body?.platform === 'web' ? 'web' : undefined;

        if (!ownerType || !ownerId) {
            return sendError(res, 401, 'Authentication required');
        }

        // Logout must clear this device from every outlet it was registered on, not just
        // the one the session happened to be scoped to - otherwise a stale token keeps
        // receiving pushes for sibling outlets after the owner logs out.
        const targetIds = await getFcmTargetOwnerIds(req);
        await Promise.all(
            targetIds.map((id) => removeFirebaseDeviceToken({ ownerType, ownerId: id, token, platform })),
        );
        return res.status(200).json({
            success: true,
            message: 'FCM token removed'
        });
    } catch (error) {
        next(error);
    }
};

router.delete('/remove', authMiddleware, handleRemoveToken);
router.delete('/remove/:token', authMiddleware, handleRemoveToken);

router.post('/test', authMiddleware, async (req, res, next) => {
    try {
        const { ownerType, ownerId } = getOwnerContext(req);
        const platform = req.body?.platform === 'mobile' ? 'mobile' : req.body?.platform === 'web' ? 'web' : undefined;

        if (!ownerType || !ownerId) {
            return sendError(res, 401, 'Authentication required');
        }

        const result = await sendTestNotification({ ownerType, ownerId, platform });
        return res.status(200).json({
            success: true,
            message: 'Test notification sent',
            data: result
        });
    } catch (error) {
        next(error);
    }
});

export default router;
