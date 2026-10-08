import { sendResponse } from '../../../../utils/response.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import * as chatService from '../services/chat.service.js';

const requesterFrom = (req) => ({ role: req.user?.role, userId: req.user?.userId });

export const listConversationsController = async (req, res, next) => {
    try {
        const data = await chatService.listConversationsForUser(requesterFrom(req), req.query || {});
        return sendResponse(res, 200, 'Conversations fetched', data);
    } catch (error) {
        next(error);
    }
};

/** Opens (or creates) the conversation for an order — used by the chat entry point on either app. */
export const openConversationForOrderController = async (req, res, next) => {
    try {
        const { orderId } = req.query || {};
        if (!orderId) return next(new ValidationError('orderId is required'));
        const conversation = await chatService.getOrCreateConversationForOrder(orderId, requesterFrom(req));
        return sendResponse(res, 200, 'Conversation ready', { conversationId: String(conversation._id) });
    } catch (error) {
        next(error);
    }
};

export const listMessagesController = async (req, res, next) => {
    try {
        const { conversationId, limit, before } = req.query || {};
        if (!conversationId) return next(new ValidationError('conversationId is required'));
        const data = await chatService.listMessages(conversationId, requesterFrom(req), { limit, before });
        return sendResponse(res, 200, 'Messages fetched', data);
    } catch (error) {
        next(error);
    }
};

export const sendMessageController = async (req, res, next) => {
    try {
        const { conversationId, text } = req.body || {};
        if (!conversationId) return next(new ValidationError('conversationId is required'));
        const message = await chatService.sendMessage(conversationId, requesterFrom(req), text);
        return sendResponse(res, 200, 'Message sent', message);
    } catch (error) {
        next(error);
    }
};

export const markConversationReadController = async (req, res, next) => {
    try {
        const result = await chatService.markConversationRead(req.params.id, requesterFrom(req));
        return sendResponse(res, 200, 'Conversation marked read', result);
    } catch (error) {
        next(error);
    }
};
