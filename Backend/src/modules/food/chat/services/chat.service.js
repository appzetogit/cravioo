import mongoose from 'mongoose';
import { ChatConversation } from '../models/chatConversation.model.js';
import { ChatMessage } from '../models/chatMessage.model.js';
import { FoodOrder } from '../../orders/models/order.model.js';
import { FoodUser } from '../../../../core/users/user.model.js';
import { FoodDeliveryPartner } from '../../delivery/models/deliveryPartner.model.js';
import { ValidationError, ForbiddenError, NotFoundError } from '../../../../core/auth/errors.js';
import { getIO, rooms } from '../../../../config/socket.js';
import { sendNotificationToOwner } from '../../../../core/notifications/firebase.service.js';
import { logger } from '../../../../utils/logger.js';

const OTHER_ROLE = { USER: 'DELIVERY_PARTNER', DELIVERY_PARTNER: 'USER' };

const isParticipant = (conversation, role, userId) => {
    if (role === 'USER') return String(conversation.userId) === String(userId);
    if (role === 'DELIVERY_PARTNER') return String(conversation.deliveryPartnerId) === String(userId);
    return false;
};

/**
 * Finds the conversation for an order, creating it the first time either side opens
 * the chat. A delivery partner must already be assigned — chat only makes sense once
 * there's someone on the other end.
 */
export const getOrCreateConversationForOrder = async (orderId, { role, userId }) => {
    const identity = mongoose.Types.ObjectId.isValid(orderId) ? { _id: orderId } : { orderId };
    const order = await FoodOrder.findOne(identity).select('orderId userId dispatch').lean();
    if (!order) throw new NotFoundError('Order not found');

    const deliveryPartnerId = order.dispatch?.deliveryPartnerId;
    if (!deliveryPartnerId) throw new ValidationError('No delivery partner assigned to this order yet');

    if (role === 'USER' && String(order.userId) !== String(userId)) throw new ForbiddenError('Not your order');
    if (role === 'DELIVERY_PARTNER' && String(deliveryPartnerId) !== String(userId)) throw new ForbiddenError('Not your order');

    let conversation = await ChatConversation.findOne({ orderId: order._id });
    if (!conversation) {
        conversation = await ChatConversation.create({
            orderId: order._id,
            orderNumber: order.orderId || '',
            userId: order.userId,
            deliveryPartnerId,
        });
    }
    return conversation;
};

export const listConversationsForUser = async ({ role, userId }, { limit = 20, page = 1 } = {}) => {
    if (!['USER', 'DELIVERY_PARTNER'].includes(role)) throw new ValidationError('Invalid role for chat');
    const filter = role === 'USER' ? { userId } : { deliveryPartnerId: userId };
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);

    const [rows, total] = await Promise.all([
        ChatConversation.find(filter)
            .sort({ updatedAt: -1 })
            .skip((parsedPage - 1) * parsedLimit)
            .limit(parsedLimit)
            .lean(),
        ChatConversation.countDocuments(filter),
    ]);

    return {
        conversations: rows.map((c) => ({
            id: String(c._id),
            orderId: c.orderId,
            orderNumber: c.orderNumber,
            lastMessage: c.lastMessage,
            unreadCount: c.unreadCount?.[role] || 0,
            updatedAt: c.updatedAt,
        })),
        pagination: { total, limit: parsedLimit, page: parsedPage, totalPages: Math.ceil(total / parsedLimit) || 1 },
    };
};

export const listMessages = async (conversationId, { role, userId }, { limit = 50, before } = {}) => {
    const conversation = await ChatConversation.findById(conversationId).lean();
    if (!conversation) throw new NotFoundError('Conversation not found');
    if (!isParticipant(conversation, role, userId)) throw new ForbiddenError('Not your conversation');

    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const query = { conversationId };
    if (before) query.createdAt = { $lt: new Date(before) };

    const messages = await ChatMessage.find(query).sort({ createdAt: -1 }).limit(parsedLimit).lean();
    return { messages: messages.reverse(), conversation };
};

const resolveSenderName = async (role, userId) => {
    if (role === 'USER') {
        const doc = await FoodUser.findById(userId).select('name').lean();
        return doc?.name || 'Customer';
    }
    const doc = await FoodDeliveryPartner.findById(userId).select('name').lean();
    return doc?.name || 'Delivery Partner';
};

export const sendMessage = async (conversationId, { role, userId }, text) => {
    const trimmed = String(text || '').trim();
    if (!trimmed) throw new ValidationError('Message text is required');
    if (trimmed.length > 1000) throw new ValidationError('Message is too long');

    const conversation = await ChatConversation.findById(conversationId);
    if (!conversation) throw new NotFoundError('Conversation not found');
    if (!isParticipant(conversation, role, userId)) throw new ForbiddenError('Not your conversation');
    if (conversation.closedAt) throw new ValidationError('This conversation is closed');

    const senderName = await resolveSenderName(role, userId);

    const message = await ChatMessage.create({
        conversationId: conversation._id,
        senderRole: role,
        senderId: userId,
        senderName,
        text: trimmed,
    });

    const recipientRole = OTHER_ROLE[role];
    conversation.lastMessage = { text: trimmed, senderRole: role, at: message.createdAt };
    conversation.unreadCount = conversation.unreadCount || {};
    conversation.unreadCount[recipientRole] = (conversation.unreadCount[recipientRole] || 0) + 1;
    await conversation.save();

    const recipientId = recipientRole === 'USER' ? conversation.userId : conversation.deliveryPartnerId;
    const payload = {
        id: String(message._id),
        conversationId: String(conversation._id),
        orderMongoId: String(conversation.orderId),
        orderId: conversation.orderNumber,
        senderRole: role,
        senderId: String(userId),
        senderName,
        text: trimmed,
        createdAt: message.createdAt,
    };

    try {
        const io = getIO();
        const room = recipientRole === 'USER' ? rooms.user(recipientId) : rooms.delivery(recipientId);
        io?.to(room).emit('chat:message', payload);
    } catch (err) {
        logger.warn(`chat:message socket emit failed: ${err.message}`);
    }

    // Push, in case the recipient's app is backgrounded/killed — needs a real
    // notification block (not data-only) so it shows while the app is closed.
    try {
        await sendNotificationToOwner({
            ownerType: recipientRole,
            ownerId: String(recipientId),
            payload: {
                title: senderName,
                body: trimmed,
                data: {
                    type: 'chat_message',
                    audience: recipientRole === 'USER' ? 'user' : 'delivery',
                    conversationId: String(conversation._id),
                    orderMongoId: String(conversation.orderId),
                    orderId: conversation.orderNumber || '',
                    senderRole: role,
                    senderId: String(userId),
                    senderName,
                },
            },
        });
    } catch (err) {
        logger.warn(`chat_message push failed: ${err.message}`);
    }

    return payload;
};

export const markConversationRead = async (conversationId, { role, userId }) => {
    const conversation = await ChatConversation.findById(conversationId);
    if (!conversation) throw new NotFoundError('Conversation not found');
    if (!isParticipant(conversation, role, userId)) throw new ForbiddenError('Not your conversation');

    conversation.unreadCount = conversation.unreadCount || {};
    conversation.unreadCount[role] = 0;
    await conversation.save();

    await ChatMessage.updateMany(
        { conversationId: conversation._id, senderRole: OTHER_ROLE[role], readAt: null },
        { $set: { readAt: new Date() } }
    );

    return { success: true };
};
