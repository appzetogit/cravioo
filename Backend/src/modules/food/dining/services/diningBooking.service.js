import {
    FoodDiningBooking,
    DINING_ACTIVE_BOOKING_STATUSES
} from '../models/diningBooking.model.js';
import { FoodDiningProfile } from '../models/diningProfile.model.js';
import { FoodDiningTable } from '../models/diningTable.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { createInboxNotifications } from '../../../../core/notifications/notification.service.js';
import {
    ValidationError,
    NotFoundError,
    ForbiddenError,
    ConflictError
} from '../../../../core/auth/errors.js';
import {
    toObjectId,
    parseDateKey,
    toDateKey,
    buildBookingInstant,
    todayDateKeyIST,
    generateBookingCode
} from '../utils/dining.util.js';
import { getAvailabilityForDate } from './diningAvailability.service.js';

export const serializeDiningBooking = (doc, { includeHistory = false } = {}) => {
    if (!doc) return null;
    const base = {
        id: String(doc._id),
        _id: String(doc._id),
        bookingCode: doc.bookingCode,
        status: doc.status,
        restaurantId: doc.restaurantId ? String(doc.restaurantId) : '',
        restaurantName: doc.restaurantName || '',
        restaurantImage: doc.restaurantImage || '',
        restaurantAddress: doc.restaurantAddress || '',
        date: toDateKey(doc.bookingDate),
        slotStart: doc.slotStart,
        slotEnd: doc.slotEnd,
        bookingAt: doc.bookingAt || null,
        guests: doc.guests ?? 0,
        tables: (doc.tables || []).map((table) => ({
            id: table.tableId ? String(table.tableId) : '',
            name: table.name || '',
            seats: table.seats ?? 0
        })),
        guestName: doc.guestName || '',
        guestPhone: doc.guestPhone || '',
        occasion: doc.occasion || '',
        specialRequest: doc.specialRequest || '',
        cancelledBy: doc.cancelledBy || '',
        cancelReason: doc.cancelReason || '',
        rating: doc.rating ?? null,
        review: doc.review || '',
        canCancel: DINING_ACTIVE_BOOKING_STATUSES.includes(doc.status) && doc.status !== 'seated',
        canRate: doc.status === 'completed' && !doc.rating,
        createdAt: doc.createdAt || null,
        updatedAt: doc.updatedAt || null
    };
    if (includeHistory) {
        base.statusHistory = (doc.statusHistory || []).map((entry) => ({
            status: entry.status,
            note: entry.note || '',
            byRole: entry.byRole || '',
            at: entry.at || null
        }));
    }
    return base;
};

const notifySafely = async (notifications) => {
    try {
        await createInboxNotifications({ notifications, returnDocuments: false });
    } catch {
        // Inbox delivery is best-effort — never fail a booking because of it.
    }
};

const buildDateFilter = ({ from, to }) => {
    if (!from && !to) return undefined;
    const range = {};
    if (from) range.$gte = parseDateKey(from, 'From date');
    if (to) range.$lte = parseDateKey(to, 'To date');
    return range;
};

const buildBookingFilter = (query, extra = {}) => {
    const filter = { ...extra };
    const { status, from, to, search, restaurantId } = query;

    if (status === 'active') filter.status = { $in: DINING_ACTIVE_BOOKING_STATUSES };
    else if (status && status !== 'all') filter.status = status;

    const dateRange = buildDateFilter({ from, to });
    if (dateRange) filter.bookingDate = dateRange;

    if (restaurantId && !extra.restaurantId) filter.restaurantId = toObjectId(restaurantId, 'restaurant id');

    if (search) {
        const safe = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$or = [
            { bookingCode: { $regex: safe, $options: 'i' } },
            { guestName: { $regex: safe, $options: 'i' } },
            { guestPhone: { $regex: safe, $options: 'i' } },
            { restaurantName: { $regex: safe, $options: 'i' } }
        ];
    }
    return filter;
};

