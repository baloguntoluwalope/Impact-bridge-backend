'use strict';

const router = require('express').Router();
const ctrl   = require('./government.controller');
const { authenticate, authorize } = require('../../middleware/auth');

/**
 * @swagger
 * tags:
 *   - name: Government
 *     description: National SDG oversight dashboard and data exports for government officials
 */

router.use(authenticate, authorize('government_official', 'super_admin'));

/**
 * @swagger
 * /government/dashboard:
 *   get:
 *     summary: National SDG overview dashboard
 *     description: Returns SDG distribution, state heatmap, urgent cases, and monthly trends.
 *     tags: [Government]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: state
 *         schema: { type: string }
 *         description: Filter to a specific state (omit for national view)
 *     responses:
 *       200:
 *         description: National SDG dashboard data
 */
router.get('/dashboard', ctrl.getDashboard);

/**
 * @swagger
 * /government/state/{state}:
 *   get:
 *     summary: State-level deep-dive analytics
 *     tags: [Government]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: state
 *         required: true
 *         schema: { type: string }
 *         example: Lagos
 *     responses:
 *       200:
 *         description: State analytics — cases, funding, LGA breakdown, SDG distribution
 */
router.get('/state/:state', ctrl.getStateDive);

/**
 * @swagger
 * /government/state/{state}/lga/{lga}:
 *   get:
 *     summary: LGA-level analytics
 *     tags: [Government]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: state
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: lga
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: LGA analytics
 */
router.get('/state/:state/lga/:lga', ctrl.getLGA);

/**
 * @swagger
 * /government/export/cases:
 *   get:
 *     summary: Export cases as CSV file download
 *     tags: [Government]
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
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema: { type: string }
 */
router.get('/export/cases', ctrl.exportCases);

/**
 * @swagger
 * /government/export/funding:
 *   get:
 *     summary: Export funding/payment data as CSV file download
 *     tags: [Government]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema: { type: string }
 */
router.get('/export/funding', ctrl.exportFunding);

module.exports = router;