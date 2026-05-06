'use strict';

const feeSvc = require('./fee.service');
const R      = require('../../utils/apiResponse');
const router = require('express').Router();
const { authenticate, authorize } = require('../../middleware/auth');
const auditLog = require('../../middleware/auditLog');

/**
 * @swagger
 * tags:
 *   - name: Fees
 *     description: Fee calculation and breakdown for funding requests
 */

/**
 * @swagger
 * /fees/{requestId}/breakdown:
 *   get:
 *     summary: Get fee breakdown for a request (public)
 *     description: |
 *       Returns where every naira of a donor's contribution goes.
 *       - **preview** — before approval, shows what fees would be
 *       - **locked**  — after approval, shows exact locked amounts
 *     tags: [Fees]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Fee breakdown with totals and labels
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [preview, locked] }
 *                 note:   { type: string }
 *                 total:  { type: number }
 *                 labels:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       key:    { type: string }
 *                       label:  { type: string }
 *                       amount: { type: number }
 *                       pct:    { type: number }
 *                       color:  { type: string }
 *                       note:   { type: string }
 */
router.get('/:requestId/breakdown', async (req, res) => {
  const data = await feeSvc.getFeeBreakdown(req.params.requestId);
  R.success(res, data, 'Fee breakdown');
});

/**
 * @swagger
 * /fees/{requestId}/recalculate:
 *   post:
 *     summary: Admin — recalculate fees with optional custom percentages
 *     tags: [Fees]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ngo_fee_pct:      { type: number, example: 10 }
 *               platform_fee_pct: { type: number, example: 5 }
 *     responses:
 *       200:
 *         description: Fees recalculated and locked
 *       400:
 *         description: Request not in a verifiable status
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post(
  '/:requestId/recalculate',
  authenticate,
  authorize('super_admin', 'admin'),
  auditLog('RECALCULATE_FEES', 'Request'),
  async (req, res) => {
    const data = await feeSvc.recalculateFees(req.params.requestId, req.user._id, req.body);
    R.success(res, data, 'Fees recalculated and locked');
  }
);

module.exports = router;