'use strict';

const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  user:            { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  user_role:       { type: String },
  action:          { type: String, required: true },
  resource:        { type: String, required: true },
  resource_id:     { type: mongoose.Schema.Types.ObjectId },
  ip_address:      { type: String },
  user_agent:      { type: String },
  request_body:    { type: mongoose.Schema.Types.Mixed },
  response_status: { type: Number },
  timestamp:       { type: Date, default: Date.now },
});

// Fast queries by user and time
auditLogSchema.index({ user: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, resource: 1 });
auditLogSchema.index({ timestamp: -1 });

// Auto-delete audit logs after 90 days (GDPR / storage management)
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('AuditLog', auditLogSchema);