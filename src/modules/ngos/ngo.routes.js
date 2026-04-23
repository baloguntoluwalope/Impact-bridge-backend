'use strict';

const router = require('express').Router();
const ctrl   = require('./ngo.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const auditLog = require('../../middleware/auditLog');

/**
 * @swagger
 * tags:
 *   - name: NGOs
 *     description: NGO profiles, verification, and case management
 */

/**
 * @swagger
 * /ngos:
 *   get:
 *     summary: Get all verified NGOs (public)
 *     tags: [NGOs]
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - in: query
 *         name: state
 *         schema: { type: string }
 *       - in: query
 *         name: sdg
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Verified NGO list
 */
router.get('/', ctrl.getAll);

/**
 * @swagger
 * /ngos/{slug}:
 *   get:
 *     summary: Get NGO profile by URL slug (public)
 *     tags: [NGOs]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *         example: save-the-children-nigeria
 *     responses:
 *       200:
 *         description: NGO profile
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:slug', ctrl.getBySlug);

/**
 * @swagger
 * /ngos/{id}/cases:
 *   get:
 *     summary: Get all cases assigned to an NGO
 *     tags: [NGOs]
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: NGO assigned cases
 */
router.get('/:id/cases', ctrl.getCases);

/**
 * @swagger
 * /ngos/{id}/stats:
 *   get:
 *     summary: Get NGO impact statistics
 *     tags: [NGOs]
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: NGO stats
 */
router.get('/:id/stats', ctrl.getStats);

router.use(authenticate, authorize('super_admin'));

/**
 * @swagger
 * /ngos:
 *   post:
 *     summary: Create a new NGO profile (admin only)
 *     tags: [NGOs]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateNGOBody'
 *     responses:
 *       201:
 *         description: NGO created
 *       409:
 *         $ref: '#/components/responses/Conflict'
 */
router.post('/', auditLog('CREATE', 'NGO'), ctrl.create);

/**
 * @swagger
 * /ngos/{id}/verify:
 *   patch:
 *     summary: Verify an NGO (admin only)
 *     description: Once verified, the NGO appears in public listings and can be assigned to cases.
 *     tags: [NGOs]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: NGO verified
 */
router.patch('/:id/verify', auditLog('VERIFY', 'NGO'), ctrl.verify);

/**
 * @swagger
 * /ngos/{id}:
 *   patch:
 *     summary: Update an NGO profile (admin only)
 *     tags: [NGOs]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateNGOBody'
 *     responses:
 *       200:
 *         description: NGO updated
 */
router.patch('/:id', ctrl.update);

module.exports = router;