'use strict';

const Request = require('./request.model');
const Wallet = require('../wallets/wallet.model');
const { addJob } = require('../../config/bullmq');
const { getRedisClient } = require('../../config/redis');
const { paginate, paginationMeta, generateReference } = require('../../utils/helpers');
const ApiError = require('../../utils/apiError');
const mediaService = require('../media/media.service');

const REQUESTER_TYPE_MAP = {
  individual: 'individual',
  student: 'student',
  school_admin: 'school',
  community_leader: 'community',
  ngo_partner: 'ngo',
};

/**
 * Helper: Invalidate specific request caches
 */
const invalidateRequestCache = async () => {
  const redis = getRedisClient();
  const keys = await redis.keys('requests:*');
  if (keys.length > 0) await redis.del(keys);
};

/**
 * Create a new assistance request
 */
const createRequest = async (userId, userRole, body, files = []) => {
  const requesterType = REQUESTER_TYPE_MAP[userRole] || 'individual';

  const request = await Request.create({
    ...body,
    requester: userId,
    requester_type: requesterType,
    status: 'submitted',
  });

  if (files.length > 0) {
    const uploaded = await mediaService.uploadMultiple(files, `requests/${request._id}/media`);
    await Request.findByIdAndUpdate(request._id, { $push: { media: { $each: uploaded } } });
  }

  await Wallet.create({
    request: request._id,
    wallet_type: 'case_wallet',
    reference: generateReference('CW'),
    currency: 'NGN',
  });

  await addJob('notification', 'notify_admins_new_request', {
    type: 'broadcast',
    roles: ['super_admin'],
    title: '📥 New Request Submitted',
    body: `"${request.title}" needs verification`,
    data: { request_id: request._id.toString() },
  });

  return request;
};

/**
 * Get all verified and public requests (with caching)
 */
const getVerifiedRequests = async (query) => {
  const {
    page, limit, category, state, lga, urgency,
    min_amount, max_amount, search, is_featured,
    sort = '-created_at', fund_type,
  } = query;

  const { page: p, limit: l, skip } = paginate(page, limit);

  // Core filter: Only show verified and visible requests
  const filter = { 
    status: 'verified', 
    is_visible: true, 
    is_archived: { $ne: true } 
  };

  if (category) filter.category = category;
  if (state) filter.state = state;
  if (lga) filter.lga = lga;
  if (urgency) filter.urgency = urgency;
  if (fund_type) filter.fund_type = fund_type;
  if (is_featured === 'true') filter.is_featured = true;
  
  if (min_amount || max_amount) {
    filter.amount_needed = {};
    if (min_amount) filter.amount_needed.$gte = Number(min_amount);
    if (max_amount) filter.amount_needed.$lte = Number(max_amount);
  }
  
  if (search) filter.$text = { $search: search };

  const cacheKey = `requests:verified:${JSON.stringify(filter)}:${p}:${l}:${sort}`;
  const redis = getRedisClient();
  
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const [requests, total] = await Promise.all([
    Request.find(filter)
      .select('-verification.fraud_score -ngo_field_reports')
      .populate('requester', 'first_name last_name state lga avatar')
      .populate('assigned_ngo', 'name logo')
      .sort(sort)
      .skip(skip)
      .limit(l)
      .lean(),
    Request.countDocuments(filter),
  ]);

  const result = { requests, pagination: paginationMeta(total, p, l) };
  
  // Cache result for 5 minutes
  await redis.setEx(cacheKey, 300, JSON.stringify(result));
  return result;
};

/**
 * Get a single request by ID
 */
const getRequestById = async (id, userId = null) => {
  const request = await Request.findById(id)
    .populate('requester', 'first_name last_name state lga avatar bio')
    .populate('assigned_ngo', 'name logo contact_email website')
    .populate('verification.verified_by', 'first_name last_name')
    .populate('progress_updates.updated_by', 'first_name last_name role')
    .lean();

  if (!request) throw ApiError.notFound('Request not found');

  // Privacy Check: Only owner/admin can see non-visible requests
  if (!request.is_visible && !userId) {
    throw ApiError.forbidden('This request is not publicly visible');
  }

  await Request.findByIdAndUpdate(id, { $inc: { views: 1 } });
  return request;
};

