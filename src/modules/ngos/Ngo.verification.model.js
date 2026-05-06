'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * NGO Verification Application
 *
 * Tracks the full lifecycle of an NGO's verification request:
 *   submitted → under_review → documents_verified → interview_scheduled
 *   → approved | rejected | suspended
 *
 * Only approved NGOs:
 *  - Can be assigned to requests for field verification
 *  - Can be assigned for project execution
 *  - Can access donor contact info
 *  - Can receive fund disbursements
 *
 * All NGOs (regardless of status) can:
 *  - Post projects
 *  - View public requests
 */
const ngoVerificationSchema = new Schema(
  {
    /* ── Identity ─────────────────────────────────────────── */
    ngo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,           // One active application per NGO at a time
    },

    /* ── Application status ───────────────────────────────── */
    status: {
      type: String,
      enum: [
        'draft',
        'submitted',
        'under_review',
        'documents_verified',
        'interview_scheduled',
        'approved',
        'rejected',
        'suspended',
      ],
      default: 'draft',
      index: true,
    },

    /* ── Organisation profile ─────────────────────────────── */
    organisation: {
      legal_name:      { type: String, required: true, trim: true },
      trading_name:    { type: String, trim: true },
      registration_no: { type: String, required: true, trim: true },
      year_founded:    { type: Number, min: 1800, max: new Date().getFullYear() },
      website:         { type: String, trim: true },
      hq_state:        { type: String, trim: true },
      hq_lga:          { type: String, trim: true },
      hq_address:      { type: String, trim: true },
      staff_count:     { type: Number, min: 0 },
      volunteer_count: { type: Number, min: 0 },
      annual_budget:   { type: Number, min: 0 },       // NGN
      phone:           { type: String, trim: true },
      contact_email:   { type: String, trim: true, lowercase: true },
    },

    /* ── SDG focus areas ──────────────────────────────────── */
    sdg_focus: [{
      type: String,
      enum: [
        'no_poverty', 'zero_hunger', 'good_health', 'quality_education',
        'gender_equality', 'clean_water', 'clean_energy', 'decent_work',
        'industry_innovation', 'reduced_inequalities', 'sustainable_cities',
        'responsible_consumption', 'climate_action', 'life_below_water',
        'life_on_land', 'peace_justice', 'partnerships',
      ],
    }],

    /* ── Operational states ───────────────────────────────── */
    operational_states: [{ type: String }],   // Nigerian states where NGO operates

    /* ── Documents ────────────────────────────────────────── */
    documents: {
      // CAC / Corporate Affairs Commission certificate
      cac_certificate: {
        url:         String,
        public_id:   String,
        uploaded_at: Date,
        verified:    { type: Boolean, default: false },
      },
      // Tax clearance certificate
      tax_clearance: {
        url:         String,
        public_id:   String,
        uploaded_at: Date,
        verified:    { type: Boolean, default: false },
      },
      // Most recent annual report
      annual_report: {
        url:         String,
        public_id:   String,
        uploaded_at: Date,
        verified:    { type: Boolean, default: false },
      },
      // Constitution / founding document
      constitution: {
        url:         String,
        public_id:   String,
        uploaded_at: Date,
        verified:    { type: Boolean, default: false },
      },
      // Board resolution approving the partnership application
      board_resolution: {
        url:         String,
        public_id:   String,
        uploaded_at: Date,
        verified:    { type: Boolean, default: false },
      },
      // Audited financial statements (last 2 years)
      financial_statements: [{
        url:         String,
        public_id:   String,
        year:        Number,
        uploaded_at: Date,
      }],
      // Proof of past projects (photos, reports, media)
      project_evidence: [{
        url:         String,
        public_id:   String,
        type:        { type: String, enum: ['image', 'video', 'document', 'other'] },
        caption:     String,
        uploaded_at: Date,
      }],
      // Any additional supporting documents
      additional: [{
        url:         String,
        public_id:   String,
        label:       String,
        uploaded_at: Date,
      }],
    },

    /* ── Past projects ────────────────────────────────────── */
    past_projects: [{
      title:            { type: String, required: true },
      description:      String,
      location:         String,
      year:             Number,
      beneficiaries:    Number,
      budget_ngn:       Number,
      donor_or_funder:  String,      // Who funded it
      outcome:          String,      // Key outcome / impact metric
      sdg_category:     String,
    }],

    /* ── References ───────────────────────────────────────── */
    references: [{
      name:         { type: String, required: true },
      organisation: String,
      role:         String,
      email:        String,
      phone:        String,
      relationship: String,           // e.g. "Former funder", "Community partner"
    }],

    /* ── Partnership questionnaire ────────────────────────── */
    questionnaire: {
      // Why do you want to partner with Pathbridge?
      why_partner: { type: String, maxlength: 2000 },

      // Describe your field verification capacity
      field_capacity: { type: String, maxlength: 2000 },

      // How do you ensure accountability with funds?
      accountability_approach: { type: String, maxlength: 2000 },

      // What is your safeguarding / child protection policy?
      safeguarding_policy: { type: String, maxlength: 2000 },

      // Describe a project where you faced a major challenge
      challenge_example: { type: String, maxlength: 2000 },

      // Have you ever had funds mismanaged or a project fail? Explain.
      past_failures: { type: String, maxlength: 1000 },

      // What states/LGAs can your team physically reach within 48 hours?
      geographic_reach: { type: String, maxlength: 1000 },

      // Do you have vehicles / logistics infrastructure?
      logistics_infrastructure: { type: Boolean, default: false },
      logistics_details:        { type: String, maxlength: 500 },

      // Can you provide monthly progress reports?
      can_report_monthly: { type: Boolean, default: false },

      // Have you been investigated or sanctioned by any regulatory body?
      regulatory_issues: { type: Boolean, default: false },
      regulatory_details: { type: String, maxlength: 500 },

      // Social media / online presence
      social_media: {
        facebook:  String,
        twitter:   String,
        instagram: String,
        linkedin:  String,
        youtube:   String,
      },
    },

    /* ── Admin review ─────────────────────────────────────── */
    review: {
      assigned_reviewer: { type: Schema.Types.ObjectId, ref: 'User' },
      started_at:        Date,
      completed_at:      Date,

      // Document check scores / notes per doc type
      document_notes: [{
        document_type: String,
        note:          String,
        flagged:       { type: Boolean, default: false },
        reviewed_by:   { type: Schema.Types.ObjectId, ref: 'User' },
        reviewed_at:   Date,
      }],

      // Overall fraud / risk score (0–100, lower = lower risk)
      risk_score:   { type: Number, min: 0, max: 100, default: 0 },

      // Internal admin notes timeline
      notes: [{
        note:       String,
        added_by:   { type: Schema.Types.ObjectId, ref: 'User' },
        added_at:   { type: Date, default: Date.now },
      }],

      // Interview details
      interview_date:    Date,
      interview_medium:  { type: String, enum: ['video_call', 'phone', 'in_person'] },
      interview_notes:   String,
      interview_outcome: { type: String, enum: ['pass', 'fail', 'pending'] },

      // Final decision
      approved_by:       { type: Schema.Types.ObjectId, ref: 'User' },
      approved_at:       Date,
      rejected_by:       { type: Schema.Types.ObjectId, ref: 'User' },
      rejected_at:       Date,
      rejection_reason:  String,

      // Suspension
      suspended_by:     { type: Schema.Types.ObjectId, ref: 'User' },
      suspended_at:     Date,
      suspension_reason: String,
    },

    /* ── Verification tier (post-approval) ───────────────── */
    // Tier 1 = basic verified, Tier 2 = trusted partner, Tier 3 = strategic partner
    verification_tier: {
      type: Number,
      enum: [1, 2, 3],
      default: 1,
    },

    /* ── Permissions (derived from status + tier) ─────────── */
    permissions: {
      can_verify_requests:   { type: Boolean, default: false }, // Assigned to verify field
      can_execute_projects:  { type: Boolean, default: false }, // Assigned for execution
      can_receive_funds:     { type: Boolean, default: false }, // Wallet disbursements
      can_access_donor_info: { type: Boolean, default: false }, // See donor contacts
      max_concurrent_cases:  { type: Number, default: 0 },      // 0 = unlimited for tier 3
    },

    /* ── Reapplication ────────────────────────────────────── */
    reapplication_allowed_at: Date,          // Set when rejected to enforce cooldown
    reapplication_count:      { type: Number, default: 0 },

    /* ── Submission ───────────────────────────────────────── */
    submitted_at: Date,
    declaration_agreed: { type: Boolean, default: false },  // NGO agreed to T&Cs
    declaration_agreed_at: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* ── Indexes ──────────────────────────────────────────────── */
ngoVerificationSchema.index({ ngo: 1, status: 1 });
ngoVerificationSchema.index({ status: 1, createdAt: -1 });
ngoVerificationSchema.index({ 'organisation.hq_state': 1 });
ngoVerificationSchema.index({ sdg_focus: 1 });

/* ── Virtuals ─────────────────────────────────────────────── */
ngoVerificationSchema.virtual('is_approved').get(function () {
  return this.status === 'approved';
});

ngoVerificationSchema.virtual('documents_complete').get(function () {
  const d = this.documents;
  return !!(d.cac_certificate?.url && d.annual_report?.url && d.constitution?.url);
});

ngoVerificationSchema.virtual('questionnaire_complete').get(function () {
  const q = this.questionnaire;
  return !!(
    q.why_partner &&
    q.field_capacity &&
    q.accountability_approach &&
    q.safeguarding_policy
  );
});

/* ── Pre-save: set permissions on approval ────────────────── */
ngoVerificationSchema.pre('save', function (next) {
  if (this.isModified('status') && this.status === 'approved') {
    const tier = this.verification_tier || 1;
    this.permissions = {
      can_verify_requests:   true,
      can_execute_projects:  true,
      can_receive_funds:     true,
      can_access_donor_info: tier >= 2,
      max_concurrent_cases:  tier === 3 ? 0 : tier === 2 ? 10 : 5,
    };
    this.review.approved_at = new Date();
  }

  if (this.isModified('status') && this.status === 'rejected') {
    this.permissions = {
      can_verify_requests:   false,
      can_execute_projects:  false,
      can_receive_funds:     false,
      can_access_donor_info: false,
      max_concurrent_cases:  0,
    };
    // Enforce 90-day reapplication cooldown
    const cooldown = new Date();
    cooldown.setDate(cooldown.getDate() + 90);
    this.reapplication_allowed_at = cooldown;
  }

  next();
});

module.exports =
  mongoose.models.NgoVerification ||
  mongoose.model('NgoVerification', ngoVerificationSchema);