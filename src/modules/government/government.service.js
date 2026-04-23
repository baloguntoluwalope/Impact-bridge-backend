'use strict';

const Request = require('../requests/request.model');
const Payment = require('../payments/payment.model');
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

const getNationalDashboard = async (state = null) => {
  const cacheKey = `gov:dashboard:${state || 'national'}`;
  return cache(cacheKey, 120, async () => {
    const matchFilter = state ? { state } : {};

    const [sdgDistribution, stateHeatmap, urgentCases, completedThisYear, monthlyTrends, totalBeneficiaries] = await Promise.all([
      Request.aggregate([
        { $match: { ...matchFilter, status: { $in: ['verified','funded','in_progress','completed'] } } },
        { $group: { _id: { sdg: '$sdg_number', category: '$category' }, cases: { $sum: 1 }, needed: { $sum: '$amount_needed' }, raised: { $sum: '$amount_raised' }, beneficiaries: { $sum: '$beneficiaries_count' } } },
        { $sort: { '_id.sdg': 1 } },
      ]),
      Request.aggregate([
        { $match: { status: { $in: ['verified','funded','completed'] } } },
        { $group: { _id: '$state', cases: { $sum: 1 }, needed: { $sum: '$amount_needed' }, raised: { $sum: '$amount_raised' } } },
        { $sort: { cases: -1 } },
      ]),
      Request.find({
        ...matchFilter,
        status:  'verified',
        urgency: { $in: ['high','critical'] },
        is_visible: true,
      }).select('title category state lga amount_needed amount_raised urgency sdg_number').sort('-created_at').limit(20).lean(),
      Request.countDocuments({
        ...matchFilter,
        status:       'completed',
        completed_at: { $gte: new Date(new Date().getFullYear(), 0, 1) },
      }),
      Payment.aggregate([
        { $group: { _id: { y: { $year: '$created_at' }, m: { $month: '$created_at' } }, total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { '_id.y': 1, '_id.m': 1 } },
        { $limit: 12 },
      ]),
      Request.aggregate([{ $match: { ...matchFilter, status: 'completed' } }, { $group: { _id: null, total: { $sum: '$beneficiaries_count' } } }]),
    ]);

    return { sdg_distribution: sdgDistribution, state_heatmap: stateHeatmap, urgent_cases: urgentCases, completed_this_year: completedThisYear, monthly_trends: monthlyTrends, total_beneficiaries: totalBeneficiaries[0]?.total || 0 };
  });
};

const getStateDeepDive = async (state) => {
  const [cases, funding, lgaBreakdown, sdgDist, projects] = await Promise.all([
    Request.find({ state, status: { $in: ['verified','funded','in_progress','completed'] } })
      .select('title category status amount_needed amount_raised sdg_number lga urgency created_at')
      .sort('-created_at').limit(50).lean(),
    Payment.aggregate([
      { $lookup: { from: 'requests', localField: 'request', foreignField: '_id', as: 'req' } },
      { $unwind: '$req' },
      { $match: { 'req.state': state, status: 'success' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Request.aggregate([
      { $match: { state, status: { $in: ['verified','funded','in_progress','completed'] } } },
      { $group: { _id: '$lga', cases: { $sum: 1 }, needed: { $sum: '$amount_needed' }, raised: { $sum: '$amount_raised' } } },
      { $sort: { cases: -1 } },
    ]),
    Request.aggregate([
      { $match: { state, status: { $in: ['verified','funded','completed'] } } },
      { $group: { _id: '$sdg_number', cases: { $sum: 1 }, raised: { $sum: '$amount_raised' } } },
      { $sort: { _id: 1 } },
    ]),
    Project.find({ target_states: state, status: { $in: ['approved','in_progress','completed'] } })
      .select('title status total_budget amount_funded sdg_goals creator_type').lean(),
  ]);

  return { state, cases, funding: funding[0] || { total: 0, count: 0 }, lga_breakdown: lgaBreakdown, sdg_distribution: sdgDist, projects };
};

const getLGAData = async (state, lga) => {
  const [cases, summary] = await Promise.all([
    Request.find({ state, lga, status: { $in: ['verified','funded','in_progress','completed'] } })
      .select('title category status amount_needed amount_raised sdg_number urgency').lean(),
    Request.aggregate([
      { $match: { state, lga, status: { $in: ['verified','funded','completed'] } } },
      { $group: { _id: null, cases: { $sum: 1 }, needed: { $sum: '$amount_needed' }, raised: { $sum: '$amount_raised' }, beneficiaries: { $sum: '$beneficiaries_count' } } },
    ]),
  ]);

  return { state, lga, cases, summary: summary[0] || {} };
};

module.exports = { getNationalDashboard, getStateDeepDive, getLGAData };