/**
 * Get requests created by a specific user
 */
const getUserRequests = async (userId, query) => {
  const { page, limit, status } = query;
  const { page: p, limit: l, skip } = paginate(page, limit);

  const filter = { requester: userId };
  if (status) filter.status = status;

  const [requests, total] = await Promise.all([
    Request.find(filter)
      .populate('assigned_ngo', 'name logo')
      .sort('-created_at')
      .skip(skip)
      .limit(l)
      .lean(),
    Request.countDocuments(filter),
  ]);

  return { requests, pagination: paginationMeta(total, p, l) };
};

/**
 * Update request details (Only before verification)
 */
const updateRequest = async (requestId, userId, body, files = []) => {
  const request = await Request.findById(requestId);
  if (!request) throw ApiError.notFound('Request not found');

  if (request.requester.toString() !== userId.toString()) {
    throw ApiError.forbidden('You are not authorized to update this request');
  }

  if (!['draft', 'submitted'].includes(request.status)) {
    throw ApiError.badRequest('Cannot update a request that is already under review or verified');
  }

  const updated = await Request.findByIdAndUpdate(requestId, body, {
    new: true,
    runValidators: true,
  });

  if (files.length > 0) {
    const uploaded = await mediaService.uploadMultiple(files, `requests/${requestId}/media`);
    await Request.findByIdAndUpdate(requestId, { $push: { media: { $each: uploaded } } });
  }

  await invalidateRequestCache();
  return updated;
};

/**
 * Add progress updates to an active request
 */
const addProgressUpdate = async (requestId, userId, data, files = []) => {
  const request = await Request.findById(requestId);
  if (!request) throw ApiError.notFound('Request not found');

  let media = [];
  if (files.length > 0) {
    media = await mediaService.uploadMultiple(files, `requests/${requestId}/progress`);
  }

  const update = {
    title: data.title,
    description: data.description,
    updated_by: userId,
    media,
    created_at: new Date(),
  };

  await Request.findByIdAndUpdate(requestId, { $push: { progress_updates: update } });

  await addJob('notification', 'notify_request_progress', {
    type: 'single',
    userId: request.requester.toString(),
    title: `📊 Progress Update: ${request.title}`,
    body: data.title,
    data: { request_id: requestId },
  });

  return update;
};

/**
 * Public Search
 */
const searchRequests = async ({ q, page, limit }) => {
  if (!q) throw ApiError.badRequest('Search query is required');

  const { page: p, limit: l, skip } = paginate(page, limit);
  const filter = { $text: { $search: q }, status: 'verified', is_visible: true };

  const [results, total] = await Promise.all([
    Request.find(filter, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } })
      .populate('requester', 'first_name last_name')
      .skip(skip)
      .limit(l)
      .lean(),
    Request.countDocuments(filter),
  ]);

  return { results, pagination: paginationMeta(total, p, l) };
};

/**
 * Get Featured Requests (Cached)
 */
const getFeaturedRequests = async (limit = 6) => {
  const redis = getRedisClient();
  const cacheKey = `requests:featured:${limit}`;
  
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const requests = await Request.find({
    status: 'verified',
    is_visible: true,
    is_featured: true,
  })
    .populate('requester', 'first_name last_name avatar')
    .sort('-created_at')
    .limit(limit)
    .lean();

  await redis.setEx(cacheKey, 300, JSON.stringify(requests));
  return requests;
};

/**
 * Delete a request
 */
