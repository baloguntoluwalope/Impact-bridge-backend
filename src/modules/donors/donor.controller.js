'use strict';

const svc = require('./donor.service');
const R   = require('../../utils/apiResponse');

module.exports = {
  browseCases:      async (req, res) => { const d = await svc.browseCases(req.query); R.paginated(res, d.cases, d.pagination, 'Verified cases for donors'); },
  getLeaderboard:   async (req, res) => R.success(res, await svc.getLeaderboard(parseInt(req.query.limit) || 10), 'Donor leaderboard'),
  getDashboard:     async (req, res) => R.success(res, await svc.getImpactDashboard(req.user._id),                'Your impact dashboard'),
  getBookmarks:     async (req, res) => R.success(res, await svc.getBookmarks(req.user._id),                      'Bookmarked cases'),
  getProofOfImpact: async (req, res) => R.success(res, await svc.getProofOfImpact(req.user._id),                  'Proof of impact for your donations'),
};