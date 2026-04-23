'use strict';

const Payment  = require('../payments/payment.model');
const Request  = require('../requests/request.model');
const Wallet   = require('../wallets/wallet.model');
const { getRedisClient } = require('../../config/redis');
const { paginate, paginationMeta } = require('../../utils/helpers');
const ApiError = require('../../utils/apiError');

const cache = async (key, ttl, fn) => {
  const redis  = getRedisClient();
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  const data = await fn();
  await redis.setEx(key, ttl, JSON.stringify(data));
  return data;
};

const getFundingOverview = async () =>
  cache('funding:overview', 180, async () => {
    const [byType, byGateway, recentLarge] = await Promise.all([
      Payment.aggregate([
        { $match: { status: 'success' } },
        { $group: { _id: '$fund_type', total_amount: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total_amount: -1 } },
      ]),
      Payment.aggregate([
        { $match: { status: 'success' } },
        { $group: { _id: '$gateway', total_amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Payment.find({ status: 'success' })
        .sort('-amount')
        .limit(5)
        .populate('donor', 'first_name last_name')
        .populate('request', 'title category')
        .lean(),
    ]);
    return { by_fund_type: byType, by_gateway: byGateway, recent_large_donations: recentLarge };
  });

const getCaseFundingHistory = async (requestId, query) => {
  const { page, limit } = query;
  const { page: p, limit: l, skip } = paginate(page, limit);

  const request = await Request.findById(requestId);
  if (!request) throw ApiError.notFound('Request not found');

  const [payments, total] = await Promise.all([
    Payment.find({ request: requestId, status: 'success' })
      .populate('donor', 'first_name last_name avatar')
      .select('amount created_at donor is_anonymous donor_message fund_type')
      .sort('-created_at')
      .skip(skip)
      .limit(l)
      .lean(),
    Payment.countDocuments({ request: requestId, status: 'success' }),
  ]);

  const masked = payments.map((p) => ({
    ...p,
    donor: p.is_anonymous ? { first_name: 'Anonymous', last_name: 'Donor', avatar: null } : p.donor,
  }));

  return { request: { title: request.title, amount_needed: request.amount_needed, amount_raised: request.amount_raised }, payments: masked, pagination: paginationMeta(total, p, l) };
};

const getWalletAllocations = async (query) => {
  const { page, limit, wallet_type } = query;
  const { page: p, limit: l, skip } = paginate(page, limit);

  const filter = {};
  if (wallet_type) filter.wallet_type = wallet_type;

  const [wallets, total] = await Promise.all([
    Wallet.find(filter)
      .populate('request', 'title status category')
      .populate('project', 'title status')
      .sort('-created_at')
      .skip(skip)
      .limit(l)
      .lean(),
    Wallet.countDocuments(filter),
  ]);

  return { wallets, pagination: paginationMeta(total, p, l) };
};

const reconcilePayment = async (reference) => {
  const payment = await Payment.findOne({ reference });
  if (!payment) throw ApiError.notFound('Payment not found');
  if (payment.status === 'success') return { already_processed: true, payment };

  const paymentService = require('../payments/payment.service');
  return paymentService.verifyPaymentManually(reference);
};

module.exports = { getFundingOverview, getCaseFundingHistory, getWalletAllocations, reconcilePayment };