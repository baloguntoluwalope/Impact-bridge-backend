'use strict';

const Project      = require('./project.model');
const Wallet       = require('../wallets/wallet.model');
const { addJob }   = require('../../config/bullmq');
const { getRedisClient } = require('../../config/redis');
const { generateReference, paginate, paginationMeta } = require('../../utils/helpers');
const ApiError     = require('../../utils/apiError');
const mediaService = require('../media/media.service');

const CREATOR_TYPE_MAP = {
  ngo_partner:          'ngo',
  corporate:            'corporate',
  government_official:  'government',
  super_admin:          'admin',
};

const invalidateProjectCache = async () => {
  const redis = getRedisClient();
  const keys  = await redis.keys('projects:public:*');
  if (keys.length) await redis.del(keys);
};

const createProject = async (userId, userRole, body, files = {}) => {
  const creatorType = CREATOR_TYPE_MAP[userRole];
  if (!creatorType) throw ApiError.forbidden('Your role cannot create sponsored projects');

  const project = await Project.create({
    ...body,
    created_by:   userId,
    creator_type: creatorType,
    status:       'pending_approval',
  });

  if (files.budget_document?.[0]) {
    const uploaded = await mediaService.uploadSingle(files.budget_document[0], `projects/${project._id}/docs`);
    await Project.findByIdAndUpdate(project._id, { budget_document: uploaded.url });
  }

  if (files.proposal_document?.[0]) {
    const uploaded = await mediaService.uploadSingle(files.proposal_document[0], `projects/${project._id}/docs`);
    await Project.findByIdAndUpdate(project._id, { proposal_document: uploaded.url });
  }

  if (files.media?.length) {
    const uploaded = await mediaService.uploadMultiple(files.media, `projects/${project._id}/media`);
    await Project.findByIdAndUpdate(project._id, { $push: { media: { $each: uploaded } } });
  }

  await addJob('notification', 'new_project_submitted', {
    type:  'broadcast',
    roles: ['super_admin'],
    title: '📁 New Sponsored Project Submitted',
    body:  `"${project.title}" awaiting approval`,
    data:  { project_id: project._id.toString() },
  });

  return project;
};

const approveProject = async (projectId, adminId) => {
  const project = await Project.findById(projectId);
  if (!project) throw ApiError.notFound('Project not found');
  if (project.status !== 'pending_approval') {
    throw ApiError.badRequest('Project must be in pending_approval status');
  }

  const wallet = await Wallet.create({
    project:     projectId,
    wallet_type: 'project_wallet',
    reference:   generateReference('PW'),
    currency:    'NGN',
  });

  const updated = await Project.findByIdAndUpdate(
    projectId,
    {
      status:       'approved',
      approved_by:  adminId,
      approved_at:  new Date(),
      wallet:       wallet._id,
      is_public:    true,
    },
    { new: true }
  ).populate('created_by', 'first_name last_name email');

  await invalidateProjectCache();

  await addJob('notification', 'project_approved', {
    type:   'single',
    userId: updated.created_by._id.toString(),
    title:  '✅ Your project has been approved!',
    body:   `"${updated.title}" is now live on Impact Bridge.`,
    data:   { project_id: projectId },
  });

  return updated;
};

const rejectProject = async (projectId, adminId, { reason }) => {
  if (!reason) throw ApiError.badRequest('Rejection reason is required');

  const updated = await Project.findByIdAndUpdate(
    projectId,
    { status: 'rejected', rejection_reason: reason, approved_by: adminId },
    { new: true }
  ).populate('created_by', 'first_name last_name email');

  if (!updated) throw ApiError.notFound('Project not found');

  await addJob('notification', 'project_rejected', {
    type:   'single',
    userId: updated.created_by._id.toString(),
    title:  'Project Not Approved',
    body:   `"${updated.title}" was not approved. Reason: ${reason}`,
    data:   { project_id: projectId },
  });

  return updated;
};

const addMilestone = async (projectId, userId, data) => {
  const project = await Project.findById(projectId);
  if (!project) throw ApiError.notFound('Project not found');

  const updated = await Project.findByIdAndUpdate(
    projectId,
    { $push: { milestones: { ...data, status: 'pending' } } },
    { new: true }
  );
  return updated;
};

