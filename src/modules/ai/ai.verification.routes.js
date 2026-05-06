'use strict';

const svc = require('./ai.verification.service');
const R   = require('../../utils/apiResponse');

/* ── Controller ─────────────────────────────────────────────── */
const ctrl = {
  getAnalysis:  async (req, res) => R.success(res, await svc.getAnalysis(req.params.requestId),                         'AI analysis retrieved'),
  analyse:      async (req, res) => R.success(res, await svc.analyseRequest(req.params.requestId, req.user._id),        'Multi-AI analysis complete'),
  crossCheck:   async (req, res) => R.success(res, await svc.crossCheckNgoReport(req.params.assignmentId),              'Multi-AI cross-check complete'),
  smartAssign:  async (req, res) => R.success(res, await svc.smartAssignNgo(req.params.requestId, req.query.type),      'AI NGO recommendations ready'),
  reverify:     async (req, res) => R.success(res, await svc.fullReverification(req.params.requestId),                  'Multi-AI reverification complete'),
};

/* ── Router ─────────────────────────────────────────────────── */
const router   = require('express').Router();
const { authenticate, authorize } = require('../../middleware/auth');
const auditLog = require('../../middleware/auditLog');

/**
 * @swagger
 * tags:
 *   - name: AI Verification
 *     description: |
 *       Multi-AI powered fraud detection, trust scoring, NGO report cross-checking,
 *       smart NGO matching, and final holistic reverification.
 *
 *       **Three AI providers run in parallel on every request:**
 *       - 🟠 **Anthropic Claude** (claude-sonnet-4-6)
 *       - 🟢 **OpenAI GPT-4o**
 *       - 🔵 **Google Gemini** (gemini-1.5-pro)
 *
 *       Results are merged into a **consensus verdict**:
 *       - Numeric scores are averaged across providers
 *       - Flags and issues are unioned (any flag from any model is kept)
 *       - Recommendations require 2/3 agreement
 *       - Per-provider breakdown is included in every response for admin transparency
 *       - If one provider fails, the remaining two still produce a result
 *
 *       All endpoints are admin-only. Cache TTL: 6 hours.
 *
 *       **Required environment variables:**
 *       ```
 *       ANTHROPIC_API_KEY=sk-ant-...
 *       OPENAI_API_KEY=sk-...
 *       GEMINI_API_KEY=AI...
 *       ```
 */

/**
 * @swagger
 * /ai-verification/{requestId}:
 *   get:
 *     summary: Get cached multi-AI analysis for a request
 *     description: "Returns the most recent consensus analysis. Never re-runs. Returns { analysis: null } if not yet run."
 *     tags: [AI Verification]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Cached consensus analysis or null
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cached:      { type: boolean }
 *                 age_hours:   { type: integer, nullable: true }
 *                 analysed_at: { type: string, format: date-time, nullable: true }
 *                 analysis:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     risk_score:     { type: integer, description: "Consensus average, 0-100" }
 *                     trust_score:    { type: integer, description: "Consensus average, 0-100" }
 *                     recommendation:
 *                       type: string
 *                       enum:
 *                         - approve
 *                         - needs_ngo
 *                         - needs_review
 *                         - high_risk
 *                     flags:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: "Union of all flags from all providers"
 *                     _providers:
 *                       type: object
 *                       properties:
 *                         used:             { type: array, items: { type: string } }
 *                         failed:           { type: array }
 *                         partial_consensus:{ type: boolean }
 *                         individual_scores:{ type: array }
 */
router.get('/:requestId', authenticate, authorize('super_admin', 'admin'), ctrl.getAnalysis);

/**
 * @swagger
 * /ai-verification/{requestId}/analyse:
 *   post:
 *     summary: Run fresh multi-AI analysis (all 3 providers in parallel)
 *     description: |
 *       Runs a fresh 5-layer analysis using **all 3 AI providers simultaneously**:
 *       - Layer 1: Text & story — AI-generated content, manipulation signals
 *       - Layer 2: Documents — sufficiency, missing documents
 *       - Layer 3: Images — suspicious media
 *       - Layer 4: Financials — cost plausibility vs Nigerian market rates
 *       - Layer 5: User history — account age, past submissions
 *
 *       Each provider scores independently. Results are merged:
 *       - Scores averaged, flags unioned, recommendations majority-voted
 *       - `_providers` field shows per-model breakdown for full transparency
 *
 *       **Duration:** 5–15 seconds (parallel calls).
 *       Result cached 6 hours, saved to `request.verification.ai_check`.
 *     tags: [AI Verification]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Consensus analysis with per-provider breakdown
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cached:      { type: boolean, example: false }
 *                 age_hours:   { type: integer, example: 0 }
 *                 analysed_at: { type: string, format: date-time }
 *                 analysis:
 *                   type: object
 *                   properties:
 *                     risk_score:             { type: integer }
 *                     trust_score:            { type: integer }
 *                     confidence:             { type: integer }
 *                     recommendation:         { type: string }
 *                     recommendation_agreement:
 *                       type: string
 *                       enum:
 *                         - full
 *                         - partial
 *                         - none
 *                     admin_notes:            { type: string }
 *                     flags:                  { type: array, items: { type: string } }
 *                     text_analysis:          { type: object }
 *                     document_analysis:      { type: object }
 *                     image_analysis:         { type: object }
 *                     financial_analysis:     { type: object }
 *                     user_risk:              { type: object }
 *                     verification_status:    { type: object }
 *                     _providers:
 *                       type: object
 *                       properties:
 *                         used:              { type: array, items: { type: string }, example: ["claude","openai","gemini"] }
 *                         failed:            { type: array }
 *                         count_used:        { type: integer }
 *                         partial_consensus: { type: boolean }
 *                         individual_scores:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               provider:       { type: string }
 *                               risk_score:     { type: integer }
 *                               trust_score:    { type: integer }
 *                               recommendation: { type: string }
 *                               flags_count:    { type: integer }
 */
