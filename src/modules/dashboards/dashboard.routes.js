'use strict';

const router = require('express').Router();
const ctrl   = require('./dashboard.controller');
const { authenticate, authorize } = require('../../middleware/auth');

/**
 * @swagger
 * tags:
 *   - name: Dashboards
 *     description: Role-specific dashboards — all data is aggregated and cached
 */

router.use(authenticate);

/**
 * @swagger
 * /dashboards/admin:
 *   get:
 *     summary: Admin system-wide overview dashboard (super_admin only)
 *     description: Returns total users, requests, payments, recent activity, and SDG breakdown. Cached 2 minutes.
 *     tags: [Dashboards]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Admin dashboard data
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/admin', authorize('super_admin'), ctrl.admin);

/**
 * @swagger
 * /dashboards/donor:
 *   get:
 *     summary: Donor personal impact dashboard
 *     description: Total donated, recent donations, and impact broken down by SDG. Cached 1 minute.
 *     tags: [Dashboards]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Donor dashboard
 */
router.get('/donor', ctrl.donor);

/**
 * @swagger
 * /dashboards/ngo:
 *   get:
 *     summary: NGO operations dashboard (ngo_partner only)
 *     description: Assigned cases, stats, and reports pending. Cached 1 minute.
 *     tags: [Dashboards]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: NGO dashboard
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/ngo', authorize('ngo_partner'), ctrl.ngo);

/**
 * @swagger
 * /dashboards/government:
 *   get:
 *     summary: Government national SDG dashboard
 *     description: SDG progress, state distribution, funding gaps, monthly trends. Cached 2 minutes.
 *     tags: [Dashboards]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: state
 *         schema: { type: string }
 *         description: Filter to specific state (omit for national view)
 *     responses:
 *       200:
 *         description: Government dashboard
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/government', authorize('government_official', 'super_admin'), ctrl.government);

module.exports = router;