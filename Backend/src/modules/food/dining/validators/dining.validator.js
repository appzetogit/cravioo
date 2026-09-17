import { z } from 'zod';
import { ValidationError } from '../../../../core/auth/errors.js';
import { DINING_TABLE_SECTIONS } from '../models/diningTable.model.js';
import { DINING_BANNER_PLACEMENTS } from '../models/diningBanner.model.js';
import { DINING_BOOKING_STATUSES } from '../models/diningBooking.model.js';

const parse = (schema, payload, fallbackMessage) => {
    const result = schema.safeParse(payload);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0]?.message || fallbackMessage);
    }
    return result.data;
};

const timeString = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be in HH:mm format');
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');
const objectIdString = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const boolish = z.preprocess((value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes'].includes(normalized)) return true;
        if (['false', '0', 'no'].includes(normalized)) return false;
    }
    return value;
}, z.boolean());

/** Multipart bodies send arrays as JSON strings, CSV or repeated fields. */
const toStringArray = (value) => {
    if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
    if (typeof value === 'string') {
        const raw = value.trim();
        if (!raw) return [];
        if (raw.startsWith('[')) {
            try {
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed.map((v) => String(v).trim()).filter(Boolean) : [];
            } catch {
                return [];
            }
        }
        return raw.split(',').map((v) => v.trim()).filter(Boolean);
    }
    return value;
};

const stringArray = z.preprocess(toStringArray, z.array(z.string().min(1).max(120)));
const idArray = z.preprocess(toStringArray, z.array(objectIdString));

const paginationShape = {
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20)
};

/* ------------------------------ Categories ------------------------------ */

const categoryCreateSchema = z.object({
    name: z.string().trim().min(2, 'Category name is required').max(120),
    description: z.string().trim().max(500).optional().default(''),
    sortOrder: z.coerce.number().int().min(0).max(9999).optional().default(0),
    isActive: boolish.optional().default(true)
});

export const validateDiningCategoryCreate = (body) =>
    parse(categoryCreateSchema, body, 'Invalid dining category data');

export const validateDiningCategoryUpdate = (body) =>
    parse(categoryCreateSchema.partial(), body, 'Invalid dining category data');

/* -------------------------------- Banners ------------------------------- */

const bannerUpdateSchema = z.object({
    title: z.string().trim().min(2, 'Banner title is required').max(120).optional(),
    subtitle: z.string().trim().max(200).optional(),
    ctaText: z.string().trim().max(60).optional(),
    link: z.string().trim().max(500).optional(),
    placement: z.enum(DINING_BANNER_PLACEMENTS).optional(),
    sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
    isActive: boolish.optional()
});

export const validateDiningBannerUpdate = (body) =>
    parse(bannerUpdateSchema, body, 'Invalid dining banner data');

/* ----------------------------- Dining profile ---------------------------- */

const profileSubmitSchema = z.object({
    about: z.string().trim().min(20, 'About must be at least 20 characters').max(2000),
    categories: idArray.refine((v) => v.length >= 1, 'Select at least one dining category')
        .refine((v) => v.length <= 10, 'Maximum 10 categories'),
    cuisines: stringArray.optional().default([]),
    amenities: stringArray.optional().default([]),
    costForTwo: z.coerce.number().min(0, 'Cost for two is required').max(100000),
    seatingCapacity: z.coerce.number().int().min(1, 'Seating capacity is required').max(2000),
    contactName: z.string().trim().min(2, 'Contact name is required').max(120),
    contactPhone: z.string().trim().regex(/^[0-9]{10}$/, 'Contact phone must be a 10 digit number'),
    removeGalleryUrls: stringArray.optional().default([]),
    removeMenuImageUrls: stringArray.optional().default([])
});

export const validateDiningProfileSubmit = (body) =>
    parse(profileSubmitSchema, body, 'Invalid dining request data');

const profileSettingsSchema = z.object({
    bookingWindowDays: z.coerce.number().int().min(1).max(90).optional(),
    slotDurationMins: z.coerce.number().int().min(15).max(240).optional(),
    maxGuestsPerBooking: z.coerce.number().int().min(1).max(50).optional(),
    minAdvanceMins: z.coerce.number().int().min(0).max(1440).optional(),
    autoConfirm: boolish.optional(),
    isOnline: boolish.optional()
});

export const validateDiningProfileSettings = (body) =>
    parse(profileSettingsSchema, body, 'Invalid dining settings');

const profileReviewSchema = z.object({
    action: z.enum(['approve', 'reject', 'suspend', 'reinstate'], {
        errorMap: () => ({ message: 'Action must be approve, reject, suspend or reinstate' })
    }),
    reason: z.string().trim().max(500).optional().default('')
}).superRefine((data, ctx) => {
    if ((data.action === 'reject' || data.action === 'suspend') && !data.reason) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'Reason is required' });
    }
});

export const validateDiningProfileReview = (body) =>
    parse(profileReviewSchema, body, 'Invalid review action');

/* -------------------------------- Tables -------------------------------- */

const tableSchema = z.object({
    name: z.string().trim().min(1, 'Table name is required').max(60),
    seats: z.coerce.number().int().min(1, 'Seats must be at least 1').max(50),
    section: z.enum(DINING_TABLE_SECTIONS).optional().default('indoor'),
    note: z.string().trim().max(200).optional().default(''),
    isActive: boolish.optional().default(true)
});

