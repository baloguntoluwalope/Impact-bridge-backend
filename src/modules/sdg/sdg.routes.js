'use strict';

const router = require('express').Router();
const ctrl   = require('./sdg.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate }   = require('../../utils/validators');
const { apiLimiter } = require('../../middleware/rateLimiter');

/**
 * @swagger
 * tags:
 *   - name: SDG
 *     description: Dynamic SDG content CMS — 17 goals, admin adds educational content continuously
 */

/**
 * @swagger
 * /sdg:
 *   get:
 *     summary: Get all 17 SDG goals
 *     tags: [SDG]
 *     security: []
 *     responses:
 *       200:
 *         description: All 17 SDG goals with colors and icons
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SDG'
 */
router.get('/', apiLimiter, ctrl.getAll);

/**
 * @swagger
 * /sdg/analytics/national:
 *   get:
 *     summary: National SDG analytics — funding and impact per goal
 *     tags: [SDG]
 *     security: []
 *     responses:
 *       200:
 *         description: Aggregated national SDG data
 */
router.get('/analytics/national', ctrl.getNationalAnalytics);

/**
 * @swagger
 * /sdg/{number}:
 *   get:
 *     summary: Get a single SDG with live statistics
 *     tags: [SDG]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: number
 *         required: true
 *         schema: { type: integer, minimum: 1, maximum: 17 }
 *         example: 4
 *     responses:
 *       200:
 *         description: SDG detail with content count, active cases, and funding stats
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:number', ctrl.getByNumber);

/**
 * @swagger
 * /sdg/{number}/content:
 *   get:
 *     summary: Get published educational content for a specific SDG
 *     tags: [SDG]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: number
 *         required: true
 *         schema: { type: integer, minimum: 1, maximum: 17 }
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - in: query
 *         name: content_type
 *         schema: { type: string, enum: [text, video, audio, pdf, infographic, quiz] }
 *       - in: query
 *         name: target_audience
 *         schema: { type: string, enum: [all, students, teachers, community, ngo, government, donor] }
 *       - in: query
 *         name: language
 *         schema: { type: string, enum: [en, ha, yo, ig], default: en }
 *     responses:
 *       200:
 *         description: SDG educational content (paginated)
 */
router.get('/:number/content', ctrl.getContent);

/**
 * @swagger
 * /sdg/content/{contentId}/view:
 *   post:
 *     summary: Track a content view (for analytics)
 *     tags: [SDG]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: contentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: View tracked
 */
router.post('/content/:contentId/view', ctrl.trackView);

// ── Admin CMS routes ──────────────────────────────────────────────
router.use(authenticate, authorize('super_admin'));

/**
 * @swagger
 * /sdg/seed:
 *   post:
 *     summary: Seed all 17 SDGs (admin — run once on first deployment)
 *     tags: [SDG]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: 17 SDGs seeded
 */
router.post('/seed', ctrl.seed);

/**
 * @swagger
 * /sdg/content:
 *   post:
 *     summary: Create new SDG educational content (admin CMS)
 *     description: Admins can continuously add text, video, audio, PDF, infographics, or quizzes per SDG.
 *     tags: [SDG]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SDGContentBody'
 *     responses:
 *       201:
 *         description: Content created
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/content', validate('sdgContent'), ctrl.createContent);

/**
 * @swagger
 * /sdg/content/{id}:
 *   patch:
 *     summary: Update SDG content (admin)
 *     tags: [SDG]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SDGContentBody'
 *     responses:
 *       200:
 *         description: Content updated
 *
 *   delete:
 *     summary: Delete SDG content (admin)
 *     tags: [SDG]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Content deleted
 */
router.patch('/content/:id', ctrl.updateContent);
router.delete('/content/:id', ctrl.deleteContent);

module.exports = router;