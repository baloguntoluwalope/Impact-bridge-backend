'use strict';

const Payment  = require('../payments/payment.model');
const Request  = require('../requests/request.model');
const { paginate } = require('../../utils/helpers');

const getDonationReport = async (query) => {
  const { from, to, gateway, fund_type } = query;
  const filter = { status: 'success' };

  if (from || to) {
    filter.created_at = {};
    if (from) filter.created_at.$gte = new Date(from);
    if (to)   filter.created_at.$lte = new Date(to);
  }
  if (gateway)   filter.gateway   = gateway;
  if (fund_type) filter.fund_type = fund_type;

  const [payments, summary] = await Promise.all([
    Payment.find(filter)
      .populate('donor', 'first_name last_name email')
      .populate('request', 'title category state')
      .sort('-created_at')
      .lean(),
    Payment.aggregate([
      { $match: filter },
      { $group: { _id: null, total_amount: { $sum: '$amount' }, count: { $sum: 1 }, unique_donors: { $addToSet: '$donor' } } },
      { $project: { total_amount: 1, count: 1, unique_donors: { $size: '$unique_donors' } } },
    ]),
  ]);

  return { summary: summary[0] || {}, payments };
};

const getImpactReport = async (query) => {
  const { state, category, from, to } = query;
  const filter = { status: 'completed' };

  if (state)    filter.state    = state;
  if (category) filter.category = category;
  if (from || to) {
    filter.completed_at = {};
    if (from) filter.completed_at.$gte = new Date(from);
    if (to)   filter.completed_at.$lte = new Date(to);
  }

  const [requests, summary] = await Promise.all([
    Request.find(filter)
      .populate('requester', 'first_name last_name')
      .populate('assigned_ngo', 'name')
      .sort('-completed_at')
      .lean(),
    Request.aggregate([
      { $match: filter },
      { $group: { _id: null, total_cases: { $sum: 1 }, total_raised: { $sum: '$amount_raised' }, total_beneficiaries: { $sum: '$beneficiaries_count' } } },
    ]),
  ]);

  return { summary: summary[0] || {}, requests };
};

const getSDGReport = async () => {
  return Request.aggregate([
    { $match: { status: { $in: ['verified','funded','in_progress','completed'] } } },
    {
      $group: {
        _id: { sdg: '$sdg_number', category: '$category', state: '$state' },
        cases:         { $sum: 1 },
        total_needed:  { $sum: '$amount_needed' },
        total_raised:  { $sum: '$amount_raised' },
        beneficiaries: { $sum: '$beneficiaries_count' },
        completed:     { $sum: { $cond: [{ $eq: ['$status','completed'] }, 1, 0] } },
      },
    },
    { $sort: { '_id.sdg': 1 } },
  ]);
};

module.exports = { getDonationReport, getImpactReport, getSDGReport };