'use strict';

const Request  = require('../requests/request.model');
const { addJob }         = require('../../config/bullmq');
const { getRedisClient } = require('../../config/redis');
const { paginate, paginationMeta } = require('../../utils/helpers');
const ApiError = require('../../utils/apiError');

const invalidateCache = async () => {
  const redis = getRedisClient();
  const keys  = await redis.keys('requests:verified:*');
  if (keys.length) await redis.del(keys);
};

const getPendingVerifications = async (query) => {
  const { page, limit, state, category, urgency } = query;
  const { page: p, limit: l, skip } = paginate(page, limit);

  const filter = { status: { $in: ['submitted', 'under_review'] } };
  if (state)    filter.state    = state;
  if (category) filter.category = category;
  if (urgency)  filter.urgency  = urgency;

  const [requests, total] = await Promise.all([
    Request.find(filter)
      .populate('requester', 'first_name last_name email phone state lga')
      .sort({ urgency: -1, created_at: 1 })
      .skip(skip)
      .limit(l)
      .lean(),
    Request.countDocuments(filter),
  ]);

  return { requests, pagination: paginationMeta(total, p, l) };
};

const setUnderReview = async (requestId, adminId) => {
  const request = await Request.findById(requestId);
  if (!request) throw ApiError.notFound('Request not found');
  if (request.status !== 'submitted') {
    throw ApiError.badRequest(`Request must be in 'submitted' status. Current: ${request.status}`);
  }

  const updated = await Request.findByIdAndUpdate(
    requestId,
    { status: 'under_review' },
    { new: true }
  ).populate('requester', 'first_name last_name email');

  await addJob('notification', 'request_under_review', {
    type:   'single',
    userId: updated.requester._id.toString(),
    title:  '🔍 Your request is being reviewed',
    body:   `"${updated.title}" is currently under review by our team.`,
    data:   { request_id: requestId },
  });

  return updated;
};

const approveRequest = async (requestId, adminId, { notes, ngo_id } = {}) => {
  const request = await Request.findById(requestId);
  if (!request) throw ApiError.notFound('Request not found');

  if (!['submitted', 'under_review'].includes(request.status)) {
    throw ApiError.badRequest(`Cannot approve request in '${request.status}' status`);
  }

  const updateData = {
    status:                          'verified',
    is_visible:                      true,
    'verification.verified_by':      adminId,
    'verification.verified_at':      new Date(),
  };

  if (notes) updateData.$push = { 'verification.notes': notes };
  if (ngo_id) updateData.assigned_ngo = ngo_id;

  const updated = await Request.findByIdAndUpdate(requestId, updateData, { new: true })
    .populate('requester', 'first_name last_name email');

  await invalidateCache();

  await addJob('notification', 'request_approved', {
    type:   'single',
    userId: updated.requester._id.toString(),
    title:  '🎉 Your request has been verified!',
    body:   `"${updated.title}" is now live and visible to donors.`,
    data:   { request_id: requestId },
  });

  return updated;
};

const rejectRequest = async (requestId, adminId, { reason, notes }) => {
  if (!reason) throw ApiError.badRequest('Rejection reason is required');

  const request = await Request.findById(requestId);
  if (!request) throw ApiError.notFound('Request not found');

  const updated = await Request.findByIdAndUpdate(
    requestId,
    {
      status:                            'rejected',
      is_visible:                        false,
      'verification.rejected_by':        adminId,
      'verification.rejected_at':        new Date(),
      'verification.rejection_reason':   reason,
      $push: { 'verification.notes': notes || `Rejected: ${reason}` },
    },
    { new: true }
  ).populate('requester', 'first_name last_name email');

  if (!updated) throw ApiError.notFound('Request not found');

  await addJob('notification', 'request_rejected', {
    type:   'single',
    userId: updated.requester._id.toString(),
    title:  'Request Update',
    body:   `Your request "${updated.title}" was not approved at this time. Reason: ${reason}`,
    data:   { request_id: requestId, reason },
  });

  await addJob('email', 'request_rejected_email', {
    to:       updated.requester.email,
    subject:  'Update on Your Impact Bridge Request',
    template: 'more_info',
    data: {
      name:         updated.requester.first_name,
      requestTitle: updated.title,
      message:      `Your request was not approved. Reason: ${reason}. You may revise and resubmit.`,
    },
  });

  return updated;
};

const requestMoreInfo = async (requestId, adminId, { message }) => {
  if (!message) throw ApiError.badRequest('Message is required');

  const request = await Request.findById(requestId)
    .populate('requester', 'first_name last_name email');

  if (!request) throw ApiError.notFound('Request not found');

  const note = `[INFO REQUEST][${new Date().toISOString()}]: ${message}`;
  await Request.findByIdAndUpdate(requestId, { $push: { 'verification.notes': note } });

  await addJob('email', 'more_info_request', {
    to:       request.requester.email,
    subject:  'Additional Information Needed – Impact Bridge',
    template: 'more_info',
    data: {
      name:         request.requester.first_name,
      requestTitle: request.title,
      message,
    },
  });

  await addJob('notification', 'more_info_needed', {
    type:   'single',
    userId: request.requester._id.toString(),
    title:  '📋 Additional information needed',
    body:   `Please provide more details for "${request.title}"`,
    data:   { request_id: requestId },
  });

  return { message: 'Information request sent to requester' };
};

const flagForFraud = async (requestId, adminId, { reason, fraud_score }) => {
  if (!reason)      throw ApiError.badRequest('Fraud reason is required');
  if (!fraud_score) throw ApiError.badRequest('Fraud score (0–100) is required');

  const note = `[FRAUD FLAG][Score: ${fraud_score}]: ${reason}`;

  await Request.findByIdAndUpdate(requestId, {
    'verification.fraud_score': fraud_score,
    is_visible:                 false,
    $push: { 'verification.notes': note },
  });

  await invalidateCache();
  return { message: 'Request flagged for fraud review and hidden from donors' };
};

const getVerificationStats = async () => {
  const redis    = getRedisClient();
  const cacheKey = 'verification:stats';
  const cached   = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const [submitted, under_review, verified, rejected, total] = await Promise.all([
    Request.countDocuments({ status: 'submitted' }),
    Request.countDocuments({ status: 'under_review' }),
    Request.countDocuments({ status: 'verified' }),
    Request.countDocuments({ status: 'rejected' }),
    Request.countDocuments(),
  ]);

  const stats = { submitted, under_review, verified, rejected, total, pending: submitted + under_review };
  await redis.setEx(cacheKey, 60, JSON.stringify(stats));
  return stats;
};

module.exports = {
  getPendingVerifications,
  setUnderReview,
  approveRequest,
  rejectRequest,
  requestMoreInfo,
  flagForFraud,
  getVerificationStats,
};