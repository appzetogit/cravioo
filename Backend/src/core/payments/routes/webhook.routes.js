import express from 'express';
import { handleCashfreeWebhook } from '../controllers/cashfreeWebhook.controller.js';

/** Webhook Routes Module */
const router = express.Router();

/**
 * Endpoint for Cashfree payment/refund/subscription events (Public)
 * Path: /api/v1/payments/webhook/cashfree
 */
router.post('/cashfree', handleCashfreeWebhook);

export default router;
