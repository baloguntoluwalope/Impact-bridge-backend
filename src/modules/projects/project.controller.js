'use strict';

const svc = require('./project.service');
const R   = require('../../utils/apiResponse');

module.exports = {
  create:            async (req, res) => R.created(res, await svc.createProject(req.user._id, req.user.role, req.body, req.files || {}), 'Project submitted for approval'),
  approve:           async (req, res) => R.success(res, await svc.approveProject(req.params.id, req.user._id),                          'Project approved'),
  reject:            async (req, res) => R.success(res, await svc.rejectProject(req.params.id, req.user._id, req.body),                 'Project rejected'),
  addMilestone:      async (req, res) => R.success(res, await svc.addMilestone(req.params.id, req.user._id, req.body),                  'Milestone added'),
  completeMilestone: async (req, res) => R.success(res, await svc.completeMilestone(req.params.id, req.params.milestoneId, req.user._id, req.body, req.files || []), 'Milestone completed'),
  submitReport:      async (req, res) => R.success(res, await svc.submitReport(req.params.id, req.user._id, req.body, req.files || []), 'Report submitted'),
  complete:          async (req, res) => R.success(res, await svc.completeProject(req.params.id, req.user._id, req.files || []),        'Project completed'),
  getPublic:         async (req, res) => { const d = await svc.getPublicProjects(req.query); R.paginated(res, d.projects, d.pagination, 'Sponsored Projects'); },
  getById:           async (req, res) => R.success(res, await svc.getProjectById(req.params.id)),
  getMyProjects:     async (req, res) => { const d = await svc.getMyProjects(req.user._id, req.query); R.paginated(res, d.projects, d.pagination); },
  getAll:            async (req, res) => { const d = await svc.getAllProjects(req.query); R.paginated(res, d.projects, d.pagination); },
};