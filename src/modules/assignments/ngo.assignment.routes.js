'use strict';

/* ════════════════════════════════════════════════════════════
   ngo.assignment.controller.js
════════════════════════════════════════════════════════════ */

const svc = require('./ngo.assignment.service');
const R   = require('../../utils/apiResponse');

const ctrl = {
  /* ── Admin ── */
  assign: async (req, res) => {
    const data = await svc.assignNgo(req.user._id, req.body);
    R.created(res, data, 'NGO assigned successfully');
  },

  list: async (req, res) => {
    const { data, pagination } = await svc.listAssignments(req.query);
    R.paginated(res, data, pagination, 'Assignments');
  },

  reassign: async (req, res) => {
    const data = await svc.reassign(req.params.id, req.user._id, req.body);
    R.success(res, data, 'Assignment reassigned');
  },

  reviewReport: async (req, res) => {
    const data = await svc.reviewReport(req.params.id, req.user._id, req.body);
    R.success(res, data, 'Report reviewed');
  },

  availableNgos: async (req, res) => {
    const data = await svc.getAvailableNgos(req.query);
    R.success(res, data, 'Available verified NGOs');
  },

  /* ── NGO ── */
  myAssignments: async (req, res) => {
    const { data, pagination } = await svc.getMyAssignments(req.user._id, req.query);
    R.paginated(res, data, pagination, 'Your assignments');
  },

  accept: async (req, res) => {
    const data = await svc.acceptAssignment(req.params.id, req.user._id);
    R.success(res, data, 'Assignment accepted');
  },

  decline: async (req, res) => {
    const data = await svc.declineAssignment(req.params.id, req.user._id, req.body);
    R.success(res, data, 'Assignment declined');
  },

  markInProgress: async (req, res) => {
    const data = await svc.markInProgress(req.params.id, req.user._id);
    R.success(res, data, 'Marked as in progress');
  },

  submitReport: async (req, res) => {
    const data = await svc.submitReport(req.params.id, req.user._id, req.body, req.files || []);
    R.success(res, data, 'Report submitted successfully');
  },
};

/* ════════════════════════════════════════════════════════════
   ngo.assignment.routes.js  (export at bottom)
════════════════════════════════════════════════════════════ */

const router     = require('express').Router();
const { authenticate, authorize } = require('../../middleware/auth');
const { mediaUpload }   = require('../../middleware/upload');
const { uploadLimiter } = require('../../middleware/rateLimiter');
const auditLog          = require('../../middleware/auditLog');

/**
 * @swagger
 * tags:
 *   - name: NGO Assignments
 *     description: |
 *       Admin assigns verified NGOs to requests for field verification or project execution.
 *
 *       **Assignment flow:**
 *       `assigned` → `accepted` → `in_progress` → `report_submitted` → `completed`
 *
 *       NGOs see new assignments **immediately** in their dashboard (cache busted on assign).
 *       Reports must be submitted within the set deadline or the assignment turns overdue.
 */

// ── Admin routes ─────────────────────────────────────────────

/**
 * @swagger
 * /assignments/available-ngos:
 *   get:
 *     summary: Admin — list verified NGOs available for assignment
 *     description: |
 *       Returns approved NGOs filtered by state, SDG focus, and assignment type.
 *       Each NGO includes their current active assignment count and whether they are at capacity.
 *     tags: [NGO Assignments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: state
 *         schema: { type: string }
 *         description: Filter by Nigerian state the NGO operates in
 *       - in: query
 *         name: sdg
 *         schema: { type: string }
 *         description: Filter by SDG focus area
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [field_verification, execution], default: field_verification }
 *         description: Filter NGOs by required permission type
 *     responses:
 *       200:
 *         description: Verified NGOs with capacity info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       ngo:               { type: object }
 *                       verification_tier: { type: integer }
 *                       active_assignments:{ type: integer }
 *                       at_capacity:       { type: boolean }
 *                       operational_states:
 *                         type: array
 *                         items:
 *                           type: string
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/available-ngos', authenticate, authorize('super_admin', 'admin'), ctrl.availableNgos);

/**
 * @swagger
 * /assignments:
 *   get:
 *     summary: Admin — list all assignments
 *     tags: [NGO Assignments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [assigned, accepted, declined, in_progress, report_submitted, completed, reassigned, overdue] }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [field_verification, execution] }
 *       - in: query
 *         name: ngo
 *         schema: { type: string }
 *         description: Filter by NGO user ID
 *       - in: query
 *         name: overdue
 *         schema: { type: boolean }
 *         description: Set true to return only overdue assignments
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200:
 *         description: Paginated assignments
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', authenticate, authorize('super_admin', 'admin'), ctrl.list);

/**
 * @swagger
 * /assignments:
 *   post:
 *     summary: Admin — assign a verified NGO to a request
 *     description: |
 *       Creates a new assignment. Validates:
 *       - NGO must be approved/verified
 *       - NGO must have the required permission for the assignment type
 *       - NGO must not be at their concurrent case limit
 *       - No duplicate active assignment of the same type on the same request
 *
 *       After creation, the NGO's dashboard cache is immediately busted so they
 *       see the new assignment without waiting for cache expiry.
 *     tags: [NGO Assignments]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [request_id, ngo_user_id, type, deadline_days]
 *             properties:
 *               request_id:
 *                 type: string
 *                 description: ID of the request to assign
 *               ngo_user_id:
 *                 type: string
 *                 description: User ID of the verified NGO
 *               type:
 *                 type: string
 *                 enum: [field_verification, execution]
 *               instructions:
 *                 type: string
 *                 maxLength: 2000
 *                 description: Specific instructions for this assignment
 *               deadline_days:
 *                 type: integer
 *                 default: 7
 *                 description: Number of days from now for the report deadline
 *     responses:
 *       201:
 *         description: Assignment created, NGO notified
 *       400:
 *         description: NGO not verified, at capacity, or duplicate assignment
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post(
  '/',
  authenticate,
  authorize('super_admin', 'admin'),
  auditLog('ASSIGN_NGO', 'NgoAssignment'),
  ctrl.assign
);

/**
 * @swagger
 * /assignments/{id}/reassign:
 *   patch:
 *     summary: Admin — reassign to a different NGO
 *     description: Marks current assignment as reassigned and creates a new one for the new NGO.
 *     tags: [NGO Assignments]
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
 *             required: [ngo_user_id, reason]
 *             properties:
 *               ngo_user_id:   { type: string }
 *               reason:        { type: string }
 *               deadline_days: { type: integer, default: 7 }
 *     responses:
 *       200:
 *         description: Reassigned successfully
 */
