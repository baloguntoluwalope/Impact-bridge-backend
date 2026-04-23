'use strict';

const Request = require('../requests/request.model');
const Payment = require('../payments/payment.model');
const User    = require('../users/user.model');
const Project = require('../projects/project.model');
const { getRedisClient } = require('../../config/redis');

const cache = async (key, ttl, fn) => {
  const redis  = getRedisClient();
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  const data = await fn();
  await redis.setEx(key, ttl, JSON.stringify(data));
  return data;
};

const getPlatformMetrics = async () =>
  cache('analytics:platform', 180, async () => {
    const now          = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear  = new Date(now.getFullYear(), 0, 1);

    const [totalUsers, totalRequests, activeRequests, completedRequests, totalPayments, totalAmount, monthlyAmount, yearlyAmount, totalProjects, beneficiaries] = await Promise.all([
      User.countDocuments({ is_active: true }),
      Request.countDocuments(),
      Request.countDocuments({ status: { $in: ['verified','funded','in_progress'] } }),
      Request.countDocuments({ status: 'completed' }),
      Payment.countDocuments({ status: 'success' }),
      Payment.aggregate([{ $match: { status: 'success' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Payment.aggregate([{ $match: { status: 'success', created_at: { $gte: startOfMonth } } }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
      Payment.aggregate([{ $match: { status: 'success', created_at: { $gte: startOfYear } } }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
      Project.countDocuments({ status: { $in: ['approved','in_progress','completed'] } }),
      Request.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, total: { $sum: '$beneficiaries_count' } } }]),
    ]);

    return {
      users:        { total: totalUsers },
      requests:     { total: totalRequests, active: activeRequests, completed: completedRequests },
      donations: {
        total_count:     totalPayments,
        total_amount:    totalAmount[0]?.total || 0,
        monthly_amount:  monthlyAmount[0]?.total || 0,
        monthly_count:   monthlyAmount[0]?.count || 0,
        yearly_amount:   yearlyAmount[0]?.total || 0,
      },
      projects:     { total: totalProjects },
      beneficiaries:{ total: beneficiaries[0]?.total || 0 },
    };
  });

const getDonationTrends = async (months = 12) =>
  cache(`analytics:trends:${months}`, 180, () =>
    Payment.aggregate([
      { $match: { status: 'success' } },
      { $group: { _id: { year: { $year: '$created_at' }, month: { $month: '$created_at' } }, total_amount: { $sum: '$amount' }, total_count: { $sum: 1 }, unique_donors: { $addToSet: '$donor' } } },
      { $project: { year: '$_id.year', month: '$_id.month', total_amount: 1, total_count: 1, unique_donors: { $size: '$unique_donors' } } },
      { $sort: { year: 1, month: 1 } },
      { $limit: months },
    ])
  );

const getFundingGaps = async (filters = {}) =>
  cache(`analytics:gaps:${JSON.stringify(filters)}`, 180, async () => {
    const match = { status: 'verified', is_visible: true };
    if (filters.state)    match.state    = filters.state;
    if (filters.category) match.category = filters.category;

    return Request.aggregate([
      { $match: match },
      { $addFields: { gap: { $subtract: ['$amount_needed', '$amount_raised'] } } },
      { $match: { gap: { $gt: 0 } } },
      { $group: { _id: { state: '$state', category: '$category' }, total_gap: { $sum: '$gap' }, case_count: { $sum: 1 } } },
      { $sort: { total_gap: -1 } },
      { $limit: 20 },
    ]);
  });

const getSDGDistribution = async () =>
  cache('analytics:sdg_distribution', 180, () =>
    Payment.aggregate([
      { $match: { status: 'success', request: { $ne: null } } },
      { $lookup: { from: 'requests', localField: 'request', foreignField: '_id', as: 'req' } },
      { $unwind: '$req' },
      { $group: { _id: { sdg: '$req.sdg_number', category: '$req.category' }, total_amount: { $sum: '$amount' }, donation_count: { $sum: 1 } } },
      { $sort: { total_amount: -1 } },
    ])
  );

const getRegionalAnalysis = async () =>
  cache('analytics:regional', 180, () =>
    Request.aggregate([
      { $match: { status: { $in: ['verified','funded','in_progress','completed'] } } },
      { $group: { _id: '$state', cases: { $sum: 1 }, needed: { $sum: '$amount_needed' }, raised: { $sum: '$amount_raised' }, completed: { $sum: { $cond: [{ $eq: ['$status','completed'] }, 1, 0] } }, beneficiaries: { $sum: '$beneficiaries_count' } } },
      { $sort: { cases: -1 } },
    ])
  );

const getTopDonors = async (limit = 10) =>
  cache(`analytics:top_donors:${limit}`, 300, () =>
    User.find({ donation_count: { $gt: 0 } })
      .select('first_name last_name total_donated donation_count avatar state')
      .sort('-total_donated')
      .limit(limit)
      .lean()
  );

const getUserRoleDistribution = async () =>
  cache('analytics:user_roles', 600, () =>
    User.aggregate([
      { $match: { is_active: true } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ])
  );

const getCategoryBreakdown = async () =>
  cache('analytics:category_breakdown', 300, () =>
    Request.aggregate([
      { $group: { _id: { category: '$category', sdg: '$sdg_number' }, total: { $sum: 1 }, verified: { $sum: { $cond: [{ $eq: ['$status','verified'] }, 1, 0] } }, funded: { $sum: { $cond: [{ $eq: ['$status','funded'] }, 1, 0] } }, completed: { $sum: { $cond: [{ $eq: ['$status','completed'] }, 1, 0] } }, total_raised: { $sum: '$amount_raised' } } },
      { $sort: { total: -1 } },
    ])
  );

module.exports = {
  getPlatformMetrics,
  getDonationTrends,
  getFundingGaps,
  getSDGDistribution,
  getRegionalAnalysis,
  getTopDonors,
  getUserRoleDistribution,
  getCategoryBreakdown,
};