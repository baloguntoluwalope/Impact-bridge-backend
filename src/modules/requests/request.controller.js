'use strict';

const Request = require('./request.model');
const svc     = require('./request.service');
const R       = require('../../utils/apiResponse');

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

  // ── Admin: verification queue ──────────────────────────────────
  getAdminQueue: async (req, res, next) => {
    try {
      const page  = Math.max(1, parseInt(req.query.page)  || 1);
      const limit = Math.min(100, parseInt(req.query.limit) || 50);
      const skip  = (page - 1) * limit;

      const statusParam = req.query.status
        || 'submitted,under_review,field_verification,more_info_requested';
      const statuses = statusParam.split(',').map(s => s.trim());

      const filter = { status: { $in: statuses } };
      if (req.query.category) filter.category = req.query.category;
      if (req.query.urgency)  filter.urgency  = req.query.urgency;

      const [data, total] = await Promise.all([
        Request.find(filter)
          .populate('requester', 'first_name last_name email avatar')
          .sort({ created_at: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Request.countDocuments(filter),
      ]);

      res.json({
        data,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit),
          limit,
        },
      });
    } catch (err) {
      next(err);
    }
  },
};