const deleteRequest = async (requestId, userId, userRole) => {
  const request = await Request.findById(requestId);
  if (!request) throw ApiError.notFound('Request not found');

  const isOwner = request.requester.toString() === userId.toString();
  const isAdmin = userRole === 'super_admin';

  if (!isOwner && !isAdmin) throw ApiError.forbidden('Not authorized to delete this request');
  
  if (!['draft', 'submitted', 'rejected'].includes(request.status)) {
    throw ApiError.badRequest('Cannot delete a request in an active or funded state');
  }

  await Request.findByIdAndDelete(requestId);
  await Wallet.deleteOne({ request: requestId });
  await invalidateRequestCache();

  return { message: 'Request deleted successfully' };
};

/**
 * ADMIN: Verify or Reject Request
 */
const verifyRequest = async (requestId, adminId, { status, reason, notes }) => {
  const request = await Request.findById(requestId);
  if (!request) throw ApiError.notFound('Request not found');

  const updateData = {
    status,
    'verification.verified_by': adminId,
    'verification.verified_at': new Date(),
    is_visible: status === 'verified',
  };

  if (status === 'rejected') {
    updateData['verification.rejected_by'] = adminId;
    updateData['verification.rejected_at'] = new Date();
    updateData['verification.rejection_reason'] = reason;
    updateData.is_visible = false;
  }

  if (notes) {
    updateData.$push = { 'verification.notes': notes };
  }

  const updated = await Request.findByIdAndUpdate(requestId, updateData, { new: true });

  await addJob('notification', 'notify_request_status_change', {
    userId: request.requester.toString(),
    status,
    title: request.title,
    reason: reason || ''
  });

  await invalidateRequestCache();
  return updated;
};

module.exports = {
  createRequest,
  getVerifiedRequests,
  getRequestById,
  getUserRequests,
  updateRequest,
  addProgressUpdate,
  searchRequests,
  getFeaturedRequests,
  deleteRequest,
  verifyRequest,
};





// 'use strict';

// const Request      = require('./request.model');
// const Wallet       = require('../wallets/wallet.model');
// const { addJob }   = require('../../config/bullmq');
// const { getRedisClient } = require('../../config/redis');
// const { paginate, paginationMeta, generateReference } = require('../../utils/helpers');
// const ApiError     = require('../../utils/apiError');
// const mediaService = require('../media/media.service');

// const REQUESTER_TYPE_MAP = {
//   individual:        'individual',
//   student:           'student',
//   school_admin:      'school',
//   community_leader:  'community',
//   ngo_partner:       'ngo',
// };

// const invalidateRequestCache = async () => {
//   const redis = getRedisClient();
//   const keys  = await redis.keys('requests:verified:*');
//   if (keys.length) await redis.del(keys);
// };

// const createRequest = async (userId, userRole, body, files = []) => {
//   const requesterType = REQUESTER_TYPE_MAP[userRole] || 'individual';

//   const request = await Request.create({
//     ...body,
//     requester:      userId,
//     requester_type: requesterType,
//     status:         'submitted',
//   });

//   if (files.length > 0) {
//     const uploaded = await mediaService.uploadMultiple(files, `requests/${request._id}/media`);
//     await Request.findByIdAndUpdate(request._id, { $push: { media: { $each: uploaded } } });
//   }

//   await Wallet.create({
//     request:     request._id,
//     wallet_type: 'case_wallet',
//     reference:   generateReference('CW'),
//     currency:    'NGN',
//   });

//   await addJob('notification', 'notify_admins_new_request', {
//     type:   'broadcast',
//     roles:  ['super_admin'],
//     title:  '📥 New Request Submitted',
//     body:   `"${request.title}" needs verification`,
//     data:   { request_id: request._id.toString() },
//   });

//   return request;
// };

// const getVerifiedRequests = async (query) => {
//   const {
//     page, limit, category, state, lga, urgency,
//     min_amount, max_amount, search, is_featured,
//     sort = '-created_at', fund_type,
//   } = query;

//   const { page: p, limit: l, skip } = paginate(page, limit);

//   const filter = { status: 'verified', is_visible: true, is_archived: false };

