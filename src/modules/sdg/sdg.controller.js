'use strict';

const svc = require('./sdg.service');
const R   = require('../../utils/apiResponse');

module.exports = {
  seed:               async (req, res) => R.success(res, await svc.seedSDGs(),                              'All 17 SDGs seeded successfully'),
  getAll:             async (req, res) => R.success(res, await svc.getAllSDGs(),                             'All SDG Goals'),
  getByNumber:        async (req, res) => R.success(res, await svc.getSDGByNumber(req.params.number)),
  getContent:         async (req, res) => { const d = await svc.getSDGContent(req.params.number, req.query); R.paginated(res, d.content, d.pagination); },
  trackView:          async (req, res) => { await svc.trackView(req.params.contentId); R.success(res, null, 'View tracked'); },
  createContent:      async (req, res) => R.created(res, await svc.createContent(req.user._id, req.body),   'SDG content created'),
  updateContent:      async (req, res) => R.success(res, await svc.updateContent(req.params.id, req.body),  'Content updated'),
  deleteContent:      async (req, res) => { await svc.deleteContent(req.params.id); R.success(res, null, 'Content deleted'); },
  getNationalAnalytics: async (req, res) => R.success(res, await svc.getNationalAnalytics(),                'National SDG Analytics'),
};