const completeMilestone = async (projectId, milestoneId, userId, data, files = []) => {
  let proofMedia = [];
  if (files.length > 0) {
    proofMedia = await mediaService.uploadMultiple(files, `projects/${projectId}/milestones`);
  }

  const updated = await Project.findOneAndUpdate(
    { _id: projectId, 'milestones._id': milestoneId },
    {
      $set: {
        'milestones.$.status':           'completed',
        'milestones.$.completed_at':     new Date(),
        'milestones.$.completion_note':  data.note,
        'milestones.$.proof_media':      proofMedia,
      },
    },
    { new: true }
  );

  if (!updated) throw ApiError.notFound('Project or milestone not found');
  return updated;
};

const submitReport = async (projectId, userId, data, files = []) => {
  let media = [];
  if (files.length > 0) {
    media = await mediaService.uploadMultiple(files, `projects/${projectId}/reports`);
  }

  const updated = await Project.findByIdAndUpdate(
    projectId,
    {
      $push: {
        reports: {
          ...data,
          submitted_by: userId,
          media,
          created_at:   new Date(),
        },
      },
    },
    { new: true }
  );

  if (!updated) throw ApiError.notFound('Project not found');
  return updated;
};

const completeProject = async (projectId, userId, files = []) => {
  const project = await Project.findById(projectId);
  if (!project) throw ApiError.notFound('Project not found');
  if (!['funded', 'in_progress'].includes(project.status)) {
    throw ApiError.badRequest('Project must be funded or in_progress to mark as complete');
  }

  let completionProof = [];
  if (files.length > 0) {
    completionProof = await mediaService.uploadMultiple(files, `projects/${projectId}/completion`);
  }

  const updated = await Project.findByIdAndUpdate(
    projectId,
    { status: 'completed', completed_at: new Date(), completion_proof: completionProof },
    { new: true }
  );

  await invalidateProjectCache();

  await addJob('notification', 'project_completed', {
    type:   'single',
    userId: project.created_by.toString(),
    title:  '🏆 Project Completed!',
    body:   `"${project.title}" has been successfully completed.`,
    data:   { project_id: projectId },
  });

  return updated;
};

const getPublicProjects = async (query) => {
  const { page, limit, status, sdg, state, creator_type } = query;
  const { page: p, limit: l, skip } = paginate(page, limit);

  const filter = { is_public: true };
  if (status)       filter.status       = status;
  if (sdg)          filter.sdg_goals    = parseInt(sdg);
  if (state)        filter.state        = state;
  if (creator_type) filter.creator_type = creator_type;

  const cacheKey = `projects:public:${JSON.stringify(filter)}:${p}:${l}`;
  const redis    = getRedisClient();
  const cached   = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const [projects, total] = await Promise.all([
    Project.find(filter)
      .populate('created_by', 'first_name last_name organization_name')
      .populate('executing_ngo', 'name logo')
      .sort('-created_at')
      .skip(skip)
      .limit(l)
      .lean(),
    Project.countDocuments(filter),
  ]);

  const result = { projects, pagination: paginationMeta(total, p, l) };
  await redis.setEx(cacheKey, 300, JSON.stringify(result));
  return result;
};

const getProjectById = async (projectId) => {
  const project = await Project.findById(projectId)
    .populate('created_by', 'first_name last_name email organization_name')
    .populate('executing_ngo', 'name logo contact_email')
    .populate('approved_by', 'first_name last_name')
    .lean();

  if (!project) throw ApiError.notFound('Project not found');
  return project;
};

const getMyProjects = async (userId, query) => {
  const { page, limit, status } = query;
  const { page: p, limit: l, skip } = paginate(page, limit);

  const filter = { created_by: userId };
  if (status) filter.status = status;

  const [projects, total] = await Promise.all([
    Project.find(filter).sort('-created_at').skip(skip).limit(l).lean(),
    Project.countDocuments(filter),
  ]);

  return { projects, pagination: paginationMeta(total, p, l) };
};

const getAllProjects = async (query) => {
  const { page, limit, status, creator_type } = query;
  const { page: p, limit: l, skip } = paginate(page, limit);

  const filter = {};
  if (status)       filter.status       = status;
  if (creator_type) filter.creator_type = creator_type;

  const [projects, total] = await Promise.all([
    Project.find(filter)
      .populate('created_by', 'first_name last_name email role')
      .sort('-created_at')
      .skip(skip)
      .limit(l)
      .lean(),
    Project.countDocuments(filter),
  ]);

  return { projects, pagination: paginationMeta(total, p, l) };
};

module.exports = {
  createProject,
  approveProject,
  rejectProject,
  addMilestone,
  completeMilestone,
  submitReport,
  completeProject,
  getPublicProjects,
  getProjectById,
  getMyProjects,
  getAllProjects,
};