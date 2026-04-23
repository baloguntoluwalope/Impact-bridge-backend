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

const getAdminDashboard = async () =>
  cache('dashboard:admin', 120, async () => {
    const now          = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [total_users, total_requests, pending, verified, total_payments, amount_raised, monthly_donations, by_status, by_sdg, recent_payments, new_users_month] = await Promise.all([
      User.countDocuments({ is_active: true }),
      Request.countDocuments(),
      Request.countDocuments({ status: { $in: ['submitted','under_review'] } }),
      Request.countDocuments({ status: 'verified', is_visible: true }),
      Payment.countDocuments({ status: 'success' }),
      Payment.aggregate([{ $match: { status: 'success' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Payment.aggregate([{ $match: { status: 'success', created_at: { $gte: startOfMonth } } }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
      Request.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Request.aggregate([{ $match: { status: { $in: ['verified','funded','completed'] } } }, { $group: { _id: '$category', count: { $sum: 1 }, raised: { $sum: '$amount_raised' } } }, { $sort: { count: -1 } }]),
      Payment.find({ status: 'success' }).sort('-created_at').limit(10).populate('donor','first_name last_name').populate('request','title').lean(),
      User.countDocuments({ created_at: { $gte: startOfMonth } }),
    ]);

    return {
      stats: { total_users, total_requests, pending, verified, total_payments, total_amount_raised: amount_raised[0]?.total || 0, monthly_donations: monthly_donations[0]?.total || 0, monthly_donation_count: monthly_donations[0]?.count || 0, new_users_month },
      by_status,
      by_sdg,
      recent_payments,
    };
  });

const getDonorDashboard = async (donorId) =>
  cache(`dashboard:donor:${donorId}`, 60, async () => {
    const [user, recent_donations, by_type, completed_cases] = await Promise.all([
      User.findById(donorId).select('total_donated donation_count').lean(),
      Payment.find({ donor: donorId, status: 'success' }).populate('request','title category status sdg_number').sort('-created_at').limit(10).lean(),
      Payment.aggregate([{ $match: { donor: donorId, status: 'success' } }, { $group: { _id: '$fund_type', total: { $sum: '$amount' }, count: { $sum: 1 } } }, { $sort: { total: -1 } }]),
      Payment.find({ donor: donorId, status: 'success', request: { $ne: null } }).distinct('request').then((ids) => Request.countDocuments({ _id: { $in: ids }, status: 'completed' })),
    ]);

    return { summary: { total_donated: user?.total_donated || 0, donation_count: user?.donation_count || 0, completed_cases }, recent_donations, by_type };
  });

const getNGODashboard = async (ngoUserId) => {
  const user = await User.findById(ngoUserId).populate('ngo_profile').lean();
  const ngoId = user?.ngo_profile?._id;

  return cache(`dashboard:ngo:${ngoId}`, 60, async () => {
    const [assigned, v, c, ip, reports_pending] = await Promise.all([
      Request.find({ assigned_ngo: ngoId }).select('title status amount_needed amount_raised category state lga urgency created_at').sort('-created_at').limit(20).lean(),
      Request.countDocuments({ assigned_ngo: ngoId, status: 'verified' }),
      Request.countDocuments({ assigned_ngo: ngoId, status: 'completed' }),
      Request.countDocuments({ assigned_ngo: ngoId, status: 'in_progress' }),
      Request.countDocuments({ assigned_ngo: ngoId, status: 'funded', progress_updates: { $size: 0 } }),
    ]);

    return { ngo_id: ngoId, stats: { verified: v, completed: c, in_progress: ip, reports_pending }, assigned_cases: assigned };
  });
};

const getGovernmentDashboard = async (state = null) => {
  const cacheKey = `dashboard:gov:${state || 'national'}`;
  return cache(cacheKey, 120, async () => {
    const match = state ? { state } : {};

    const [sdg_progress, state_dist, gaps, beneficiaries, monthly] = await Promise.all([
      Request.aggregate([{ $match: { ...match, status: { $in: ['verified','funded','in_progress','completed'] } } }, { $group: { _id: { sdg: '$sdg_number', cat: '$category' }, cases: { $sum: 1 }, needed: { $sum: '$amount_needed' }, raised: { $sum: '$amount_raised' }, beneficiaries: { $sum: '$beneficiaries_count' } } }, { $sort: { '_id.sdg': 1 } }]),
      Request.aggregate([{ $match: { status: { $in: ['verified','funded','completed'] } } }, { $group: { _id: '$state', cases: { $sum: 1 }, needed: { $sum: '$amount_needed' }, raised: { $sum: '$amount_raised' } } }, { $sort: { cases: -1 } }]),
      Request.find({ ...match, status: 'verified', $expr: { $lt: ['$amount_raised','$amount_needed'] } }).select('title category state lga amount_needed amount_raised sdg_number urgency').sort('-amount_needed').limit(20).lean(),
      Request.aggregate([{ $match: { ...match, status: 'completed' } }, { $group: { _id: null, total: { $sum: '$beneficiaries_count' } } }]),
      Payment.aggregate([{ $group: { _id: { y: { $year: '$created_at' }, m: { $month: '$created_at' } }, total: { $sum: '$amount' }, count: { $sum: 1 } } }, { $sort: { '_id.y': 1, '_id.m': 1 } }, { $limit: 12 }]),
    ]);

    return { sdg_progress, state_distribution: state_dist, funding_gaps: gaps, total_beneficiaries: beneficiaries[0]?.total || 0, monthly_trends: monthly };
  });
};

module.exports = { getAdminDashboard, getDonorDashboard, getNGODashboard, getGovernmentDashboard };