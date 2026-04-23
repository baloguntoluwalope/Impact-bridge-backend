'use strict';

const router = require('express').Router();
const ctrl   = require('./donor.controller');
const { authenticate, optionalAuth } = require('../../middleware/auth');
const { apiLimiter } = require('../../middleware/rateLimiter');

/**
 * @swagger
 * tags:
 *   - name: Donors
 *     description: Donor browsing, impact tracking and leaderboard
 */

/**
 * @swagger
 * /donors/cases:
 *   get:
 *     summary: Browse all verified cases (donor view with rich filters)
 *     tags: [Donors]
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: state
 *         schema: { type: string }
 *       - in: query
 *         name: urgency
 *         schema: { type: string, enum: [low, medium, high, critical] }
 *       - in: query
 *         name: is_featured
 *         schema: { type: boolean }
 *       - in: query
 *         name: min_amount
 *         schema: { type: number }
 *       - in: query
 *         name: max_amount
 *         schema: { type: number }
 *       - in: query
 *         name: sort
 *         schema: { type: string, default: '-created_at' }
 *         description: "Options: -created_at, -amount_raised, -donor_count"
 *     responses:
 *       200:
 *         description: Verified cases for donation
 */
router.get('/cases', apiLimiter, optionalAuth, ctrl.browseCases);

/**
 * @swagger
 * /donors/leaderboard:
 *   get:
 *     summary: Top donors leaderboard (public)
 *     tags: [Donors]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 50 }
 *     responses:
 *       200:
 *         description: Top donors ranked by total amount donated
 */
router.get('/leaderboard', ctrl.getLeaderboard);

router.use(authenticate);

/**
 * @swagger
 * /donors/dashboard:
 *   get:
 *     summary: Get donor's personal impact dashboard
 *     description: Shows total donated, donation history, and impact broken down by SDG.
 *     tags: [Donors]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Personal impact dashboard
 */
router.get('/dashboard', ctrl.getDashboard);

/**
 * @swagger
 * /donors/bookmarks:
 *   get:
 *     summary: Get donor's bookmarked cases
 *     tags: [Donors]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Bookmarked cases
 */
router.get('/bookmarks', ctrl.getBookmarks);

/**
 * @swagger
 * /donors/proof-of-impact:
 *   get:
 *     summary: View proof of impact for all cases you've donated to
 *     description: Shows progress updates, NGO field reports, and completion media for cases you funded.
 *     tags: [Donors]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Proof of impact
 */
router.get('/proof-of-impact', ctrl.getProofOfImpact);

module.exports = router;