'use strict';

const router = require('express').Router();
const ctrl   = require('./funding.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { apiLimiter } = require('../../middleware/rateLimiter');

/**
 * @swagger
 * tags:
 *   - name: Funding
 *     description: Funding overview, case donation history, wallet allocations, and reconciliation
 */

/**
 * @swagger
 * /funding/overview:
 *   get:
 *     summary: Platform funding overview — totals by type and gateway
 *     tags: [Funding]
 *     security: []
 *     responses:
 *       200:
 *         description: Funding overview with by_fund_type, by_gateway, recent_large_donations
 */
router.get('/overview', apiLimiter, ctrl.getOverview);

/**
 * @swagger
 * /funding/case/{requestId}/history:
 *   get:
 *     summary: Get donation history for a specific case
 *     description: Anonymous donors are masked. Shows amount and message per donation.
 *     tags: [Funding]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema: { type: string }
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200:
 *         description: Donation history for the case
 */
router.get('/case/:requestId/history', ctrl.getCaseHistory);

router.use(authenticate, authorize('super_admin', 'ngo_partner'));

/**
 * @swagger
 * /funding/allocations:
 *   get:
 *     summary: Get all wallet allocations (admin/NGO)
 *     tags: [Funding]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - in: query
 *         name: wallet_type
 *         schema: { type: string, enum: [case_wallet, project_wallet, general_fund] }
 *     responses:
 *       200:
 *         description: Wallet allocations
 */
router.get('/allocations', ctrl.getAllocations);

/**
 * @swagger
 * /funding/reconcile/{reference}:
 *   post:
 *     summary: Manually reconcile a payment by reference (admin only)
 *     description: Verifies with payment gateway and updates wallet/stats if confirmed.
 *     tags: [Funding]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reference
 *         required: true
 *         schema: { type: string }
 *         example: PAY-LK4F2A-8B9C0D1E
 *     responses:
 *       200:
 *         description: Reconciliation result
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post('/reconcile/:reference', authorize('super_admin'), ctrl.reconcile);

module.exports = router;