'use strict';

const Request         = require('../requests/request.model');
const Payment         = require('../payments/payment.model');
const User            = require('../users/user.model');
const NgoAssignment   = require('../assignments/ngo.assignment.model');
const NgoVerification = require('../ngos/ngo.verification.model');
const { getRedisClient } = require('../../config/redis');

/* ─── Generic cache helper ──────────────────────────────────── */
const cache = async (key, ttl, fn) => {
  const redis  = getRedisClient();
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  const data = await fn();
  await redis.setEx(key, ttl, JSON.stringify(data));
  return data;
};

/* ══════════════════════════════════════════════════════════════
   ADMIN DASHBOARD
   New additions:
   - assignments_pending   — active NGO assignments
   - assignments_overdue   — past deadline
   - ngo_verif_pending     — NGO applications awaiting review
   - ngo_verified_total    — total approved NGOs
   - ai_checks_today       — requests AI-analysed today
   - recent_assignments    — last 5 assignments with full detail
   - fees_collected_total  — total platform + NGO fees across all verified requests
   - fees_pending_count    — verified requests without fees applied yet
   - ngo_verif_queue       — pending NGO applications (last 5)
══════════════════════════════════════════════════════════════ */
const getAdminDashboard = async () =>
  cache('dashboard:admin', 120, async () => {
    const now          = new Date();
    const startOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      total_users,
      total_requests,
      pending,
      verified,
      total_payments,
      amount_raised,
      monthly_donations,
      by_status,
      by_sdg,
      recent_payments,
      new_users_month,
      /* ── new ── */
      assignments_pending,
      assignments_overdue,
      ngo_verif_pending,
      ngo_verified_total,
      ai_checks_today,
      recent_assignments,
      ngo_verif_queue,
      fee_agg,
      fees_pending_count,
    ] = await Promise.all([
      User.countDocuments({ is_active: true }),
      Request.countDocuments(),
      Request.countDocuments({ status: { $in: ['submitted', 'under_review'] } }),
      Request.countDocuments({ status: 'verified', is_visible: true }),
      Payment.countDocuments({ status: 'success' }),
      Payment.aggregate([
        { $match: { status: 'success' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Payment.aggregate([
        { $match: { status: 'success', created_at: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Request.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Request.aggregate([
        { $match: { status: { $in: ['verified', 'funded', 'completed'] } } },
        { $group: { _id: '$category', count: { $sum: 1 }, raised: { $sum: '$amount_raised' } } },
        { $sort: { count: -1 } },
      ]),
      Payment.find({ status: 'success' })
        .sort('-created_at').limit(10)
        .populate('donor',   'first_name last_name')
        .populate('request', 'title')
        .lean(),
      User.countDocuments({ created_at: { $gte: startOfMonth } }),

      /* ── NGO assignments ── */
      NgoAssignment.countDocuments({
        status: { $in: ['assigned', 'accepted', 'in_progress'] },
      }),
      NgoAssignment.countDocuments({
        status:   { $in: ['assigned', 'accepted', 'in_progress'] },
        deadline: { $lt: now },
      }),

      /* ── NGO verification ── */
      NgoVerification.countDocuments({
        status: { $in: ['submitted', 'under_review', 'documents_verified', 'interview_scheduled'] },
      }),
      NgoVerification.countDocuments({ status: 'approved' }),

      /* ── AI checks done today ── */
      Request.countDocuments({
        'verification.ai_check.checked_at': { $gte: startOfDay },
      }),

      /* ── Recent assignments (last 5) ── */
      NgoAssignment.find()
        .sort('-createdAt')
        .limit(5)
        .populate('request', 'title category state urgency status')
        .populate('ngo',     'first_name last_name email')
        .lean(),

      /* ── NGO applications pending review (last 5) ── */
      NgoVerification.find({
        status: { $in: ['submitted', 'under_review', 'documents_verified'] },
      })
        .sort('-createdAt')
        .limit(5)
        .populate('ngo', 'first_name last_name email')
        .lean(),

      /* ── Fee stats ── */
      Request.aggregate([
        { $match: { 'fee_breakdown.applied': true } },
        { $group: { _id: null, total_fees: { $sum: '$fee_breakdown.total_fees' }, platform_fees: { $sum: '$fee_breakdown.platform_fee' }, ngo_fees: { $sum: '$fee_breakdown.ngo_execution_fee' } } },
      ]),
      Request.countDocuments({ status: 'verified', 'fee_breakdown.applied': { $ne: true } }),
    ]);

    return {
      stats: {
        total_users,
        total_requests,
        pending,
        verified,
        total_payments,
        total_amount_raised:    amount_raised[0]?.total      || 0,
        monthly_donations:      monthly_donations[0]?.total  || 0,
        monthly_donation_count: monthly_donations[0]?.count  || 0,
        new_users_month,
        /* new */
        assignments_pending,
        assignments_overdue,
        ngo_verif_pending,
        ngo_verified_total,
        ai_checks_today,
        fees_collected_total:   fee_agg[0]?.total_fees    || 0,
        fees_platform_total:    fee_agg[0]?.platform_fees || 0,
        fees_ngo_total:         fee_agg[0]?.ngo_fees      || 0,
        fees_pending_count,
      },
      by_status,
      by_sdg,
      recent_payments,
      /* new */
      recent_assignments,
      ngo_verif_queue,
    };
  });

/* ══════════════════════════════════════════════════════════════
   DONOR DASHBOARD  (unchanged)
══════════════════════════════════════════════════════════════ */
const getDonorDashboard = async (donorId) =>
  cache(`dashboard:donor:${donorId}`, 60, async () => {
    const [user, recent_donations, by_type, completed_cases] = await Promise.all([
      User.findById(donorId).select('total_donated donation_count').lean(),
      Payment.find({ donor: donorId, status: 'success' })
        .populate('request', 'title category status sdg_number')
        .sort('-created_at').limit(10).lean(),
      Payment.aggregate([
        { $match: { donor: donorId, status: 'success' } },
        { $group: { _id: '$fund_type', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),
      Payment.find({ donor: donorId, status: 'success', request: { $ne: null } })
        .distinct('request')
        .then(ids => Request.countDocuments({ _id: { $in: ids }, status: 'completed' })),
    ]);

    return {
      summary: {
        total_donated:   user?.total_donated  || 0,
        donation_count:  user?.donation_count || 0,
        completed_cases,
      },
      recent_donations,
      by_type,
    };
  });

/* ══════════════════════════════════════════════════════════════
   NGO DASHBOARD
   New additions:
   - active_assignments    — current assignments with full request + deadline
   - overdue_count         — assignments past their deadline
   - reports_submitted     — total reports the NGO has submitted
   - verification_status   — the NGO's own verification application status
══════════════════════════════════════════════════════════════ */
const getNGODashboard = async (ngoUserId) => {
  /* Resolve the NGO profile ID */
  const user  = await User.findById(ngoUserId).lean();
  /* Support both embedded ngo_profile ref and direct _id */
  const ngoId = user?.ngo_profile?._id || user?.ngo_profile || ngoUserId;

  return cache(`dashboard:ngo:${ngoId}`, 60, async () => {
    const now = new Date();

    const [
      assigned_cases,
      verified_count,
      completed_count,
      in_progress_count,
      reports_pending,
      /* new */
      active_assignments,
      overdue_count,
      reports_submitted_count,
      my_verification,
    ] = await Promise.all([
      /* Legacy: cases where request.assigned_ngo === ngoId */
      Request.find({ assigned_ngo: ngoId })
        .select('title status amount_needed amount_raised category state lga urgency createdAt')
        .sort('-createdAt').limit(20).lean(),

      Request.countDocuments({ assigned_ngo: ngoId, status: 'verified' }),
      Request.countDocuments({ assigned_ngo: ngoId, status: 'completed' }),
      Request.countDocuments({ assigned_ngo: ngoId, status: 'in_progress' }),
      Request.countDocuments({ assigned_ngo: ngoId, status: 'funded', progress_updates: { $size: 0 } }),

      /* ── Active NgoAssignment records for this NGO ── */
      NgoAssignment.find({
        ngo:    ngoUserId,
        status: { $in: ['assigned', 'accepted', 'in_progress'] },
      })
        .populate({
          path:   'request',
          select: 'title description category state lga urgency amount_needed beneficiaries_count media status createdAt',
          populate: { path: 'requester', select: 'first_name last_name avatar' },
        })
        .populate('assigned_by', 'first_name last_name')
        .sort('deadline')   // soonest deadline first
        .lean(),

      /* ── Overdue count ── */
      NgoAssignment.countDocuments({
        ngo:      ngoUserId,
        status:   { $in: ['assigned', 'accepted', 'in_progress'] },
        deadline: { $lt: now },
      }),

      /* ── Total reports submitted ── */
      NgoAssignment.countDocuments({
        ngo:    ngoUserId,
        status: { $in: ['report_submitted', 'completed'] },
      }),

      /* ── This NGO's own verification application ── */
      NgoVerification.findOne({ ngo: ngoUserId })
        .select('status verification_tier permissions submitted_at review.approved_at review.rejection_reason reapplication_allowed_at')
        .lean(),
    ]);

    /* Enrich each active assignment with days_remaining */
    const enriched_assignments = active_assignments.map(a => ({
      ...a,
      days_remaining: Math.ceil((new Date(a.deadline) - now) / (1000 * 60 * 60 * 24)),
      is_overdue:     new Date(a.deadline) < now,
    }));

    return {
      ngo_id: ngoId,
      stats: {
        verified:         verified_count,
        completed:        completed_count,
        in_progress:      in_progress_count,
        reports_pending,
        /* new */
        active_assignments:     active_assignments.length,
        overdue_assignments:    overdue_count,
        reports_submitted:      reports_submitted_count,
      },
      /* Legacy field — kept for backward compat */
      assigned_cases,
      /* New fields */
      active_assignments:   enriched_assignments,
      verification_status:  my_verification || null,
    };
  });
};

/* ══════════════════════════════════════════════════════════════
   GOVERNMENT DASHBOARD  (unchanged)
══════════════════════════════════════════════════════════════ */
const getGovernmentDashboard = async (state = null) => {
  const cacheKey = `dashboard:gov:${state || 'national'}`;
  return cache(cacheKey, 120, async () => {
    const match = state ? { state } : {};

    const [sdg_progress, state_dist, gaps, beneficiaries, monthly] = await Promise.all([
      Request.aggregate([
        { $match: { ...match, status: { $in: ['verified', 'funded', 'in_progress', 'completed'] } } },
        { $group: { _id: { sdg: '$sdg_number', cat: '$category' }, cases: { $sum: 1 }, needed: { $sum: '$amount_needed' }, raised: { $sum: '$amount_raised' }, beneficiaries: { $sum: '$beneficiaries_count' } } },
        { $sort: { '_id.sdg': 1 } },
      ]),
      Request.aggregate([
        { $match: { status: { $in: ['verified', 'funded', 'completed'] } } },
        { $group: { _id: '$state', cases: { $sum: 1 }, needed: { $sum: '$amount_needed' }, raised: { $sum: '$amount_raised' } } },
        { $sort: { cases: -1 } },
      ]),
      Request.find({
        ...match,
        status: 'verified',
        $expr: { $lt: ['$amount_raised', '$amount_needed'] },
      })
        .select('title category state lga amount_needed amount_raised sdg_number urgency')
        .sort('-amount_needed').limit(20).lean(),
      Request.aggregate([
        { $match: { ...match, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$beneficiaries_count' } } },
      ]),
      Payment.aggregate([
        { $group: { _id: { y: { $year: '$created_at' }, m: { $month: '$created_at' } }, total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { '_id.y': 1, '_id.m': 1 } },
        { $limit: 12 },
      ]),
    ]);

    return {
      sdg_progress,
      state_distribution: state_dist,
      funding_gaps:       gaps,
      total_beneficiaries: beneficiaries[0]?.total || 0,
      monthly_trends:     monthly,
    };
  });
};

module.exports = {
  getAdminDashboard,
  getDonorDashboard,
  getNGODashboard,
  getGovernmentDashboard,
};