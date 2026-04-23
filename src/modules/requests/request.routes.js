'use strict';

const router = require('express').Router();
const ctrl   = require('./request.controller');
const { authenticate, authorize, optionalAuth } = require('../../middleware/auth');
const { validate }      = require('../../utils/validators');
const { mediaUpload }   = require('../../middleware/upload');
const { uploadLimiter, apiLimiter } = require('../../middleware/rateLimiter');
const auditLog          = require('../../middleware/auditLog');

/**
 * @swagger
 * tags:
 *   - name: Requests
 *     description: Social impact cases — submit, browse, track progress
 */

/**
 * @swagger
 * /requests:
 *   get:
 *     summary: Get all verified public requests (cases)
 *     description: Returns paginated, publicly visible and verified requests. Cached for 5 minutes.
 *     tags: [Requests]
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *         description: SDG category slug (e.g. quality_education)
 *       - in: query
 *         name: state
 *         schema: { type: string }
 *         description: Nigerian state name (e.g. Lagos)
 *       - in: query
 *         name: lga
 *         schema: { type: string }
 *       - in: query
 *         name: urgency
 *         schema: { type: string, enum: [low, medium, high, critical] }
 *       - in: query
 *         name: fund_type
 *         schema: { type: string, enum: [case_funding, student_sponsorship, school_funding, community_project, sdg_club, general_impact] }
 *       - in: query
 *         name: min_amount
 *         schema: { type: number }
 *         description: Minimum amount needed (NGN)
 *       - in: query
 *         name: max_amount
 *         schema: { type: number }
 *         description: Maximum amount needed (NGN)
 *       - in: query
 *         name: is_featured
 *         schema: { type: boolean }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Full-text search across title and description
 *       - in: query
 *         name: sort
 *         schema: { type: string, default: '-created_at' }
 *         description: "Sort field. Examples: -created_at, -amount_raised, -donor_count, urgency"
 *     responses:
 *       200:
 *         description: Paginated verified requests
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 */
router.get('/', apiLimiter, optionalAuth, ctrl.getVerified);

/**
 * @swagger
 * /requests/featured:
 *   get:
 *     summary: Get featured requests
 *     tags: [Requests]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 6 }
 *     responses:
 *       200:
 *         description: Featured requests
 */
router.get('/featured', ctrl.getFeatured);

/**
 * @swagger
 * /requests/search:
 *   get:
 *     summary: Full-text search on verified requests
 *     tags: [Requests]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *         description: Search query
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200:
 *         description: Search results ranked by relevance
 */
router.get('/search', ctrl.search);

/**
 * @swagger
 * /requests/me:
 *   get:
 *     summary: Get current user's own submitted requests
 *     tags: [Requests]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, submitted, under_review, verified, rejected, funded, in_progress, completed] }
 *     responses:
 *       200:
 *         description: User's requests
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/me', authenticate, ctrl.getMyRequests);

/**
 * @swagger
 * /requests/{id}:
 *   get:
 *     summary: Get a single request by ID
 *     tags: [Requests]
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Request detail with progress updates and media
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Request'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', optionalAuth, ctrl.getById);

/**
 * @swagger
 * /requests:
 *   post:
 *     summary: Submit a new social impact request
 *     description: |
 *       Submit a need for funding. The request starts in 'submitted' status and goes through verification
 *       before becoming visible to donors.
 *
 *       **State flow:** draft → submitted → under_review → verified → funded → in_progress → completed
 *
 *       Upload evidence files as multipart/form-data (images, videos, documents — max 50MB per file, up to 10 files).
 *     tags: [Requests]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/CreateRequestBody'
 *               - type: object
 *                 properties:
 *                   media:
 *                     type: array
 *                     items: { type: string, format: binary }
 *                     description: Evidence files — images, videos, documents (max 10 files, 50MB each)
 *     responses:
 *       201:
 *         description: Request submitted successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.post(
  '/',
  authenticate,
  authorize('individual', 'student', 'school_admin', 'community_leader', 'ngo_partner'),
  uploadLimiter,
  mediaUpload.array('media', 10),
  validate('createRequest'),
  auditLog('CREATE', 'Request'),
  ctrl.create
);

/**
 * @swagger
 * /requests/{id}:
 *   patch:
 *     summary: Update a request (owner only, draft or submitted status only)
 *     tags: [Requests]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/CreateRequestBody'
 *               - type: object
 *                 properties:
 *                   media:
 *                     type: array
 *                     items: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Request updated
 *       400:
 *         description: Cannot update — request is beyond submitted status
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.patch(
  '/:id',
  authenticate,
  mediaUpload.array('media', 5),
  auditLog('UPDATE', 'Request'),
  ctrl.update
);

/**
 * @swagger
 * /requests/{id}/progress:
 *   post:
 *     summary: Add a progress update to a request (NGO or admin)
 *     description: Upload before/after photos, videos, and descriptions of execution progress.
 *     tags: [Requests]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [title, description]
 *             properties:
 *               title:       { type: string, example: Week 2 Update }
 *               description: { type: string, example: Roof materials delivered to site... }
 *               media:
 *                 type: array
 *                 items: { type: string, format: binary }
 *                 description: Progress photos/videos (max 5 files)
 *     responses:
 *       200:
 *         description: Progress update added
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post(
  '/:id/progress',
  authenticate,
  authorize('ngo_partner', 'super_admin'),
  mediaUpload.array('media', 5),
  ctrl.addProgress
);

/**
 * @swagger
 * /requests/{id}:
 *   delete:
 *     summary: Delete a request (owner or admin, only draft/submitted/rejected)
 *     tags: [Requests]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Request deleted
 *       400:
 *         description: Cannot delete — request is in active or funded state
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.delete('/:id', authenticate, auditLog('DELETE', 'Request'), ctrl.deleteRequest);

module.exports = router;