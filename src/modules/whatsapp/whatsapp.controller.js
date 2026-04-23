'use strict';

const svc = require('./whatsapp.service');
const R   = require('../../utils/apiResponse');

module.exports = {
  getContactLink: async (req, res) => R.success(res, svc.getContactLink(req.query.type, req.query.subject)),
  getCaseLink:    async (req, res) => R.success(res, await svc.getCaseLink(req.params.requestId)),
  getProjectLink: async (req, res) => R.success(res, await svc.getProjectLink(req.params.projectId)),
};