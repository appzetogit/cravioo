import mongoose from 'mongoose';
import { FoodUser } from '../../../../core/users/user.model.js';
import { FoodOrder } from '../../orders/models/order.model.js';
import { FoodUserContact } from '../models/userContact.model.js';
import { COMPLETED_ORDER_STATUS } from '../../../../constants/orderStatus.js';
import { normalizePhoneNumber } from '../utils/phone.js';
import { ValidationError } from '../../../../core/auth/errors.js';

export const MUTUAL_TOP_USERS_LIMIT = 10;
/** Upper bound on synced contacts considered per request (protects memory / query size). */
export const MUTUAL_MAX_CONTACTS = 5000;
/** Contacts per `$in` lookup; each expands to a few stored-phone variants. */
const USER_LOOKUP_CHUNK_SIZE = 500;

const INDIA_PREFIX = '+91';

/**
 * Users store `phone` exactly as entered at login (see auth.service getPhoneCandidates),
 * so a normalized number can appear in several stored shapes.
 */
const phoneVariants = (normalized) => {
    const digits = normalized.slice(1);
    if (normalized.startsWith(INDIA_PREFIX)) {
        const local = normalized.slice(INDIA_PREFIX.length);
        return [normalized, digits, local, `${INDIA_PREFIX} ${local}`];
    }
    return [normalized, digits];
};

const chunk = (arr, size) => {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
};

/**
 * Top Cravioo users (by completed orders) among the authenticated user's synced contacts.
 * Queries: 1 contacts read + ceil(contacts/500) user lookups + 1 order aggregation.
 *
 * @param {string|mongoose.Types.ObjectId} userId
 */
export async function getMutualTopUsers(userId) {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        throw new ValidationError('Invalid user ID');
    }
    const currentUserId = new mongoose.Types.ObjectId(userId);

    const me = await FoodUser.findById(currentUserId)
        .select('contactPermissionStatus isContactSynced phone')
        .lean();
    const contactStatus = {
        permissionStatus: me?.contactPermissionStatus || 'PENDING',
        isSynced: Boolean(me?.isContactSynced)
    };
    if (!me || !contactStatus.isSynced) {
        return { users: [], count: 0, ...contactStatus };
    }

    const contacts = await FoodUserContact.find({ userId: currentUserId })
        .select('contactName normalizedNumber')
        .limit(MUTUAL_MAX_CONTACTS)
        .lean();

    const ownNumber = normalizePhoneNumber(me.phone);
    const nameByNumber = new Map();
    for (const c of contacts) {
        if (c.normalizedNumber && c.normalizedNumber !== ownNumber) {
            nameByNumber.set(c.normalizedNumber, c.contactName);
        }
    }
    if (nameByNumber.size === 0) {
        return { users: [], count: 0, ...contactStatus };
    }

    // Bulk user lookup (indexed on phone), eligible accounts only.
    const numberChunks = chunk([...nameByNumber.keys()], USER_LOOKUP_CHUNK_SIZE);
    const matchedChunks = await Promise.all(
        numberChunks.map((numbers) =>
            FoodUser.find({
                phone: { $in: numbers.flatMap(phoneVariants) },
                _id: { $ne: currentUserId },
                isActive: { $ne: false },
                isBlocked: { $ne: true },
                isDeleted: { $ne: true },
                accountStatus: { $ne: 'deleted' }
            })
                .select('name profileImage phone')
                .lean()
        )
    );

    const matchedById = new Map();
    for (const u of matchedChunks.flat()) matchedById.set(String(u._id), u);
    if (matchedById.size === 0) {
        return { users: [], count: 0, ...contactStatus };
    }

    // One aggregation over all matched users; ranking and limit happen in the database.
    const ranked = await FoodOrder.aggregate([
        {
            $match: {
                userId: { $in: [...matchedById.values()].map((u) => u._id) },
                orderStatus: COMPLETED_ORDER_STATUS
            }
        },
        { $group: { _id: '$userId', orderCount: { $sum: 1 } } },
        { $sort: { orderCount: -1, _id: 1 } },
        { $limit: MUTUAL_TOP_USERS_LIMIT }
    ]);

    const users = ranked.map(({ _id, orderCount }) => {
        const u = matchedById.get(String(_id));
        return {
            userId: String(_id),
            name: u.name || '',
            contactName: nameByNumber.get(normalizePhoneNumber(u.phone)) || '',
            profileImage: u.profileImage || '',
            orderCount
        };
    });

    return { users, count: users.length, ...contactStatus };
}
