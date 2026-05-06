'use strict';

/* ════════════════════════════════════════════════════════════
   ngo.assignment.service.js
════════════════════════════════════════════════════════════ */

const NgoAssignment    = require('./Ngo.assignment.model');
const Request          = require('../requests/request.model');
const NgoVerification  = require('../ngos/ngo.verification.model');
const User             = require('../users/user.model');
const { addJob }       = require('../../config/bullmq');
const { getRedisClient } = require('../../config/redis');
const mediaService     = require('../media/media.service');
const ApiError         = require('../../utils/apiError');
const { paginate, paginationMeta } = require('../../utils/helpers');

/* ── Cache invalidation helper ────────────────────────────── */
const bustNgoDashboardCache = async (ngoUserId) => {
  const redis = getRedisClient();
  const user  = await User.findById(ngoUserId).select('ngo_profile').lean();
  const ngoId = user?.ngo_profile;
  if (ngoId) await redis.del(`dashboard:ngo:${ngoId}`);
  await redis.del('dashboard:admin');
};

/* ─────────────────────────────────────────────────────────────
   ADMIN — assign a verified NGO to a request
───────────────────────────────────────────────────────────── */
const assignNgo = async (adminId, { request_id, ngo_user_id, type, instructions, deadline_days = 7 }) => {
  // 1. Confirm request exists
  const request = await Request.findById(request_id);
  if (!request) throw ApiError.notFound('Request not found');

  // 2. Confirm NGO is verified
  const verification = await NgoVerification.findOne({ ngo: ngo_user_id, status: 'approved' });
  if (!verification) throw ApiError.badRequest('NGO is not verified. Only approved NGOs can be assigned.');

  // 3. Check permission for the assignment type
  if (type === 'field_verification' && !verification.permissions.can_verify_requests) {
    throw ApiError.forbidden('This NGO does not have field verification permissions.');
  }
  if (type === 'execution' && !verification.permissions.can_execute_projects) {
    throw ApiError.forbidden('This NGO does not have execution permissions.');
  }

  // 4. Check max concurrent cases (0 = unlimited)
  const max = verification.permissions.max_concurrent_cases;
  if (max > 0) {
    const active = await NgoAssignment.countDocuments({
      ngo:    ngo_user_id,
      status: { $in: ['assigned', 'accepted', 'in_progress'] },
    });
    if (active >= max) {
      throw ApiError.badRequest(`This NGO has reached their maximum of ${max} concurrent assignments.`);
    }
  }

  // 5. Check for duplicate active assignment of same type on same request
  const existing = await NgoAssignment.findOne({
    request: request_id,
    type,
    status: { $in: ['assigned', 'accepted', 'in_progress'] },
  });
  if (existing) throw ApiError.conflict(`An active ${type} assignment already exists for this request.`);

  // 6. Calculate deadline
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + deadline_days);

  // 7. Create assignment
  const assignment = await NgoAssignment.create({
    request:     request_id,
    ngo:         ngo_user_id,
    assigned_by: adminId,
    type,
    instructions,
    deadline,
    status: 'assigned',
  });

  // 8. Update request with assigned NGO
  await Request.findByIdAndUpdate(request_id, { assigned_ngo: ngo_user_id });

  // 9. Bust NGO dashboard cache so they see it immediately
  await bustNgoDashboardCache(ngo_user_id);

  // 10. Notify NGO
  await addJob('notification', 'notify_ngo_assignment', {
    type:   'single',
    userId: ngo_user_id,
    title:  `📋 New ${type === 'field_verification' ? 'Verification' : 'Execution'} Assignment`,
    body:   `You have been assigned to "${request.title}". Deadline: ${deadline.toLocaleDateString('en-NG')}`,
    data:   { assignment_id: assignment._id.toString(), request_id },
  });

  return assignment.populate([
    { path: 'request',     select: 'title category state lga urgency status' },
    { path: 'ngo',         select: 'first_name last_name email' },
    { path: 'assigned_by', select: 'first_name last_name' },
  ]);
};

/* ─────────────────────────────────────────────────────────────
   ADMIN — list all assignments
───────────────────────────────────────────────────────────── */
const listAssignments = async (query) => {
  const { page, limit, status, type, ngo, overdue } = query;
  const { page: p, limit: l, skip } = paginate(page, limit);

  const filter = {};
  if (status) filter.status = status;
  if (type)   filter.type   = type;
  if (ngo)    filter.ngo    = ngo;
  if (overdue === 'true') {
    filter.deadline = { $lt: new Date() };
    filter.status   = { $in: ['assigned', 'accepted', 'in_progress'] };
  }

  const [data, total] = await Promise.all([
    NgoAssignment.find(filter)
      .populate('request',     'title category state lga urgency status amount_needed')
      .populate('ngo',         'first_name last_name email avatar')
      .populate('assigned_by', 'first_name last_name')
      .sort({ deadline: 1 })
      .skip(skip).limit(l).lean(),
    NgoAssignment.countDocuments(filter),
  ]);

  return { data, pagination: paginationMeta(total, p, l) };
};

