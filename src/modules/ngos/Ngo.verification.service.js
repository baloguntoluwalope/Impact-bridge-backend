'use strict';

const NgoVerification = require('./Ngo.verification.model');
const User            = require('../users/user.model');
const { addJob }      = require('../../config/bullmq');
const mediaService    = require('../media/media.service');
const ApiError        = require('../../utils/apiError');
const { paginate, paginationMeta } = require('../../utils/helpers');

/* ─────────────────────────────────────────────────────────────
   NGO ACTIONS
───────────────────────────────────────────────────────────── */

/**
 * Start or continue a draft application
 */
const getOrCreateApplication = async (ngoId) => {
  let app = await NgoVerification.findOne({ ngo: ngoId });

  if (!app) {
    app = await NgoVerification.create({ ngo: ngoId });
  }

  if (app.status === 'rejected' && app.reapplication_allowed_at > new Date()) {
    const daysLeft = Math.ceil((app.reapplication_allowed_at - new Date()) / (1000 * 60 * 60 * 24));
    throw ApiError.forbidden(
      `You may reapply in ${daysLeft} days. Previous application was rejected.`
    );
  }

  return app;
};

/**
 * Save application progress (any step)
 */
const saveProgress = async (ngoId, body) => {
  const app = await NgoVerification.findOne({ ngo: ngoId });
  if (!app) throw ApiError.notFound('No application found. Start one first.');

  if (!['draft', 'submitted'].includes(app.status)) {
    throw ApiError.badRequest(`Cannot edit an application in "${app.status}" status.`);
  }

  // Merge nested fields carefully
  const allowed = [
    'organisation', 'sdg_focus', 'operational_states',
    'past_projects', 'references', 'questionnaire',
  ];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      if (typeof body[key] === 'object' && !Array.isArray(body[key])) {
        app[key] = { ...app[key]?.toObject?.() || {}, ...body[key] };
      } else {
        app[key] = body[key];
      }
    }
  }

  if (body.declaration_agreed) {
    app.declaration_agreed = true;
    app.declaration_agreed_at = new Date();
  }

  await app.save();
  return app;
};

/**
 * Upload documents to an application
 */
const uploadDocuments = async (ngoId, docType, files) => {
  const app = await NgoVerification.findOne({ ngo: ngoId });
  if (!app) throw ApiError.notFound('No application found.');

  if (!['draft', 'submitted'].includes(app.status)) {
    throw ApiError.badRequest('Cannot upload documents in current status.');
  }

  const SINGLE_DOC_TYPES = [
    'cac_certificate', 'tax_clearance', 'annual_report',
    'constitution', 'board_resolution',
  ];
  const MULTI_DOC_TYPES = ['financial_statements', 'project_evidence', 'additional'];

  if (!SINGLE_DOC_TYPES.includes(docType) && !MULTI_DOC_TYPES.includes(docType)) {
    throw ApiError.badRequest(`Unknown document type: ${docType}`);
  }

  const uploaded = await mediaService.uploadMultiple(
    files,
    `ngo-verification/${app._id}/${docType}`
  );

  if (SINGLE_DOC_TYPES.includes(docType)) {
    // Replace single document
    app.documents[docType] = {
      url:         uploaded[0].url,
      public_id:   uploaded[0].public_id,
      uploaded_at: new Date(),
      verified:    false,
    };
  } else {
    // Append to array
    const entries = uploaded.map(f => ({
      url:         f.url,
      public_id:   f.public_id,
      type:        f.type || 'document',
      uploaded_at: new Date(),
    }));
    app.documents[docType].push(...entries);
  }

  await app.save();
  return app.documents;
};

/**
 * Submit the application for review
 */
const submitApplication = async (ngoId) => {
  const app = await NgoVerification.findOne({ ngo: ngoId });
  if (!app) throw ApiError.notFound('No application found.');

  if (app.status !== 'draft') {
    throw ApiError.badRequest(`Application is already "${app.status}". Cannot re-submit.`);
  }

  // Validate required documents
  const d = app.documents;
  const missing = [];
  if (!d.cac_certificate?.url) missing.push('CAC Certificate');
  if (!d.annual_report?.url)   missing.push('Annual Report');
  if (!d.constitution?.url)    missing.push('NGO Constitution');

  if (missing.length) {
    throw ApiError.badRequest(`Missing required documents: ${missing.join(', ')}`);
  }

  // Validate questionnaire
  const q = app.questionnaire;
  if (!q.why_partner || !q.field_capacity || !q.accountability_approach) {
    throw ApiError.badRequest('Please complete all required questionnaire fields before submitting.');
  }

  if (!app.declaration_agreed) {
    throw ApiError.badRequest('You must agree to the partnership declaration before submitting.');
  }

  app.status       = 'submitted';
  app.submitted_at = new Date();
  if (app.reapplication_count > 0) app.reapplication_count += 1;

  await app.save();

  // Notify admins
  await addJob('notification', 'notify_admins_ngo_application', {
    type:  'broadcast',
    roles: ['super_admin'],
    title: '🏢 New NGO Verification Application',
    body:  `${app.organisation.legal_name} has submitted a verification application`,
    data:  { application_id: app._id.toString() },
  });

  return app;
};

