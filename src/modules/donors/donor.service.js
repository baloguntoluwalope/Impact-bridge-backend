'use strict';

const Request = require('../requests/request.model');
const Payment = require('../payments/payment.model');
const User    = require('../users/user.model');
const { getRedisClient } = require('../../config/redis');
const { paginate, paginationMeta } = require('../../utils/helpers');

const cache = async (key, ttl, fn) => {
  const redis  = getRedisClient();
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  const data = await fn();
  await redis.setEx(key, ttl, JSON.stringify(data));
  return data;
};

const browseCases = async (query) => {
  const { page, limit, category, state, urgency, is_featured, sort = '-created_at', min_amount, max_amount } = query;
  const { page: p, limit: l, skip } = paginate(page, limit);

  const filter = { status: 'verified', is_visible: true, is_archived: false };
  if (category)             filter.category   = category;
  if (state)                filter.state      = state;
  if (urgency)              filter.urgency    = urgency;
  if (is_featured === 'true') filter.is_featured = true;
  if (min_amount || max_amount) {
    filter.amount_needed = {};
    if (min_amount) filter.amount_needed.$gte = Number(min_amount);
    if (max_amount) filter.amount_needed.$lte = Number(max_amount);
  }

  const cacheKey = `donor:cases:${JSON.stringify(filter)}:${p}:${l}:${sort}`;
  const redis    = getRedisClient();
  const cached   = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const [cases, total] = await Promise.all([
    Request.find(filter)
      .select('title description category state lga amount_needed amount_raised donor_count urgency is_featured media sdg_number created_at fund_type')
      .populate('requester', 'first_name last_name avatar')
      .populate('assigned_ngo', 'name logo')
      .sort(sort)
      .skip(skip)
      .limit(l)
      .lean(),
    Request.countDocuments(filter),
  ]);

  const result = { cases, pagination: paginationMeta(total, p, l) };
  await redis.setEx(cacheKey, 120, JSON.stringify(result));
  return result;
};

const getImpactDashboard = async (donorId) =>
  cache(`donor:dashboard:${donorId}`, 60, async () => {
    const [user, payments, bySDG] = await Promise.all([
      User.findById(donorId).select('total_donated donation_count bookmarked_cases').lean(),
      Payment.find({ donor: donorId, status: 'success' })
        .populate('request', 'title category status sdg_number state amount_needed amount_raised')
        .sort('-created_at')
        .limit(10)
        .lean(),
      Payment.aggregate([
        { $match: { donor: donorId, status: 'success', request: { $ne: null } } },
        { $lookup: { from: 'requests', localField: 'request', foreignField: '_id', as: 'req' } },
        { $unwind: '$req' },
        { $group: { _id: { sdg: '$req.sdg_number', category: '$req.category' }, total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),
    ]);

    return {
      summary:         { total_donated: user?.total_donated || 0, donation_count: user?.donation_count || 0 },
      recent_donations: payments,
      impact_by_sdg:   bySDG,
    };
  });

const getBookmarks = async (donorId) => {
  const user  = await User.findById(donorId).select('bookmarked_cases').lean();
  const cases = await Request.find({
    _id:        { $in: user?.bookmarked_cases || [] },
    is_visible: true,
  })
    .select('title category state amount_needed amount_raised status sdg_number media')
    .lean();
  return cases;
};

const getProofOfImpact = async (donorId) => {
  const paidRequestIds = await Payment.find({ donor: donorId, status: 'success', request: { $ne: null } }).distinct('request');

  const cases = await Request.find({
    _id:    { $in: paidRequestIds },
    status: { $in: ['completed','in_progress','funded'] },
  })
    .select('title status progress_updates completion_proof ngo_field_reports state category sdg_number completed_at')
    .populate('assigned_ngo', 'name logo')
    .lean();

  return cases;
};

const getLeaderboard = async (limit = 10) =>
  cache(`donor:leaderboard:${limit}`, 300, () =>
    User.find({ donation_count: { $gt: 0 } })
      .select('first_name last_name total_donated donation_count avatar state')
      .sort('-total_donated')
      .limit(limit)
      .lean()
  );

module.exports = { browseCases, getImpactDashboard, getBookmarks, getProofOfImpact, getLeaderboard };