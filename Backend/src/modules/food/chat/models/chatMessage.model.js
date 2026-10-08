import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema(
    {
        conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatConversation', required: true, index: true },
        senderRole: { type: String, enum: ['USER', 'DELIVERY_PARTNER'], required: true },
        senderId: { type: mongoose.Schema.Types.ObjectId, required: true },
        senderName: { type: String, default: '' },
        text: { type: String, required: true, trim: true, maxlength: 1000 },
        readAt: { type: Date, default: null },
    },
    { timestamps: true, collection: 'food_chat_messages' }
);

chatMessageSchema.index({ conversationId: 1, createdAt: 1 });

export const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema, 'food_chat_messages');
