'use strict';

const Request         = require('./request.model');
const Wallet          = require('../wallets/wallet.model');
const NgoAssignment   = require('../assignments/ngo.assignment.model');
const NgoVerification = require('../ngos/ngo.verification.model');
const User            = require('../users/user.model');
// fee.service is required inline inside verifyRequest to avoid circular deps
const { addJob }      = require('../../config/bullmq');
const { getRedisClient } = require('../../config/redis');
const { paginate, paginationMeta, generateReference } = require('../../utils/helpers');
const ApiError        = require('../../utils/apiError');
const mediaService    = require('../media/media.service');

const REQUESTER_TYPE_MAP = {
  individual:       'individual',
  student:          'student',
  school_admin:     'school',
  community_leader: 'community',
  ngo_partner:      'ngo',
};

/* ── Cache invalidation ─────────────────────────────────────── */
const invalidateRequestCache = async () => {
  const redis = getRedisClient();
  const keys  = await redis.keys('requests:*');
  if (keys.length > 0) await redis.del(keys);
};

/* ── Bust a single NGO's dashboard cache ────────────────────── */
const bustNgoDashboardCache = async (ngoUserId) => {
  try {
    const redis = getRedisClient();
    const user  = await User.findById(ngoUserId).select('ngo_profile').lean();
    const ngoId = user?.ngo_profile;
    if (ngoId) await redis.del(`dashboard:ngo:${ngoId}`);
    await redis.del('dashboard:admin');
  } catch { /* non-critical */ }
};

/* ══════════════════════════════════════════════════════════════
   CREATE REQUEST
══════════════════════════════════════════════════════════════ */
const createRequest = async (userId, userRole, body, files = []) => {
  const requesterType = REQUESTER_TYPE_MAP[userRole] || 'individual';

  const request = await Request.create({
    ...body,
    requester:      userId,
    requester_type: requesterType,
    status:         'submitted',
  });

  if (files.length > 0) {
    const uploaded = await mediaService.uploadMultiple(files, `requests/${request._id}/media`);
    await Request.findByIdAndUpdate(request._id, { $push: { media: { $each: uploaded } } });
  }

  await Wallet.create({
    request:     request._id,
    wallet_type: 'case_wallet',
    reference:   generateReference('CW'),
    currency:    'NGN',
  });

  await addJob('notification', 'notify_admins_new_request', {
    type:  'broadcast',
    roles: ['super_admin'],
    title: '📥 New Request Submitted',
    body:  `"${request.title}" needs verification`,
    data:  { request_id: request._id.toString() },
  });

  return request;
};

/* ══════════════════════════════════════════════════════════════
   GET VERIFIED REQUESTS  (public, cached)
══════════════════════════════════════════════════════════════ */
const getVerifiedRequests = async (query) => {
  const {
    page, limit, category, state, lga, urgency,
    min_amount, max_amount, search, is_featured,
    sort = '-created_at', fund_type,
  } = query;

  const { page: p, limit: l, skip } = paginate(page, limit);

  const filter = { status: 'verified', is_visible: true, is_archived: { $ne: true } };
  if (category)    filter.category  = category;
  if (state)       filter.state     = state;
  if (lga)         filter.lga       = lga;
  if (urgency)     filter.urgency   = urgency;
  if (fund_type)   filter.fund_type = fund_type;
  if (is_featured === 'true') filter.is_featured = true;
  if (min_amount || max_amount) {
    filter.amount_needed = {};
    if (min_amount) filter.amount_needed.$gte = Number(min_amount);
    if (max_amount) filter.amount_needed.$lte = Number(max_amount);
  }
  if (search) filter.$text = { $search: search };

  const cacheKey = `requests:verified:${JSON.stringify(filter)}:${p}:${l}:${sort}`;
  const redis    = getRedisClient();
  const cached   = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const [requests, total] = await Promise.all([
    Request.find(filter)
      .select('-verification.fraud_score -ngo_field_reports')
      .populate('requester',    'first_name last_name state lga avatar')
      .populate('assigned_ngo', 'name logo')
      .sort(sort).skip(skip).limit(l).lean(),
    Request.countDocuments(filter),
  ]);

  const result = { requests, pagination: paginationMeta(total, p, l) };
  await redis.setEx(cacheKey, 300, JSON.stringify(result));
  return result;
};

