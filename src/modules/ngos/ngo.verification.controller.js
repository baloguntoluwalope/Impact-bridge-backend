'use strict';

// ═══════════════════════════════════════════════════════
//  CONTROLLER  —  ngo.verification.controller.js
// ═══════════════════════════════════════════════════════

const svc = require('./ngo.verification.service');
const R   = require('../../utils/apiResponse');

module.exports = {

  /* ── NGO ── */
  getOrCreate: async (req, res) => {
    const data = await svc.getOrCreateApplication(req.user._id);
    R.success(res, data, 'Application retrieved');
  },

  saveProgress: async (req, res) => {
    const data = await svc.saveProgress(req.user._id, req.body);
    R.success(res, data, 'Progress saved');
  },

  uploadDocuments: async (req, res) => {
    const data = await svc.uploadDocuments(
      req.user._id,
      req.params.docType,
      req.files || []
    );
    R.success(res, data, 'Documents uploaded');
  },

  submit: async (req, res) => {
    const data = await svc.submitApplication(req.user._id);
    R.success(res, data, 'Application submitted successfully. You will be notified within 5 business days.');
  },

  getMyApplication: async (req, res) => {
    const data = await svc.getMyApplication(req.user._id);
    R.success(res, data);
  },

  /* ── Admin ── */
  listApplications: async (req, res) => {
    const { data, pagination } = await svc.listApplications(req.query);
    R.paginated(res, data, pagination, 'NGO verification applications');
  },

  getDetail: async (req, res) => {
    const data = await svc.getApplicationDetail(req.params.id);
    R.success(res, data);
  },

  startReview: async (req, res) => {
    const data = await svc.startReview(req.params.id, req.user._id);
    R.success(res, data, 'Review started');
  },

  verifyDocument: async (req, res) => {
    const data = await svc.verifyDocument(
      req.params.id,
      req.user._id,
      req.params.docType,
      req.body
    );
    R.success(res, data, 'Document status updated');
  },

  addNote: async (req, res) => {
    const data = await svc.addReviewNote(req.params.id, req.user._id, req.body.note);
    R.success(res, data, 'Note added');
  },

  scheduleInterview: async (req, res) => {
    const data = await svc.scheduleInterview(req.params.id, req.user._id, req.body);
    R.success(res, data, 'Interview scheduled');
  },

  recordInterview: async (req, res) => {
    const data = await svc.recordInterviewOutcome(req.params.id, req.user._id, req.body);
    R.success(res, data, 'Interview outcome recorded');
  },

  approve: async (req, res) => {
    const data = await svc.approveApplication(req.params.id, req.user._id, req.body);
    R.success(res, data, 'NGO approved and verified');
  },

  reject: async (req, res) => {
    const data = await svc.rejectApplication(req.params.id, req.user._id, req.body);
    R.success(res, data, 'Application rejected');
  },

  suspend: async (req, res) => {
    const data = await svc.suspendNGO(req.params.id, req.user._id, req.body);
    R.success(res, data, 'NGO suspended');
  },

  getStats: async (req, res) => {
    const data = await svc.getStats();
    R.success(res, data);
  },
};