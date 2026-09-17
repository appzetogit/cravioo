import { v2 as cloudinary } from 'cloudinary';
import { FoodDiningProfile } from '../models/diningProfile.model.js';
import { FoodDiningCategory } from '../models/diningCategory.model.js';
import { FoodDiningBooking } from '../models/diningBooking.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { uploadImageBufferDetailed } from '../../../../services/cloudinary.service.js';
import {
    ValidationError,
    NotFoundError,
    ForbiddenError,
    ConflictError
} from '../../../../core/auth/errors.js';
import { toObjectId } from '../utils/dining.util.js';
import { serializeDiningCategory } from './diningCatalog.service.js';

const PROFILE_FOLDER = 'food/dining/profiles';
const MAX_GALLERY = 10;

const uploadImages = async (files = []) => {
    const uploads = await Promise.all(
        files
            .filter((file) => file?.buffer)
            .map((file) => uploadImageBufferDetailed(file.buffer, PROFILE_FOLDER))
    );
    return uploads.map((result) => ({ url: result.secure_url, publicId: result.public_id }));
};

const destroyImages = async (images = []) => {
    await Promise.all(
        images
            .filter((image) => image?.publicId)
            .map((image) => cloudinary.uploader.destroy(image.publicId).catch(() => { }))
    );
};

const pickFiles = (files, field) => {
    if (!files) return [];
    if (Array.isArray(files)) return files.filter((file) => file.fieldname === field);
    return Array.isArray(files[field]) ? files[field] : [];
};

export const serializeDiningProfile = (doc, { includeReview = false } = {}) => {
    if (!doc) return null;
    const categories = Array.isArray(doc.categories)
        ? doc.categories.map((category) =>
            category && typeof category === 'object' && category.name
                ? serializeDiningCategory(category)
                : { id: String(category), _id: String(category) }
        )
        : [];

    const base = {
        id: String(doc._id),
        _id: String(doc._id),
        restaurantId: doc.restaurantId ? String(doc.restaurantId) : '',
        restaurantName: doc.restaurantName || '',
        status: doc.status,
        categories,
        about: doc.about || '',
        cuisines: doc.cuisines || [],
        amenities: doc.amenities || [],
        costForTwo: doc.costForTwo ?? 0,
        seatingCapacity: doc.seatingCapacity ?? 0,
        contactName: doc.contactName || '',
        contactPhone: doc.contactPhone || '',
        coverImage: doc.coverImage?.url || '',
        gallery: (doc.gallery || []).map((image) => image.url),
        menuImages: (doc.menuImages || []).map((image) => image.url),
        city: doc.city || '',
        bookingWindowDays: doc.bookingWindowDays ?? 30,
        slotDurationMins: doc.slotDurationMins ?? 60,
        maxGuestsPerBooking: doc.maxGuestsPerBooking ?? 12,
        minAdvanceMins: doc.minAdvanceMins ?? 30,
        autoConfirm: doc.autoConfirm === true,
        isOnline: doc.isOnline !== false,
        ratingAvg: Number((doc.ratingAvg ?? 0).toFixed(1)),
        ratingCount: doc.ratingCount ?? 0,
        totalBookings: doc.totalBookings ?? 0,
        rejectionReason: doc.rejectionReason || '',
        submittedAt: doc.submittedAt || null,
        reviewedAt: doc.reviewedAt || null,
        createdAt: doc.createdAt || null,
        updatedAt: doc.updatedAt || null
    };

    if (includeReview) {
        base.statusHistory = (doc.statusHistory || []).map((entry) => ({
            status: entry.status,
            note: entry.note || '',
            byRole: entry.byRole || '',
            at: entry.at || null
        }));
    }
    return base;
};

const loadRestaurantSnapshot = async (restaurantId) => {
    const restaurant = await FoodRestaurant.findById(restaurantId)
        .select('restaurantName city zoneId location status isActive isDeleted profileImage addressLine1 addressLine2')
        .lean();

    if (!restaurant || restaurant.isDeleted === true) {
        throw new NotFoundError('Restaurant not found');
    }
    if (String(restaurant.status || '').toLowerCase() !== 'approved') {
        throw new ForbiddenError('Only approved restaurants can apply for dining');
    }
    return restaurant;
};

const assertCategoriesExist = async (categoryIds) => {
    const ids = categoryIds.map((id) => toObjectId(id, 'category id'));
    const count = await FoodDiningCategory.countDocuments({ _id: { $in: ids }, isActive: true });
    if (count !== ids.length) {
        throw new ValidationError('One or more selected dining categories are unavailable');
    }
    return ids;
};

export const getDiningProfileByRestaurant = async (restaurantId, options = {}) => {
    const profile = await FoodDiningProfile.findOne({ restaurantId: toObjectId(restaurantId, 'restaurant id') })
        .populate('categories', 'name image description isActive sortOrder')
        .lean();
    return profile ? serializeDiningProfile(profile, options) : null;
};

