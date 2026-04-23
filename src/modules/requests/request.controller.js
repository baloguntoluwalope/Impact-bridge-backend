'use strict';

const svc = require('./request.service');
const R   = require('../../utils/apiResponse');

module.exports = {
  create: async (req, res) => {
    const data = await svc.createRequest(req.user._id, req.user.role, req.body, req.files || []);
    R.created(res, data, 'Request submitted successfully. It will be reviewed within 48 hours.');
  },

  getVerified: async (req, res) => {
    const { requests, pagination } = await svc.getVerifiedRequests(req.query);
    R.paginated(res, requests, pagination, 'Verified requests');
  },

  getById: async (req, res) => {
    const data = await svc.getRequestById(req.params.id, req.user?._id);
    R.success(res, data);
  },

  getMyRequests: async (req, res) => {
    const { requests, pagination } = await svc.getUserRequests(req.user._id, req.query);
    R.paginated(res, requests, pagination, 'Your requests');
  },

  update: async (req, res) => {
    const data = await svc.updateRequest(req.params.id, req.user._id, req.body, req.files || []);
    R.success(res, data, 'Request updated successfully');
  },

  addProgress: async (req, res) => {
    const data = await svc.addProgressUpdate(req.params.id, req.user._id, req.body, req.files || []);
    R.success(res, data, 'Progress update added');
  },

  search: async (req, res) => {
    const { results, pagination } = await svc.searchRequests(req.query);
    R.paginated(res, results, pagination, 'Search results');
  },

  getFeatured: async (req, res) => {
    const data = await svc.getFeaturedRequests(parseInt(req.query.limit) || 6);
    R.success(res, data, 'Featured requests');
  },

  deleteRequest: async (req, res) => {
    const data = await svc.deleteRequest(req.params.id, req.user._id, req.user.role);
    R.success(res, null, data.message);
  },
};