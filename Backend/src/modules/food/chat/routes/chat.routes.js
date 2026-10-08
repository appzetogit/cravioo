import express from 'express';
import {
    listConversationsController,
    openConversationForOrderController,
    listMessagesController,
    sendMessageController,
    markConversationReadController,
} from '../controllers/chat.controller.js';

const router = express.Router();

router.get('/conversations', listConversationsController);
router.get('/conversations/open', openConversationForOrderController);
router.patch('/conversations/:id/read', markConversationReadController);
router.get('/messages', listMessagesController);
router.post('/messages', sendMessageController);

export default router;
