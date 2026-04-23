'use strict';

const router = require('express').Router();
const svc    = require('./contact.service');
const R      = require('../../utils/apiResponse');
const { validate }   = require('../../utils/validators');
const { authenticate, authorize } = require('../../middleware/auth');
const { apiLimiter } = require('../../middleware/rateLimiter');

/**
 * @swagger
 * tags:
 *   - name: Contact
 *     description: Contact form submissions and admin inquiry management
 */

/**
 * @swagger
 * /contact:
 *   post:
 *     summary: Submit a contact form
 *     description: Rate limited to prevent spam. Sends notification to support team.
 *     tags: [Contact]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ContactBody'
 *     responses:
 *       201:
 *         description: Message received — response within 48 hours
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.post('/', apiLimiter, validate('contact'), async (req, res) => {
  await svc.submitContact(req.body, req.ip);
  R.created(res, null, 'Your message has been received. We will respond within 48 hours.');
});

router.use(authenticate, authorize('super_admin'));

/**
 * @swagger
 * /contact:
 *   get:
 *     summary: Get all contact submissions (admin only)
 *     tags: [Contact]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [new, in_progress, resolved, closed] }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [inquiry, case_inquiry, partnership, report, other] }
 *     responses:
 *       200:
 *         description: Contact submissions
 */
router.get('/', async (req, res) => {
  const { contacts, pagination } = await svc.getAllContacts(req.query);
  R.paginated(res, contacts, pagination);
});

/**
 * @swagger
 * /contact/stats:
 *   get:
 *     summary: Get contact queue statistics (admin only)
 *     tags: [Contact]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Contact stats
 */
router.get('/stats', async (req, res) => {
  const data = await svc.getContactStats();
  R.success(res, data, 'Contact statistics');
});

/**
 * @swagger
 * /contact/{id}:
 *   patch:
 *     summary: Update contact status or notes (admin only)
 *     tags: [Contact]
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
 *               status:      { type: string, enum: [new, in_progress, resolved, closed] }
 *               admin_notes: { type: string }
 *               assigned_to: { type: string, description: Admin user ID }
 *     responses:
 *       200:
 *         description: Contact updated
 */
router.patch('/:id', async (req, res) => {
  const data = await svc.updateContact(req.params.id, req.body);
  R.success(res, data, 'Contact updated');
});

module.exports = router;