router.post(
  '/:requestId/analyse',
  authenticate,
  authorize('super_admin', 'admin'),
  auditLog('AI_ANALYSE', 'Request'),
  ctrl.analyse
);

/**
 * @swagger
 * /ai-verification/{assignmentId}/cross-check:
 *   post:
 *     summary: Multi-AI cross-check of NGO field report vs original request
 *     description: |
 *       All 3 AI providers independently cross-check the NGO's field report against
 *       the original request data. Results are consensus-merged.
 *
 *       Checks: beneficiary count, location, needs, financial consistency, evidence quality.
 *
 *       Saved to `assignment.report.ai_cross_check`.
 *     tags: [AI Verification]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Consensus cross-check result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 consensus:
 *                   type: object
 *                   properties:
 *                     consistency_score:    { type: integer }
 *                     report_authenticity:  { type: integer }
 *                     flags:               { type: array, items: { type: string } }
 *                     risk_assessment:     { type: string }
 *                     final_recommendation:{ type: string }
 *                     ai_verdict:          { type: string }
 *                     _providers:          { type: object }
 *                 providers_used: { type: array, items: { type: string } }
 *       400:
 *         description: No report submitted yet on this assignment
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post(
  '/:assignmentId/cross-check',
  authenticate,
  authorize('super_admin', 'admin'),
  auditLog('AI_CROSS_CHECK', 'NgoAssignment'),
  ctrl.crossCheck
);

/**
 * @swagger
 * /ai-verification/{requestId}/smart-assign:
 *   get:
 *     summary: Multi-AI NGO ranking for a request
 *     description: |
 *       All 3 providers rank verified NGOs by SDG alignment, geography, tier, capacity, and track record.
 *       Primary result uses Claude; per-provider picks are included for transparency.
 *     tags: [AI Verification]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [field_verification, execution], default: field_verification }
 *     responses:
 *       200:
 *         description: Top 3 NGO picks with per-provider breakdown
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 recommendation:  { type: object, nullable: true }
 *                 runner_up:       { type: object, nullable: true }
 *                 third_choice:    { type: object, nullable: true }
 *                 matching_logic:  { type: string }
 *                 total_eligible:  { type: integer }
 *                 provider_picks:
 *                   type: array
 *                   description: What each AI independently recommended
 *                   items:
 *                     type: object
 *                     properties:
 *                       provider: { type: string }
 *                       top_pick: { type: object }
 *                 providers_used: { type: array, items: { type: string } }
 */
router.get('/:requestId/smart-assign', authenticate, authorize('super_admin', 'admin'), ctrl.smartAssign);

/**
 * @swagger
 * /ai-verification/{requestId}/reverify:
 *   post:
 *     summary: Multi-AI full reverification — final holistic verdict
 *     description: |
 *       All 3 AI providers independently review all evidence layers and vote on a final verdict:
 *       - Layer 1: Content analysis consensus (risk/trust scores)
 *       - Layer 2: NGO field report
 *       - Layer 3: Cross-check consensus
 *
 *       Majority vote determines `final_verdict`. Per-provider verdicts included for audit trail.
 *       Saved to `request.verification.ai_final`.
 *     tags: [AI Verification]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Consensus final verdict
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 final_verdict:     { type: string, enum: [approve, reject, escalate] }
 *                 approval_score:    { type: integer, description: "Consensus average 0-100" }
 *                 overall_confidence:
 *                   type: string
 *                   enum:
 *                     - low
 *                     - medium
 *                     - high
 *                 summary:           { type: string }
 *                 conditions:        { type: array, items: { type: string } }
 *                 red_flags:         { type: array, items: { type: string } }
 *                 recommended_disbursement_schedule:
 *                   type: string
 *                   enum:
 *                     - immediate
 *                     - phased
 *                     - hold
 *                 _providers:
 *                   type: object
 *                   properties:
 *                     used:   { type: array }
 *                     failed: { type: array }
 *                     individual_verdicts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           provider:       { type: string }
 *                           final_verdict:  { type: string }
 *                           approval_score: { type: integer }
 */
router.post(
  '/:requestId/reverify',
  authenticate,
  authorize('super_admin'),
  auditLog('AI_REVERIFY', 'Request'),
  ctrl.reverify
);

module.exports = router;