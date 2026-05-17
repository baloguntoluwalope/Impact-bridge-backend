'use strict';

const router = require('express').Router();
const ctrl   = require('./ngo.verification.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { mediaUpload }  = require('../../middleware/upload');
const { uploadLimiter } = require('../../middleware/rateLimiter');
const auditLog         = require('../../middleware/auditLog');

/**
 * @swagger
 * tags:
 *   - name: NGO Verification
 *     description: |
 *       Full NGO partner verification lifecycle.
 *
 *       **NGO state flow:**
 *       `draft` → `submitted` → `under_review` → `documents_verified`
 *       → `interview_scheduled` → `approved` | `rejected` | `suspended`
 *
 *       **Access rules:**
 *       - All NGOs: post projects, view public requests
 *       - Verified (approved) NGOs: field-verify requests, execute projects,
 *         receive fund disbursements, access donor info (Tier 2+)
 */

// ── NGO self-service ────────────────────────────────────────────

/**
 * @swagger
 * /ngo-verification/my:
 *   get:
 *     summary: Get my verification application (NGO)
 *     tags: [NGO Verification]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Current application state
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/my', authenticate, authorize('ngo_partner'), ctrl.getMyApplication);

/**
 * @swagger
 * /ngo-verification/start:
 *   post:
 *     summary: Start or retrieve a draft application (NGO)
 *     description: |
 *       Creates a new draft application if none exists.
 *       Returns existing application if already in progress.
 *       Rejected NGOs must wait 90 days before reapplying.
 *     tags: [NGO Verification]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Application retrieved or created
 *       403:
 *         description: Reapplication cooldown still active
 */
router.post('/start', authenticate, authorize('ngo_partner'), ctrl.getOrCreate);

/**
 * @swagger
 * /ngo-verification/progress:
 *   patch:
 *     summary: Save application progress (NGO)
 *     description: |
 *       Save any step of the application form. Can be called multiple times.
 *       Only works while status is `draft` or `submitted`.
 *
 *       Send only the fields you want to update — other fields are untouched.
 *     tags: [NGO Verification]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               organisation:
 *                 type: object
 *                 properties:
 *                   legal_name:      { type: string }
 *                   registration_no: { type: string }
 *                   year_founded:    { type: integer }
 *                   website:         { type: string }
 *                   hq_state:        { type: string }
 *                   hq_lga:          { type: string }
 *                   hq_address:      { type: string }
 *                   staff_count:     { type: integer }
 *                   annual_budget:   { type: number }
 *                   phone:           { type: string }
 *                   contact_email:   { type: string }
 *               sdg_focus:
 *                 type: array
 *                 items: { type: string }
 *               operational_states:
 *                 type: array
 *                 items: { type: string }
 *               past_projects:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     title:         { type: string }
 *                     description:   { type: string }
 *                     location:      { type: string }
 *                     year:          { type: integer }
 *                     beneficiaries: { type: integer }
 *                     budget_ngn:    { type: number }
 *                     outcome:       { type: string }
 *               references:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:         { type: string }
 *                     organisation: { type: string }
 *                     role:         { type: string }
 *                     email:        { type: string }
 *                     phone:        { type: string }
 *               questionnaire:
 *                 type: object
 *                 properties:
 *                   why_partner:              { type: string, maxLength: 2000 }
 *                   field_capacity:           { type: string, maxLength: 2000 }
 *                   accountability_approach:  { type: string, maxLength: 2000 }
 *                   safeguarding_policy:      { type: string, maxLength: 2000 }
 *                   challenge_example:        { type: string, maxLength: 2000 }
 *                   geographic_reach:         { type: string }
 *                   logistics_infrastructure: { type: boolean }
 *                   can_report_monthly:       { type: boolean }
 *                   regulatory_issues:        { type: boolean }
 *               declaration_agreed:
 *                 type: boolean
 *                 description: Must be true to enable final submission
 *     responses:
 *       200:
 *         description: Progress saved
 *       400:
 *         description: Cannot edit in current status
 */
router.patch(
  '/progress',
  authenticate,
  authorize('ngo_partner'),
  ctrl.saveProgress
);

/**
 * @swagger
 * /ngo-verification/documents/{docType}:
 *   post:
 *     summary: Upload a document (NGO)
 *     description: |
 *       Upload files for a specific document type.
 *
 *       **Single-file types** (replaces existing):
 *       `cac_certificate`, `tax_clearance`, `annual_report`,
 *       `constitution`, `board_resolution`
 *
 *       **Multi-file types** (appends):
 *       `financial_statements`, `project_evidence`, `additional`
 *     tags: [NGO Verification]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: docType
 *         required: true
 *         schema:
 *           type: string
 *           enum:
 *             - cac_certificate
 *             - tax_clearance
 *             - annual_report
 *             - constitution
 *             - board_resolution
 *             - financial_statements
 *             - project_evidence
 *             - additional
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items: { type: string, format: binary }
 *                 description: Max 5 files, 20MB each
 *     responses:
 *       200:
 *         description: Documents uploaded successfully
 *       400:
 *         description: Invalid document type or status error
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.post(
  '/documents/:docType',
  authenticate,
  authorize('ngo_partner'),
  uploadLimiter,
  mediaUpload.array('files', 5),
  auditLog('UPLOAD', 'NgoVerificationDocument'),
  ctrl.uploadDocuments
);

/**
 * @swagger
 * /ngo-verification/submit:
 *   post:
 *     summary: Submit application for review (NGO)
 *     description: |
 *       Finalises the application and sends it to the admin queue.
 *
 *       **Prerequisites before submitting:**
 *       - CAC Certificate uploaded
 *       - Annual Report uploaded
 *       - NGO Constitution uploaded
 *       - `why_partner`, `field_capacity`, `accountability_approach` answered
 *       - `declaration_agreed` set to `true`
 *     tags: [NGO Verification]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Application submitted
 *       400:
 *         description: Missing required documents or questionnaire fields
 */
router.post(
  '/submit',
  authenticate,
  authorize('ngo_partner'),
  auditLog('SUBMIT', 'NgoVerification'),
  ctrl.submit
);

// ── Admin ───────────────────────────────────────────────────────

/**
 * @swagger
 * /ngo-verification/admin/stats:
 *   get:
 *     summary: Admin — NGO verification stats
 *     tags: [NGO Verification]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Stats by status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:     { type: integer }
 *                 by_status:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:   { type: string }
 *                       count: { type: integer }
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/admin/stats',
  authenticate,
  authorize('super_admin', 'admin'),
  ctrl.getStats
);

/**
 * @swagger
 * /ngo-verification/admin/queue:
 *   get:
 *     summary: Admin — list all NGO applications
 *     tags: [NGO Verification]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, submitted, under_review, documents_verified, interview_scheduled, approved, rejected, suspended]
 *       - in: query
 *         name: sdg_focus
 *         schema: { type: string }
 *       - in: query
 *         name: state
 *         schema: { type: string }
 *         description: Filter by NGO HQ state
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200:
 *         description: Paginated list of applications
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/admin/queue',
  authenticate,
  authorize('super_admin', 'admin'),
  ctrl.listApplications
);

/**
 * @swagger
 * /ngo-verification/admin/{id}:
 *   get:
 *     summary: Admin — get full application detail
 *     tags: [NGO Verification]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Full application with all documents and review history
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  '/admin/:id',
  authenticate,
  authorize('super_admin', 'admin'),
  ctrl.getDetail
);

/**
 * @swagger
 * /ngo-verification/admin/{id}/review:
 *   patch:
 *     summary: Admin — start review (assign self as reviewer)
 *     tags: [NGO Verification]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Review started, status → under_review
 *       400:
 *         description: Application is not in submitted status
 */
router.patch(
  '/admin/:id/review',
  authenticate,
  authorize('super_admin', 'admin'),
  auditLog('REVIEW_START', 'NgoVerification'),
  ctrl.startReview
);

/**
 * @swagger
 * /ngo-verification/admin/{id}/documents/{docType}:
 *   patch:
 *     summary: Admin — verify or flag a specific document
 *     tags: [NGO Verification]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *       - in: path
 *         name: docType
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [verified]
 *             properties:
 *               verified: { type: boolean }
 *               note:     { type: string }
 *     responses:
 *       200:
 *         description: Document status updated
 */
router.patch(
  '/admin/:id/documents/:docType',
  authenticate,
  authorize('super_admin', 'admin'),
  ctrl.verifyDocument
);

/**
 * @swagger
 * /ngo-verification/admin/{id}/note:
 *   post:
 *     summary: Admin — add internal review note
 *     tags: [NGO Verification]
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
 *             required: [note]
 *             properties:
 *               note: { type: string, maxLength: 1000 }
 *     responses:
 *       200:
 *         description: Note added
 */
router.post(
  '/admin/:id/note',
  authenticate,
  authorize('super_admin', 'admin'),
  ctrl.addNote
);

/**
 * @swagger
 * /ngo-verification/admin/{id}/interview:
 *   post:
 *     summary: Admin — schedule an interview
 *     tags: [NGO Verification]
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
 *             required: [date, medium]
 *             properties:
 *               date:   { type: string, format: date-time }
 *               medium: { type: string, enum: [video_call, phone, in_person] }
 *               note:   { type: string }
 *     responses:
 *       200:
 *         description: Interview scheduled, NGO notified
 */
router.post(
  '/admin/:id/interview',
  authenticate,
  authorize('super_admin', 'admin'),
  auditLog('INTERVIEW_SCHEDULED', 'NgoVerification'),
  ctrl.scheduleInterview
);

/**
 * @swagger
 * /ngo-verification/admin/{id}/interview/outcome:
 *   patch:
 *     summary: Admin — record interview outcome
 *     tags: [NGO Verification]
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
 *             required: [outcome]
 *             properties:
 *               outcome: { type: string, enum: [pass, fail, pending] }
 *               notes:   { type: string }
 *     responses:
 *       200:
 *         description: Interview outcome recorded
 */
router.patch(
  '/admin/:id/interview/outcome',
  authenticate,
  authorize('super_admin', 'admin'),
  ctrl.recordInterview
);

/**
 * @swagger
 * /ngo-verification/admin/{id}/approve:
 *   post:
 *     summary: Admin — approve NGO application
 *     description: |
 *       Approves the NGO and sets their verification tier.
 *
 *       **Tier permissions:**
 *       - Tier 1: field verify + execute (max 5 concurrent cases)
 *       - Tier 2: + donor contact access (max 10 cases)
 *       - Tier 3: full access, unlimited cases
 *     tags: [NGO Verification]
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
 *             properties:
 *               tier: { type: integer, enum: [1, 2, 3], default: 1 }
 *               note: { type: string }
 *     responses:
 *       200:
 *         description: NGO approved and User record updated
 *       400:
 *         description: Already approved
 */
router.post(
  '/admin/:id/approve',
  authenticate,
  authorize('super_admin'),
  auditLog('APPROVE', 'NgoVerification'),
  ctrl.approve
);

/**
 * @swagger
 * /ngo-verification/admin/{id}/reject:
 *   post:
 *     summary: Admin — reject NGO application
 *     description: Sets 90-day reapplication cooldown and notifies the NGO.
 *     tags: [NGO Verification]
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
 *               reason: { type: string, description: Reason shown to the NGO }
 *               note:   { type: string, description: Internal admin note }
 *     responses:
 *       200:
 *         description: Application rejected
 *       400:
 *         description: Reason is required
 */
router.post(
  '/admin/:id/reject',
  authenticate,
  authorize('super_admin', 'admin'),
  auditLog('REJECT', 'NgoVerification'),
  ctrl.reject
);

/**
 * @swagger
 * /ngo-verification/admin/{id}/suspend:
 *   post:
 *     summary: Admin — suspend a verified NGO
 *     description: Immediately revokes all verified NGO permissions.
 *     tags: [NGO Verification]
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
 *         description: NGO suspended
 *       400:
 *         description: NGO is not currently approved
 */
router.post(
  '/admin/:id/suspend',
  authenticate,
  authorize('super_admin'),
  auditLog('SUSPEND', 'NgoVerification'),
  ctrl.suspend
);

module.exports = router;