import { v2 as cloudinary } from 'cloudinary';
import { FoodDiningCategory } from '../models/diningCategory.model.js';
import { FoodDiningBanner } from '../models/diningBanner.model.js';
import { FoodDiningProfile } from '../models/diningProfile.model.js';
import { uploadImageBufferDetailed } from '../../../../services/cloudinary.service.js';
import { ValidationError, NotFoundError, ConflictError } from '../../../../core/auth/errors.js';
import { toObjectId } from '../utils/dining.util.js';

const CATEGORY_FOLDER = 'food/dining/categories';
const BANNER_FOLDER = 'food/dining/banners';

const uploadImage = async (buffer, folder) => {
    const result = await uploadImageBufferDetailed(buffer, folder);
    return { url: result.secure_url, publicId: result.public_id };
};

const destroyImage = async (publicId) => {
    if (!publicId) return;
    await cloudinary.uploader.destroy(publicId).catch(() => { });
};

export const serializeDiningCategory = (doc) => {
    if (!doc) return null;
    return {
        id: String(doc._id),
        _id: String(doc._id),
        name: doc.name || '',
        description: doc.description || '',
        image: doc.image || '',
        sortOrder: doc.sortOrder ?? 0,
        isActive: doc.isActive !== false,
        restaurantCount: doc.restaurantCount ?? undefined,
        createdAt: doc.createdAt || null,
        updatedAt: doc.updatedAt || null
    };
};

export const serializeDiningBanner = (doc) => {
    if (!doc) return null;
    return {
        id: String(doc._id),
        _id: String(doc._id),
        title: doc.title || '',
        subtitle: doc.subtitle || '',
        image: doc.image || '',
        ctaText: doc.ctaText || '',
        link: doc.link || '',
        sortOrder: doc.sortOrder ?? 0,
        isActive: doc.isActive !== false,
        createdAt: doc.createdAt || null,
        updatedAt: doc.updatedAt || null
    };
};

/* ------------------------------ Categories ------------------------------ */

export const listDiningCategories = async ({ includeInactive = false, withCounts = false } = {}) => {
    const filter = includeInactive ? {} : { isActive: true };
    const categories = await FoodDiningCategory.find(filter)
        .sort({ sortOrder: 1, name: 1 })
        .lean();

    if (!withCounts || categories.length === 0) {
        return categories.map(serializeDiningCategory);
    }

    // One grouped pass instead of a count per category.
    const counts = await FoodDiningProfile.aggregate([
        { $match: { status: 'approved' } },
        { $unwind: '$categories' },
        { $group: { _id: '$categories', count: { $sum: 1 } } }
    ]);
    const countMap = new Map(counts.map((row) => [String(row._id), row.count]));

    return categories.map((category) =>
        serializeDiningCategory({
            ...category,
            restaurantCount: countMap.get(String(category._id)) || 0
        })
    );
};

export const createDiningCategory = async (payload, file) => {
    if (!file?.buffer) {
        throw new ValidationError('Category image is required');
    }

    const nameNormalized = payload.name.trim().toLowerCase();
    const exists = await FoodDiningCategory.exists({ nameNormalized });
    if (exists) {
        throw new ConflictError('A dining category with this name already exists');
    }

    const image = await uploadImage(file.buffer, CATEGORY_FOLDER);

    try {
        const created = await FoodDiningCategory.create({
            name: payload.name.trim(),
            description: payload.description || '',
            image: image.url,
            imagePublicId: image.publicId,
            sortOrder: payload.sortOrder ?? 0,
            isActive: payload.isActive !== false
        });
        return serializeDiningCategory(created.toObject());
    } catch (error) {
        await destroyImage(image.publicId);
        if (error?.code === 11000) {
            throw new ConflictError('A dining category with this name already exists');
        }
        throw error;
    }
};

