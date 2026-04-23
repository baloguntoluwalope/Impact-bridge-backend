'use strict';

const mongoose  = require('mongoose');
const { slugify } = require('../../utils/helpers');

const ngoSchema = new mongoose.Schema({
  name:                { type: String, required: true, trim: true },
  slug:                { type: String, unique: true },
  description:         { type: String },
  logo:                { type: String },
  contact_email:       { type: String },
  contact_phone:       { type: String },
  website:             { type: String },
  registration_number: { type: String },
  states_of_operation: [{ type: String }],
  sdg_focus:           [{ type: Number, min: 1, max: 17 }],
  is_verified:         { type: Boolean, default: false },
  verified_at:         { type: Date },
  verified_by:         { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  is_active:           { type: Boolean, default: true },
  admin_users:         [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  total_cases_handled: { type: Number, default: 0 },
  total_completed:     { type: Number, default: 0 },
}, { timestamps: true });

ngoSchema.index({ slug: 1 }, { unique: true });
ngoSchema.index({ is_verified: 1, is_active: 1 });

ngoSchema.pre('save', function (next) {
  if (this.isNew && this.name && !this.slug) {
    this.slug = slugify(this.name);
  }
  next();
});

module.exports = mongoose.model('NGO', ngoSchema);