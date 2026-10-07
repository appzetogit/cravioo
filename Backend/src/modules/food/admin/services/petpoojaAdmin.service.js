import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { ValidationError, NotFoundError } from '../../../../core/auth/errors.js';

const maskSecret = (value) => {
  const v = String(value || '');
  if (!v) return '';
  return v.length <= 4 ? '••••' : `••••${v.slice(-4)}`;
};

const getZoneName = (zone) => zone?.name || zone?.zoneName || zone?.serviceLocation || '';

const toListItem = (doc) => ({
  id: String(doc._id),
  restaurantName: doc.restaurantName,
  status: doc.status,
  zone: typeof doc.zoneId === 'object' ? getZoneName(doc.zoneId) : '',
  petpooja: {
    enabled: Boolean(doc.petpooja?.enabled),
    restId: doc.petpooja?.restId || '',
    appKey: maskSecret(doc.petpooja?.appKey),
    appSecret: maskSecret(doc.petpooja?.appSecret),
    accessToken: maskSecret(doc.petpooja?.accessToken),
    connectedAt: doc.petpooja?.connectedAt || null,
  },
});

/** Lists restaurants with their PetPooja connection status, for the admin integration screen. */
export const listPetpoojaRestaurants = async ({ search = '', onlyConnected = false, page = 1, limit = 20 } = {}) => {
  const filter = { isDeleted: { $ne: true } };
  if (search.trim()) {
    filter.restaurantName = { $regex: search.trim(), $options: 'i' };
  }
  if (onlyConnected === true || onlyConnected === 'true') {
    filter['petpooja.enabled'] = true;
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));

  const [docs, total] = await Promise.all([
    FoodRestaurant.find(filter)
      .select('restaurantName status zoneId petpooja')
      .populate('zoneId', 'name zoneName serviceLocation')
      .sort({ restaurantName: 1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    FoodRestaurant.countDocuments(filter),
  ]);

  return {
    data: docs.map(toListItem),
    meta: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  };
};

/** Admin sets/edits one restaurant's PetPooja credentials and whether it's connected. */
export const updatePetpoojaConfig = async (restaurantId, body = {}) => {
  const restaurant = await FoodRestaurant.findById(restaurantId);
  if (!restaurant) throw new NotFoundError('Restaurant not found');

  const { enabled, restId, appKey, appSecret, accessToken } = body;

  if (enabled === true) {
    const finalRestId = restId !== undefined ? String(restId).trim() : restaurant.petpooja?.restId;
    const finalAppKey = appKey !== undefined ? String(appKey).trim() : restaurant.petpooja?.appKey;
    const finalAppSecret = appSecret !== undefined ? String(appSecret).trim() : restaurant.petpooja?.appSecret;
    const finalAccessToken = accessToken !== undefined ? String(accessToken).trim() : restaurant.petpooja?.accessToken;
    if (!finalRestId || !finalAppKey || !finalAppSecret || !finalAccessToken) {
      throw new ValidationError('restId, appKey, appSecret and accessToken are all required to enable PetPooja');
    }
  }

  if (restId !== undefined) restaurant.petpooja.restId = String(restId).trim();
  if (appKey !== undefined) restaurant.petpooja.appKey = String(appKey).trim();
  if (appSecret !== undefined) restaurant.petpooja.appSecret = String(appSecret).trim();
  if (accessToken !== undefined) restaurant.petpooja.accessToken = String(accessToken).trim();
  if (enabled !== undefined) {
    restaurant.petpooja.enabled = Boolean(enabled);
    if (enabled && !restaurant.petpooja.connectedAt) restaurant.petpooja.connectedAt = new Date();
  }

  await restaurant.save();
  await restaurant.populate('zoneId', 'name zoneName serviceLocation');
  return toListItem(restaurant.toObject());
};