router.patch(
  '/:id/reassign',
  authenticate,
  authorize('super_admin', 'admin'),
  auditLog('REASSIGN_NGO', 'NgoAssignment'),
  ctrl.reassign
);

/**
 * @swagger
 * /assignments/{id}/review-report:
 *   patch:
 *     summary: Admin — accept or request revision on submitted report
 *     description: |
 *       Accepts the report (marks assignment completed) or requests revision.
 *       NGO is notified of the outcome either way.
 *     tags: [NGO Assignments]
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
 *             required: [accepted]
 *             properties:
 *               accepted: { type: boolean }
 *               feedback: { type: string, description: Required if accepted is false }
 *     responses:
 *       200:
 *         description: Report reviewed
 */
router.patch(
  '/:id/review-report',
  authenticate,
  authorize('super_admin', 'admin'),
  auditLog('REVIEW_REPORT', 'NgoAssignment'),
  ctrl.reviewReport
);

// ── NGO routes ───────────────────────────────────────────────

/**
 * @swagger
 * /assignments/my:
 *   get:
 *     summary: NGO — get all my assignments
 *     description: Returns all assignments for the authenticated NGO, sorted by deadline (soonest first).
 *     tags: [NGO Assignments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *         description: Filter by assignment status
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200:
 *         description: NGO's assignments
 */
router.get('/my', authenticate, authorize('ngo_partner'), ctrl.myAssignments);

/**
 * @swagger
 * /assignments/{id}/accept:
 *   patch:
 *     summary: NGO — accept an assignment
 *     tags: [NGO Assignments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Assignment accepted, admin notified
 *       400:
 *         description: Assignment is not in "assigned" status
 */
router.patch('/:id/accept', authenticate, authorize('ngo_partner'), ctrl.accept);

/**
 * @swagger
 * /assignments/{id}/decline:
 *   patch:
 *     summary: NGO — decline an assignment
 *     description: Admin is immediately notified to reassign.
 *     tags: [NGO Assignments]
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
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: Declined, admin notified
 */
router.patch('/:id/decline', authenticate, authorize('ngo_partner'), ctrl.decline);

/**
 * @swagger
 * /assignments/{id}/in-progress:
 *   patch:
 *     summary: NGO — mark assignment as in-progress
 *     tags: [NGO Assignments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Marked as in progress
 */
router.patch('/:id/in-progress', authenticate, authorize('ngo_partner'), ctrl.markInProgress);

/**
 * @swagger
 * /assignments/{id}/report:
 *   post:
 *     summary: NGO — submit field verification or execution report
 *     description: |
 *       Submits the NGO's report with findings, media evidence, and recommendation.
 *       Admin is immediately notified for review.
 *
 *       Upload media files (photos, videos, documents) as multipart/form-data.
 *       All other fields are sent as form fields.
 *     tags: [NGO Assignments]
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
 *             required: [summary, findings, recommendation]
 *             properties:
 *               summary:
 *                 type: string
 *                 description: Executive summary of findings
 *               findings:
 *                 type: string
 *                 description: Detailed field findings
 *               challenges:
 *                 type: string
 *                 description: Any challenges encountered
 *               next_steps:
 *                 type: string
 *                 description: Recommended next steps
 *               site_visited:
 *                 type: boolean
 *                 description: Was the physical site visited?
 *               visit_date:
 *                 type: string
 *                 format: date
 *               beneficiaries_confirmed:
 *                 type: integer
 *               location_confirmed:
 *                 type: boolean
 *               needs_confirmed:
 *                 type: boolean
 *               fraud_risk:
 *                 type: string
 *                 enum: [none, low, medium, high]
 *               recommendation:
 *                 type: string
 *                 enum: [approve, reject, more_info, pending]
 *               gps_lat:
 *                 type: number
 *                 description: GPS latitude of site visit
 *               gps_lng:
 *                 type: number
 *                 description: GPS longitude of site visit
 *               files:
 *                 type: array
 *                 items: { type: string, format: binary }
 *                 description: Photos, videos, documents (max 10 files, 50MB each)
 *     responses:
 *       200:
 *         description: Report submitted, admin notified
 *       400:
 *         description: Assignment not in accepted or in_progress status
 */
router.post(
  '/:id/report',
  authenticate,
  authorize('ngo_partner'),
  uploadLimiter,
  mediaUpload.array('files', 10),
  auditLog('SUBMIT_REPORT', 'NgoAssignment'),
  ctrl.submitReport
);

module.exports = router;