//   if (category)              filter.category   = category;
//   if (state)                 filter.state      = state;
//   if (lga)                   filter.lga        = lga;
//   if (urgency)               filter.urgency    = urgency;
//   if (fund_type)             filter.fund_type  = fund_type;
//   if (is_featured === 'true') filter.is_featured = true;
//   if (min_amount || max_amount) {
//     filter.amount_needed = {};
//     if (min_amount) filter.amount_needed.$gte = Number(min_amount);
//     if (max_amount) filter.amount_needed.$lte = Number(max_amount);
//   }
//   if (search) filter.$text = { $search: search };

//   const cacheKey = `requests:verified:${JSON.stringify(filter)}:${p}:${l}:${sort}`;
//   // const redis    = getRedisClient();
//   const redis = getRedisClient();
// await redis.flushAll();
//   const cached   = await redis.get(cacheKey);
//   if (cached) return JSON.parse(cached);

//   const [requests, total] = await Promise.all([
//     Request.find(filter)
//       .select('-verification.fraud_score -ngo_field_reports')
//       .populate('requester', 'first_name last_name state lga avatar')
//       .populate('assigned_ngo', 'name logo')
//       .sort(sort)
//       .skip(skip)
//       .limit(l)
//       .lean(),
//     Request.countDocuments(filter),
//   ]);

//   const result = { requests, pagination: paginationMeta(total, p, l) };
//   await redis.setEx(cacheKey, 300, JSON.stringify(result));
//   return result;
// };

// const getRequestById = async (id, userId = null) => {
//   const request = await Request.findById(id)
//     .populate('requester', 'first_name last_name state lga avatar bio')
//     .populate('assigned_ngo', 'name logo contact_email website')
//     .populate('verification.verified_by', 'first_name last_name')
//     .populate('progress_updates.updated_by', 'first_name last_name role')
//     .lean();

//   if (!request) throw ApiError.notFound('Request not found');

//   if (!request.is_visible && !userId) {
//     throw ApiError.forbidden('This request is not publicly visible');
//   }

//   await Request.findByIdAndUpdate(id, { $inc: { views: 1 } });
//   return request;
// };

// const getUserRequests = async (userId, query) => {
//   const { page, limit, status } = query;
//   const { page: p, limit: l, skip } = paginate(page, limit);

//   const filter = { requester: userId };
//   if (status) filter.status = status;

//   const [requests, total] = await Promise.all([
//     Request.find(filter)
//       .populate('assigned_ngo', 'name logo')
//       .sort('-created_at')
//       .skip(skip)
//       .limit(l)
//       .lean(),
//     Request.countDocuments(filter),
//   ]);

//   return { requests, pagination: paginationMeta(total, p, l) };
// };

// const updateRequest = async (requestId, userId, body, files = []) => {
//   const request = await Request.findById(requestId);
//   if (!request) throw ApiError.notFound('Request not found');

//   if (request.requester.toString() !== userId.toString()) {
//     throw ApiError.forbidden('You are not authorized to update this request');
//   }

//   if (!['draft', 'submitted'].includes(request.status)) {
//     throw ApiError.badRequest('Cannot update a request that is under review or beyond');
//   }

//   const updated = await Request.findByIdAndUpdate(requestId, body, {
//     new:           true,
//     runValidators: true,
//   });

//   if (files.length > 0) {
//     const uploaded = await mediaService.uploadMultiple(files, `requests/${requestId}/media`);
//     await Request.findByIdAndUpdate(requestId, { $push: { media: { $each: uploaded } } });
//   }

//   await invalidateRequestCache();
//   return updated;
// };

// const addProgressUpdate = async (requestId, userId, data, files = []) => {
//   const request = await Request.findById(requestId);
//   if (!request) throw ApiError.notFound('Request not found');

//   let media = [];
//   if (files.length > 0) {
//     media = await mediaService.uploadMultiple(files, `requests/${requestId}/progress`);
//   }

//   const update = {
//     title:       data.title,
//     description: data.description,
//     updated_by:  userId,
//     media,
//     created_at:  new Date(),
//   };

