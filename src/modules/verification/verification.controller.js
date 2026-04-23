'use strict';

const svc = require('./verification.service');
const R   = require('../../utils/apiResponse');

module.exports = {
  getPending: async (req, res) => {
    const { requests, pagination } = await svc.getPendingVerifications(req.query);
    R.paginated(res, requests, pagination, 'Pending verification queue');
  },

  setUnderReview: async (req, res) => {
    const data = await svc.setUnderReview(req.params.id, req.user._id);
    R.success(res, data, 'Request moved to under review');
  },

  approve: async (req, res) => {
    const data = await svc.approveRequest(req.params.id, req.user._id, req.body);
    R.success(res, data, 'Request approved and published to donors');
  },

  reject: async (req, res) => {
    const data = await svc.rejectRequest(req.params.id, req.user._id, req.body);
    R.success(res, data, 'Request rejected');
  },

  requestMoreInfo: async (req, res) => {
    const data = await svc.requestMoreInfo(req.params.id, req.user._id, req.body);
    R.success(res, null, data.message);
  },

  flagForFraud: async (req, res) => {
    const data = await svc.flagForFraud(req.params.id, req.user._id, req.body);
    R.success(res, null, data.message);
  },

  getStats: async (req, res) => {
    const data = await svc.getVerificationStats();
    R.success(res, data, 'Verification statistics');
  },
};