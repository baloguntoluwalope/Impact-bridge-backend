'use strict';

const svc = require('./admin.service');
const R   = require('../../utils/apiResponse');

module.exports = {
  getUsers:          async (req, res) => { const d = await svc.getUsers(req.query); R.paginated(res, d.users, d.pagination); },
  suspendUser:       async (req, res) => R.success(res, await svc.suspendUser(req.params.id, req.body.reason),                                  'User suspended'),
  activateUser:      async (req, res) => R.success(res, await svc.activateUser(req.params.id),                                                   'User activated'),
  getRequests:       async (req, res) => { const d = await svc.getAllRequests(req.query); R.paginated(res, d.requests, d.pagination); },
  featureRequest:    async (req, res) => R.success(res, await svc.toggleFeatureRequest(req.params.id, req.body.is_featured),                     'Feature status updated'),
  getPayments:       async (req, res) => { const d = await svc.getAllPayments(req.query); R.paginated(res, d.payments, d.pagination); },
  getAuditLogs:      async (req, res) => { const d = await svc.getAuditLogs(req.query); R.paginated(res, d.logs, d.pagination); },
  getDLQStatus:      async (req, res) => R.success(res, await svc.getDLQStatus(),                                                                 'Dead-letter queue status'),
  getSystemStats:    async (req, res) => R.success(res, await svc.getSystemStats(),                                                               'System statistics'),
  
};