//   await Request.findByIdAndUpdate(requestId, { $push: { progress_updates: update } });

//   await addJob('notification', 'notify_request_progress', {
//     type:   'single',
//     userId: request.requester.toString(),
//     title:  `📊 Progress Update: ${request.title}`,
//     body:   data.title,
//     data:   { request_id: requestId },
//   });

//   return update;
// };

// const searchRequests = async ({ q, page, limit }) => {
//   if (!q) throw ApiError.badRequest('Search query is required');

//   const { page: p, limit: l, skip } = paginate(page, limit);

//   const filter = { $text: { $search: q }, status: 'verified', is_visible: true };

//   const [results, total] = await Promise.all([
//     Request.find(filter, { score: { $meta: 'textScore' } })
//       .sort({ score: { $meta: 'textScore' } })
//       .populate('requester', 'first_name last_name')
//       .skip(skip)
//       .limit(l)
//       .lean(),
//     Request.countDocuments(filter),
//   ]);

//   return { results, pagination: paginationMeta(total, p, l) };
// };

// const getFeaturedRequests = async (limit = 6) => {
//   const redis    = getRedisClient();
//   const cacheKey = `requests:featured:${limit}`;
//   const cached   = await redis.get(cacheKey);
//   if (cached) return JSON.parse(cached);

//   const requests = await Request.find({
//     status:      'verified',
//     is_visible:  true,
//     is_featured: true,
//   })
//     .populate('requester', 'first_name last_name avatar')
//     .sort('-created_at')
//     .limit(limit)
//     .lean();

//   await redis.setEx(cacheKey, 300, JSON.stringify(requests));
//   return requests;
// };

// const deleteRequest = async (requestId, userId, userRole) => {
//   const request = await Request.findById(requestId);
//   if (!request) throw ApiError.notFound('Request not found');

//   const isOwner = request.requester.toString() === userId.toString();
//   const isAdmin = userRole === 'super_admin';

//   if (!isOwner && !isAdmin) throw ApiError.forbidden('Not authorized to delete this request');
//   if (!['draft', 'submitted', 'rejected'].includes(request.status)) {
//     throw ApiError.badRequest('Cannot delete a request in active or funded state');
//   }

//   await Request.findByIdAndDelete(requestId);
//   await Wallet.deleteOne({ request: requestId });
//   await invalidateRequestCache();

//   return { message: 'Request deleted successfully' };
// };


// const invalidateCache = async () => {
//   const redis = getRedisClient();
//   const keys = await redis.keys('requests:*');
//   if (keys.length) await redis.del(keys);
// };

// /**
//  * ADMIN: Verify or Reject Request
//  */
// const verifyRequest = async (requestId, adminId, { status, reason, notes }) => {
//   const request = await Request.findById(requestId);
//   if (!request) throw ApiError.notFound('Request not found');

//   const updateData = {
//     status,
//     'verification.verified_by': adminId,
//     'verification.verified_at': new Date(),
//     is_visible: status === 'verified', // Visibility logic
//   };

//   if (status === 'rejected') {
//     updateData['verification.rejected_by'] = adminId;
//     updateData['verification.rejected_at'] = new Date();
//     updateData['verification.rejection_reason'] = reason;
//     updateData.is_visible = false;
//   }

//   if (notes) updateData.$push = { 'verification.notes': notes };

//   const updated = await Request.findByIdAndUpdate(requestId, updateData, { new: true });

//   // Trigger Notification Queue (Emails/Push)
//   await addJob('notification', 'notify_request_status_change', {
//     userId: request.requester.toString(),
//     status,
//     title: request.title,
//     reason: reason || ''
//   });

//   await invalidateCache();
//   return updated;
// };

// module.exports = {
//   createRequest,
//   getVerifiedRequests,
//   getRequestById,
//   getUserRequests,
//   updateRequest,
//   addProgressUpdate,
//   searchRequests,
//   getFeaturedRequests,
//   deleteRequest,
//   verifyRequest,
// };