const listBookings = async (filter, { page, limit }, options = {}) => {
    const skip = (page - 1) * limit;
    const [items, total, statusCounts] = await Promise.all([
        FoodDiningBooking.find(filter)
            .sort({ bookingAt: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        FoodDiningBooking.countDocuments(filter),
        options.withCounts
            ? FoodDiningBooking.aggregate([
                { $match: options.countScope || filter },
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ])
            : Promise.resolve(null)
    ]);

    return {
        items: items.map((item) => serializeDiningBooking(item, options)),
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
        ...(statusCounts
            ? {
                counts: statusCounts.reduce((acc, row) => ({ ...acc, [row._id]: row.count }), {
                    pending: 0,
                    confirmed: 0,
                    seated: 0,
                    completed: 0,
                    cancelled: 0,
                    rejected: 0,
                    no_show: 0
                })
            }
            : {})
    };
};

/* --------------------------------- User --------------------------------- */

export const createDiningBooking = async (userId, payload) => {
    const uid = toObjectId(userId, 'user id');
    const rid = toObjectId(payload.restaurantId, 'restaurant id');

    const availability = await getAvailabilityForDate(rid, {
        date: payload.date,
        guests: payload.guests
    });
    if (!availability.isOpen) {
        throw new ConflictError(availability.reason || 'Dining is unavailable for this date');
    }

    const slot = availability.slots.find((entry) => entry.startTime === payload.slotStart);
    if (!slot) {
        throw new ValidationError('Selected slot is not available');
    }
    if (!slot.isAvailable) {
        throw new ConflictError(slot.unavailableReason || 'Selected slot is not available');
    }

    const duplicate = await FoodDiningBooking.exists({
        userId: uid,
        restaurantId: rid,
        bookingDate: parseDateKey(payload.date),
        slotStart: payload.slotStart,
        status: { $in: DINING_ACTIVE_BOOKING_STATUSES }
    });
    if (duplicate) {
        throw new ConflictError('You already have a booking for this slot');
    }

    const [profile, restaurant] = await Promise.all([
        FoodDiningProfile.findOne({ restaurantId: rid }).select('autoConfirm coverImage').lean(),
        FoodRestaurant.findById(rid)
            .select('restaurantName profileImage addressLine1 addressLine2 city')
            .lean()
    ]);

    const status = profile?.autoConfirm === true ? 'confirmed' : 'pending';
    const now = new Date();
    const booking = await FoodDiningBooking.create({
        bookingCode: generateBookingCode(),
        userId: uid,
        restaurantId: rid,
        diningProfileId: profile?._id,
        bookingDate: parseDateKey(payload.date),
        slotStart: slot.startTime,
        slotEnd: slot.endTime,
        bookingAt: buildBookingInstant(payload.date, slot.startTime),
        guests: payload.guests,
        guestName: payload.guestName,
        guestPhone: payload.guestPhone,
        occasion: payload.occasion || '',
        specialRequest: payload.specialRequest || '',
        status,
        statusHistory: [{ status, note: 'Booking created', byRole: 'USER', byId: uid, at: now }],
        restaurantName: restaurant?.restaurantName || '',
        restaurantImage: profile?.coverImage?.url || restaurant?.profileImage || '',
        restaurantAddress: [restaurant?.addressLine1, restaurant?.addressLine2, restaurant?.city]
            .filter(Boolean)
            .join(', ')
    });

    // Optimistic capacity guard: the availability read above is not transactional, so
    // re-check the slot after writing and roll back if this booking pushed it over.
    const confirmedSeats = await FoodDiningBooking.aggregate([
        {
            $match: {
                restaurantId: rid,
                bookingDate: parseDateKey(payload.date),
                slotStart: slot.startTime,
                status: { $in: DINING_ACTIVE_BOOKING_STATUSES }
            }
        },
        { $group: { _id: null, seats: { $sum: '$guests' } } }
    ]);
    if ((confirmedSeats[0]?.seats || 0) > slot.capacity) {
        await FoodDiningBooking.deleteOne({ _id: booking._id });
        throw new ConflictError('This slot just got fully booked. Please pick another slot.');
    }

    await Promise.all([
        FoodDiningProfile.updateOne({ restaurantId: rid }, { $inc: { totalBookings: 1 } }),
        notifySafely([
            {
                ownerType: 'RESTAURANT',
                ownerId: rid,
                title: 'New dining booking request',
                message: `${payload.guestName} • ${payload.guests} guests • ${payload.date} ${slot.startTime}`,
                category: 'dining',
                link: '/restaurant/dining/bookings'
            },
            {
                ownerType: 'USER',
                ownerId: uid,
                title: status === 'confirmed' ? 'Table confirmed' : 'Booking request sent',
                message: `${booking.restaurantName || 'Restaurant'} • ${payload.date} at ${slot.startTime}`,
                category: 'dining',
                link: '/food/user/dining/bookings'
            }
        ])
    ]);

    return serializeDiningBooking(booking.toObject(), { includeHistory: true });
};

export const listUserDiningBookings = async (userId, query) => {
    const filter = buildBookingFilter(query, { userId: toObjectId(userId, 'user id') });
    return listBookings(filter, query, {
        withCounts: true,
        countScope: { userId: toObjectId(userId, 'user id') }
    });
};

export const getUserDiningBooking = async (userId, bookingId) => {
    const booking = await FoodDiningBooking.findOne({
        _id: toObjectId(bookingId, 'booking id'),
        userId: toObjectId(userId, 'user id')
    }).lean();
    if (!booking) {
        throw new NotFoundError('Booking not found');
    }
    return serializeDiningBooking(booking, { includeHistory: true });
};

export const cancelUserDiningBooking = async (userId, bookingId, { reason }) => {
    const booking = await FoodDiningBooking.findOne({
        _id: toObjectId(bookingId, 'booking id'),
        userId: toObjectId(userId, 'user id')
    });
    if (!booking) {
        throw new NotFoundError('Booking not found');
    }
    if (!DINING_ACTIVE_BOOKING_STATUSES.includes(booking.status) || booking.status === 'seated') {
        throw new ConflictError(`A ${booking.status} booking cannot be cancelled`);
    }

    booking.status = 'cancelled';
    booking.cancelledBy = 'user';
    booking.cancelReason = reason;
    booking.statusHistory.push({
        status: 'cancelled',
        note: reason,
        byRole: 'USER',
        byId: booking.userId,
        at: new Date()
    });
    await booking.save();

    await notifySafely([
        {
            ownerType: 'RESTAURANT',
            ownerId: booking.restaurantId,
            title: 'Dining booking cancelled',
            message: `${booking.bookingCode} • ${toDateKey(booking.bookingDate)} ${booking.slotStart}`,
            category: 'dining',
            link: '/restaurant/dining/bookings'
        }
    ]);

    return serializeDiningBooking(booking.toObject(), { includeHistory: true });
};

export const rateDiningBooking = async (userId, bookingId, { rating, review }) => {
    const booking = await FoodDiningBooking.findOne({
        _id: toObjectId(bookingId, 'booking id'),
        userId: toObjectId(userId, 'user id')
    });
    if (!booking) {
        throw new NotFoundError('Booking not found');
    }
    if (booking.status !== 'completed') {
        throw new ConflictError('Only completed visits can be rated');
    }
    if (booking.rating) {
        throw new ConflictError('This visit is already rated');
    }

    booking.rating = rating;
    booking.review = review || '';
    booking.ratedAt = new Date();
    await booking.save();

    // Keep the outlet's dining rating as a running average.
    const profile = await FoodDiningProfile.findOne({ restaurantId: booking.restaurantId })
        .select('ratingAvg ratingCount');
    if (profile) {
        const count = (profile.ratingCount || 0) + 1;
        profile.ratingAvg = (((profile.ratingAvg || 0) * (count - 1)) + rating) / count;
        profile.ratingCount = count;
        await profile.save();
    }

    return serializeDiningBooking(booking.toObject());
};

/* ------------------------------- Restaurant ------------------------------ */

const RESTAURANT_TRANSITIONS = {
    confirmed: ['pending'],
    rejected: ['pending'],
    seated: ['confirmed'],
    completed: ['seated', 'confirmed'],
    no_show: ['confirmed', 'seated'],
    cancelled: ['pending', 'confirmed']
};

export const listRestaurantDiningBookings = async (restaurantId, query) => {
    const rid = toObjectId(restaurantId, 'restaurant id');
    const filter = buildBookingFilter(query, { restaurantId: rid });
    return listBookings(filter, query, { withCounts: true, countScope: { restaurantId: rid } });
};

export const getRestaurantDiningBooking = async (restaurantId, bookingId) => {
    const booking = await FoodDiningBooking.findOne({
        _id: toObjectId(bookingId, 'booking id'),
        restaurantId: toObjectId(restaurantId, 'restaurant id')
    }).lean();
    if (!booking) {
        throw new NotFoundError('Booking not found');
    }
    return serializeDiningBooking(booking, { includeHistory: true });
};

export const updateRestaurantDiningBookingStatus = async (restaurantId, bookingId, payload) => {
    const rid = toObjectId(restaurantId, 'restaurant id');
    const booking = await FoodDiningBooking.findOne({
        _id: toObjectId(bookingId, 'booking id'),
        restaurantId: rid
    });
    if (!booking) {
        throw new NotFoundError('Booking not found');
    }

    const allowedFrom = RESTAURANT_TRANSITIONS[payload.status] || [];
    if (!allowedFrom.includes(booking.status)) {
        throw new ConflictError(`Cannot move a ${booking.status} booking to ${payload.status}`);
    }

    if (payload.status === 'confirmed' && payload.tableIds?.length) {
        const tables = await FoodDiningTable.find({
            _id: { $in: payload.tableIds.map((id) => toObjectId(id, 'table id')) },
            restaurantId: rid,
            isActive: true
        }).select('name seats').lean();

        if (tables.length !== payload.tableIds.length) {
            throw new ValidationError('One or more selected tables are unavailable');
        }

        const clash = await FoodDiningBooking.exists({
            restaurantId: rid,
            bookingDate: booking.bookingDate,
            slotStart: booking.slotStart,
            status: { $in: DINING_ACTIVE_BOOKING_STATUSES },
            _id: { $ne: booking._id },
            'tables.tableId': { $in: tables.map((table) => table._id) }
        });
        if (clash) {
            throw new ConflictError('A selected table is already assigned for this slot');
        }

        const seats = tables.reduce((sum, table) => sum + (table.seats || 0), 0);
        if (seats < booking.guests) {
            throw new ValidationError(`Selected tables seat ${seats}, booking needs ${booking.guests}`);
        }

        booking.tables = tables.map((table) => ({
            tableId: table._id,
            name: table.name,
            seats: table.seats
        }));
    }

    booking.status = payload.status;
    if (payload.status === 'cancelled' || payload.status === 'rejected') {
        booking.cancelledBy = 'restaurant';
        booking.cancelReason = payload.note;
    }
    booking.statusHistory.push({
        status: payload.status,
        note: payload.note || '',
        byRole: 'RESTAURANT',
        byId: rid,
        at: new Date()
    });
    await booking.save();

    const userMessages = {
        confirmed: 'Your table is confirmed',
        rejected: 'Your booking request was declined',
        seated: 'Enjoy your meal!',
        completed: 'Thanks for dining with us',
        no_show: 'Your booking was marked as no-show',
        cancelled: 'Your booking was cancelled by the restaurant'
    };

    await notifySafely([
        {
            ownerType: 'USER',
            ownerId: booking.userId,
            title: userMessages[payload.status] || 'Booking updated',
            message: `${booking.restaurantName || 'Restaurant'} • ${toDateKey(booking.bookingDate)} ${booking.slotStart}${payload.note ? ` • ${payload.note}` : ''}`,
            category: 'dining',
            link: '/food/user/dining/bookings'
        }
    ]);

    return serializeDiningBooking(booking.toObject(), { includeHistory: true });
};

export const getRestaurantDiningStats = async (restaurantId) => {
    const rid = toObjectId(restaurantId, 'restaurant id');
    const todayStart = parseDateKey(todayDateKeyIST());

    const [counts, todayRows] = await Promise.all([
        FoodDiningBooking.aggregate([
            { $match: { restaurantId: rid } },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]),
        FoodDiningBooking.aggregate([
            {
                $match: {
                    restaurantId: rid,
                    bookingDate: todayStart,
                    status: { $in: DINING_ACTIVE_BOOKING_STATUSES }
                }
            },
            { $group: { _id: null, bookings: { $sum: 1 }, guests: { $sum: '$guests' } } }
        ])
    ]);

    const map = counts.reduce((acc, row) => ({ ...acc, [row._id]: row.count }), {});
    return {
        pending: map.pending || 0,
        confirmed: map.confirmed || 0,
        seated: map.seated || 0,
        completed: map.completed || 0,
        cancelled: (map.cancelled || 0) + (map.rejected || 0),
        noShow: map.no_show || 0,
        today: {
            bookings: todayRows[0]?.bookings || 0,
            guests: todayRows[0]?.guests || 0
        }
    };
};

/* --------------------------------- Admin -------------------------------- */

export const listAdminDiningBookings = async (query) => {
    const filter = buildBookingFilter(query);
    return listBookings(filter, query, { withCounts: true, includeHistory: false });
};

export const getAdminDiningBooking = async (bookingId) => {
    const booking = await FoodDiningBooking.findOne({ _id: toObjectId(bookingId, 'booking id') }).lean();
    if (!booking) {
        throw new NotFoundError('Booking not found');
    }
    return serializeDiningBooking(booking, { includeHistory: true });
};

export const assertRestaurantDiningAccess = async (restaurantId) => {
    const profile = await FoodDiningProfile.findOne({ restaurantId: toObjectId(restaurantId, 'restaurant id') })
        .select('status')
        .lean();
    if (!profile) {
        throw new NotFoundError('Dining request not found');
    }
    if (profile.status !== 'approved') {
        throw new ForbiddenError('Dining management unlocks after admin approval');
    }
    return profile;
};
