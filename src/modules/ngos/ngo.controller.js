'use strict';

const svc = require('./ngo.service');
const R   = require('../../utils/apiResponse');

module.exports = {
  create:    async (req, res) => R.created(res, await svc.createNGO(req.body),                    'NGO profile created'),
  verify:    async (req, res) => R.success(res, await svc.verifyNGO(req.params.id, req.user._id), 'NGO verified'),
  getAll:    async (req, res) => { const d = await svc.getAllNGOs(req.query); R.paginated(res, d.ngos, d.pagination, 'Verified NGOs'); },
  getBySlug: async (req, res) => R.success(res, await svc.getNGOBySlug(req.params.slug)),
  update:    async (req, res) => R.success(res, await svc.updateNGO(req.params.id, req.user._id, req.body), 'NGO updated'),
  getCases:  async (req, res) => { const d = await svc.getNGOCases(req.params.id, req.query); R.paginated(res, d.requests, d.pagination, 'NGO cases'); },
  getStats:  async (req, res) => R.success(res, await svc.getNGOStats(req.params.id)),
};