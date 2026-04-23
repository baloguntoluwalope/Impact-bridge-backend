'use strict';

const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  email:       { type: String, required: true },
  phone:       { type: String },
  subject:     { type: String, required: true },
  message:     { type: String, required: true },
  type:        { type: String, enum: ['inquiry','case_inquiry','partnership','report','other'], default: 'inquiry' },
  status:      { type: String, enum: ['new','in_progress','resolved','closed'], default: 'new' },
  assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  admin_notes: { type: String },
  resolved_at: { type: Date },
  ip_address:  { type: String },
}, { timestamps: true });

contactSchema.index({ status: 1, created_at: -1 });
contactSchema.index({ email: 1 });

module.exports = mongoose.model('Contact', contactSchema);