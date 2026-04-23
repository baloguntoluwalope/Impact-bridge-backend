'use strict';

const router = require('express').Router();
const ctrl   = require('./whatsapp.controller');
const { apiLimiter } = require('../../middleware/rateLimiter');

/**
 * @swagger
 * tags:
 *   - name: WhatsApp
 *     description: Generate prefilled wa.me links for cases, projects and general contact
 */

/**
 * @swagger
 * /whatsapp/contact:
 *   get:
 *     summary: Get a prefilled WhatsApp contact link
 *     tags: [WhatsApp]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [general, partnership, donation, ngo, support, volunteer] }
 *         default: general
 *       - in: query
 *         name: subject
 *         schema: { type: string }
 *         description: Used when type is 'support'
 *     responses:
 *       200:
 *         description: WhatsApp link
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     wa_link: { type: string, example: 'https://wa.me/2348012345678?text=...' }
 *                     phone:   { type: string, example: '2348012345678' }
 */
router.get('/contact', apiLimiter, ctrl.getContactLink);

/**
 * @swagger
 * /whatsapp/case/{requestId}:
 *   get:
 *     summary: Get prefilled WhatsApp link for a specific case
 *     description: Pre-populates case title, location, SDG, funding progress for easy inquiry.
 *     tags: [WhatsApp]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Case WhatsApp link
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/case/:requestId', apiLimiter, ctrl.getCaseLink);

/**
 * @swagger
 * /whatsapp/project/{projectId}:
 *   get:
 *     summary: Get prefilled WhatsApp link for a sponsored project
 *     tags: [WhatsApp]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Project WhatsApp link
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/project/:projectId', apiLimiter, ctrl.getProjectLink);

module.exports = router;