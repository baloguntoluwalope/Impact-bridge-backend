'use strict';

const router = require('express').Router();
const ctrl   = require('./notification.controller');
const { authenticate, authorize } = require('../../middleware/auth');

/**
 * @swagger
 * tags:
 *   - name: Notifications
 *     description: In-app notification management and broadcast
 */

router.use(authenticate);

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: Get current user's notifications
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - in: query
 *         name: is_read
 *         schema: { type: boolean }
 *         description: Filter by read status
 *     responses:
 *       200:
 *         description: Notifications with unread count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     notifications:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Notification'
 *                     total:        { type: integer }
 *                     unread_count: { type: integer }
 */
router.get('/', ctrl.getAll);

/**
 * @swagger
 * /notifications/{id}/read:
 *   patch:
 *     summary: Mark a single notification as read
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Marked as read
 */
router.patch('/:id/read', ctrl.markRead);

/**
 * @swagger
 * /notifications/read-all:
 *   patch:
 *     summary: Mark all notifications as read
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 */
router.patch('/read-all', ctrl.markAllRead);

/**
 * @swagger
 * /notifications/broadcast:
 *   post:
 *     summary: Broadcast a notification to users by role (admin only)
 *     description: Creates in-app notifications for all matching users. Does not send email or push.
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, body]
 *             properties:
 *               title: { type: string, example: System Maintenance Notice }
 *               body:  { type: string, example: Impact Bridge will be down for maintenance on Sunday 2am–4am WAT }
 *               roles:
 *                 type: array
 *                 items: { type: string }
 *                 example: [donor, ngo_partner]
 *                 description: Leave empty to broadcast to ALL users
 *               type:  { type: string, default: broadcast }
 *     responses:
 *       200:
 *         description: Broadcast sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     sent: { type: integer, description: Number of users notified }
 */
router.post('/broadcast', authorize('super_admin'), ctrl.broadcast);

module.exports = router;