/* ─────────────────────────────────────────────────────────────
   ADMIN — reassign to different NGO
───────────────────────────────────────────────────────────── */
const reassign = async (assignmentId, adminId, { ngo_user_id, reason, deadline_days = 7 }) => {
  const assignment = await NgoAssignment.findById(assignmentId);
  if (!assignment) throw ApiError.notFound('Assignment not found');

  const verification = await NgoVerification.findOne({ ngo: ngo_user_id, status: 'approved' });
  if (!verification) throw ApiError.badRequest('New NGO is not verified');

  // Mark old assignment as reassigned
  assignment.status              = 'reassigned';
  assignment.previous_ngo        = assignment.ngo;
  assignment.reassigned_at       = new Date();
  assignment.reassignment_reason = reason;
  await assignment.save();

  // Notify old NGO
  await addJob('notification', 'notify_user', {
    type:   'single',
    userId: assignment.ngo.toString(),
    title:  '🔄 Assignment Reassigned',
    body:   `Your assignment has been reassigned to another NGO. Reason: ${reason}`,
    data:   { assignment_id: assignmentId },
  });

  // Create new assignment
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + deadline_days);

  const newAssignment = await NgoAssignment.create({
    request:          assignment.request,
    ngo:              ngo_user_id,
    assigned_by:      adminId,
    type:             assignment.type,
    instructions:     assignment.instructions,
    deadline,
    status:           'assigned',
    previous_ngo:     assignment.ngo,
  });

  await bustNgoDashboardCache(ngo_user_id);
  await bustNgoDashboardCache(assignment.ngo.toString());

  return newAssignment;
};

/* ─────────────────────────────────────────────────────────────
   NGO — accept assignment
───────────────────────────────────────────────────────────── */
const acceptAssignment = async (assignmentId, ngoUserId) => {
  const assignment = await NgoAssignment.findOne({ _id: assignmentId, ngo: ngoUserId });
  if (!assignment) throw ApiError.notFound('Assignment not found or not yours');
  if (assignment.status !== 'assigned') throw ApiError.badRequest('Assignment is not in "assigned" status');

  assignment.status      = 'accepted';
  assignment.accepted_at = new Date();
  await assignment.save();

  await bustNgoDashboardCache(ngoUserId);

  // Notify admin
  await addJob('notification', 'notify_admins_assignment_accepted', {
    type:  'broadcast',
    roles: ['super_admin'],
    title: '✅ NGO Accepted Assignment',
    body:  `An NGO has accepted their assignment. Case review can now begin.`,
    data:  { assignment_id: assignmentId },
  });

  return assignment;
};

/* ─────────────────────────────────────────────────────────────
   NGO — decline assignment
───────────────────────────────────────────────────────────── */
const declineAssignment = async (assignmentId, ngoUserId, { reason }) => {
  const assignment = await NgoAssignment.findOne({ _id: assignmentId, ngo: ngoUserId });
  if (!assignment) throw ApiError.notFound('Assignment not found or not yours');
  if (!['assigned', 'accepted'].includes(assignment.status)) throw ApiError.badRequest('Cannot decline at this stage');

  assignment.status         = 'declined';
  assignment.declined_at    = new Date();
  assignment.decline_reason = reason;
  await assignment.save();

  await bustNgoDashboardCache(ngoUserId);

  // Alert admin to reassign
  await addJob('notification', 'notify_admins_assignment_declined', {
    type:  'broadcast',
    roles: ['super_admin'],
    title: '⚠️ NGO Declined Assignment',
    body:  `An NGO declined their assignment. Reason: ${reason}. Please reassign.`,
    data:  { assignment_id: assignmentId },
  });

  return assignment;
};

/* ─────────────────────────────────────────────────────────────
   NGO — submit verification/execution report
───────────────────────────────────────────────────────────── */
const submitReport = async (assignmentId, ngoUserId, body, files = []) => {
  const assignment = await NgoAssignment.findOne({ _id: assignmentId, ngo: ngoUserId })
    .populate('request', 'title requester');
  if (!assignment) throw ApiError.notFound('Assignment not found or not yours');

  if (!['accepted', 'in_progress'].includes(assignment.status)) {
    throw ApiError.badRequest('You can only submit a report for accepted or in-progress assignments');
  }

  // Upload media evidence
  let media = [];
  if (files.length > 0) {
    media = await mediaService.uploadMultiple(files, `assignments/${assignment._id}/report`);
  }

  assignment.status = 'report_submitted';
  assignment.report = {
    submitted_at:            new Date(),
    site_visited:            body.site_visited            === 'true' || body.site_visited === true,
    visit_date:              body.visit_date              ? new Date(body.visit_date) : undefined,
    beneficiaries_confirmed: body.beneficiaries_confirmed ? Number(body.beneficiaries_confirmed) : undefined,
    location_confirmed:      body.location_confirmed      === 'true' || body.location_confirmed === true,
    needs_confirmed:         body.needs_confirmed         === 'true' || body.needs_confirmed === true,
    fraud_risk:              body.fraud_risk              || 'none',
    recommendation:          body.recommendation          || 'pending',
    summary:                 body.summary,
    findings:                body.findings,
    challenges:              body.challenges,
    next_steps:              body.next_steps,
    media,
    gps_coordinates:         body.gps_lat && body.gps_lng
      ? { lat: Number(body.gps_lat), lng: Number(body.gps_lng) }
      : undefined,
  };

  await assignment.save();
  await bustNgoDashboardCache(ngoUserId);

  // Notify admin — report ready for review
  await addJob('notification', 'notify_admins_report_submitted', {
    type:  'broadcast',
    roles: ['super_admin'],
    title: `📊 Field Report Submitted`,
    body:  `NGO field report received for "${assignment.request?.title}". Ready for review.`,
    data:  {
      assignment_id: assignmentId,
      request_id:   assignment.request?._id?.toString(),
      recommendation: body.recommendation,
    },
  });

  return assignment;
};

