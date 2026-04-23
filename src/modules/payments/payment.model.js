'use strict';

const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  reference:        { type: String, required: true, unique: true, index: true },
  donor:            { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  request:          { type: mongoose.Schema.Types.ObjectId, ref: 'Request', default: null },
  project:          { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
  amount:           { type: Number, required: true },
  currency:         { type: String, default: 'NGN' },
  fund_type: {
    type:     String,
    enum:     ['case_funding','student_sponsorship','school_funding','community_project','sdg_club','general_impact','project_funding'],
    required: true,
  },
  gateway:          { type: String, enum: ['korapay','paystack','flutterwave'], required: true },
  gateway_reference:{ type: String },
  gateway_response: { type: mongoose.Schema.Types.Mixed },
  status: {
    type:    String,
    enum:    ['pending','processing','success','failed','refunded','disputed'],
    default: 'pending',
  },
  is_anonymous:     { type: Boolean, default: false },
  donor_message:    { type: String, maxlength: 500 },
  payment_method:   { type: String },
  failure_reason:   { type: String },
  webhook_verified: { type: Boolean, default: false },
  ip_address:       { type: String },
  metadata:         { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

paymentSchema.index({ donor: 1, status: 1 });
paymentSchema.index({ request: 1, status: 1 });
paymentSchema.index({ status: 1, created_at: -1 });
paymentSchema.index({ gateway: 1 });

module.exports = mongoose.model('Payment', paymentSchema);