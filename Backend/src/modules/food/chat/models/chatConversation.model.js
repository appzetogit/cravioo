import mongoose from 'mongoose';

/** One conversation per order, between the customer and the assigned delivery partner. */
const chatConversationSchema = new mongoose.Schema(
    {
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodOrder', required: true, unique: true, index: true },
        orderNumber: { type: String, default: '' },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodUser', required: true, index: true },
        deliveryPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodDeliveryPartner', required: true, index: true },
        lastMessage: {
            text: { type: String, default: '' },
            senderRole: { type: String, enum: ['USER', 'DELIVERY_PARTNER'], default: null },
            at: { type: Date, default: null },
        },
        unreadCount: {
            USER: { type: Number, default: 0 },
            DELIVERY_PARTNER: { type: Number, default: 0 },
        },
        closedAt: { type: Date, default: null },
    },
    { timestamps: true, collection: 'food_chat_conversations' }
);

chatConversationSchema.index({ userId: 1, updatedAt: -1 });
chatConversationSchema.index({ deliveryPartnerId: 1, updatedAt: -1 });

export const ChatConversation = mongoose.model('ChatConversation', chatConversationSchema, 'food_chat_conversations');
