'use strict';

const router = require('express').Router();
const ctrl   = require('./analytics.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { apiLimiter } = require('../../middleware/rateLimiter');

/**
 * @swagger
 * tags:
 *   - name: Analytics
 *     description: Platform analytics — donations, SDG distribution, regional data, funding gaps
 */

/**
 * @swagger
 * /analytics/platform:
 *   get:
 *     summary: Platform-wide key metrics (public)
 *     tags: [Analytics]
 *     security: []
 *     responses:
 *       200:
 *         description: Users, requests, donations, projects, beneficiaries totals
 */
router.get('/platform', apiLimiter, ctrl.getPlatform);

/**
 * @swagger
 * /analytics/sdg-distribution:
 *   get:
 *     summary: Donation amounts distributed by SDG goal (public)
 *     tags: [Analytics]
 *     security: []
 *     responses:
 *       200:
 *         description: SDG distribution of donations
 */
router.get('/sdg-distribution', ctrl.getSDGDistribution);

/**
 * @swagger
 * /analytics/regional:
 *   get:
 *     summary: State-by-state case and funding analytics (public)
 *     tags: [Analytics]
 *     security: []
 *     responses:
 *       200:
 *         description: Regional breakdown
 */
router.get('/regional', ctrl.getRegional);

/**
 * @swagger
 * /analytics/category-breakdown:
 *   get:
 *     summary: Request count, funding and completion by SDG category (public)
 *     tags: [Analytics]
 *     security: []
 *     responses:
 *       200:
 *         description: Category breakdown
 */
router.get('/category-breakdown', ctrl.getCategoryBreakdown);

router.use(authenticate, authorize('super_admin', 'government_official', 'ngo_partner'));

/**
 * @swagger
 * /analytics/trends:
 *   get:
 *     summary: Monthly donation trends (authenticated)
 *     tags: [Analytics]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: months
 *         schema: { type: integer, default: 12, minimum: 1, maximum: 24 }
 *         description: Number of months to return
 *     responses:
 *       200:
 *         description: Monthly trends array
 */
router.get('/trends', ctrl.getTrends);

/**
 * @swagger
 * /analytics/funding-gaps:
 *   get:
 *     summary: Where is funding most needed? (authenticated)
 *     description: Groups verified requests by state and category, showing total funding gap.
 *     tags: [Analytics]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: state
 *         schema: { type: string }
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Funding gaps top 20
 */
router.get('/funding-gaps', ctrl.getFundingGaps);

/**
 * @swagger
 * /analytics/top-donors:
 *   get:
 *     summary: Top donors leaderboard (admin only)
 *     tags: [Analytics]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 50 }
 *     responses:
 *       200:
 *         description: Top donors ranked by total donated
 */
router.get('/top-donors', authorize('super_admin'), ctrl.getTopDonors);

/**
 * @swagger
 * /analytics/user-roles:
 *   get:
 *     summary: User role distribution (admin only)
 *     tags: [Analytics]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Count of users per role
 */
router.get('/user-roles', authorize('super_admin'), ctrl.getUserRoles);

module.exports = router;