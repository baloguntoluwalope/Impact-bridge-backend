'use strict';

const router = require('express').Router();
const ctrl = require('./auth.controller');
const { validate } = require('../../utils/validators');
const { authLimiter, otpLimiter } = require('../../middleware/rateLimiter');
const { authenticate } = require('../../middleware/auth');

/**
 * @swagger
 * tags:
 *   - name: Auth
 *     description: Register, login, OTP verification, password reset
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user account
 *     description: |
 *       Creates a new account and sends a 6-digit OTP to the provided email.
 *       The OTP must be verified via POST /auth/verify-email before login is allowed.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterBody'
 *           examples:
 *             superAdmin:
 *               summary: Register as superAdmin
 *               value:
 *                 first_name: Amara
 *                 last_name: Okafor
 *                 email: amara@example.com
 *                 phone: "08012345678"
 *                 password: SecurePass@1
 *                 role: super_Admin
 *                 state: Lagos
 *                 lga: Ikeja 
 *             government:
 *               summary: Register as a government official
 *               value:
 *                 first_name: Amara
 *                 last_name: Okafor
 *                 email: amara@example.com
 *                 phone: "08012345678"
 *                 password: SecurePass@1
 *                 role: government_official
 *                 state: Lagos
 *                 lga: Ikeja 
 *             student:
 *               summary: Register as a student
 *               value:
 *                 first_name: Amara
 *                 last_name: Okafor
 *                 email: amara@example.com
 *                 phone: "08012345678"
 *                 password: SecurePass@1
 *                 role: student
 *                 state: Lagos
 *                 lga: Ikeja
 *             school_admin:
 *               summary: Register as a school admin
 *               value:
 *                 first_name: Amara
 *                 last_name: Okafor
 *                 email: amara@example.com
 *                 phone: "08012345678"
 *                 password: SecurePass@1
 *                 role: school_admin
 *                 state: Lagos
 *                 lga: Ikeja
 *             community:
 *               summary: Register as a community leader
 *               value:
 *                 first_name: Amara
 *                 last_name: Okafor
 *                 email: amara@example.com
 *                 phone: "08012345678"
 *                 password: SecurePass@1
 *                 role: community_leader
 *                 state: Lagos
 *                 lga: Ikeja
 *             individual:
 *               summary: Register as an individual
 *               value:
 *                 first_name: Amara
 *                 last_name: Okafor
 *                 email: amara@example.com
 *                 phone: "08012345678"
 *                 password: SecurePass@1
 *                 role: individual
 *                 state: Lagos
 *                 lga: Ikeja
 *             donor:
 *               summary: Register as a donor
 *               value:
 *                 first_name: Amara
 *                 last_name: Okafor
 *                 email: amara@example.com
 *                 phone: "08012345678"
 *                 password: SecurePass@1
 *                 role: donor
 *                 state: Lagos
 *                 lga: Ikeja
 *             ngo:
 *               summary: Register as an NGO partner
 *               value:
 *                 first_name: Chidi
 *                 last_name: Eze
 *                 email: chidi@savenig.org
 *                 phone: "08098765432"
 *                 password: StrongPass@2
 *                 role: ngo_partner
 *                 state: Abuja
 *                 lga: Municipal
 *                 organization_name: Save Nigeria Foundation
 *     responses:
 *       201:
 *         description: Registration successful — OTP sent to email
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         user:
 *                           type: object
 *                           properties:
 *                             _id:       { type: string }
 *                             email:     { type: string }
 *                             role:      { type: string }
 *                             full_name: { type: string }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.post('/register', authLimiter, validate('register'), ctrl.register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login and receive JWT tokens
 *     description: |
 *       Returns an `accessToken` (7d) and `refreshToken` (30d).
 *       Use the `accessToken` in the Authorization header: `Bearer <token>`
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginBody'
 *           example:
 *             email: amara@example.com
 *             password: SecurePass@1
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: Invalid credentials or email not verified
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Account suspended
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.post('/login', authLimiter, validate('login'), ctrl.login);

/**
 * @swagger
 * /auth/verify-email:
 *   post:
 *     summary: Verify email with 6-digit OTP
 *     description: Must be called before login is allowed. OTP expires in 10 minutes.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp]
 *             properties:
 *               email: { type: string, format: email, example: amara@example.com }
 *               otp:   { type: string, minLength: 6, maxLength: 6, example: "123456" }
 *               type:  { type: string, default: email_verification, enum: [email_verification, phone_verification] }
 *     responses:
 *       200:
 *         description: Email verified
 *       400:
 *         description: Invalid or expired OTP
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.post('/verify-email', otpLimiter, validate('verifyOtp'), ctrl.verifyEmail);

/**
 * @swagger
 * /auth/resend-otp:
 *   post:
 *     summary: Resend OTP to email
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *               type:  { type: string, default: email_verification }
 *     responses:
 *       200:
 *         description: OTP resent
 *       404:
 *         description: User not found
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.post('/resend-otp', otpLimiter, ctrl.resendOTP);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request a password reset link
 *     description: Sends a reset link to the email if the account exists. Always returns 200 to prevent email enumeration.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email, example: amara@example.com }
 *     responses:
 *       200:
 *         description: Reset link sent if email exists
 */
router.post('/forgot-password', authLimiter, validate('forgotPassword'), ctrl.forgotPassword);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password using token from email link
 *     description: Token from forgot-password email. Expires in 1 hour.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token:    { type: string, description: Token from reset email link }
 *               password: { type: string, minLength: 8, description: New password (must meet complexity rules) }
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid or expired token
 */
router.post('/reset-password', authLimiter, validate('resetPassword'), ctrl.resetPassword);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout and invalidate current token
 *     description: Adds the JWT to a Redis blacklist so it cannot be reused. Also removes the refresh token.
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/logout', authenticate, ctrl.logout);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Get a new access token using refresh token
 *     description: |
 *       Implements refresh token rotation — a new refresh token is issued each time.
 *       The old refresh token is invalidated. Reusing an old refresh token triggers a security alert.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refresh_token]
 *             properties:
 *               refresh_token: { type: string, description: The refresh token received at login }
 *     responses:
 *       200:
 *         description: New tokens issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:  { type: string }
 *                     refreshToken: { type: string }
 *       401:
 *         description: Invalid or reused refresh token
 */
router.post('/refresh', ctrl.refresh);

module.exports = router;