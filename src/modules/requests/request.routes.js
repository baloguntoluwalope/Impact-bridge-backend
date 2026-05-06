'use strict';

const router = require('express').Router();
const ctrl   = require('./request.controller');
const { authenticate, authorize, optionalAuth } = require('../../middleware/auth');
const { validate }       = require('../../utils/validators');
const { mediaUpload }    = require('../../middleware/upload');
const { uploadLimiter, apiLimiter } = require('../../middleware/rateLimiter');
const auditLog           = require('../../middleware/auditLog');



/**
 * @swagger
 * tags:
 *   - name: Requests
 *     description: Social impact cases — submit, browse, verify, assign to NGO
 */

// ── Public ──────────────────────────────────────────────────────

/**
 * @swagger
 * /requests:
 *   get:
 *     summary: Get all verified public requests
 *     description: Returns paginated publicly visible verified requests. Cached 5 minutes.
 *     tags: [Requests]
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
 *       - in: query
 *         name: max_amount
 *         schema: { type: number }
 *       - in: query
 *         name: is_featured
 *         schema: { type: boolean }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: sort
 *         schema: { type: string, default: '-created_at' }
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
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200:
 *         description: Ranked search results
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.get('/search', ctrl.search);

// ── Named paths MUST come before /:id ───────────────────────────

/**
 * @swagger
 * /requests/me:
 *   get:
 *     summary: Get current user's own requests
 *     tags: [Requests]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, submitted, under_review, verified, rejected, funded, in_progress, completed]
 *     responses:
 *       200:
 *         description: User's requests
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/me', authenticate, ctrl.getMyRequests);

/**
 * @swagger
 * /requests/admin/queue:
 *   get:
 *     summary: Admin — get requests pending verification
 *     description: |
 *       Returns requests filtered by status for the admin verification queue.
 *       Comma-separate multiple statuses. Defaults to all pending statuses.
 *     tags: [Requests]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *         example: submitted,under_review,field_verification,more_info_requested
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: urgency
 *         schema: { type: string, enum: [low, medium, high, critical] }
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200:
 *         description: Pending requests
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/admin/queue',
  authenticate,
  authorize('super_admin', 'admin'),
  ctrl.getAdminQueue
);

/**
 * @swagger
 * /requests/assignment/{assignmentId}:
 *   get:
 *     summary: NGO — get my assignment with full request details
 *     description: |
 *       Returns the full assignment including ALL request data:
 *       - Full description, impact statement
 *       - All media (images, videos, documents) uploaded by the requester
 *       - Beneficiary count, location, urgency, amount needed
 *       - Requester's name and avatar
 *       - Verification notes and status
 *       - Deadline set by admin
 *
 *       Only accessible by the NGO the assignment was assigned to.
 *     tags: [Requests]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema: { type: string }
 *         description: MongoDB ID of the NgoAssignment
 *     responses:
 *       200:
 *         description: Full assignment with complete request data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:          { type: string }
 *                 type:         { type: string, enum: [field_verification, execution] }
 *                 status:       { type: string }
 *                 deadline:     { type: string, format: date-time }
 *                 instructions: { type: string }
 *                 assigned_by:  { type: object }
 *                 request:
 *                   type: object
 *                   description: Full request with all media
 *                   properties:
 *                     title:             { type: string }
 *                     description:       { type: string }
 *                     impact_statement:  { type: string }
 *                     state:             { type: string }
 *                     lga:               { type: string }
 *                     amount_needed:     { type: number }
 *                     beneficiaries_count:{ type: integer }
 *                     urgency:           { type: string }
 *                     media:
 *                       type: array
 *                       description: All images, videos, documents from the requester
 *                       items:
 *                         type: object
 *                         properties:
 *                           url:         { type: string }
 *                           public_id:   { type: string }
 *                           type:        { type: string, enum: [image, video, document] }
 *                           uploaded_at: { type: string, format: date-time }
 *                     requester: { type: object }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  '/assignment/:assignmentId',
  authenticate,
  authorize('ngo_partner'),
  ctrl.getMyAssignment
);

// ── Dynamic :id routes ───────────────────────────────────────────

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
 *         description: Request detail with media and progress
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', optionalAuth, ctrl.getById);

/**
 * @swagger
 * /requests:
 *   post:
 *     summary: Submit a new funding request
 *     description: |
 *       State flow: draft → submitted → under_review → verified → funded → in_progress → completed
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
 *                     description: Evidence files (max 10, 50MB each)
 *     responses:
 *       201:
 *         description: Request submitted
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
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
 * /requests/{id}/assign:
 *   post:
 *     summary: Admin — assign request to a verified NGO for field verification or execution
 *     description: |
 *       Manually assigns a verified NGO to a request with a set deadline.
 *
 *       **What happens:**
 *       - Validates NGO is verified and has the required permission
 *       - Checks NGO is not over their concurrent case limit
 *       - Prevents duplicate active assignment of same type
 *       - Sets request status to `under_review`
 *       - Busts NGO dashboard cache — they see it **immediately**
 *       - Sends NGO a push notification with deadline
 *
 *       **What the NGO gets access to** (via `GET /requests/assignment/:id`):
 *       - Full request title, description, impact statement
 *       - All uploaded media: images, videos, documents from the requester
 *       - Beneficiary count, location (state + LGA), urgency
 *       - Amount needed
 *       - Admin instructions and deadline
 *     tags: [Requests]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ngo_user_id]
 *             properties:
 *               ngo_user_id:
 *                 type: string
 *                 description: User._id of the verified NGO to assign
 *               assignment_type:
 *                 type: string
 *                 enum: [field_verification, execution]
 *                 default: field_verification
 *                 description: What the NGO should do — verify the claim or execute the project
 *               instructions:
 *                 type: string
 *                 maxLength: 2000
 *                 description: Specific instructions for the NGO (what to check, what evidence to collect)
 *               deadline_days:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 30
 *                 default: 7
 *                 description: Number of days from today for the NGO's report deadline
 *     responses:
 *       201:
 *         description: Assignment created. NGO notified and can access full request immediately.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:          { type: string }
 *                 type:         { type: string }
 *                 status:       { type: string, example: assigned }
 *                 deadline:     { type: string, format: date-time }
 *                 instructions: { type: string }
 *                 ngo:          { type: object }
 *                 assigned_by:  { type: object }
 *                 request:      { type: object, description: Full request with media }
 *       400:
 *         description: NGO not verified, at capacity, duplicate assignment, or invalid status
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: Active assignment of this type already exists for this request
 */
router.post(
  '/:id/assign',
  authenticate,
  authorize('super_admin', 'admin'),
  auditLog('ASSIGN_NGO', 'Request'),
  ctrl.assignToNgo
);

/**
 * @swagger
 * /requests/{id}/assignments:
 *   get:
 *     summary: Admin — list all NGO assignments for a request
 *     tags: [Requests]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: All assignments (past and current) for this request
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/:id/assignments',
  authenticate,
  authorize('super_admin', 'admin'),
  ctrl.getAssignments
);

/**
 * @swagger
 * /requests/{id}:
 *   patch:
 *     summary: Update a request (owner only, draft or submitted status)
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
 *         description: Cannot update — already under review or verified
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
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
 *     summary: Add a progress update (NGO or admin)
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
 *               title:       { type: string }
 *               description: { type: string }
 *               media:
 *                 type: array
 *                 items: { type: string, format: binary }
 *                 description: Progress photos/videos (max 5)
 *     responses:
 *       200:
 *         description: Progress update added
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
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
 *         description: Deleted successfully
 *       400:
 *         description: Cannot delete — active or funded state
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete('/:id', authenticate, auditLog('DELETE', 'Request'), ctrl.deleteRequest);

module.exports = router;