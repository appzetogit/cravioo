import mongoose from 'mongoose';
import { FoodUser } from '../../../../core/users/user.model.js';
import { FoodOrder } from '../../orders/models/order.model.js';
import { COMPLETED_ORDER_STATUS } from '../../../../constants/orderStatus.js';

export async function getMembersLeaderboard({ currentUserId = null, search = '', limit = 100, page = 1 } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 100));
    const skip = (pageNum - 1) * limitNum;

    // 1. Aggregate orders by userId to get total completed/placed orders per user
    const orderAgg = await FoodOrder.aggregate([
        {
            $match: {
                orderStatus: { $in: [COMPLETED_ORDER_STATUS, 'delivered', 'completed', 'confirmed', 'processing', 'picked_up'] }
            }
        },
        {
            $group: {
                _id: '$userId',
                orderCount: { $sum: 1 },
                lastOrderDate: { $max: '$createdAt' }
            }
        }
    ]);

    const orderCountMap = new Map();
    for (const item of orderAgg) {
        if (item._id) {
            orderCountMap.set(String(item._id), item.orderCount);
        }
    }

    // 2. Fetch all active users
    const userQuery = {
        isActive: { $ne: false },
        isBlocked: { $ne: true },
        isDeleted: { $ne: true },
        accountStatus: { $ne: 'deleted' }
    };

    if (search && search.trim().length > 0) {
        const regex = new RegExp(search.trim(), 'i');
        userQuery.$or = [{ name: regex }, { phone: regex }];
    }

    const allUsers = await FoodUser.find(userQuery)
        .select('name profileImage createdAt phone')
        .lean();

    // 3. Map with order count and sort descending by orders, then ascending by join date
    const formatted = allUsers.map((u) => {
        const uid = String(u._id);
        const orderCount = orderCountMap.get(uid) || 0;
        const rawName = u.name && u.name.trim().length > 0 ? u.name.trim() : (u.phone ? `Foodie ${u.phone.slice(-4)}` : 'Cravioo Foodie');

        let badge = 'Member';
        if (orderCount >= 50) badge = '👑 Legend Foodie';
        else if (orderCount >= 20) badge = '💎 Diamond Eater';
        else if (orderCount >= 10) badge = '🥇 Gold Gourmet';
        else if (orderCount >= 5) badge = '🥈 Silver Diner';
        else if (orderCount >= 1) badge = '🥉 Bronze Foodie';

        return {
            id: uid,
            userId: uid,
            name: rawName,
            profileImage: u.profileImage || '',
            orderCount,
            joinedAt: u.createdAt,
            badge,
            isCurrentUser: currentUserId ? uid === String(currentUserId) : false
        };
    });

    // Sort: highest orderCount first, then older member first
    formatted.sort((a, b) => {
        if (b.orderCount !== a.orderCount) {
            return b.orderCount - a.orderCount;
        }
        return new Date(a.joinedAt || 0) - new Date(b.joinedAt || 0);
    });

    // Assign overall rank (1-based)
    formatted.forEach((item, index) => {
        item.rank = index + 1;
    });

    let myRankInfo = null;
    if (currentUserId) {
        const foundIndex = formatted.findIndex((u) => u.userId === String(currentUserId));
        if (foundIndex !== -1) {
            myRankInfo = {
                ...formatted[foundIndex],
                rank: foundIndex + 1
            };
        } else {
            const me = await FoodUser.findById(currentUserId).select('name profileImage createdAt phone').lean();
            if (me) {
                const myOrders = orderCountMap.get(String(currentUserId)) || 0;
                myRankInfo = {
                    id: String(currentUserId),
                    userId: String(currentUserId),
                    name: me.name || (me.phone ? `Foodie ${me.phone.slice(-4)}` : 'You'),
                    profileImage: me.profileImage || '',
                    orderCount: myOrders,
                    rank: formatted.length + 1,
                    badge: myOrders > 0 ? 'Active Foodie' : 'New Member',
                    isCurrentUser: true
                };
            }
        }
    }

    const totalMembers = formatted.length;
    const topPodium = formatted.slice(0, 3);
    const paginatedMembers = formatted.slice(skip, skip + limitNum);

    return {
        totalMembers,
        topPodium,
        myRank: myRankInfo,
        members: paginatedMembers,
        page: pageNum,
        totalPages: Math.ceil(totalMembers / limitNum) || 1
    };
}
