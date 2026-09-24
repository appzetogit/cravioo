import { FoodDiningSlot, FoodDiningBlockedDate } from '../models/diningSlot.model.js';
import { FoodDiningTable } from '../models/diningTable.model.js';
import { FoodDiningProfile } from '../models/diningProfile.model.js';
import {
    FoodDiningBooking,
    DINING_ACTIVE_BOOKING_STATUSES
} from '../models/diningBooking.model.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../../../../core/auth/errors.js';
import {
    toObjectId,
    parseDateKey,
    todayDateKeyIST,
    dayOfWeekForDateKey,
    buildBookingInstant,
    timeToMinutes
} from '../utils/dining.util.js';

export const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const serializeSlot = (slot) => ({
    startTime: slot.startTime,
    endTime: slot.endTime,
    capacity: slot.capacity ?? 0,
    isActive: slot.isActive !== false
});

export const serializeDiningDay = (doc, dayOfWeek) => ({
    dayOfWeek,
    day: DAY_LABELS[dayOfWeek],
    isOpen: doc ? doc.isOpen !== false : false,
    slots: (doc?.slots || []).map(serializeSlot)
});

export const serializeDiningTable = (doc) => ({
    id: String(doc._id),
    _id: String(doc._id),
    name: doc.name || '',
    seats: doc.seats ?? 0,
    section: doc.section || 'indoor',
    note: doc.note || '',
    isActive: doc.isActive !== false,
    createdAt: doc.createdAt || null
});

const requireApprovedDining = async (restaurantId) => {
    const profile = await FoodDiningProfile.findOne({ restaurantId })
        .select('status isOnline bookingWindowDays slotDurationMins maxGuestsPerBooking minAdvanceMins autoConfirm')
        .lean();
    if (!profile) {
        throw new NotFoundError('Dining request not found. Submit a dining request first.');
    }
    if (profile.status !== 'approved') {
        throw new ForbiddenError('Dining management unlocks after admin approval');
    }
    return profile;
};

/* --------------------------------- Slots -------------------------------- */

export const getWeeklySlots = async (restaurantId) => {
    const rid = toObjectId(restaurantId, 'restaurant id');
    const docs = await FoodDiningSlot.find({ restaurantId: rid }).lean();
    const byDay = new Map(docs.map((doc) => [doc.dayOfWeek, doc]));
    return DAY_LABELS.map((_, dayOfWeek) => serializeDiningDay(byDay.get(dayOfWeek), dayOfWeek));
};

export const saveWeeklySlots = async (restaurantId, { days }) => {
    const rid = toObjectId(restaurantId, 'restaurant id');
    await requireApprovedDining(rid);

    await FoodDiningSlot.bulkWrite(
        days.map((day) => ({
            updateOne: {
                filter: { restaurantId: rid, dayOfWeek: day.dayOfWeek },
                update: {
                    $set: {
                        isOpen: day.isOpen !== false,
                        slots: day.slots.map(serializeSlot)
                    }
                },
                upsert: true
            }
        }))
    );

    return getWeeklySlots(rid);
};

export const listBlockedDates = async (restaurantId, { includePast = false } = {}) => {
    const filter = { restaurantId: toObjectId(restaurantId, 'restaurant id') };
    if (!includePast) {
        filter.date = { $gte: parseDateKey(todayDateKeyIST()) };
    }
    const docs = await FoodDiningBlockedDate.find(filter).sort({ date: 1 }).lean();
    return docs.map((doc) => ({
        id: String(doc._id),
        _id: String(doc._id),
        date: doc.date.toISOString().slice(0, 10),
        reason: doc.reason || ''
    }));
};

