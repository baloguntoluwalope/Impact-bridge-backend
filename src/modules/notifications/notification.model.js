'use strict';

const mongoose = require('mongoose');

const notifSchema = new mongoose.Schema({
  user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title:          { type: String, required: true },
  body:           { type: String, required: true },
  type:           { type: String, required: true },
  data:           { type: mongoose.Schema.Types.Mixed },
  channel:        { type: String, enum: ['email','sms','push','in_app'] },
  is_read:        { type: Boolean, default: false },
  read_at:        { type: Date },
  failed:         { type: Boolean, default: false },
  failure_reason: { type: String },
}, { timestamps: true });

notifSchema.index({ user: 1, is_read: 1 });
notifSchema.index({ user: 1, created_at: -1 });

module.exports = mongoose.model('Notification', notifSchema);