/**
 * NGO: get their own application
 */
const getMyApplication = async (ngoId) => {
  return NgoVerification.findOne({ ngo: ngoId })
    .populate('ngo', 'first_name last_name email avatar')
    .lean();
};

/* ─────────────────────────────────────────────────────────────
   ADMIN ACTIONS
───────────────────────────────────────────────────────────── */

/**
 * List all applications (admin)
 */
const listApplications = async (query) => {
  const { page, limit, status, sdg_focus, state } = query;
  const { page: p, limit: l, skip } = paginate(page, limit);

  const filter = {};
  if (status)    filter.status = status;
  if (sdg_focus) filter.sdg_focus = sdg_focus;
  if (state)     filter['organisation.hq_state'] = state;

  const [data, total] = await Promise.all([
    NgoVerification.find(filter)
      .populate('ngo', 'first_name last_name email avatar')
      .populate('review.assigned_reviewer', 'first_name last_name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(l)
      .lean(),
    NgoVerification.countDocuments(filter),
  ]);

  return { data, pagination: paginationMeta(total, p, l) };
};

/**
 * Get full application detail (admin)
 */
const getApplicationDetail = async (appId) => {
  const app = await NgoVerification.findById(appId)
    .populate('ngo', 'first_name last_name email avatar phone created_at')
    .populate('review.assigned_reviewer', 'first_name last_name email')
    .populate('review.notes.added_by', 'first_name last_name')
    .populate('review.approved_by', 'first_name last_name')
    .populate('review.rejected_by', 'first_name last_name')
    .lean();

  if (!app) throw ApiError.notFound('Application not found');
  return app;
};

/**
 * Assign reviewer and move to under_review
 */
const startReview = async (appId, adminId) => {
  const app = await NgoVerification.findById(appId);
  if (!app) throw ApiError.notFound('Application not found');

  if (app.status !== 'submitted') {
    throw ApiError.badRequest('Can only start review on submitted applications');
  }

  app.status                    = 'under_review';
  app.review.assigned_reviewer  = adminId;
  app.review.started_at         = new Date();

  await app.save();

  // Notify NGO
  await addJob('notification', 'notify_user', {
    type:   'single',
    userId: app.ngo.toString(),
    title:  '🔍 Your application is under review',
    body:   'Our team has started reviewing your verification application.',
    data:   { application_id: app._id.toString() },
  });

  return app;
};

/**
 * Verify a specific document
 */
const verifyDocument = async (appId, adminId, docType, { verified, note }) => {
  const app = await NgoVerification.findById(appId);
  if (!app) throw ApiError.notFound('Application not found');

  // Mark the doc as verified/flagged
  if (app.documents[docType]) {
    app.documents[docType].verified = verified;
  }

  // Log the document note
  app.review.document_notes.push({
    document_type: docType,
    note:          note || (verified ? 'Document verified' : 'Document flagged'),
    flagged:       !verified,
    reviewed_by:   adminId,
    reviewed_at:   new Date(),
  });

  // Check if all core docs now verified
  const coreDocs = ['cac_certificate', 'annual_report', 'constitution'];
  const allVerified = coreDocs.every(d => app.documents[d]?.verified);

  if (allVerified && app.status === 'under_review') {
    app.status = 'documents_verified';
  }

  await app.save();
  return app;
};

/**
 * Add an internal review note
 */
const addReviewNote = async (appId, adminId, note) => {
  const app = await NgoVerification.findById(appId);
  if (!app) throw ApiError.notFound('Application not found');

  app.review.notes.push({ note, added_by: adminId, added_at: new Date() });
  await app.save();
  return app.review.notes;
};

/**
 * Schedule interview
 */
const scheduleInterview = async (appId, adminId, { date, medium, note }) => {
  const app = await NgoVerification.findById(appId);
  if (!app) throw ApiError.notFound('Application not found');

  app.status                    = 'interview_scheduled';
  app.review.interview_date     = new Date(date);
  app.review.interview_medium   = medium;
  app.review.interview_outcome  = 'pending';

  if (note) app.review.notes.push({ note, added_by: adminId, added_at: new Date() });

  await app.save();

  await addJob('notification', 'notify_user', {
    type:   'single',
    userId: app.ngo.toString(),
    title:  '📅 Interview Scheduled',
    body:   `Your verification interview is scheduled for ${new Date(date).toLocaleDateString('en-NG')} via ${medium.replace('_', ' ')}.`,
    data:   { application_id: app._id.toString() },
  });

  return app;
};

/**
 * Set interview outcome
 */
const recordInterviewOutcome = async (appId, adminId, { outcome, notes }) => {
  const app = await NgoVerification.findById(appId);
  if (!app) throw ApiError.notFound('Application not found');

  app.review.interview_outcome = outcome;
  app.review.interview_notes   = notes;
  if (notes) app.review.notes.push({ note: `Interview ${outcome}: ${notes}`, added_by: adminId });

  await app.save();
  return app;
};

/**
 * Approve an NGO application
 */
const approveApplication = async (appId, adminId, { tier = 1, note } = {}) => {
  const app = await NgoVerification.findById(appId);
  if (!app) throw ApiError.notFound('Application not found');

  if (app.status === 'approved') throw ApiError.badRequest('Already approved');

  app.status              = 'approved';
  app.verification_tier   = tier;
  app.review.approved_by  = adminId;
  app.review.completed_at = new Date();

  if (note) app.review.notes.push({ note, added_by: adminId });

  await app.save();

  // Update the User record to mark as verified NGO
  await User.findByIdAndUpdate(app.ngo, {
    'ngo_profile.is_verified': true,
    'ngo_profile.verified_at': new Date(),
    'ngo_profile.verification_tier': tier,
  });

  await addJob('notification', 'notify_user', {
    type:   'single',
    userId: app.ngo.toString(),
    title:  '🎉 Your NGO is now Verified!',
    body:   `Congratulations! Your organisation has been approved as a Tier ${tier} Pathbridge partner.`,
    data:   { application_id: app._id.toString() },
  });

  return app;
};

/**
 * Reject an NGO application
 */
const rejectApplication = async (appId, adminId, { reason, note } = {}) => {
  const app = await NgoVerification.findById(appId);
  if (!app) throw ApiError.notFound('Application not found');

  if (!reason) throw ApiError.badRequest('Rejection reason is required');

  app.status                    = 'rejected';
  app.review.rejected_by        = adminId;
  app.review.rejection_reason   = reason;
  app.review.completed_at       = new Date();
  app.reapplication_count       += 1;

  if (note) app.review.notes.push({ note, added_by: adminId });

  await app.save();  // pre-save hook sets reapplication_allowed_at + clears permissions

  await User.findByIdAndUpdate(app.ngo, {
    'ngo_profile.is_verified': false,
  });

  await addJob('notification', 'notify_user', {
    type:   'single',
    userId: app.ngo.toString(),
    title:  '❌ Verification Application Rejected',
    body:   `Your application was not approved. Reason: ${reason}. You may reapply after 90 days.`,
    data:   { application_id: app._id.toString() },
  });

  return app;
};

/**
 * Suspend a verified NGO
 */
const suspendNGO = async (appId, adminId, { reason }) => {
  const app = await NgoVerification.findById(appId);
  if (!app) throw ApiError.notFound('Application not found');
  if (app.status !== 'approved') throw ApiError.badRequest('Can only suspend approved NGOs');

  app.status                  = 'suspended';
  app.review.suspended_by     = adminId;
  app.review.suspended_at     = new Date();
  app.review.suspension_reason = reason;
  app.permissions             = {
    can_verify_requests:   false,
    can_execute_projects:  false,
    can_receive_funds:     false,
    can_access_donor_info: false,
    max_concurrent_cases:  0,
  };

  await app.save();
  await User.findByIdAndUpdate(app.ngo, { 'ngo_profile.is_verified': false });
  return app;
};

/**
 * Get stats for admin dashboard
 */
const getStats = async () => {
  const [total, byStatus] = await Promise.all([
    NgoVerification.countDocuments(),
    NgoVerification.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort:  { count: -1 } },
    ]),
  ]);
  return { total, by_status: byStatus };
};

module.exports = {
  getOrCreateApplication,
  saveProgress,
  uploadDocuments,
  submitApplication,
  getMyApplication,
  listApplications,
  getApplicationDetail,
  startReview,
  verifyDocument,
  addReviewNote,
  scheduleInterview,
  recordInterviewOutcome,
  approveApplication,
  rejectApplication,
  suspendNGO,
  getStats,
};