export const updateDiningCategory = async (categoryId, payload, file) => {
    const category = await FoodDiningCategory.findById(toObjectId(categoryId, 'category id'));
    if (!category) {
        throw new NotFoundError('Dining category not found');
    }

    if (payload.name !== undefined) {
        const nameNormalized = payload.name.trim().toLowerCase();
        const clash = await FoodDiningCategory.exists({
            nameNormalized,
            _id: { $ne: category._id }
        });
        if (clash) {
            throw new ConflictError('A dining category with this name already exists');
        }
        category.name = payload.name.trim();
    }

    if (payload.description !== undefined) category.description = payload.description;
    if (payload.sortOrder !== undefined) category.sortOrder = payload.sortOrder;
    if (payload.isActive !== undefined) category.isActive = payload.isActive;

    if (file?.buffer) {
        const previousPublicId = category.imagePublicId;
        const image = await uploadImage(file.buffer, CATEGORY_FOLDER);
        category.image = image.url;
        category.imagePublicId = image.publicId;
        await destroyImage(previousPublicId);
    }

    await category.save();
    return serializeDiningCategory(category.toObject());
};

export const deleteDiningCategory = async (categoryId) => {
    const id = toObjectId(categoryId, 'category id');
    const inUse = await FoodDiningProfile.exists({ categories: id });
    if (inUse) {
        throw new ConflictError('This category is used by a restaurant. Deactivate it instead.');
    }

    const category = await FoodDiningCategory.findByIdAndDelete(id);
    if (!category) {
        throw new NotFoundError('Dining category not found');
    }
    await destroyImage(category.imagePublicId);
    return { deleted: true, id: String(id) };
};

/* -------------------------------- Banners ------------------------------- */

/** Next order value so a newly added banner lands at the end of the list. */
const getNextBannerSortOrder = async () => {
    const last = await FoodDiningBanner.findOne().sort({ sortOrder: -1 }).select('sortOrder').lean();
    return (last?.sortOrder ?? -1) + 1;
};

/**
 * List banners.
 * - Admin passes includeInactive so it can manage hidden banners too.
 * - The user app gets only active banners, ordered by sortOrder.
 */
export const listDiningBanners = async ({ includeInactive = false } = {}) => {
    const filter = includeInactive ? {} : { isActive: true };
    const banners = await FoodDiningBanner.find(filter)
        .sort({ sortOrder: 1, createdAt: 1 })
        .lean();
    return banners.map(serializeDiningBanner);
};

export const createDiningBanner = async (payload, file) => {
    if (!file?.buffer) {
        throw new ValidationError('Banner image is required');
    }

    const image = await uploadImage(file.buffer, BANNER_FOLDER);

    try {
        const created = await FoodDiningBanner.create({
            title: payload.title.trim(),
            subtitle: payload.subtitle || '',
            ctaText: payload.ctaText || '',
            link: payload.link || '',
            image: image.url,
            imagePublicId: image.publicId,
            sortOrder: payload.sortOrder ?? (await getNextBannerSortOrder()),
            isActive: payload.isActive !== false
        });
        return serializeDiningBanner(created.toObject());
    } catch (error) {
        // Never leave an orphan upload behind when the write fails.
        await destroyImage(image.publicId);
        throw error;
    }
};

export const updateDiningBanner = async (bannerId, payload, file) => {
    const banner = await FoodDiningBanner.findById(toObjectId(bannerId, 'banner id'));
    if (!banner) {
        throw new NotFoundError('Dining banner not found');
    }

    if (payload.title !== undefined) banner.title = payload.title;
    if (payload.subtitle !== undefined) banner.subtitle = payload.subtitle;
    if (payload.ctaText !== undefined) banner.ctaText = payload.ctaText;
    if (payload.link !== undefined) banner.link = payload.link;
    if (payload.sortOrder !== undefined) banner.sortOrder = payload.sortOrder;
    if (payload.isActive !== undefined) banner.isActive = payload.isActive;

    if (file?.buffer) {
        const previousPublicId = banner.imagePublicId;
        const image = await uploadImage(file.buffer, BANNER_FOLDER);
        banner.image = image.url;
        banner.imagePublicId = image.publicId;
        await destroyImage(previousPublicId);
    }

    await banner.save();
    return serializeDiningBanner(banner.toObject());
};

export const deleteDiningBanner = async (bannerId) => {
    const banner = await FoodDiningBanner.findByIdAndDelete(toObjectId(bannerId, 'banner id'));
    if (!banner) {
        throw new NotFoundError('Dining banner not found');
    }
    await destroyImage(banner.imagePublicId);
    return { deleted: true, id: String(banner._id) };
};