/* ══════════════════════════════════════════════════════════════
   GET SINGLE REQUEST
══════════════════════════════════════════════════════════════ */
const getRequestById = async (id, userId = null) => {
  const request = await Request.findById(id)
    .populate('requester',                    'first_name last_name state lga avatar bio')
    .populate('assigned_ngo',                 'name logo contact_email website')
    .populate('verification.verified_by',     'first_name last_name')
    .populate('progress_updates.updated_by',  'first_name last_name role')
    .lean();

  if (!request) throw ApiError.notFound('Request not found');
  if (!request.is_visible && !userId) throw ApiError.forbidden('This request is not publicly visible');

  await Request.findByIdAndUpdate(id, { $inc: { views: 1 } });
  return request;
};

/* ══════════════════════════════════════════════════════════════
   GET USER'S OWN REQUESTS
══════════════════════════════════════════════════════════════ */
const getUserRequests = async (userId, query) => {
  const { page, limit, status } = query;
  const { page: p, limit: l, skip } = paginate(page, limit);

  const filter = { requester: userId };
  if (status) filter.status = status;

  const [requests, total] = await Promise.all([
    Request.find(filter)
      .populate('assigned_ngo', 'name logo')
      .sort('-created_at').skip(skip).limit(l).lean(),
    Request.countDocuments(filter),
  ]);
  return { requests, pagination: paginationMeta(total, p, l) };
};

/* ══════════════════════════════════════════════════════════════
   UPDATE REQUEST
══════════════════════════════════════════════════════════════ */
const updateRequest = async (requestId, userId, body, files = []) => {
  const request = await Request.findById(requestId);
  if (!request) throw ApiError.notFound('Request not found');
  if (request.requester.toString() !== userId.toString()) throw ApiError.forbidden('Not authorized');
  if (!['draft', 'submitted'].includes(request.status)) {
    throw ApiError.badRequest('Cannot update a request already under review or verified');
  }

  const updated = await Request.findByIdAndUpdate(requestId, body, { new: true, runValidators: true });
  if (files.length > 0) {
    const uploaded = await mediaService.uploadMultiple(files, `requests/${requestId}/media`);
    await Request.findByIdAndUpdate(requestId, { $push: { media: { $each: uploaded } } });
  }
  await invalidateRequestCache();
  return updated;
};

/* ══════════════════════════════════════════════════════════════
   ADD PROGRESS UPDATE
══════════════════════════════════════════════════════════════ */
const addProgressUpdate = async (requestId, userId, data, files = []) => {
  const request = await Request.findById(requestId);
  if (!request) throw ApiError.notFound('Request not found');

  let media = [];
  if (files.length > 0) {
    media = await mediaService.uploadMultiple(files, `requests/${requestId}/progress`);
  }

  const update = { title: data.title, description: data.description, updated_by: userId, media, created_at: new Date() };
  await Request.findByIdAndUpdate(requestId, { $push: { progress_updates: update } });

  await addJob('notification', 'notify_request_progress', {
    type:   'single',
    userId: request.requester.toString(),
    title:  `📊 Progress Update: ${request.title}`,
    body:   data.title,
    data:   { request_id: requestId },
  });

  return update;
};

/* ══════════════════════════════════════════════════════════════
   SEARCH
══════════════════════════════════════════════════════════════ */
const searchRequests = async ({ q, page, limit }) => {
  if (!q) throw ApiError.badRequest('Search query is required');
  const { page: p, limit: l, skip } = paginate(page, limit);
  const filter = { $text: { $search: q }, status: 'verified', is_visible: true };
  const [results, total] = await Promise.all([
    Request.find(filter, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } })
      .populate('requester', 'first_name last_name')
      .skip(skip).limit(l).lean(),
    Request.countDocuments(filter),
  ]);
  return { results, pagination: paginationMeta(total, p, l) };
};

/* ══════════════════════════════════════════════════════════════
   GET FEATURED  (cached)
══════════════════════════════════════════════════════════════ */
const getFeaturedRequests = async (limit = 6) => {
  const redis    = getRedisClient();
  const cacheKey = `requests:featured:${limit}`;
  const cached   = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const requests = await Request.find({ status: 'verified', is_visible: true, is_featured: true })
    .populate('requester', 'first_name last_name avatar')
    .sort('-created_at').limit(limit).lean();

  await redis.setEx(cacheKey, 300, JSON.stringify(requests));
  return requests;
};

