'use strict';

const svc = require('./notification.service');
const R   = require('../../utils/apiResponse');

module.exports = {
  getAll:     async (req, res) => R.success(res, await svc.getUserNotifications(req.user._id, req.query)),
  markRead:   async (req, res) => R.success(res, await svc.markRead(req.params.id, req.user._id),  'Marked as read'),
  markAllRead:async (req, res) => { await svc.markAllRead(req.user._id); R.success(res, null, 'All notifications marked as read'); },
  broadcast:  async (req, res) => { const d = await svc.broadcast(req.user._id, req.body); R.success(res, d, `Broadcast sent to ${d.sent} users`); },
};