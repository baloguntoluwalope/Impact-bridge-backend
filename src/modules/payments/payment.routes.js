'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('./payment.controller');
const { authenticate }   = require('../../middleware/auth');
const { validate }       = require('../../utils/validators');
const { paymentLimiter } = require('../../middleware/rateLimiter');
const idempotency        = require('../../middleware/idempotency');
const auditLog           = require('../../middleware/auditLog');

/**
 * @swagger
 * tags:
 *   - name: Payments
 *     description: Korapay payment processing with Paystack/Flutterwave fallback
 */

// ── Webhook routes (raw body — MUST be before JSON middleware) ─────
/**
 * @swagger
 * /payments/webhook/korapay:
 *   post:
 *     summary: Korapay webhook receiver (called by Korapay servers — do not call manually)
 *     description: |
 *       Receives payment confirmation events from Korapay.
 *       Verifies HMAC-SHA256 signature before processing.
 *       Always returns 200 to prevent Korapay from retrying.
 *       Implements idempotency — duplicate webhooks are safely ignored.
 *     tags: [Payments]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Korapay event payload
 *     responses:
 *       200:
 *         description: Webhook acknowledged
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 */
router.post('/webhook/korapay',  express.raw({ type: 'application/json' }), ctrl.webhookKorapay);

/**
 * @swagger
 * /payments/webhook/paystack:
 *   post:
 *     summary: Paystack webhook receiver (fallback gateway)
 *     description: Receives payment events from Paystack when used as fallback.
 *     tags: [Payments]
 *     security: []
 *     responses:
 *       200:
 *         description: Webhook acknowledged
 */
router.post('/webhook/paystack', express.raw({ type: 'application/json' }), ctrl.webhookPaystack);

// ── Authenticated payment routes ──────────────────────────────────
router.use(authenticate);

/**
 * @swagger
 * /payments/initiate:
 *   post:
 *     summary: Initiate a donation payment
 *     description: |
 *       Creates a payment record and returns a Korapay checkout URL.
 *       Redirect the user to `checkout_url` to complete payment.
 *
 *       **Korapay is the primary gateway.** If Korapay is unavailable,
 *       the system automatically falls back to Paystack.
 *
 *       **Include `X-Idempotency-Key` header** (UUID) to prevent duplicate payments
 *       if the user submits the form twice.
 *
 *       Payment is confirmed via webhook — not frontend callback.
 *     tags: [Payments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Idempotency-Key
 *         schema: { type: string, format: uuid }
 *         description: Unique key per payment attempt (UUID v4 recommended)
 *         required: false
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/InitiatePaymentBody'
 *           examples:
 *             case_donation:
 *               summary: Donate to a verified case
 *               value:
 *                 request_id: "64f1a2b3c4d5e6f7a8b9c0d1"
 *                 fund_type: case_funding
 *                 amount: 10000
 *                 currency: NGN
 *                 is_anonymous: false
 *                 message: "Keep up the good work!"
 *                 payment_gateway: korapay
 *             general_impact:
 *               summary: General impact fund donation
 *               value:
 *                 fund_type: general_impact
 *                 amount: 5000
 *                 is_anonymous: true
 *     responses:
 *       200:
 *         description: Payment initialized — redirect user to checkout_url
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaymentInitResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.post(
  '/initiate',
  paymentLimiter,
  idempotency(86400),
  validate('initiatePayment'),
  auditLog('INITIATE', 'Payment'),
  ctrl.initiate
);

/**
 * @swagger
 * /payments/verify/{reference}:
 *   get:
 *     summary: Manually verify a payment by reference
 *     description: |
 *       Use this to check payment status if webhook was missed.
 *       Also triggers post-payment processing (wallet update, notifications) if payment is confirmed.
 *     tags: [Payments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reference
 *         required: true
 *         schema: { type: string }
 *         description: Payment reference (e.g. PAY-LK4F2A-8B9C0D1E)
 *     responses:
 *       200:
 *         description: Verification result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     payment:      { $ref: '#/components/schemas/Payment' }
 *                     verification: { type: object }
 *                     already_processed: { type: boolean }
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/verify/:reference', ctrl.verify);

/**
 * @swagger
 * /payments/history:
 *   get:
 *     summary: Get authenticated user's payment history
 *     tags: [Payments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, success, failed, refunded] }
 *         description: Filter by payment status
 *     responses:
 *       200:
 *         description: Payment history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     payments:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Payment'
 *                     total: { type: integer }
 *                     page:  { type: integer }
 *                     limit: { type: integer }
 */
router.get('/history', ctrl.history);

module.exports = router;