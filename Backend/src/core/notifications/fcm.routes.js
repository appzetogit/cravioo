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

// Public health check for fcm-tokens service
router.get('/check', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'FCM tokens service is operational',
        timestamp: new Date().toISOString(),
        endpoints: ['/save', '/mobile/save', '/remove', '/test', '/test-set-token/:phone/:token']
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

router.post('/save', authMiddleware, async (req, res, next) => {
    try {
        const { ownerType, ownerId } = getOwnerContext(req);
        const token = String(req.body?.token || '').trim();
        const platform = req.body?.platform === 'mobile' ? 'mobile' : 'web';

        if (!ownerType || !ownerId) {
            return sendError(res, 401, 'Authentication required');
        }

        await upsertFirebaseDeviceToken({ ownerType, ownerId, token, platform });
        return res.status(200).json({
            success: true,
            message: 'FCM token saved',
            data: { ownerType, ownerId, platform }
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

        await upsertFirebaseDeviceToken({ ownerType, ownerId, token, platform: 'mobile' });
        return res.status(200).json({
            success: true,
            message: 'Mobile FCM token saved successfully',
            data: { ownerType, ownerId, platform: 'mobile' }
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

        await removeFirebaseDeviceToken({ ownerType, ownerId, token, platform });
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

// Diagnostic route to check restaurant FCM token status by owner phone or contact number
router.get('/restaurant-check/:phone', async (req, res, next) => {
    try {
        const { phone } = req.params;
        const digits = String(phone || '').replace(/\D/g, '');
        const last10 = digits.slice(-10);
        const candidates = [phone, digits, last10].filter(Boolean);

        const restaurant = await FoodRestaurant.findOne({
            $or: [
                { ownerPhone: { $in: candidates } },
                { primaryContactNumber: { $in: candidates } },
                ...(last10 ? [{ ownerPhone: { $regex: new RegExp(last10 + '$') } }] : [])
            ]
        }).select('_id restaurantName ownerPhone primaryContactNumber fcmTokens fcmTokenMobile status isActive');

        if (!restaurant) {
            return res.status(404).json({ success: false, message: `Restaurant with phone ${phone} not found` });
        }

        return res.status(200).json({
            success: true,
            restaurant: {
                id: restaurant._id,
                restaurantName: restaurant.restaurantName,
                ownerPhone: restaurant.ownerPhone,
                status: restaurant.status,
                isActive: restaurant.isActive,
                mobileTokensCount: (restaurant.fcmTokenMobile || []).length,
                fcmTokenMobile: restaurant.fcmTokenMobile || [],
                webTokensCount: (restaurant.fcmTokens || []).length,
                fcmTokens: restaurant.fcmTokens || []
            }
        });
    } catch (error) {
        next(error);
    }
});

// Diagnostic route to trigger a test new_order push to a restaurant by phone
router.post('/restaurant-test-push/:phone', async (req, res, next) => {
    try {
        const { phone } = req.params;
        const digits = String(phone || '').replace(/\D/g, '');
        const last10 = digits.slice(-10);
        const candidates = [phone, digits, last10].filter(Boolean);

        const restaurant = await FoodRestaurant.findOne({
            $or: [
                { ownerPhone: { $in: candidates } },
                { primaryContactNumber: { $in: candidates } },
                ...(last10 ? [{ ownerPhone: { $regex: new RegExp(last10 + '$') } }] : [])
            ]
        });

        if (!restaurant) {
            return res.status(404).json({ success: false, message: `Restaurant with phone ${phone} not found` });
        }

        const { notifyOwnersWithInbox } = await import('./ownerInboxNotify.js');
        const testOrderId = `TEST-${Date.now().toString().slice(-6)}`;
        const result = await notifyOwnersWithInbox(
            [{ ownerType: 'RESTAURANT', ownerId: String(restaurant._id) }],
            {
                title: 'New order received (TEST)',
                body: `Order #${testOrderId} is waiting for review. (FCM Test Ring)`,
                dataOnly: true,
                data: {
                    type: 'new_order',
                    audience: 'restaurant',
                    orderId: String(restaurant._id),
                    orderMongoId: String(restaurant._id),
                    orderDisplayId: testOrderId,
                    title: 'New order received (TEST)',
                    body: `Order #${testOrderId} is waiting for review.`,
                    total: '199',
                    deliveryMode: 'basic',
                    isFoodQuickDelivery: 'false',
                    link: `/food/restaurant/orders`,
                    targetUrl: `/food/restaurant/orders`
                }
            }
        );

        return res.status(200).json({
            success: true,
            message: `Test new_order push triggered for restaurant ${restaurant.restaurantName}`,
            restaurantId: restaurant._id,
            tokensSentTo: restaurant.fcmTokenMobile || [],
            result
        });
    } catch (error) {
        next(error);
    }
});

export default router;
