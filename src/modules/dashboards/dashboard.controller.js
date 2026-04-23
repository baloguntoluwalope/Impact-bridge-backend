'use strict';

const svc = require('./dashboard.service');
const R   = require('../../utils/apiResponse');

module.exports = {
  admin:      async (req, res) => R.success(res, await svc.getAdminDashboard(),                          'Admin dashboard'),
  donor:      async (req, res) => R.success(res, await svc.getDonorDashboard(req.user._id),              'Donor dashboard'),
  ngo:        async (req, res) => R.success(res, await svc.getNGODashboard(req.user._id),                'NGO dashboard'),
  government: async (req, res) => R.success(res, await svc.getGovernmentDashboard(req.query.state),      'Government dashboard'),
};