/**
 * Create or re-submit a restaurant's dining request.
 * Approved profiles keep their status and stay live while details are edited;
 * a rejected profile goes back to `pending` on resubmit.
 */
export const submitDiningProfile = async (restaurantId, payload, files) => {
    const rid = toObjectId(restaurantId, 'restaurant id');
    const restaurant = await loadRestaurantSnapshot(rid);
    const categoryIds = await assertCategoriesExist(payload.categories);

    const existing = await FoodDiningProfile.findOne({ restaurantId: rid });
    if (existing && existing.status === 'suspended') {
        throw new ForbiddenError('Dining is suspended for this outlet. Contact support.');
    }

    const coverFiles = pickFiles(files, 'coverImage');
    const galleryFiles = pickFiles(files, 'gallery');
    const menuFiles = pickFiles(files, 'menuImages');

    if (!existing && coverFiles.length === 0) {
        throw new ValidationError('Cover image is required');
    }
    if (!existing && galleryFiles.length === 0) {
        throw new ValidationError('At least one gallery image is required');
    }

    const removeGallery = new Set(payload.removeGalleryUrls || []);
    const removeMenu = new Set(payload.removeMenuImageUrls || []);

    const keptGallery = (existing?.gallery || []).filter((image) => !removeGallery.has(image.url));
    const keptMenu = (existing?.menuImages || []).filter((image) => !removeMenu.has(image.url));

    const [coverUploads, galleryUploads, menuUploads] = await Promise.all([
        uploadImages(coverFiles),
        uploadImages(galleryFiles),
        uploadImages(menuFiles)
    ]);

    const gallery = [...keptGallery, ...galleryUploads].slice(0, MAX_GALLERY);
    const menuImages = [...keptMenu, ...menuUploads].slice(0, MAX_GALLERY);

    if (gallery.length === 0) {
        await destroyImages([...coverUploads, ...galleryUploads, ...menuUploads]);
        throw new ValidationError('At least one gallery image is required');
    }

    const nextStatus = existing?.status === 'approved' ? 'approved' : 'pending';
    const doc = existing || new FoodDiningProfile({ restaurantId: rid });
    const replacedImages = [];

    if (coverUploads.length > 0) {
        if (doc.coverImage?.publicId) replacedImages.push(doc.coverImage);
        doc.coverImage = coverUploads[0];
    }
    (existing?.gallery || []).forEach((image) => {
        if (removeGallery.has(image.url)) replacedImages.push(image);
    });
    (existing?.menuImages || []).forEach((image) => {
        if (removeMenu.has(image.url)) replacedImages.push(image);
    });

    doc.categories = categoryIds;
    doc.about = payload.about;
    doc.cuisines = payload.cuisines || [];
    doc.amenities = payload.amenities || [];
    doc.costForTwo = payload.costForTwo;
    doc.seatingCapacity = payload.seatingCapacity;
    doc.contactName = payload.contactName;
    doc.contactPhone = payload.contactPhone;
    doc.gallery = gallery;
    doc.menuImages = menuImages;
    doc.restaurantName = restaurant.restaurantName || '';
    doc.city = restaurant.city || '';
    doc.zoneId = restaurant.zoneId || undefined;
    if (Array.isArray(restaurant.location?.coordinates) && restaurant.location.coordinates.length === 2) {
        doc.location = { type: 'Point', coordinates: restaurant.location.coordinates };
    }

    if (nextStatus === 'pending') {
        doc.status = 'pending';
        doc.rejectionReason = '';
        doc.submittedAt = new Date();
        doc.statusHistory = [
            ...(doc.statusHistory || []),
            { status: 'pending', note: existing ? 'Re-submitted by restaurant' : 'Submitted by restaurant', byRole: 'RESTAURANT', byId: rid, at: new Date() }
        ];
    }

    try {
        await doc.save();
    } catch (error) {
        await destroyImages([...coverUploads, ...galleryUploads, ...menuUploads]);
        if (error?.code === 11000) {
            throw new ConflictError('A dining request already exists for this outlet');
        }
        throw error;
    }

    await destroyImages(replacedImages);
    const populated = await doc.populate('categories', 'name image description isActive sortOrder');
    return serializeDiningProfile(populated.toObject(), { includeReview: true });
};

export const updateDiningProfileSettings = async (restaurantId, payload) => {
    const profile = await FoodDiningProfile.findOne({ restaurantId: toObjectId(restaurantId, 'restaurant id') });
    if (!profile) {
        throw new NotFoundError('Dining request not found');
    }
    if (profile.status !== 'approved') {
        throw new ForbiddenError('Dining settings unlock only after admin approval');
    }

    ['bookingWindowDays', 'slotDurationMins', 'maxGuestsPerBooking', 'minAdvanceMins', 'autoConfirm', 'isOnline']
        .forEach((key) => {
            if (payload[key] !== undefined) profile[key] = payload[key];
        });

    await profile.save();
    return serializeDiningProfile(profile.toObject());
};

