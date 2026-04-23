'use strict';

const NGO      = require('./ngo.model');
const Request  = require('../requests/request.model');
const { slugify, paginate, paginationMeta } = require('../../utils/helpers');
const ApiError = require('../../utils/apiError');

const createNGO = async (body) => {
  const exists = await NGO.findOne({ $or: [{ name: body.name }, { registration_number: body.registration_number }].filter(Boolean) });
  if (exists) throw ApiError.conflict('An NGO with this name or registration number already exists');
  return NGO.create({ ...body, slug: slugify(body.name) });
};

const verifyNGO = async (ngoId, adminId) => {
  const ngo = await NGO.findByIdAndUpdate(
    ngoId,
    { is_verified: true, verified_at: new Date(), verified_by: adminId },
    { new: true }
  );
  if (!ngo) throw ApiError.notFound('NGO not found');
  return ngo;
};

const getAllNGOs = async (query) => {
  const { page, limit, state, sdg } = query;
  const { page: p, limit: l, skip } = paginate(page, limit);

  const filter = { is_verified: true, is_active: true };
  if (state) filter.states_of_operation = state;
  if (sdg)   filter.sdg_focus           = parseInt(sdg);

  const [ngos, total] = await Promise.all([
    NGO.find(filter).select('-admin_users').sort('-total_cases_handled').skip(skip).limit(l).lean(),
    NGO.countDocuments(filter),
  ]);

  return { ngos, pagination: paginationMeta(total, p, l) };
};

const getNGOBySlug = async (slug) => {
  const ngo = await NGO.findOne({ slug, is_verified: true })
    .populate('admin_users', 'first_name last_name email')
    .lean();
  if (!ngo) throw ApiError.notFound('NGO not found');
  return ngo;
};

const getNGOById = async (id) => {
  const ngo = await NGO.findById(id).lean();
  if (!ngo) throw ApiError.notFound('NGO not found');
  return ngo;
};

const updateNGO = async (ngoId, adminId, body) => {
  return NGO.findByIdAndUpdate(ngoId, body, { new: true, runValidators: true });
};

const getNGOCases = async (ngoId, query) => {
  const { page, limit, status } = query;
  const { page: p, limit: l, skip } = paginate(page, limit);

  const filter = { assigned_ngo: ngoId };
  if (status) filter.status = status;

  const [requests, total] = await Promise.all([
    Request.find(filter)
      .select('title status amount_needed amount_raised category state lga urgency created_at')
      .sort('-created_at')
      .skip(skip)
      .limit(l)
      .lean(),
    Request.countDocuments(filter),
  ]);

  return { requests, pagination: paginationMeta(total, p, l) };
};

const getNGOStats = async (ngoId) => {
  const [total, completed, inProgress, funded, totalRaised] = await Promise.all([
    Request.countDocuments({ assigned_ngo: ngoId }),
    Request.countDocuments({ assigned_ngo: ngoId, status: 'completed' }),
    Request.countDocuments({ assigned_ngo: ngoId, status: 'in_progress' }),
    Request.countDocuments({ assigned_ngo: ngoId, status: 'funded' }),
    Request.aggregate([
      { $match: { assigned_ngo: ngoId } },
      { $group: { _id: null, total: { $sum: '$amount_raised' } } },
    ]),
  ]);

  return {
    total_cases:   total,
    completed,
    in_progress:   inProgress,
    funded,
    total_raised:  totalRaised[0]?.total || 0,
  };
};

module.exports = { createNGO, verifyNGO, getAllNGOs, getNGOBySlug, getNGOById, updateNGO, getNGOCases, getNGOStats };