export const addBlockedDate = async (restaurantId, { date, reason }) => {
    const rid = toObjectId(restaurantId, 'restaurant id');
    await requireApprovedDining(rid);

    const dayKey = parseDateKey(date);
    if (date < todayDateKeyIST()) {
        throw new ConflictError('Cannot block a date in the past');
    }

    const created = await FoodDiningBlockedDate.findOneAndUpdate(
        { restaurantId: rid, date: dayKey },
        { $set: { reason: reason || '' } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return { id: String(created._id), date, reason: created.reason || '' };
};

export const removeBlockedDate = async (restaurantId, blockedDateId) => {
    const deleted = await FoodDiningBlockedDate.findOneAndDelete({
        _id: toObjectId(blockedDateId, 'blocked date id'),
        restaurantId: toObjectId(restaurantId, 'restaurant id')
    });
    if (!deleted) {
        throw new NotFoundError('Blocked date not found');
    }
    return { deleted: true, id: String(deleted._id) };
};

/* -------------------------------- Tables -------------------------------- */

export const listDiningTables = async (restaurantId, { includeInactive = true } = {}) => {
    const filter = { restaurantId: toObjectId(restaurantId, 'restaurant id') };
    if (!includeInactive) filter.isActive = true;
    const tables = await FoodDiningTable.find(filter).sort({ section: 1, name: 1 }).lean();
    return tables.map(serializeDiningTable);
};

export const getTableSummary = async (restaurantId) => {
    const rows = await FoodDiningTable.aggregate([
        { $match: { restaurantId: toObjectId(restaurantId, 'restaurant id'), isActive: true } },
        { $group: { _id: null, tables: { $sum: 1 }, seats: { $sum: '$seats' } } }
    ]);
    return { tables: rows[0]?.tables || 0, seats: rows[0]?.seats || 0 };
};

export const createDiningTable = async (restaurantId, payload) => {
    const rid = toObjectId(restaurantId, 'restaurant id');
    await requireApprovedDining(rid);
    try {
        const created = await FoodDiningTable.create({ ...payload, restaurantId: rid });
        return serializeDiningTable(created.toObject());
    } catch (error) {
        if (error?.code === 11000) {
            throw new ConflictError('A table with this name already exists');
        }
        throw error;
    }
};

export const updateDiningTable = async (restaurantId, tableId, payload) => {
    const table = await FoodDiningTable.findOne({
        _id: toObjectId(tableId, 'table id'),
        restaurantId: toObjectId(restaurantId, 'restaurant id')
    });
    if (!table) {
        throw new NotFoundError('Table not found');
    }

    ['name', 'seats', 'section', 'note', 'isActive'].forEach((key) => {
        if (payload[key] !== undefined) table[key] = payload[key];
    });

    try {
        await table.save();
    } catch (error) {
        if (error?.code === 11000) {
            throw new ConflictError('A table with this name already exists');
        }
        throw error;
    }
    return serializeDiningTable(table.toObject());
};

export const deleteDiningTable = async (restaurantId, tableId) => {
    const rid = toObjectId(restaurantId, 'restaurant id');
    const tid = toObjectId(tableId, 'table id');

    const inUse = await FoodDiningBooking.exists({
        restaurantId: rid,
        'tables.tableId': tid,
        status: { $in: DINING_ACTIVE_BOOKING_STATUSES }
    });
    if (inUse) {
        throw new ConflictError('This table is assigned to an active booking. Deactivate it instead.');
    }

    const deleted = await FoodDiningTable.findOneAndDelete({ _id: tid, restaurantId: rid });
    if (!deleted) {
        throw new NotFoundError('Table not found');
    }
    return { deleted: true, id: String(tid) };
};

/* ------------------------------ Availability ----------------------------- */

/**
 * Seats already held by active bookings for each slot of a day.
 * Returns a Map keyed by slot start time.
 */
const getBookedSeatsBySlot = async (restaurantId, dayKey) => {
    const rows = await FoodDiningBooking.aggregate([
        {
            $match: {
                restaurantId,
                bookingDate: dayKey,
                status: { $in: DINING_ACTIVE_BOOKING_STATUSES }
            }
        },
        { $group: { _id: '$slotStart', seats: { $sum: '$guests' }, bookings: { $sum: 1 } } }
    ]);
    return new Map(rows.map((row) => [row._id, { seats: row.seats, bookings: row.bookings }]));
};

/**
 * Bookable slots for a restaurant on a given date.
 * Applies: approval + online state, weekly schedule, blocked dates, booking window,
 * minimum advance time, per-slot capacity (falls back to total active table seats).
 */
export const getAvailabilityForDate = async (restaurantId, { date, guests = 2 }) => {
    const rid = toObjectId(restaurantId, 'restaurant id');
    const profile = await FoodDiningProfile.findOne({ restaurantId: rid })
        .select('status isOnline bookingWindowDays maxGuestsPerBooking minAdvanceMins autoConfirm')
        .lean();

    const closed = (reason) => ({
        date,
        isOpen: false,
        reason,
        autoConfirm: profile?.autoConfirm === true,
        maxGuestsPerBooking: profile?.maxGuestsPerBooking ?? 12,
        slots: []
    });

    if (!profile || profile.status !== 'approved') return closed('Dining is not available at this outlet');
    if (profile.isOnline === false) return closed('Dining bookings are temporarily offline');
    if (guests > (profile.maxGuestsPerBooking ?? 12)) {
        return closed(`Maximum ${profile.maxGuestsPerBooking ?? 12} guests per booking`);
    }

    const today = todayDateKeyIST();
    if (date < today) return closed('Selected date has passed');

    const maxDate = new Date(`${today}T00:00:00.000Z`);
    maxDate.setUTCDate(maxDate.getUTCDate() + (profile.bookingWindowDays ?? 30));
    if (date > maxDate.toISOString().slice(0, 10)) {
        return closed(`Bookings open only ${profile.bookingWindowDays ?? 30} days in advance`);
    }

    const dayKey = parseDateKey(date);
    const dayOfWeek = dayOfWeekForDateKey(date);

    const [daySchedule, blocked, tableSummary, bookedMap] = await Promise.all([
        FoodDiningSlot.findOne({ restaurantId: rid, dayOfWeek }).lean(),
        FoodDiningBlockedDate.findOne({ restaurantId: rid, date: dayKey }).lean(),
        getTableSummary(rid),
        getBookedSeatsBySlot(rid, dayKey)
    ]);

    if (blocked) return closed(blocked.reason || 'Outlet is closed on this date');
    if (!daySchedule || daySchedule.isOpen === false || (daySchedule.slots || []).length === 0) {
        return closed('Outlet is closed on this day');
    }

    const now = Date.now();
    const minAdvanceMs = (profile.minAdvanceMins ?? 30) * 60 * 1000;

    const slots = (daySchedule.slots || [])
        .filter((slot) => slot.isActive !== false)
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
        .map((slot) => {
            const capacity = slot.capacity > 0 ? slot.capacity : tableSummary.seats;
            const booked = bookedMap.get(slot.startTime)?.seats || 0;
            const seatsLeft = Math.max(0, capacity - booked);
            const startsAt = buildBookingInstant(date, slot.startTime);
            const isPast = startsAt.getTime() - minAdvanceMs < now;

            let unavailableReason = '';
            if (capacity === 0) unavailableReason = 'No tables configured';
            else if (isPast) unavailableReason = 'Booking window closed';
            else if (seatsLeft < guests) unavailableReason = 'Fully booked';

            return {
                startTime: slot.startTime,
                endTime: slot.endTime,
                capacity,
                seatsLeft,
                isAvailable: !unavailableReason,
                unavailableReason,
                startsAt
            };
        });

    return {
        date,
        isOpen: slots.some((slot) => slot.isAvailable),
        reason: slots.some((slot) => slot.isAvailable) ? '' : 'No slots available for this date',
        autoConfirm: profile.autoConfirm === true,
        maxGuestsPerBooking: profile.maxGuestsPerBooking ?? 12,
        totalSeats: tableSummary.seats,
        slots
    };
};

export { requireApprovedDining, getBookedSeatsBySlot };
