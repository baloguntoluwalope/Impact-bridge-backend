'use strict';

const router = require('express').Router();
const ctrl   = require('./reports.controller');
const { authenticate, authorize } = require('../../middleware/auth');

/**
 * @swagger
 * tags:
 *   - name: Reports
 *     description: Generate reports in JSON or CSV format
 */

router.use(authenticate, authorize('super_admin', 'government_official', 'ngo_partner'));

/**
 * @swagger
 * /reports/donations:
 *   get:
 *     summary: Donation report with filters
 *     tags: [Reports]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: gateway
 *         schema: { type: string, enum: [korapay, paystack, flutterwave] }
 *       - in: query
 *         name: fund_type
 *         schema: { type: string }
 *       - in: query
 *         name: format
 *         schema: { type: string, enum: [json, csv], default: json }
 *         description: Response format — json returns data, csv triggers file download
 *     responses:
 *       200:
 *         description: Donation report (JSON or CSV download)
 */
router.get('/donations', ctrl.getDonations);

/**
 * @swagger
 * /reports/impact:
 *   get:
 *     summary: Impact report — completed cases with beneficiary data
 *     tags: [Reports]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: state
 *         schema: { type: string }
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: format
 *         schema: { type: string, enum: [json, csv], default: json }
 *     responses:
 *       200:
 *         description: Impact report
 */
router.get('/impact', ctrl.getImpact);

/**
 * @swagger
 * /reports/sdg:
 *   get:
 *     summary: SDG-level funding and impact report
 *     description: Groups data by SDG number, category, and state.
 *     tags: [Reports]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: SDG report
 */
router.get('/sdg', ctrl.getSDG);

module.exports = router;