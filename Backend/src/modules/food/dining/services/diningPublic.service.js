import { FoodDiningProfile } from '../models/diningProfile.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { NotFoundError } from '../../../../core/auth/errors.js';
import { toObjectId } from '../utils/dining.util.js';
import { getWeeklySlots, listBlockedDates } from './diningAvailability.service.js';

const EARTH_RADIUS_KM = 6371;

const toRadians = (value) => (value * Math.PI) / 180;

const distanceInKm = (from, to) => {
    if (!from || !to) return null;
    const dLat = toRadians(to.lat - from.lat);
    const dLng = toRadians(to.lng - from.lng);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
    return Number((EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1));
};

const toCard = (profile, origin) => {
    const coordinates = profile.location?.coordinates;
    const point =
        Array.isArray(coordinates) && coordinates.length === 2
            ? { lat: coordinates[1], lng: coordinates[0] }
            : null;

    return {
        id: String(profile._id),
        restaurantId: String(profile.restaurantId),
        name: profile.restaurantName || '',
        city: profile.city || '',
        about: profile.about || '',
        coverImage: profile.coverImage?.url || '',
        gallery: (profile.gallery || []).slice(0, 4).map((image) => image.url),
        categories: (profile.categories || []).map((category) =>
            category && typeof category === 'object'
                ? { id: String(category._id), name: category.name, image: category.image || '' }
                : { id: String(category) }
        ),
        cuisines: profile.cuisines || [],
        amenities: profile.amenities || [],
        costForTwo: profile.costForTwo ?? 0,
        seatingCapacity: profile.seatingCapacity ?? 0,
        ratingAvg: Number((profile.ratingAvg ?? 0).toFixed(1)),
        ratingCount: profile.ratingCount ?? 0,
        totalBookings: profile.totalBookings ?? 0,
        isOnline: profile.isOnline !== false,
        distanceInKm: point && origin ? distanceInKm(origin, point) : null
    };
};

const SORTS = {
    popular: { totalBookings: -1, ratingAvg: -1 },
    rating: { ratingAvg: -1, ratingCount: -1 },
    cost_low: { costForTwo: 1 },
    cost_high: { costForTwo: -1 }
};

export const listPublicDiningRestaurants = async (query) => {
    const { page, limit, search, categoryId, city, lat, lng, sort } = query;

    const filter = { status: 'approved', isOnline: { $ne: false } };
    if (categoryId) filter.categories = toObjectId(categoryId, 'category id');
    if (city) filter.city = { $regex: `^${String(city).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
    if (search) {
        const safe = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$or = [
            { restaurantName: { $regex: safe, $options: 'i' } },
            { cuisines: { $regex: safe, $options: 'i' } },
            { city: { $regex: safe, $options: 'i' } }
        ];
    }

    const origin = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    const skip = (page - 1) * limit;

    // "nearest" needs the full candidate set to sort by distance, so it is capped and
    // sorted in memory; every other sort stays an indexed DB sort.
    if (sort === 'nearest' && origin) {
        const candidates = await FoodDiningProfile.find(filter)
            .populate('categories', 'name image')
            .limit(300)
            .lean();
        const cards = candidates
            .map((profile) => toCard(profile, origin))
            .sort((a, b) => (a.distanceInKm ?? 9999) - (b.distanceInKm ?? 9999));
        return {
            items: cards.slice(skip, skip + limit),
            pagination: {
                page,
                limit,
                total: cards.length,
                totalPages: Math.max(1, Math.ceil(cards.length / limit))
            }
        };
    }

    const [items, total] = await Promise.all([
        FoodDiningProfile.find(filter)
            .populate('categories', 'name image')
            .sort(SORTS[sort] || SORTS.popular)
            .skip(skip)
            .limit(limit)
            .lean(),
        FoodDiningProfile.countDocuments(filter)
    ]);

    return {
        items: items.map((profile) => toCard(profile, origin)),
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
    };
};

export const getPublicDiningRestaurant = async (restaurantId) => {
    const rid = toObjectId(restaurantId, 'restaurant id');
    const profile = await FoodDiningProfile.findOne({
        restaurantId: rid,
        status: 'approved',
        isOnline: { $ne: false }
    })
        .populate('categories', 'name image description')
        .lean();
    if (!profile) {
        throw new NotFoundError('Dining is currently offline or not available at this outlet');
    }

    const [restaurant, weeklySlots, blockedDates] = await Promise.all([
        FoodRestaurant.findById(rid)
            .select('restaurantName phone addressLine1 addressLine2 city location profileImage coverImages')
            .lean(),
        getWeeklySlots(rid),
        listBlockedDates(rid)
    ]);

    return {
        ...toCard(profile, null),
        menuImages: (profile.menuImages || []).map((image) => image.url),
        gallery: (profile.gallery || []).map((image) => image.url),
        bookingWindowDays: profile.bookingWindowDays ?? 30,
        maxGuestsPerBooking: profile.maxGuestsPerBooking ?? 12,
        minAdvanceMins: profile.minAdvanceMins ?? 30,
        autoConfirm: profile.autoConfirm === true,
        contactPhone: profile.contactPhone || restaurant?.phone || '',
        address: [restaurant?.addressLine1, restaurant?.addressLine2, restaurant?.city]
            .filter(Boolean)
            .join(', '),
        coordinates:
            Array.isArray(restaurant?.location?.coordinates) && restaurant.location.coordinates.length === 2
                ? { lat: restaurant.location.coordinates[1], lng: restaurant.location.coordinates[0] }
                : null,
        weeklySchedule: weeklySlots.map((day) => ({
            dayOfWeek: day.dayOfWeek,
            day: day.day,
            isOpen: day.isOpen,
            slots: day.slots.filter((slot) => slot.isActive).map((slot) => ({
                startTime: slot.startTime,
                endTime: slot.endTime
            }))
        })),
        blockedDates: blockedDates.map((entry) => entry.date)
    };
};