/* ══════════════════════════════════════════════════════════════
   DELETE REQUEST
══════════════════════════════════════════════════════════════ */
const deleteRequest = async (requestId, userId, userRole) => {
  const request = await Request.findById(requestId);
  if (!request) throw ApiError.notFound('Request not found');

  const isOwner = request.requester.toString() === userId.toString();
  const isAdmin = userRole === 'super_admin';
  if (!isOwner && !isAdmin) throw ApiError.forbidden('Not authorized');
  if (!['draft', 'submitted', 'rejected'].includes(request.status)) {
    throw ApiError.badRequest('Cannot delete a request in an active or funded state');
  }

  await Request.findByIdAndDelete(requestId);
  await Wallet.deleteOne({ request: requestId });
  await invalidateRequestCache();
  return { message: 'Request deleted successfully' };
};

/* ══════════════════════════════════════════════════════════════
   ADMIN VERIFY / REJECT
══════════════════════════════════════════════════════════════ */
const verifyRequest = async (requestId, adminId, { status, reason, notes, ngo_fee_pct, platform_fee_pct } = {}) => {
  const request = await Request.findById(requestId);
  if (!request) throw ApiError.notFound('Request not found');

  const updateData = {
    status,
    'verification.verified_by': adminId,
    'verification.verified_at': new Date(),
    is_visible: status === 'verified',
  };

  if (status === 'rejected') {
    updateData['verification.rejected_by']      = adminId;
    updateData['verification.rejected_at']      = new Date();
    updateData['verification.rejection_reason'] = reason;
    updateData.is_visible                       = false;
  }
  if (notes) updateData.$push = { 'verification.notes': notes };

  const updated = await Request.findByIdAndUpdate(requestId, updateData, { new: true });

  /* ── Auto-apply fees when request is verified ── */
  if (status === 'verified') {
    const feeSvc = require('../fees/fee.service');
    await feeSvc.applyFeesToRequest(requestId, adminId, {
      ngo_fee_pct:      ngo_fee_pct      ?? undefined,
      platform_fee_pct: platform_fee_pct ?? undefined,
    });
  }

  await addJob('notification', 'notify_request_status_change', {
    userId: request.requester.toString(),
    status,
    title:  request.title,
    reason: reason || '',
  });

  await invalidateRequestCache();
  return Request.findById(requestId).lean(); // return with fees applied
};