/* --------------------------------- Admin -------------------------------- */

export const listDiningProfilesForAdmin = async (query) => {
    const { page, limit, status, search, categoryId } = query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (categoryId) filter.categories = toObjectId(categoryId, 'category id');
    if (search) {
        const safe = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$or = [
            { restaurantName: { $regex: safe, $options: 'i' } },
            { city: { $regex: safe, $options: 'i' } },
            { contactPhone: { $regex: safe, $options: 'i' } }
        ];
    }

    const skip = (page - 1) * limit;
    const [items, total, statusCounts] = await Promise.all([
        FoodDiningProfile.find(filter)
            .populate('categories', 'name image')
            .sort({ status: 1, submittedAt: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        FoodDiningProfile.countDocuments(filter),
        FoodDiningProfile.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
    ]);

    return {
        items: items.map((item) => serializeDiningProfile(item, { includeReview: true })),
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
        counts: statusCounts.reduce(
            (acc, row) => ({ ...acc, [row._id]: row.count }),
            { pending: 0, approved: 0, rejected: 0, suspended: 0, draft: 0 }
        )
    };
};

export const getDiningProfileForAdmin = async (profileId) => {
    const profile = await FoodDiningProfile.findById(toObjectId(profileId, 'dining request id'))
        .populate('categories', 'name image description')
        .lean();
    if (!profile) {
        throw new NotFoundError('Dining request not found');
    }

    const restaurant = await FoodRestaurant.findById(profile.restaurantId)
        .select('restaurantName ownerName phone email addressLine1 addressLine2 city profileImage status')
        .lean();

    return {
        ...serializeDiningProfile(profile, { includeReview: true }),
        restaurant: restaurant
            ? {
                id: String(restaurant._id),
                name: restaurant.restaurantName || '',
                ownerName: restaurant.ownerName || '',
                phone: restaurant.phone || '',
                email: restaurant.email || '',
                address: [restaurant.addressLine1, restaurant.addressLine2, restaurant.city]
                    .filter(Boolean)
                    .join(', '),
                image: restaurant.profileImage || '',
                status: restaurant.status || ''
            }
            : null
    };
};

const REVIEW_TRANSITIONS = {
    approve: { from: ['pending', 'rejected', 'suspended'], to: 'approved' },
    reject: { from: ['pending', 'approved'], to: 'rejected' },
    suspend: { from: ['approved'], to: 'suspended' },
    reinstate: { from: ['suspended'], to: 'approved' }
};

export const reviewDiningProfile = async (profileId, { action, reason }, adminId) => {
    const profile = await FoodDiningProfile.findById(toObjectId(profileId, 'dining request id'));
    if (!profile) {
        throw new NotFoundError('Dining request not found');
    }

    const transition = REVIEW_TRANSITIONS[action];
    if (!transition.from.includes(profile.status)) {
        throw new ConflictError(`Cannot ${action} a request that is already ${profile.status}`);
    }

    profile.status = transition.to;
    profile.reviewedAt = new Date();
    profile.reviewedBy = adminId || undefined;
    profile.rejectionReason = transition.to === 'approved' ? '' : reason || '';
    if (transition.to !== 'approved') {
        profile.isOnline = false;
    }
    profile.statusHistory = [
        ...(profile.statusHistory || []),
        { status: transition.to, note: reason || '', byRole: 'ADMIN', byId: adminId || undefined, at: new Date() }
    ];

    await profile.save();
    const populated = await profile.populate('categories', 'name image');
    return serializeDiningProfile(populated.toObject(), { includeReview: true });
};

export const getAdminDiningOverview = async () => {
    const [profileCounts, bookingCounts, upcoming] = await Promise.all([
        FoodDiningProfile.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
        FoodDiningBooking.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
        FoodDiningBooking.countDocuments({
            status: { $in: ['pending', 'confirmed'] },
            bookingAt: { $gte: new Date() }
        })
    ]);

    const toMap = (rows) => rows.reduce((acc, row) => ({ ...acc, [row._id]: row.count }), {});
    const profiles = toMap(profileCounts);
    const bookings = toMap(bookingCounts);

    return {
        outlets: {
            pending: profiles.pending || 0,
            approved: profiles.approved || 0,
            rejected: profiles.rejected || 0,
            suspended: profiles.suspended || 0
        },
        bookings: {
            pending: bookings.pending || 0,
            confirmed: bookings.confirmed || 0,
            completed: bookings.completed || 0,
            cancelled: (bookings.cancelled || 0) + (bookings.rejected || 0),
            upcoming
        }
    };
};
