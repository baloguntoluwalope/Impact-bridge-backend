'use strict';

const router = require('express').Router();
const ctrl   = require('./admin.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const auditLog = require('../../middleware/auditLog');

/**
 * @swagger
 * tags:
 *   - name: Admin
 *     description: Super admin control panel — full system access
 */

router.use(authenticate, authorize('super_admin'));

/**
 * @swagger
 * /admin/stats:
 *   get:
 *     summary: System-wide statistics summary
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Active users, total requests, payments and amount raised
 */
router.get('/stats', ctrl.getSystemStats);

/**
 * @swagger
 * /admin/users:
 *   get:
 *     summary: List all users with filters
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - in: query
 *         name: role
 *         schema: { type: string }
 *       - in: query
 *         name: state
 *         schema: { type: string }
 *       - in: query
 *         name: is_suspended
 *         schema: { type: boolean }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by first_name, last_name or email
 *     responses:
 *       200:
 *         description: Users list
 */
router.get('/users', ctrl.getUsers);

/**
 * @swagger
 * /admin/users/{id}/suspend:
 *   patch:
 *     summary: Suspend a user account
 *     tags: [Admin]
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
 *               reason: { type: string, example: "Suspicious payment activity detected" }
 *     responses:
 *       200:
 *         description: User suspended
 */
router.patch('/users/:id/suspend', auditLog('SUSPEND', 'User'), ctrl.suspendUser);

/**
 * @swagger
 * /admin/users/{id}/activate:
 *   patch:
 *     summary: Reactivate a suspended or deactivated user account
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: User activated
 */
router.patch('/users/:id/activate', auditLog('ACTIVATE', 'User'), ctrl.activateUser);

/**
 * @swagger
 * /admin/requests:
 *   get:
 *     summary: Get all requests with admin-level filters
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: state
 *         schema: { type: string }
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: All requests (any status)
 */
router.get('/requests', ctrl.getRequests);

/**
 * @swagger
 * /admin/requests/{id}/feature:
 *   patch:
 *     summary: Toggle featured status on a request
 *     description: Featured requests appear prominently on the donor browse page.
 *     tags: [Admin]
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
 *             required: [is_featured]
 *             properties:
 *               is_featured: { type: boolean, example: true }
 *     responses:
 *       200:
 *         description: Feature status updated
 */
router.patch('/requests/:id/feature', ctrl.featureRequest);

/**
 * @swagger
 * /admin/payments:
 *   get:
 *     summary: Get all payments with filters
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, success, failed, refunded, disputed] }
 *       - in: query
 *         name: gateway
 *         schema: { type: string, enum: [korapay, paystack, flutterwave] }
 *     responses:
 *       200:
 *         description: All payments with gateway summary
 */
router.get('/payments', ctrl.getPayments);

/**
 * @swagger
 * /admin/audit-logs:
 *   get:
 *     summary: Get system audit logs (auto-deleted after 90 days)
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - in: query
 *         name: action
 *         schema: { type: string }
 *         description: e.g. APPROVE, REJECT, CREATE, SUSPEND
 *       - in: query
 *         name: resource
 *         schema: { type: string }
 *         description: e.g. Request, Payment, User, Wallet
 *       - in: query
 *         name: user
 *         schema: { type: string }
 *         description: Filter by user ID
 *     responses:
 *       200:
 *         description: Audit log entries
 */
router.get('/audit-logs', ctrl.getAuditLogs);

/**
 * @swagger
 * /admin/dead-letter:
 *   get:
 *     summary: Dead-letter queue status — jobs that failed all retries
 *     description: Review failed background jobs for manual intervention.
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: DLQ counts per state
 */
router.get('/dead-letter', ctrl.getDLQStatus);

module.exports = router;