'use strict';

const router   = require('express').Router();
const ctrl     = require('./project.controller');
const { authenticate, authorize, optionalAuth } = require('../../middleware/auth');
const { mediaUpload }  = require('../../middleware/upload');
const { uploadLimiter }= require('../../middleware/rateLimiter');
const idempotency      = require('../../middleware/idempotency');
const auditLog         = require('../../middleware/auditLog');

/**
 * @swagger
 * tags:
 *   - name: Projects
 *     description: Sponsored projects submitted by NGOs, Corporates and Government
 */

/**
 * @swagger
 * /projects:
 *   get:
 *     summary: Get all public sponsored projects
 *     tags: [Projects]
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [approved, funding, funded, in_progress, completed]
 *       - in: query
 *         name: sdg
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 17
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *       - in: query
 *         name: creator_type
 *         schema:
 *           type: string
 *           enum: [ngo, corporate, government]
 *     responses:
 *       200:
 *         description: Paginated sponsored projects
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 */
router.get('/', optionalAuth, ctrl.getPublic);

/**
 * @swagger
 * /projects/admin/all:
 *   get:
 *     summary: Get all projects including pending (admin only)
 *     tags: [Projects]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: creator_type
 *         schema:
 *           type: string
 *           enum: [ngo, corporate, government, admin]
 *     responses:
 *       200:
 *         description: All projects (any status)
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/admin/all', authenticate, authorize('super_admin'), ctrl.getAll);

/**
 * @swagger
 * /projects/me/list:
 *   get:
 *     summary: Get current user's own projects
 *     tags: [Projects]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: My projects
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/me/list', authenticate, ctrl.getMyProjects);

/**
 * @swagger
 * /projects/{id}:
 *   get:
 *     summary: Get a single project by ID
 *     tags: [Projects]
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Project detail with milestones and reports
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', ctrl.getById);

/**
 * @swagger
 * /projects:
 *   post:
 *     summary: Create a sponsored project (NGO, Corporate or Government)
 *     description: |
 *       Upload budget and proposal documents as multipart/form-data.
 *       Include **X-Idempotency-Key** header to prevent duplicate submissions.
 *       Project starts in pending_approval status and requires admin approval.
 *     tags: [Projects]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Idempotency-Key
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Unique key to prevent duplicate submissions
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [title, description, sdg_goals, state, beneficiaries_target, total_budget]
 *             properties:
 *               title:
 *                 type: string
 *                 example: Clean Water for 1000 Families in Zamfara
 *               description:
 *                 type: string
 *                 example: This project will drill 5 boreholes across 3 communities in Gusau LGA.
 *               sdg_goals:
 *                 type: string
 *                 example: "[6, 3]"
 *                 description: JSON array of SDG numbers (1-17)
 *               state:
 *                 type: string
 *                 example: Zamfara
 *               lga:
 *                 type: string
 *                 example: Gusau
 *               beneficiaries_target:
 *                 type: integer
 *                 example: 1000
 *               total_budget:
 *                 type: number
 *                 example: 5000000
 *               start_date:
 *                 type: string
 *                 format: date
 *               end_date:
 *                 type: string
 *                 format: date
 *               budget_document:
 *                 type: string
 *                 format: binary
 *                 description: PDF budget document (max 10MB)
 *               proposal_document:
 *                 type: string
 *                 format: binary
 *                 description: PDF proposal document (max 10MB)
 *               media:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Supporting media files (max 5 files)
 *     responses:
 *       201:
 *         description: Project submitted for admin approval
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
  authorize('ngo_partner', 'corporate', 'government_official', 'super_admin'),
  uploadLimiter,
  mediaUpload.fields([
    { name: 'budget_document',   maxCount: 1 },
    { name: 'proposal_document', maxCount: 1 },
    { name: 'media',             maxCount: 5 },
  ]),
  idempotency(86400),
  auditLog('CREATE', 'Project'),
  ctrl.create
);

/**
 * @swagger
 * /projects/{id}/approve:
 *   post:
 *     summary: Approve a project and create its wallet (admin only)
 *     description: Once approved the project is publicly visible and a project wallet is created.
 *     tags: [Projects]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Project approved and published
 *       400:
 *         description: Project is not in pending_approval status
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/:id/approve', authenticate, authorize('super_admin'), auditLog('APPROVE', 'Project'), ctrl.approve);

/**
 * @swagger
 * /projects/{id}/reject:
 *   post:
 *     summary: Reject a project with reason (admin only)
 *     tags: [Projects]
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
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *                 example: Budget documentation is incomplete. Please resubmit with itemized costs.
 *     responses:
 *       200:
 *         description: Project rejected and creator notified
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/:id/reject', authenticate, authorize('super_admin'), auditLog('REJECT', 'Project'), ctrl.reject);

/**
 * @swagger
 * /projects/{id}/milestones:
 *   post:
 *     summary: Add a milestone to a project (NGO or admin)
 *     tags: [Projects]
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
 *             required: [title]
 *             properties:
 *               title:
 *                 type: string
 *                 example: Borehole drilling Phase 1
 *               description:
 *                 type: string
 *                 example: Drill and case 2 boreholes in Gusau community
 *               target_date:
 *                 type: string
 *                 format: date
 *                 example: '2025-03-01'
 *               amount_allocated:
 *                 type: number
 *                 example: 1500000
 *     responses:
 *       200:
 *         description: Milestone added
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/:id/milestones', authenticate, authorize('ngo_partner', 'super_admin'), ctrl.addMilestone);

/**
 * @swagger
 * /projects/{id}/milestones/{milestoneId}/complete:
 *   patch:
 *     summary: Mark a milestone as completed with proof media (NGO or admin)
 *     tags: [Projects]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *       - in: path
 *         name: milestoneId
 *         required: true
 *         schema:
 *           type: string
 *         description: Milestone ID
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               note:
 *                 type: string
 *                 example: Both boreholes drilled and tested successfully. Water quality confirmed.
 *               proof:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Proof photos or videos (max 5 files)
 *     responses:
 *       200:
 *         description: Milestone marked as completed
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.patch(
  '/:id/milestones/:milestoneId/complete',
  authenticate,
  authorize('ngo_partner', 'super_admin'),
  mediaUpload.array('proof', 5),
  ctrl.completeMilestone
);

/**
 * @swagger
 * /projects/{id}/reports:
 *   post:
 *     summary: Submit a field report for a project (NGO or admin)
 *     tags: [Projects]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [title, body]
 *             properties:
 *               title:
 *                 type: string
 *                 example: Monthly Progress Report - February 2025
 *               body:
 *                 type: string
 *                 example: This month we completed site surveys and community consultations.
 *               period_from:
 *                 type: string
 *                 format: date
 *               period_to:
 *                 type: string
 *                 format: date
 *               beneficiaries_reached:
 *                 type: integer
 *                 example: 250
 *               media:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Report supporting media (max 5 files)
 *     responses:
 *       200:
 *         description: Field report submitted
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  '/:id/reports',
  authenticate,
  authorize('ngo_partner', 'super_admin'),
  mediaUpload.array('media', 5),
  ctrl.submitReport
);

/**
 * @swagger
 * /projects/{id}/complete:
 *   post:
 *     summary: Mark a project as fully completed (NGO or admin)
 *     description: Requires completion proof media. Notifies the project creator.
 *     tags: [Projects]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               completion_proof:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Final before/after photos and videos (max 10 files)
 *     responses:
 *       200:
 *         description: Project marked as completed
 *       400:
 *         description: Project must be funded or in_progress to complete
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post(
  '/:id/complete',
  authenticate,
  authorize('ngo_partner', 'super_admin'),
  mediaUpload.array('completion_proof', 10),
  auditLog('COMPLETE', 'Project'),
  ctrl.complete
);

module.exports = router;