'use strict';

const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  type:          { type: String, enum: ['credit','debit','allocation','refund','reversal'], required: true },
  amount:        { type: Number, required: true },
  reference:     { type: String },
  description:   { type: String },
  payment:       { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
  performed_by:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  balance_after: { type: Number },
  created_at:    { type: Date, default: Date.now },
}, { _id: true });

const walletSchema = new mongoose.Schema({
  request:  { type: mongoose.Schema.Types.ObjectId, ref: 'Request', default: null },
  project:  { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
  wallet_type: {
    type:     String,
    enum:     ['case_wallet','project_wallet','general_fund','emergency_pool','sdg_pool'],
    required: true,
  },
  reference:        { type: String, unique: true, required: true },
  currency:         { type: String, default: 'NGN' },
  total_received:   { type: Number, default: 0 },
  allocated_funds:  { type: Number, default: 0 },
  spent_funds:      { type: Number, default: 0 },
  available_balance:{ type: Number, default: 0 },
  is_frozen:        { type: Boolean, default: false },
  freeze_reason:    { type: String },
  frozen_by:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  frozen_at:        { type: Date },
  transactions:     [transactionSchema],
  metadata:         { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

// walletSchema.index({ request: 1 });
// walletSchema.index({ project: 1 });
// walletSchema.index({ wallet_type: 1 });
// walletSchema.index({ reference: 1 }, { unique: true });

walletSchema.virtual('remaining_balance').get(function () {
  return this.total_received - this.spent_funds;
});

walletSchema.virtual('utilization_rate').get(function () {
  return this.total_received > 0
    ? Math.round((this.spent_funds / this.total_received) * 100)
    : 0;
});

module.exports = mongoose.model('Wallet', walletSchema);