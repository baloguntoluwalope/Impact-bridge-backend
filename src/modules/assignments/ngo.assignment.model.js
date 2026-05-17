'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * NgoAssignment
 *
 * Tracks when an admin assigns a verified NGO to a request for:
 *   - field_verification: NGO visits the site and submits a verification report
 *   - execution:          NGO executes a funded project and submits progress reports
 *
 * Assignment lifecycle:
 *   assigned → accepted → in_progress → report_submitted → completed
 *                       → declined (NGO declines)
 *                       → reassigned (admin reassigns to different NGO)
 *                       → overdue (deadline passed without completion)
 */
const ngoAssignmentSchema = new Schema(
  {
    /* ── Core references ──────────────────────────────────── */
    request: {
      type:     Schema.Types.ObjectId,
      ref:      'Request',
      required: true,
      index:    true,
    },
    ngo: {
      type:     Schema.Types.ObjectId,
      ref:      'User',            // The NGO user account
      required: true,
      index:    true,
    },
    assigned_by: {
      type:     Schema.Types.ObjectId,
      ref:      'User',            // The admin who made the assignment
      required: true,
    },

    /* ── Assignment type ─────────────────────────────────── */
    type: {
      type:     String,
      enum:     ['field_verification', 'execution'],
      required: true,
    },

    /* ── Status ──────────────────────────────────────────── */
    status: {
      type:    String,
      enum:    ['assigned', 'accepted', 'declined', 'in_progress', 'report_submitted', 'completed', 'reassigned', 'overdue'],
      default: 'assigned',
      index:   true,
    },

    /* ── Instructions from admin ─────────────────────────── */
    instructions: {
      type:      String,
      maxlength: 2000,
    },

    /* ── Deadline ─────────────────────────────────────────── */
    deadline: {
      type:     Date,
      required: true,
      index:    true,
    },

    /* ── NGO acceptance ──────────────────────────────────── */
    accepted_at:       Date,
    declined_at:       Date,
    decline_reason:    String,

    /* ── Report submitted by NGO ─────────────────────────── */
    report: {
      submitted_at: Date,

      // Field verification report fields
      site_visited:         { type: Boolean, default: false },
      visit_date:           Date,
      beneficiaries_confirmed: Number,
      location_confirmed:   { type: Boolean, default: false },
      needs_confirmed:      { type: Boolean, default: false },
      fraud_risk:           { type: String, enum: ['none', 'low', 'medium', 'high'], default: 'none' },
      recommendation:       { type: String, enum: ['approve', 'reject', 'more_info', 'pending'], default: 'pending' },

      // Narrative report (both types)
      summary:     { type: String, maxlength: 3000 },
      findings:    { type: String, maxlength: 3000 },
      challenges:  { type: String, maxlength: 2000 },
      next_steps:  { type: String, maxlength: 2000 },

      // Media evidence (photos, videos, documents)
      media: [{
        url:         String,
        public_id:   String,
        type:        { type: String, enum: ['image', 'video', 'document'] },
        caption:     String,
        uploaded_at: { type: Date, default: Date.now },
      }],

      // GPS coordinates of site visit
      gps_coordinates: {
        lat: Number,
        lng: Number,
      },
    },

    /* ── Admin review of report ──────────────────────────── */
    report_review: {
      reviewed_by:  { type: Schema.Types.ObjectId, ref: 'User' },
      reviewed_at:  Date,
      accepted:     Boolean,
      feedback:     String,
    },

    /* ── Reminder tracking ───────────────────────────────── */
    reminders_sent: { type: Number, default: 0 },
    last_reminder_at: Date,

    /* ── Completion ──────────────────────────────────────── */
    completed_at: Date,
    completed_by: { type: Schema.Types.ObjectId, ref: 'User' },

    /* ── Access tracking ─────────────────────────────────── */
    last_accessed_at: Date,   // set when NGO opens the assignment detail

    /* ── Reassignment ────────────────────────────────────── */
    previous_ngo:     { type: Schema.Types.ObjectId, ref: 'User' },
    reassigned_at:    Date,
    reassignment_reason: String,
  },
  {
    timestamps: true,
    toJSON:  { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* ── Indexes ──────────────────────────────────────────────── */
ngoAssignmentSchema.index({ ngo: 1, status: 1 });
ngoAssignmentSchema.index({ request: 1, type: 1 });
ngoAssignmentSchema.index({ deadline: 1, status: 1 });

/* ── Virtuals ─────────────────────────────────────────────── */
ngoAssignmentSchema.virtual('is_overdue').get(function () {
  return (
    !['completed', 'report_submitted', 'reassigned', 'declined'].includes(this.status) &&
    this.deadline < new Date()
  );
});

ngoAssignmentSchema.virtual('days_remaining').get(function () {
  const diff = this.deadline - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

module.exports = mongoose.models.NgoAssignment || mongoose.model('NgoAssignment', ngoAssignmentSchema);