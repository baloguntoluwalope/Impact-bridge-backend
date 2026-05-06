'use strict';

const mongoose = require('mongoose');

const SDG_MAP = {
  no_poverty:1, zero_hunger:2, good_health:3, quality_education:4,
  gender_equality:5, clean_water:6, affordable_energy:7, decent_work:8,
  industry_innovation:9, reduced_inequalities:10, sustainable_cities:11,
  responsible_consumption:12, climate_action:13, life_below_water:14,
  life_on_land:15, peace_justice:16, partnerships:17,
};

const mediaSchema = new mongoose.Schema({
  url:         { type: String, required: true },
  public_id:   { type: String },
  type:        { type: String, enum: ['image','video','audio','document'] },
  caption:     { type: String },
  uploaded_at: { type: Date, default: Date.now },
}, { _id: false });

const progressSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: { type: String, required: true },
  media:       [mediaSchema],
  updated_by:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at:  { type: Date, default: Date.now },
});

const requestSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, required: true, maxlength: 5000 },
  category:    { type: String, enum: Object.keys(SDG_MAP), required: true },
  sdg_number:  { type: Number, min: 1, max: 17 },
  fund_type: {
    type:    String,
    enum:    ['case_funding','student_sponsorship','school_funding','community_project','sdg_club','general_impact'],
    default: 'case_funding',
  },
  requester:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requester_type: { type: String, enum: ['individual','student','school','community','ngo'], required: true },

  state:       { type: String, required: true },
  lga:         { type: String, required: true },
  address:     { type: String },
  coordinates: { lat: { type: Number }, lng: { type: Number } },

  /* ── Funding ───────────────────────────────────────────────
     amount_needed  = original requester ask (never changes after submission)
     amount_raised  = what donors have contributed so far
     Donors fund towards fees.total_funding_target (if fees calculated)
     or amount_needed (if not yet approved)
  ─────────────────────────────────────────────────────────── */
  amount_needed:    { type: Number, required: true },
  amount_raised:    { type: Number, default: 0 },
  amount_disbursed: { type: Number, default: 0 },
  donor_count:      { type: Number, default: 0 },

  /* ── Fees (locked at approval time) ────────────────────────
     Calculated once when admin verifies/approves the request.
     Added on top of amount_needed so requester gets full amount.
  ─────────────────────────────────────────────────────────── */
  fees: {
    original_amount:        { type: Number },          // snapshot of amount_needed
    ngo_execution_fee:      { type: Number, default: 0 },
    ngo_execution_fee_pct:  { type: Number, default: 10 },
    platform_fee:           { type: Number, default: 0 },
    platform_fee_pct:       { type: Number, default: 5 },
    total_funding_target:   { type: Number },          // shown to donors
    calculated_at:          { type: Date },
    calculated_by:          { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },

  status: {
    type:    String,
    enum:    ['draft','submitted','under_review','verified','rejected','funded','in_progress','completed','cancelled'],
    default: 'draft',
  },
  urgency:             { type: String, enum: ['low','medium','high','critical'], default: 'medium' },
  beneficiaries_count: { type: Number, default: 1 },

  media: [mediaSchema],

  verification: {
    verified_by:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verified_at:      { type: Date },
    rejected_by:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejected_at:      { type: Date },
    rejection_reason: { type: String },
    notes:            [{ type: String }],
    fraud_score:      { type: Number, default: 0 },
    ai_check:         { type: mongoose.Schema.Types.Mixed },
    ai_final:         { type: mongoose.Schema.Types.Mixed },
  },

  assigned_ngo:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  progress_updates:  [progressSchema],
  ngo_field_reports: [progressSchema],
  completion_proof:  [mediaSchema],
  completed_at:      { type: Date },

  is_visible:  { type: Boolean, default: false },
  is_featured: { type: Boolean, default: false },
  is_archived: { type: Boolean, default: false },
  views:       { type: Number, default: 0 },

  tags:             [{ type: String }],
  impact_statement: { type: String, maxlength: 500 },
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

// ── Indexes ───────────────────────────────────────────────────────
requestSchema.index({ status: 1, is_visible: 1 });
requestSchema.index({ requester: 1 });
requestSchema.index({ state: 1, lga: 1 });
requestSchema.index({ category: 1 });
requestSchema.index({ sdg_number: 1 });
requestSchema.index({ createdAt: -1 });
requestSchema.index({ amount_raised: -1 });
requestSchema.index({ is_featured: 1, status: 1 });
requestSchema.index({ 'fees.total_funding_target': 1 });
requestSchema.index({ '$**': 'text' });

// ── Virtuals ──────────────────────────────────────────────────────
// The target donors fund towards
requestSchema.virtual('funding_target').get(function () {
  return this.fees?.total_funding_target || this.amount_needed;
});

// Progress % against total_funding_target (or amount_needed if not yet approved)
requestSchema.virtual('funding_percentage').get(function () {
  const target = this.fees?.total_funding_target || this.amount_needed;
  return target > 0 ? Math.min(Math.round((this.amount_raised / target) * 100), 100) : 0;
});

requestSchema.virtual('is_fully_funded').get(function () {
  const target = this.fees?.total_funding_target || this.amount_needed;
  return this.amount_raised >= target;
});

requestSchema.virtual('fees_calculated').get(function () {
  return !!(this.fees?.total_funding_target && this.fees?.calculated_at);
});

// ── Hook ──────────────────────────────────────────────────────────
requestSchema.pre('save', function () {
  if (this.category && SDG_MAP[this.category]) {
    this.sdg_number = SDG_MAP[this.category];
  }
});

module.exports = mongoose.model('Request', requestSchema);