export const validateDiningTableCreate = (body) => parse(tableSchema, body, 'Invalid table data');

export const validateDiningTableUpdate = (body) =>
    parse(tableSchema.partial(), body, 'Invalid table data');

/* --------------------------------- Slots -------------------------------- */

const slotEntrySchema = z.object({
    startTime: timeString,
    endTime: timeString,
    capacity: z.coerce.number().int().min(0).max(5000).optional().default(0),
    isActive: boolish.optional().default(true)
}).refine((slot) => slot.startTime < slot.endTime, {
    message: 'Slot end time must be after start time'
});

const daySchema = z.object({
    dayOfWeek: z.coerce.number().int().min(0).max(6),
    isOpen: boolish.optional().default(true),
    slots: z.array(slotEntrySchema).max(12, 'Maximum 12 slots per day').optional().default([])
});

const weeklySlotsSchema = z.object({
    days: z.array(daySchema).min(1, 'At least one day is required').max(7)
});

export const validateDiningWeeklySlots = (body) => {
    const data = parse(weeklySlotsSchema, body, 'Invalid slot configuration');
    const seenDays = new Set();
    data.days.forEach((day) => {
        if (seenDays.has(day.dayOfWeek)) {
            throw new ValidationError('Each day can be configured only once');
        }
        seenDays.add(day.dayOfWeek);

        const sorted = [...day.slots].sort((a, b) => a.startTime.localeCompare(b.startTime));
        for (let i = 1; i < sorted.length; i += 1) {
            if (sorted[i].startTime < sorted[i - 1].endTime) {
                throw new ValidationError('Slots of the same day cannot overlap');
            }
        }
        if (day.isOpen && day.slots.length === 0) {
            throw new ValidationError('An open day needs at least one slot');
        }
    });
    return data;
};

const blockedDateSchema = z.object({
    date: dateString,
    reason: z.string().trim().max(200).optional().default('')
});

export const validateDiningBlockedDate = (body) =>
    parse(blockedDateSchema, body, 'Invalid blocked date');

/* ------------------------------- Bookings ------------------------------- */

const bookingCreateSchema = z.object({
    restaurantId: objectIdString,
    date: dateString,
    slotStart: timeString,
    guests: z.coerce.number().int().min(1, 'At least 1 guest is required').max(50),
    guestName: z.string().trim().min(2, 'Guest name is required').max(120),
    guestPhone: z.string().trim().regex(/^[0-9]{10}$/, 'Phone must be a 10 digit number'),
    occasion: z.string().trim().max(60).optional().default(''),
    specialRequest: z.string().trim().max(500).optional().default('')
});

export const validateDiningBookingCreate = (body) =>
    parse(bookingCreateSchema, body, 'Invalid booking data');

const bookingStatusSchema = z.object({
    status: z.enum(['confirmed', 'rejected', 'seated', 'completed', 'no_show', 'cancelled']),
    note: z.string().trim().max(300).optional().default(''),
    tableIds: idArray.optional().default([])
}).superRefine((data, ctx) => {
    if ((data.status === 'rejected' || data.status === 'cancelled') && !data.note) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['note'], message: 'A reason is required' });
    }
});

export const validateDiningBookingStatus = (body) =>
    parse(bookingStatusSchema, body, 'Invalid booking status update');

const bookingCancelSchema = z.object({
    reason: z.string().trim().min(3, 'Cancellation reason is required').max(300)
});

export const validateDiningBookingCancel = (body) =>
    parse(bookingCancelSchema, body, 'Invalid cancellation');

const bookingRatingSchema = z.object({
    rating: z.coerce.number().int().min(1).max(5),
    review: z.string().trim().max(500).optional().default('')
});

export const validateDiningBookingRating = (body) =>
    parse(bookingRatingSchema, body, 'Invalid rating');

/* --------------------------------- Query -------------------------------- */

const bookingListSchema = z.object({
    ...paginationShape,
    status: z.enum([...DINING_BOOKING_STATUSES, 'active', 'all']).optional(),
    restaurantId: objectIdString.optional(),
    from: dateString.optional(),
    to: dateString.optional(),
    search: z.string().trim().max(120).optional()
});

export const validateDiningBookingListQuery = (query) =>
    parse(bookingListSchema, query, 'Invalid booking filters');

const profileListSchema = z.object({
    ...paginationShape,
    status: z.enum(['draft', 'pending', 'approved', 'rejected', 'suspended', 'all']).optional(),
    search: z.string().trim().max(120).optional(),
    categoryId: objectIdString.optional()
});

export const validateDiningProfileListQuery = (query) =>
    parse(profileListSchema, query, 'Invalid filters');

const publicListSchema = z.object({
    ...paginationShape,
    search: z.string().trim().max(120).optional(),
    categoryId: objectIdString.optional(),
    city: z.string().trim().max(80).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    sort: z.enum(['popular', 'rating', 'cost_low', 'cost_high', 'nearest']).optional().default('popular')
});

export const validateDiningPublicListQuery = (query) =>
    parse(publicListSchema, query, 'Invalid filters');

const availabilityQuerySchema = z.object({
    date: dateString,
    guests: z.coerce.number().int().min(1).max(50).optional().default(2)
});

export const validateDiningAvailabilityQuery = (query) =>
    parse(availabilityQuerySchema, query, 'Invalid availability query');