/* ══════════════════════════════════════════════════════════════
   ADMIN: ASSIGN REQUEST TO VERIFIED NGO  ← NEW
   
   Creates an NgoAssignment record, links the NGO to the request,
   busts the NGO's dashboard cache so they see it immediately,
   and sends a notification with the full deadline.

   The assigned NGO gets full read access to:
   - request.title, description, impact_statement
   - request.media  (all images / videos / documents)
   - request.state, lga, beneficiaries_count
   - request.amount_needed
   - Any existing verification notes

   Access is gated in getAssignmentWithRequest() below.
══════════════════════════════════════════════════════════════ */
const assignRequestToNgo = async (requestId, adminId, {
  ngo_user_id,
  assignment_type = 'field_verification',
  instructions    = '',
  deadline_days   = 7,
}) => {
  /* 1. Load request */
  const request = await Request.findById(requestId).lean();
  if (!request) throw ApiError.notFound('Request not found');

  if (['verified', 'rejected', 'completed'].includes(request.status)) {
    throw ApiError.badRequest(`Cannot assign a request with status "${request.status}"`);
  }

  /* 2. Confirm NGO is verified and approved */
  const verification = await NgoVerification.findOne({ ngo: ngo_user_id, status: 'approved' });
  if (!verification) {
    throw ApiError.badRequest('NGO is not verified. Only approved NGOs can be assigned.');
  }

  /* 3. Check the NGO has the right permission for the assignment type */
  if (assignment_type === 'field_verification' && !verification.permissions.can_verify_requests) {
    throw ApiError.forbidden('This NGO does not have field verification permission (Tier too low).');
  }
  if (assignment_type === 'execution' && !verification.permissions.can_execute_projects) {
    throw ApiError.forbidden('This NGO does not have execution permission.');
  }

  /* 4. Enforce max concurrent case limit */
  const maxCases = verification.permissions.max_concurrent_cases;
  if (maxCases > 0) {
    const activeCount = await NgoAssignment.countDocuments({
      ngo:    ngo_user_id,
      status: { $in: ['assigned', 'accepted', 'in_progress'] },
    });
    if (activeCount >= maxCases) {
      throw ApiError.badRequest(
        `NGO has reached their maximum of ${maxCases} concurrent assignments. Reassign an existing one first.`
      );
    }
  }

  /* 5. Prevent duplicate active assignment of same type on same request */
  const duplicate = await NgoAssignment.findOne({
    request: requestId,
    type:    assignment_type,
    status:  { $in: ['assigned', 'accepted', 'in_progress'] },
  });
  if (duplicate) {
    throw ApiError.conflict(
      `An active ${assignment_type} assignment already exists for this request. Reassign it instead.`
    );
  }

  /* 6. Calculate deadline */
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + Math.max(1, Math.min(30, deadline_days)));

  /* 7. Create the assignment */
  const assignment = await NgoAssignment.create({
    request:      requestId,
    ngo:          ngo_user_id,
    assigned_by:  adminId,
    type:         assignment_type,
    instructions: instructions.trim(),
    deadline,
    status:       'assigned',
  });

  /* 8. Mark the request as under field verification and link the NGO */
  await Request.findByIdAndUpdate(requestId, {
    assigned_ngo: ngo_user_id,
    status:       'under_review',
  });

  /* 9. Bust NGO dashboard cache — they see it immediately */
  await bustNgoDashboardCache(ngo_user_id);

  /* 10. Notify the NGO with full context */
  const typeLabel = assignment_type === 'field_verification' ? 'Field Verification' : 'Execution';
  await addJob('notification', 'notify_ngo_assignment', {
    type:   'single',
    userId: ngo_user_id,
    title:  `📋 New ${typeLabel} Assignment`,
    body:   `You have been assigned to verify "${request.title}" in ${request.state}. Deadline: ${deadline.toLocaleDateString('en-NG', { day:'numeric', month:'long', year:'numeric' })}`,
    data:   {
      assignment_id: assignment._id.toString(),
      request_id:    requestId,
      deadline:      deadline.toISOString(),
    },
  });

  /* 11. Return the full assignment with populated request (all media included) */
  return NgoAssignment.findById(assignment._id)
    .populate({
      path:   'request',
      select: 'title description impact_statement category fund_type state lga urgency amount_needed beneficiaries_count media tags verification status requester',
      populate: { path: 'requester', select: 'first_name last_name email avatar' },
    })
    .populate('ngo',         'first_name last_name email avatar')
    .populate('assigned_by', 'first_name last_name')
    .lean();
};

/* ══════════════════════════════════════════════════════════════
   NGO: GET ASSIGNMENT WITH FULL REQUEST DETAILS
   Called from the NGO dashboard — returns everything including
   all media (images, videos, documents) the requester submitted.
══════════════════════════════════════════════════════════════ */
const getAssignmentWithRequest = async (assignmentId, ngoUserId) => {
  const assignment = await NgoAssignment.findOne({ _id: assignmentId, ngo: ngoUserId })
    .populate({
      path:   'request',
      select: 'title description impact_statement category fund_type state lga urgency amount_needed beneficiaries_count media tags verification progress_updates status requester createdAt',
      populate: { path: 'requester', select: 'first_name last_name avatar' },
    })
    .populate('assigned_by', 'first_name last_name')
    .lean();

  if (!assignment) throw ApiError.notFound('Assignment not found or not assigned to you');

  // Increment a view counter so admin can see the NGO has accessed it
  await NgoAssignment.findByIdAndUpdate(assignmentId, { $set: { last_accessed_at: new Date() } });

  return assignment;
};

/* ══════════════════════════════════════════════════════════════
   ADMIN: LIST ALL ASSIGNMENTS FOR A REQUEST
══════════════════════════════════════════════════════════════ */
const getRequestAssignments = async (requestId) => {
  const assignments = await NgoAssignment.find({ request: requestId })
    .populate('ngo',         'first_name last_name email avatar')
    .populate('assigned_by', 'first_name last_name')
    .sort('-createdAt')
    .lean();

  return assignments;
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
  assignRequestToNgo,        // ← new
  getAssignmentWithRequest,  // ← new
  getRequestAssignments,     // ← new
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