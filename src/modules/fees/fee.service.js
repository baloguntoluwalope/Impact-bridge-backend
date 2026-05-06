'use strict';

/**
 * fee.service.js
 *
 * Self-contained fee calculation — no external dependencies beyond the Request model.
 *
 * Fee rates (configurable via .env):
 *   NGO_EXECUTION_FEE_PCT  — default 10%
 *   PLATFORM_FEE_PCT       — default  5%
 *
 * amount_needed       = original requester amount (never changes)
 * total_amount_needed = amount_needed + ngo_fee + platform_fee  (donor-facing goal)
 */

const Request  = require('../requests/request.model');
const ApiError = require('../../utils/apiError');

/* ── Fee rates ─────────────────────────────────────────────── */
const FEE_CONFIG = {
  ngo_execution_pct: parseFloat(process.env.NGO_EXECUTION_FEE_PCT) || 10,
  platform_pct:      parseFloat(process.env.PLATFORM_FEE_PCT)      || 5,
};

/* ── Pure calculation (no DB, no external libs) ─────────────── */
const calculateFees = (originalAmount) => {
  const amount       = Math.round(Number(originalAmount) || 0);
  const ngo_fee      = Math.round(amount * (FEE_CONFIG.ngo_execution_pct / 100));
  const platform_fee = Math.round(amount * (FEE_CONFIG.platform_pct / 100));
  const total_fees   = ngo_fee + platform_fee;

  return {
    original_amount:       amount,
    ngo_execution_fee:     ngo_fee,
    ngo_execution_fee_pct: FEE_CONFIG.ngo_execution_pct,
    platform_fee,
    platform_fee_pct:      FEE_CONFIG.platform_pct,
    total_fees,
    total_fee_pct:         FEE_CONFIG.ngo_execution_pct + FEE_CONFIG.platform_pct,
    total_amount_needed:   amount + total_fees,
    calculated_at:         new Date(),
    applied:               false,
  };
};

/* ── Apply fees to request (called automatically on verification) ─ */
const applyFeesToRequest = async (requestId, ngoUserId = null) => {
  const request = await Request.findById(requestId);
  if (!request) throw ApiError.notFound('Request not found');

  // Already applied — return existing, don't overwrite
  if (request.fee_breakdown?.applied) {
    return { fee_breakdown: request.fee_breakdown, already_applied: true };
  }

  const breakdown = {
    ...calculateFees(request.amount_needed),
    applied:        true,
    applied_at:     new Date(),
    applied_by_ngo: ngoUserId || null,
  };

  await Request.findByIdAndUpdate(requestId, {
    fee_breakdown:       breakdown,
    total_amount_needed: breakdown.total_amount_needed,
  });

  return { fee_breakdown: breakdown, already_applied: false };
};

/* ── Preview fees without saving ───────────────────────────── */
const getFeePreview = async (requestId) => {
  const request = await Request.findById(requestId)
    .select('title amount_needed fee_breakdown').lean();
  if (!request) throw ApiError.notFound('Request not found');

  // Already applied — return actual, not a preview
  if (request.fee_breakdown?.applied) {
    return { preview: false, fee_breakdown: request.fee_breakdown };
  }

  return {
    preview:         true,
    title:           request.title,
    original_amount: request.amount_needed,
    fee_breakdown:   calculateFees(request.amount_needed),
  };
};

/* ── Remove fees (on rejection after fees were applied) ─────── */
const removeFeesFromRequest = async (requestId) => {
  const request = await Request.findById(requestId)
    .select('amount_needed fee_breakdown').lean();
  if (!request || !request.fee_breakdown?.applied) return { removed: false };

  await Request.findByIdAndUpdate(requestId, {
    $unset:              { fee_breakdown: '' },
    total_amount_needed: request.amount_needed,  // reset to original
  });

  return { removed: true };
};

module.exports = {
  calculateFees,
  applyFeesToRequest,
  getFeePreview,
  removeFeesFromRequest,
  FEE_CONFIG,
};