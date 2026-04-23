'use strict';

const router = require('express').Router();
const ctrl   = require('./verification.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const auditLog = require('../../middleware/auditLog');

/**
 * @swagger
 * tags:
 *   - name: Verification
 *     description: Admin/NGO verification engine — no unverified case is visible to donors
 */

router.use(authenticate, authorize('super_admin', 'ngo_partner'));

/**
 * @swagger
 * /verification/stats:
 *   get:
 *     summary: Get verification queue statistics
 *     tags: [Verification]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Verification stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     submitted:    { type: integer }
 *                     under_review: { type: integer }
 *                     verified:     { type: integer }
 *                     rejected:     { type: integer }
 *                     total:        { type: integer }
 *                     pending:      { type: integer, description: submitted + under_review }
 */
router.get('/stats', ctrl.getStats);

/**
 * @swagger
 * /verification/pending:
 *   get:
 *     summary: Get all requests pending verification
 *     description: Returns submitted and under_review requests sorted by urgency then age.
 *     tags: [Verification]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - in: query
 *         name: state
 *         schema: { type: string }
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: urgency
 *         schema: { type: string, enum: [low, medium, high, critical] }
 *     responses:
 *       200:
 *         description: Pending verification queue
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/pending', ctrl.getPending);

/**
 * @swagger
 * /verification/{id}/review:
 *   patch:
 *     summary: Move request to under_review status
 *     description: Signals the requester that their submission is being actively reviewed.
 *     tags: [Verification]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Status updated to under_review
 *       400:
 *         description: Request is not in submitted status
 */
router.patch('/:id/review', auditLog('REVIEW', 'Request'), ctrl.setUnderReview);

/**
 * @swagger
 * /verification/approve/{id}:
 *   post:
 *     summary: Approve a request — makes it visible to donors (admin only)
 *     description: |
 *       Once approved, the request status becomes 'verified' and is_visible is set to true.
 *       Donors can then find and donate to it.
 *       Optionally assigns an NGO to execute the project.
 *     tags: [Verification]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:  { type: string, description: Internal verification notes }
 *               ngo_id: { type: string, description: Assign this NGO to execute the project }
 *     responses:
 *       200:
 *         description: Request approved and published
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/approve/:id', authorize('super_admin'), auditLog('APPROVE', 'Request'), ctrl.approve);

/**
 * @swagger
 * /verification/reject/{id}:
 *   post:
 *     summary: Reject a request with reason (admin only)
 *     description: Requester is notified via email and in-app notification with the reason.
 *     tags: [Verification]
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
 *               reason: { type: string, example: "Insufficient evidence provided. Please upload supporting documents." }
 *               notes:  { type: string, description: Internal admin notes (not shown to requester) }
 *     responses:
 *       200:
 *         description: Request rejected
 *       400:
 *         description: Reason is required
 */
router.post('/reject/:id', authorize('super_admin'), auditLog('REJECT', 'Request'), ctrl.reject);

/**
 * @swagger
 * /verification/more-info/{id}:
 *   post:
 *     summary: Request additional information from the requester
 *     description: Sends an email to the requester explaining what additional information is needed.
 *     tags: [Verification]
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
 *             required: [message]
 *             properties:
 *               message: { type: string, example: "Please provide a government ID and proof of residence for the beneficiaries." }
 *     responses:
 *       200:
 *         description: Information request sent to requester
 */
router.post('/more-info/:id', ctrl.requestMoreInfo);

/**
 * @swagger
 * /verification/flag/{id}:
 *   post:
 *     summary: Flag a request as potentially fraudulent (admin only)
 *     description: Sets a fraud score, hides the request from donors, and adds an internal note.
 *     tags: [Verification]
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
 *             required: [reason, fraud_score]
 *             properties:
 *               reason:      { type: string, example: "Duplicate request from same IP address" }
 *               fraud_score: { type: integer, minimum: 0, maximum: 100, example: 75 }
 *     responses:
 *       200:
 *         description: Request flagged and hidden from donors
 */
router.post('/flag/:id', authorize('super_admin'), auditLog('FLAG_FRAUD', 'Request'), ctrl.flagForFraud);

module.exports = router;