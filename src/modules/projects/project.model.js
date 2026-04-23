'use strict';

const mongoose = require('mongoose');

const milestoneSchema = new mongoose.Schema({
  title:            { type: String, required: true },
  description:      { type: String },
  target_date:      { type: Date },
  amount_allocated: { type: Number, default: 0 },
  status:           { type: String, enum: ['pending','in_progress','completed','delayed'], default: 'pending' },
  completed_at:     { type: Date },
  proof_media:      [{ url: String, type: String, caption: String }],
  completion_note:  { type: String },
});

const reportSchema = new mongoose.Schema({
  title:                 { type: String, required: true },
  body:                  { type: String, required: true },
  submitted_by:          { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  media:                 [{ url: String, type: String, caption: String }],
  period_from:           { type: Date },
  period_to:             { type: Date },
  beneficiaries_reached: { type: Number, default: 0 },
  created_at:            { type: Date, default: Date.now },
});

const projectSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, required: true },

  created_by:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  creator_type: { type: String, enum: ['ngo','corporate','government','admin'], required: true },

  sdg_goals:  [{ type: Number, min: 1, max: 17 }],
  categories: [{ type: String }],

  state:         { type: String, required: true },
  lga:           { type: String },
  target_states: [{ type: String }],

  beneficiaries_target: { type: Number, required: true },
  beneficiaries_reached:{ type: Number, default: 0 },

  total_budget:  { type: Number, required: true },
  amount_funded: { type: Number, default: 0 },

  status: {
    type:    String,
    enum:    ['draft','pending_approval','approved','rejected','funding','funded','in_progress','completed','cancelled'],
    default: 'draft',
  },

  start_date:   { type: Date },
  end_date:     { type: Date },
  completed_at: { type: Date },

  budget_document:  { type: String },
  proposal_document:{ type: String },
  media:            [{ url: String, type: String, caption: String }],
  completion_proof: [{ url: String, type: String, caption: String }],

  executing_ngo: { type: mongoose.Schema.Types.ObjectId, ref: 'NGO' },
  milestones:    [milestoneSchema],
  reports:       [reportSchema],

  approved_by:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approved_at:      { type: Date },
  rejection_reason: { type: String },

  wallet:     { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet' },
  is_featured:{ type: Boolean, default: false },
  is_public:  { type: Boolean, default: false },

  tags:             [{ type: String }],
  impact_statement: { type: String },
}, { timestamps: true, toJSON: { virtuals: true } });

projectSchema.index({ status: 1 });
projectSchema.index({ created_by: 1 });
projectSchema.index({ sdg_goals: 1 });
projectSchema.index({ state: 1 });
projectSchema.index({ created_at: -1 });
projectSchema.index({ is_public: 1, status: 1 });

projectSchema.virtual('funding_percentage').get(function () {
  return this.total_budget > 0
    ? Math.min(Math.round((this.amount_funded / this.total_budget) * 100), 100)
    : 0;
});

projectSchema.virtual('days_remaining').get(function () {
  if (!this.end_date) return null;
  return Math.max(Math.ceil((new Date(this.end_date) - new Date()) / 86400000), 0);
});

module.exports = mongoose.model('Project', projectSchema);