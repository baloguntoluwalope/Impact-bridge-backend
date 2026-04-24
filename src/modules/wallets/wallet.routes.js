'use strict';

const router = require('express').Router();
const ctrl   = require('./wallet.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const auditLog = require('../../middleware/auditLog');

/**
 * @swagger
 * tags:
 *   - name: Wallets
 *     description: Escrow wallet system — every naira is traceable and auditable
 */

router.use(authenticate);

/**
 * @swagger
 * /wallets/all:
 *   get:
 *     summary: Get all wallets (admin only)
 *     tags: [Wallets]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - in: query
 *         name: wallet_type
 *         schema:
 *           type: string
 *           enum: [case_wallet, project_wallet, general_fund, emergency_pool, sdg_pool]
 *     responses:
 *       200:
 *         description: All wallets
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */

// router.get('/', authorize('super_admin'), ctrl.getAllWallets);


/**
 * @swagger
 * /wallets/general-fund:
 *   get:
 *     summary: Get the general impact fund wallet (admin only)
 *     tags: [Wallets]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: General fund wallet
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Wallet'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/general-fund', authorize('super_admin'), ctrl.getGeneralFund);

/**
 * @swagger
 * /wallets/request/{requestId}:
 *   get:
 *     summary: Get wallet for a specific request
 *     description: Accessible by the request owner, assigned NGO, or admin.
 *     tags: [Wallets]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: string
 *         description: The request ID
 *     responses:
 *       200:
 *         description: Wallet data
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Wallet'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/request/:requestId', ctrl.getByRequest);

/**
 * @swagger
 * /wallets/project/{projectId}:
 *   get:
 *     summary: Get wallet for a specific project
 *     tags: [Wallets]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Project wallet
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/project/:projectId', authorize('super_admin', 'ngo_partner', 'corporate', 'government_official'), ctrl.getByProject);

/**
 * @swagger
 * /wallets/{walletId}/transactions:
 *   get:
 *     summary: Get transaction history for a wallet
 *     tags: [Wallets]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [credit, debit, allocation, refund, reversal]
 *     responses:
 *       200:
 *         description: Transaction history
 */
router.get('/:walletId/transactions', ctrl.getTransactions);

/**
 * @swagger
 * /wallets/{walletId}/allocate:
 *   post:
 *     summary: Allocate funds for disbursement (admin only)
 *     description: Moves funds from available_balance to allocated_funds. Funds must be allocated before they can be expended.
 *     tags: [Wallets]
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
 *             required: [amount, description]
 *             properties:
 *               amount:
 *                 type: number
 *                 minimum: 1
 *                 example: 100000
 *               description:
 *                 type: string
 *                 example: Allocation for roofing materials procurement
 *     responses:
 *       200:
 *         description: Funds allocated successfully
 *       400:
 *         description: Insufficient balance or wallet is frozen
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/:walletId/allocate', authorize('super_admin'), auditLog('ALLOCATE', 'Wallet'), ctrl.allocate);

/**
 * @swagger
 * /wallets/{walletId}/expend:
 *   post:
 *     summary: Record an expenditure from allocated funds (admin only)
 *     description: Records actual spending. Amount is deducted from allocated_funds and added to spent_funds.
 *     tags: [Wallets]
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
 *             required: [amount, description]
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 75000
 *               description:
 *                 type: string
 *                 example: Payment to Chisom Roofing Ltd Invoice 2451
 *               reference:
 *                 type: string
 *                 example: BANK-TRF-20240115-001
 *                 description: Bank transfer or receipt reference number
 *     responses:
 *       200:
 *         description: Expenditure recorded successfully
 *       400:
 *         description: Amount exceeds allocated funds
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/:walletId/expend', authorize('super_admin'), auditLog('EXPEND', 'Wallet'), ctrl.expend);

/**
 * @swagger
 * /wallets/{walletId}/freeze:
 *   post:
 *     summary: Freeze a wallet (admin only)
 *     description: Prevents any further transactions. Used during fraud investigations.
 *     tags: [Wallets]
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
 *                 example: Fraud investigation initiated by compliance team
 *     responses:
 *       200:
 *         description: Wallet frozen successfully
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/:walletId/freeze', authorize('super_admin'), auditLog('FREEZE', 'Wallet'), ctrl.freeze);

/**
 * @swagger
 * /wallets/{walletId}/unfreeze:
 *   post:
 *     summary: Unfreeze a wallet (admin only)
 *     tags: [Wallets]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Wallet unfrozen successfully
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/:walletId/unfreeze', authorize('super_admin'), auditLog('UNFREEZE', 'Wallet'), ctrl.unfreeze);

module.exports = router;