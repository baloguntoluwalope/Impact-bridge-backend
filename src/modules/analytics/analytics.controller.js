'use strict';

const svc = require('./analytics.service');
const R   = require('../../utils/apiResponse');

module.exports = {
  getPlatform:           async (req, res) => R.success(res, await svc.getPlatformMetrics(),                                 'Platform metrics'),
  getTrends:             async (req, res) => R.success(res, await svc.getDonationTrends(parseInt(req.query.months) || 12),  'Donation trends'),
  getFundingGaps:        async (req, res) => R.success(res, await svc.getFundingGaps(req.query),                            'Funding gaps'),
  getSDGDistribution:    async (req, res) => R.success(res, await svc.getSDGDistribution(),                                 'SDG donation distribution'),
  getRegional:           async (req, res) => R.success(res, await svc.getRegionalAnalysis(),                                'Regional analytics'),
  getTopDonors:          async (req, res) => R.success(res, await svc.getTopDonors(parseInt(req.query.limit) || 10),        'Top donors'),
  getUserRoles:          async (req, res) => R.success(res, await svc.getUserRoleDistribution(),                            'User role distribution'),
  getCategoryBreakdown:  async (req, res) => R.success(res, await svc.getCategoryBreakdown(),                               'Category breakdown'),
};