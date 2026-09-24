import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const IST_OFFSET_MINUTES = 330;

export const toObjectId = (value, label = 'id') => {
    if (!mongoose.Types.ObjectId.isValid(String(value || ''))) {
        throw new ValidationError(`Invalid ${label}`);
    }
    return new mongoose.Types.ObjectId(String(value));
};

export const normalizeTime = (value, label = 'Time') => {
    const raw = String(value || '').trim();
    if (!TIME_REGEX.test(raw)) {
        throw new ValidationError(`${label} must be in HH:mm format`);
    }
    return raw;
};

export const timeToMinutes = (hhmm) => {
    const [hours, minutes] = String(hhmm || '').split(':').map(Number);
    return (hours * 60) + minutes;
};

export const minutesToTime = (minutes) => {
    const safe = ((Math.round(minutes) % 1440) + 1440) % 1440;
    return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
};

/** "YYYY-MM-DD" -> UTC-midnight Date used as the canonical day key. */
export const parseDateKey = (value, label = 'Date') => {
    const raw = String(value || '').trim();
    if (!DATE_REGEX.test(raw)) {
        throw new ValidationError(`${label} must be in YYYY-MM-DD format`);
    }
    const date = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
        throw new ValidationError(`${label} is not a valid date`);
    }
    return date;
};

export const toDateKey = (date) => {
    const asDate = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(asDate.getTime())) return '';
    return asDate.toISOString().slice(0, 10);
};

/** Today's date key in IST, so "past date" checks match the user's calendar. */
export const todayDateKeyIST = (reference = new Date()) => {
    const shifted = new Date(reference.getTime() + (IST_OFFSET_MINUTES * 60 * 1000));
    return shifted.toISOString().slice(0, 10);
};

/** Exact UTC instant for an IST wall-clock date + "HH:mm". */
export const buildBookingInstant = (dateKey, hhmm) => {
    const [y, m, d] = String(dateKey).split('-').map(Number);
    const minutes = timeToMinutes(hhmm);
    return new Date(Date.UTC(y, m - 1, d, 0, minutes - IST_OFFSET_MINUTES, 0, 0));
};

/** JS day index (0 = Sunday) for a "YYYY-MM-DD" day key. */
export const dayOfWeekForDateKey = (dateKey) => new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();

export const generateBookingCode = () => {
    const stamp = Date.now().toString(36).toUpperCase().slice(-6);
    const random = Math.random().toString(36).toUpperCase().slice(2, 6);
    return `DN${stamp}${random}`;
};

export const serializeImage = (image) => {
    if (!image?.url) return null;
    return { url: image.url, publicId: image.publicId || '', caption: image.caption || '' };
};
