'use strict';

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  first_name:           { type: String, required: true, trim: true, maxlength: 50 },
  last_name:            { type: String, required: true, trim: true, maxlength: 50 },
  email:                { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone:                { type: String, required: true, unique: true },
  password:             { type: String, required: true, select: false, minlength: 8 },
  role: {
    type: String,
    enum: ['individual','student','school_admin','community_leader','ngo_partner','donor','government_official','corporate','super_admin'],
    required: true,
  },
  avatar:               { type: String, default: null },
  state:                { type: String, required: true },
  lga:                  { type: String, required: true },
  address:              { type: String },
  bio:                  { type: String, maxlength: 500 },
  organization_name:    { type: String },
  organization_type:    { type: String },

  // Verification flags
  is_email_verified:    { type: Boolean, default: false },
  is_phone_verified:    { type: Boolean, default: false },
  is_identity_verified: { type: Boolean, default: false },

  // Account status
  is_active:            { type: Boolean, default: true },
  is_suspended:         { type: Boolean, default: false },
  suspension_reason:    { type: String },

  // OTP (selected out by default)
  otp:                  { type: String, select: false },
  otp_type:             { type: String, select: false },
  otp_expires:          { type: Date,   select: false },

  // Push notifications
  fcm_token:            { type: String },

  // Activity tracking
  last_login:           { type: Date },
  login_count:          { type: Number, default: 0 },
  password_changed_at:  { type: Date },

  // Donor stats
  total_donated:        { type: Number, default: 0 },
  donation_count:       { type: Number, default: 0 },
  bookmarked_cases:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'Request' }],

  // Profile links
  ngo_profile:          { type: mongoose.Schema.Types.ObjectId, ref: 'NGO' },

  // Notification preferences
  notification_preferences: {
    email: { type: Boolean, default: true },
    sms:   { type: Boolean, default: true },
    push:  { type: Boolean, default: true },
  },
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

// ── Indexes ───────────────────────────────────────────────────────
// userSchema.index({ email: 1 });
// userSchema.index({ phone: 1 });
userSchema.index({ role: 1 });
userSchema.index({ state: 1, lga: 1 });
userSchema.index({ is_active: 1 });

// ── Virtuals ──────────────────────────────────────────────────────
userSchema.virtual('full_name').get(function () {
  return `${this.first_name} ${this.last_name}`;
});

// ── Hooks ─────────────────────────────────────────────────────────
userSchema.pre('save', async function () {
  // If password isn't modified, just return. No 'next' needed.
  if (!this.isModified('password')) return;

  // Hash password
  const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  this.password = await bcrypt.hash(this.password, rounds);
  
  // Track password change
  this.password_changed_at = new Date();
  
  // Mongoose automatically handles the 'next' step here because the function is async
});

// ── Methods ───────────────────────────────────────────────────────
userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);