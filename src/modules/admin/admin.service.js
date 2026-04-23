'use strict';

const User     = require('../users/user.model');
const Request  = require('../requests/request.model');
const Payment  = require('../payments/payment.model');
const AuditLog = require('./auditLog.model');
const { queues } = require('../../config/bullmq');
const { paginate, paginationMeta } = require('../../utils/helpers');
const ApiError = require('../../utils/apiError');

const getUsers = async (query) => {
  const { page, limit, role, state, is_suspended, search } = query;
  const { page: p, limit: l, skip } = paginate(page, limit);

  const filter = {};
  if (role)         filter.role         = role;
  if (state)        filter.state        = state;
  if (is_suspended !== undefined) filter.is_suspended = is_suspended === 'true';
  if (search) {
    filter.$or = [
      { first_name: { $regex: search, $options: 'i' } },
      { last_name:  { $regex: search, $options: 'i' } },
      { email:      { $regex: search, $options: 'i' } },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter).sort('-created_at').skip(skip).limit(l).lean(),
    User.countDocuments(filter),
  ]);

  return { users, pagination: paginationMeta(total, p, l) };
};

const suspendUser = async (userId, reason) => {
  if (!reason) throw ApiError.badRequest('Suspension reason is required');
  const user = await User.findByIdAndUpdate(userId, { is_suspended: true, suspension_reason: reason }, { new: true });
  if (!user) throw ApiError.notFound('User not found');
  return user;
};

const activateUser = async (userId) => {
  const user = await User.findByIdAndUpdate(userId, { is_suspended: false, suspension_reason: null, is_active: true }, { new: true });
  if (!user) throw ApiError.notFound('User not found');
  return user;
};

const getAllRequests = async (query) => {
  const { page, limit, status, state, category } = query;
  const { page: p, limit: l, skip } = paginate(page, limit);

  const filter = {};
  if (status)   filter.status   = status;
  if (state)    filter.state    = state;
  if (category) filter.category = category;

  const [requests, total] = await Promise.all([
    Request.find(filter)
      .populate('requester', 'first_name last_name email role')
      .populate('assigned_ngo', 'name')
      .sort('-created_at')
      .skip(skip)
      .limit(l)
      .lean(),
    Request.countDocuments(filter),
  ]);

  return { requests, pagination: paginationMeta(total, p, l) };
};

const toggleFeatureRequest = async (requestId, isFeatured) => {
  const request = await Request.findByIdAndUpdate(requestId, { is_featured: isFeatured }, { new: true });
  if (!request) throw ApiError.notFound('Request not found');
  return request;
};

const getAllPayments = async (query) => {
  const { page, limit, status, gateway } = query;
  const { page: p, limit: l, skip } = paginate(page, limit);

  const filter = {};
  if (status)  filter.status  = status;
  if (gateway) filter.gateway = gateway;

  const [payments, total, summary] = await Promise.all([
    Payment.find(filter)
      .populate('donor', 'first_name last_name email')
      .populate('request', 'title category')
      .sort('-created_at')
      .skip(skip)
      .limit(l)
      .lean(),
    Payment.countDocuments(filter),
    Payment.aggregate([
      { $match: { status: 'success' } },
      { $group: { _id: '$gateway', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
  ]);

  return { payments, summary, pagination: paginationMeta(total, p, l) };
};

const getAuditLogs = async (query) => {
  const { page, limit, action, resource, user } = query;
  const { page: p, limit: l, skip } = paginate(page, limit);

  const filter = {};
  if (action)   filter.action      = action;
  if (resource) filter.resource    = resource;
  if (user)     filter.user        = user;

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .populate('user', 'first_name last_name email role')
      .sort('-timestamp')
      .skip(skip)
      .limit(l)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  return { logs, pagination: paginationMeta(total, p, l) };
};

const getDLQStatus = async () => {
  const dlq    = queues.deadLetter;
  const counts = await dlq.getJobCounts('failed', 'waiting', 'completed', 'delayed');
  return { dead_letter_queue: counts };
};

const getSystemStats = async () => {
  const [users, requests, payments, amount] = await Promise.all([
    User.countDocuments({ is_active: true }),
    Request.countDocuments(),
    Payment.countDocuments({ status: 'success' }),
    Payment.aggregate([{ $match: { status: 'success' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
  ]);
  return { active_users: users, total_requests: requests, total_payments: payments, total_amount_raised: amount[0]?.total || 0 };
};

module.exports = { getUsers, suspendUser, activateUser, getAllRequests, toggleFeatureRequest, getAllPayments, getAuditLogs, getDLQStatus, getSystemStats };