/* ─────────────────────────────────────────────────────────────
   NGO — mark as in_progress
───────────────────────────────────────────────────────────── */
const markInProgress = async (assignmentId, ngoUserId) => {
  const assignment = await NgoAssignment.findOne({ _id: assignmentId, ngo: ngoUserId });
  if (!assignment) throw ApiError.notFound('Assignment not found or not yours');
  if (assignment.status !== 'accepted') throw ApiError.badRequest('Must accept assignment before marking in progress');

  assignment.status = 'in_progress';
  await assignment.save();
  await bustNgoDashboardCache(ngoUserId);
  return assignment;
};

/* ─────────────────────────────────────────────────────────────
   ADMIN — review submitted report
───────────────────────────────────────────────────────────── */
const reviewReport = async (assignmentId, adminId, { accepted, feedback }) => {
  const assignment = await NgoAssignment.findById(assignmentId)
    .populate('request', 'title')
    .populate('ngo',     'first_name last_name');

  if (!assignment) throw ApiError.notFound('Assignment not found');
  if (assignment.status !== 'report_submitted') throw ApiError.badRequest('No report to review');

  assignment.report_review = { reviewed_by: adminId, reviewed_at: new Date(), accepted, feedback };

  if (accepted) {
    assignment.status       = 'completed';
    assignment.completed_at = new Date();
    assignment.completed_by = adminId;
  }

  await assignment.save();
  await bustNgoDashboardCache(assignment.ngo._id.toString());

  // Notify NGO of report review outcome
  await addJob('notification', 'notify_user', {
    type:   'single',
    userId: assignment.ngo._id.toString(),
    title:  accepted ? '✅ Report Accepted' : '🔄 Report Needs Revision',
    body:   accepted
      ? `Your field report for "${assignment.request.title}" has been accepted. Well done!`
      : `Your report needs revision. Feedback: ${feedback}`,
    data:   { assignment_id: assignmentId },
  });

  return assignment;
};

/* ─────────────────────────────────────────────────────────────
   ADMIN — get list of verified NGOs available for assignment
───────────────────────────────────────────────────────────── */
const getAvailableNgos = async ({ state, sdg, type = 'field_verification' }) => {
  // Find all approved NGOs
  const verified = await NgoVerification.find({
    status: 'approved',
    ...(state ? { operational_states: state } : {}),
    ...(sdg   ? { sdg_focus: sdg }            : {}),
    ...(type === 'field_verification'
      ? { 'permissions.can_verify_requests':  true }
      : { 'permissions.can_execute_projects': true }),
  })
    .populate('ngo', 'first_name last_name email avatar')
    .lean();

  // Enrich with active assignment count per NGO
  const ngoIds = verified.map(v => v.ngo?._id);
  const activeCounts = await NgoAssignment.aggregate([
    { $match: { ngo: { $in: ngoIds }, status: { $in: ['assigned', 'accepted', 'in_progress'] } } },
    { $group: { _id: '$ngo', count: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(activeCounts.map(a => [a._id.toString(), a.count]));

  return verified.map(v => ({
    ...v,
    active_assignments: countMap[v.ngo?._id?.toString()] || 0,
    at_capacity: v.permissions.max_concurrent_cases > 0
      && (countMap[v.ngo?._id?.toString()] || 0) >= v.permissions.max_concurrent_cases,
  }));
};

/* ─────────────────────────────────────────────────────────────
   NGO — get own assignments
───────────────────────────────────────────────────────────── */
const getMyAssignments = async (ngoUserId, query) => {
  const { page, limit, status } = query;
  const { page: p, limit: l, skip } = paginate(page, limit);

  const filter = { ngo: ngoUserId };
  if (status) filter.status = status;

  const [data, total] = await Promise.all([
    NgoAssignment.find(filter)
      .populate('request',     'title category state lga urgency amount_needed status beneficiaries_count media')
      .populate('assigned_by', 'first_name last_name')
      .sort({ deadline: 1 })
      .skip(skip).limit(l).lean(),
    NgoAssignment.countDocuments(filter),
  ]);

  return { data, pagination: paginationMeta(total, p, l) };
};

module.exports = {
  assignNgo, listAssignments, reassign,
  acceptAssignment, declineAssignment,
  submitReport, markInProgress, reviewReport,
  getAvailableNgos, getMyAssignments,
};