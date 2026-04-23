'use strict';

const router = require('express').Router();
const ctrl   = require('./user.controller');
const { authenticate }  = require('../../middleware/auth');
const { imageUpload }   = require('../../middleware/upload');
const { uploadLimiter } = require('../../middleware/rateLimiter');

/**
 * @swagger
 * tags:
 *   - name: Users
 *     description: User profile management — all routes require authentication
 */

router.use(authenticate);

/**
 * @swagger
 * /users/profile:
 *   get:
 *     summary: Get current authenticated user's profile
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User profile data
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/profile', ctrl.getProfile);

/**
 * @swagger
 * /users/profile:
 *   patch:
 *     summary: Update profile fields
 *     description: Only allowed fields can be updated. Password change uses a separate endpoint.
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:           { type: string }
 *               last_name:            { type: string }
 *               bio:                  { type: string, maxLength: 500 }
 *               address:              { type: string }
 *               organization_name:    { type: string }
 *               fcm_token:            { type: string, description: Firebase Cloud Messaging device token for push notifications }
 *               notification_preferences:
 *                 type: object
 *                 properties:
 *                   email: { type: boolean, example: true }
 *                   sms:   { type: boolean, example: true }
 *                   push:  { type: boolean, example: true }
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.patch('/profile', ctrl.updateProfile);

/**
 * @swagger
 * /users/avatar:
 *   post:
 *     summary: Upload or replace profile avatar
 *     description: Accepts JPEG, PNG, or WebP. Max size 5MB. Uploaded to Cloudinary.
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [avatar]
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *                 description: Image file (JPEG/PNG/WebP, max 5MB)
 *     responses:
 *       200:
 *         description: Avatar uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     avatar: { type: string, example: 'https://res.cloudinary.com/xxx/image/upload/v123/avatars/user.jpg' }
 *       400:
 *         description: No image provided or invalid file type
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.post('/avatar', uploadLimiter, imageUpload.single('avatar'), ctrl.updateAvatar);

/**
 * @swagger
 * /users/change-password:
 *   patch:
 *     summary: Change account password
 *     description: Requires current password for verification.
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [current_password, new_password]
 *             properties:
 *               current_password: { type: string, description: Your current password }
 *               new_password:     { type: string, minLength: 8, description: New password (must meet complexity rules) }
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Current password incorrect
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.patch('/change-password', ctrl.changePassword);

/**
 * @swagger
 * /users/bookmark/{requestId}:
 *   post:
 *     summary: Toggle bookmark on a case (add if not bookmarked, remove if already bookmarked)
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema: { type: string }
 *         description: The ID of the request (case) to bookmark
 *     responses:
 *       200:
 *         description: Bookmark toggled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     bookmarked: { type: boolean, example: true }
 *                     message:    { type: string,  example: 'Added to bookmarks' }
 */
router.post('/bookmark/:requestId', ctrl.toggleBookmark);

module.exports = router;