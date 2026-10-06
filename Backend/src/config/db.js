import mongoose from 'mongoose';
import dns from 'dns';
import { config } from './env.js';
import { logger } from '../utils/logger.js';

// Apply public DNS before any MongoDB SRV lookup (including pool reconnects).
try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (dnsErr) {
    logger.warn(`Failed to set DNS servers: ${dnsErr.message}`);
}

const MONGO_CONNECT_OPTIONS = {
    family: 4,
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 15000,
    heartbeatFrequencyMS: 10000,
    maxPoolSize: 15,
    minPoolSize: 2,
    autoIndex: false,
    readPreference: 'primary',
    retryWrites: true,
    retryReads: true,
};

/** Reuse the single mongoose connection — never create a parallel MongoClient here. */
export const assertMongoConnected = () => {
    const state = mongoose.connection.readyState;
    if (state !== 1) {
        const error = new Error(`MongoDB not connected (readyState=${state})`);
        error.code = 'MONGO_NOT_CONNECTED';
        throw error;
    }
    return mongoose.connection;
};

export const connectDB = async () => {
    try {
        const conn = await mongoose.connect(config.mongodbUri, MONGO_CONNECT_OPTIONS);
        logger.info(`MongoDB connected: ${conn.connection.host}`);

        // Money-critical indexes (autoIndex is disabled). Fail startup if they cannot be created.
        try {
            const { validateDeliveryBonusStartup } = await import(
                '../modules/food/admin/startup/bonusStartupValidator.js'
            );
            await validateDeliveryBonusStartup();
        } catch (bonusIdxErr) {
            logger.error(
                `FATAL: Delivery bonus index ensure failed: ${bonusIdxErr.message}. Refusing to start.`
            );
            process.exit(1);
        }

        // Notification TTL + channel uniqueness (autoIndex is disabled). Fail startup if unverified.
        try {
            const { validateNotificationStartup } = await import(
                '../core/notifications/startup/notificationStartupValidator.js'
            );
            await validateNotificationStartup();
        } catch (notificationIdxErr) {
            logger.error(
                `FATAL: Notification index ensure failed: ${notificationIdxErr.message}. Refusing to start.`
            );
            process.exit(1);
        }

        // Delivery onboarding submission history indexes (unique versioning).
        try {
            const { validateDeliveryOnboardingStartup } = await import(
                '../modules/food/delivery/database/deliveryOnboardingIndexManager.js'
            );
            await validateDeliveryOnboardingStartup();
        } catch (onboardingIdxErr) {
            logger.error(
                `FATAL: Delivery onboarding index ensure failed: ${onboardingIdxErr.message}. Refusing to start.`
            );
            process.exit(1);
        }

        // Programmatically inspect and drop legacy non-sparse index to prevent duplicate null key errors
        try {
            const db = conn.connection.db;
            const collections = await db.listCollections({ name: 'common_users' }).toArray();
            if (collections.length > 0) {
                const userCol = db.collection('common_users');
                const indexes = await userCol.indexes();
                const phoneIndex = indexes.find(idx => idx.name === 'phone_1');
                if (phoneIndex && !phoneIndex.sparse) {
                    logger.info("Dropping legacy non-sparse index 'phone_1' on 'common_users' to enable dual email/phone auth...");
                    await userCol.dropIndex('phone_1');
                    logger.info("Legacy non-sparse index 'phone_1' dropped successfully.");
                }
            }

            const qpCollections = await db.listCollections({ name: 'quick_products' }).toArray();
            if (qpCollections.length > 0) {
                const qpCol = db.collection('quick_products');
                const indexes = await qpCol.indexes();
                const slugIndex = indexes.find(idx => idx.name === 'slug_1');
                if (slugIndex && slugIndex.unique) {
                    logger.info("Dropping legacy global unique 'slug_1' index on 'quick_products' to support seller-scoped slug uniqueness...");
                    await qpCol.dropIndex('slug_1');
                    logger.info("Legacy global unique 'slug_1' index dropped successfully.");
                }
            }
        } catch (idxErr) {
            logger.warn(`Failed to inspect/drop legacy index: ${idxErr.message}`);
        }

        // Cashfree migration: the old razorpayOrderId unique index is non-sparse, so once
        // new logs stop setting that field every second insert would collide on null.
        // Drop it and let the model's createIndexes() below rebuild the correct (sparse
        // legacy + new cashfreeOrderId) indexes.
        try {
            const { OnboardingPaymentLog } = await import(
                '../modules/common/models/onboardingPaymentLog.model.js'
            );
            const opCollections = await conn.connection.db
                .listCollections({ name: 'common_onboarding_payment_logs' })
                .toArray();
            if (opCollections.length > 0) {
                const opCol = conn.connection.db.collection('common_onboarding_payment_logs');
                const indexes = await opCol.indexes();
                const legacyIndex = indexes.find((idx) => idx.name === 'razorpayOrderId_1');
                if (legacyIndex && !legacyIndex.sparse) {
                    logger.info("Dropping legacy non-sparse index 'razorpayOrderId_1' on 'common_onboarding_payment_logs'...");
                    await opCol.dropIndex('razorpayOrderId_1');
                }
            }
            await OnboardingPaymentLog.createIndexes();
        } catch (idxErr) {
            logger.warn(`Failed to migrate onboarding payment log indexes: ${idxErr.message}`);
        }

        // Cashfree migration: ensure new cashfree* unique indexes exist on models whose
        // razorpay* equivalents were already sparse (no legacy index to drop/fix here).
        try {
            const { UserMembership } = await import(
                '../modules/food/membership/models/userMembership.model.js'
            );
            // Multi-outlet owners: one owner phone may back several restaurants, so the
            // legacy unique index on ownerPhoneLast10 must go before the new plain index is used.
            const frCollections = await conn.connection.db
                .listCollections({ name: 'food_restaurants' })
                .toArray();
            if (frCollections.length > 0) {
                const frCol = conn.connection.db.collection('food_restaurants');
                const frIndexes = await frCol.indexes();
                const legacyPhoneIndex = frIndexes.find((idx) => idx.name === 'ownerPhoneLast10_1');
                if (legacyPhoneIndex && legacyPhoneIndex.unique) {
                    logger.info("Dropping legacy unique index 'ownerPhoneLast10_1' on 'food_restaurants' for multi-outlet owners...");
                    await frCol.dropIndex('ownerPhoneLast10_1');
                }
                const legacyContactIndex = frIndexes.find((idx) => idx.name === 'primaryContactNumberLast10_1');
                if (legacyContactIndex && legacyContactIndex.unique) {
                    logger.info("Dropping legacy unique index 'primaryContactNumberLast10_1' on 'food_restaurants' for multi-outlet owners...");
                    await frCol.dropIndex('primaryContactNumberLast10_1');
                }
                const { FoodRestaurant } = await import(
                    '../modules/food/restaurant/models/restaurant.model.js'
                );
                await FoodRestaurant.createIndexes();
            }

            const umCollections = await conn.connection.db
                .listCollections({ name: 'food_user_memberships' })
                .toArray();
            if (umCollections.length > 0) {
                const umCol = conn.connection.db.collection('food_user_memberships');
                const indexes = await umCol.indexes();
                // Legacy plain (non-unique, non-partial) index from the old `userId: { index: true }`
                // schema option shares the default name 'userId_1' with the new partial-unique
                // index below, so it must be dropped before createIndexes() can build the real one.
                const legacyUserIdIndex = indexes.find((idx) => idx.name === 'userId_1');
                if (legacyUserIdIndex && !legacyUserIdIndex.unique) {
                    logger.info("Dropping legacy plain index 'userId_1' on 'food_user_memberships'...");
                    await umCol.dropIndex('userId_1');
                }
            }
            await UserMembership.createIndexes();
        } catch (idxErr) {
            logger.warn(`Failed to ensure UserMembership cashfree indexes: ${idxErr.message}`);
        }
    } catch (error) {
        logger.error(`MongoDB connection error: ${error.message}`);
        // Log the URI without password for debugging
        const maskedUri = config.mongodbUri.replace(/\/\/.*@/, "//***:***@");
        logger.info(`Attempted to connect to: ${maskedUri}`);
        process.exit(1);
    }
};

/**
 * Close MongoDB connection (e.g. graceful shutdown).
 * @returns {Promise<void>}
 */
export const disconnectDB = async () => {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
};
