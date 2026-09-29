import { FoodGourmetRestaurant } from '../models/gourmetRestaurant.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { getPublicGourmetRestaurants } from '../services/gourmet.service.js';

const VALID_TYPES = new Set(['top10', 'trending']);
const normalizeType = (value) => (VALID_TYPES.has(value) ? value : 'top10');

/** GET /hero-banners/gourmet?type=top10|trending - list entries for one rail (admin). Returns { success, data: { restaurants } } */
export const listGourmetAdmin = async (req, res, next) => {
    try {
        const type = normalizeType(req.query?.type);
        const docs = await FoodGourmetRestaurant.find({ type }).sort({ priority: 1, createdAt: -1 }).lean();
        const restaurantIds = [...new Set(docs.map((d) => d.restaurantId))];
        const restaurants = await FoodRestaurant.find({ _id: { $in: restaurantIds } })
            .select('restaurantName area city profileImage rating')
            .lean();
        const restaurantMap = new Map(restaurants.map((r) => [r._id.toString(), r]));
        const list = docs.map((d) => {
            const r = restaurantMap.get(d.restaurantId?.toString());
            return {
                _id: d._id,
                restaurantId: d.restaurantId,
                priority: d.priority,
                order: d.priority,
                isActive: d.isActive,
                zoneId: d.zoneId ? d.zoneId.toString() : '',
                restaurant: r ? {
                    _id: r._id,
                    name: r.restaurantName,
                    rating: r.rating || 0,
                    profileImage: r.profileImage ? { url: r.profileImage } : null,
                    area: r.area,
                    city: r.city
                } : null
            };
        });
        res.status(200).json({
            success: true,
            message: 'Gourmet restaurants fetched',
            data: { restaurants: list }
        });
    } catch (error) {
        next(error);
    }
};

/** POST /hero-banners/gourmet - add restaurant. Body: { restaurantId, type, zoneId } */
export const createGourmetAdmin = async (req, res, next) => {
    try {
        const { restaurantId } = req.body || {};
        const type = normalizeType(req.body?.type);
        const zoneId = req.body?.zoneId || null;
        if (!restaurantId) {
            return res.status(400).json({ success: false, message: 'restaurantId is required' });
        }
        const existing = await FoodGourmetRestaurant.findOne({ restaurantId, type });
        if (existing) {
            return res.status(400).json({
                success: false,
                message: `Restaurant already in ${type === 'trending' ? 'Trending Now' : 'Gourmet'}`
            });
        }
        const count = await FoodGourmetRestaurant.countDocuments({ type });
        const doc = await FoodGourmetRestaurant.create({
            restaurantId,
            type,
            zoneId,
            priority: count
        });
        const list = await getPublicGourmetRestaurants(type);
        const restaurants = (list || []).map((d) => ({
            _id: d._id,
            restaurantId: d.restaurantId,
            priority: d.priority,
            order: d.priority,
            isActive: d.isActive,
            zoneId: d.zoneId ? d.zoneId.toString() : '',
            restaurant: d.restaurant ? {
                _id: d.restaurant._id,
                name: d.restaurant.name,
                rating: d.restaurant.rating || 0,
                profileImage: d.restaurant.profileImage,
                area: d.restaurant.area,
                city: d.restaurant.city
            } : null
        })).filter((r) => r && r._id);
        res.status(201).json({
            success: true,
            message: `Restaurant added to ${type === 'trending' ? 'Trending Now' : 'Gourmet'}`,
            data: { restaurants, item: doc.toObject() }
        });
    } catch (error) {
        next(error);
    }
};

/** DELETE /hero-banners/gourmet/:id */
export const deleteGourmetAdmin = async (req, res, next) => {
    try {
        const { id } = req.params;
        const doc = await FoodGourmetRestaurant.findByIdAndDelete(id);
        if (!doc) {
            return res.status(404).json({ success: false, message: 'Gourmet entry not found' });
        }
        res.status(200).json({ success: true, message: 'Restaurant removed from Gourmet', data: { id } });
    } catch (error) {
        next(error);
    }
};

/** PATCH /hero-banners/gourmet/:id/order - body: { order } */
export const updateGourmetOrderAdmin = async (req, res, next) => {
    try {
        const { id } = req.params;
        const order = parseInt(req.body?.order, 10);
        if (Number.isNaN(order)) {
            return res.status(400).json({ success: false, message: 'order must be a number' });
        }
        const doc = await FoodGourmetRestaurant.findByIdAndUpdate(id, { priority: order }, { new: true });
        if (!doc) {
            return res.status(404).json({ success: false, message: 'Gourmet entry not found' });
        }
        res.status(200).json({ success: true, message: 'Order updated', data: doc.toObject() });
    } catch (error) {
        next(error);
    }
};

/** PATCH /hero-banners/gourmet/:id/zone - body: { zoneId } - controls where this entry shows. Empty/null = show everywhere. */
export const updateGourmetZoneAdmin = async (req, res, next) => {
    try {
        const { id } = req.params;
        const zoneId = req.body?.zoneId || null;
        const doc = await FoodGourmetRestaurant.findByIdAndUpdate(
            id,
            { zoneId },
            { new: true }
        );
        if (!doc) {
            return res.status(404).json({ success: false, message: 'Entry not found' });
        }
        res.status(200).json({ success: true, message: zoneId ? 'Zone assigned' : 'Set to show in all zones', data: doc.toObject() });
    } catch (error) {
        next(error);
    }
};

/** PATCH /hero-banners/gourmet/:id/status - toggle isActive */
export const toggleGourmetStatusAdmin = async (req, res, next) => {
    try {
        const { id } = req.params;
        const doc = await FoodGourmetRestaurant.findById(id);
        if (!doc) {
            return res.status(404).json({ success: false, message: 'Gourmet entry not found' });
        }
        doc.isActive = !doc.isActive;
        await doc.save();
        res.status(200).json({ success: true, message: doc.isActive ? 'Activated' : 'Deactivated', data: doc.toObject() });
    } catch (error) {
        next(error);
    }
};
