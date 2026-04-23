'use strict';

const svc = require('./user.service');
const R   = require('../../utils/apiResponse');

module.exports = {
  getProfile:     async (req, res) => R.success(res, await svc.getProfile(req.user._id)),
  updateProfile:  async (req, res) => R.success(res, await svc.updateProfile(req.user._id, req.body),            'Profile updated'),
  updateAvatar:   async (req, res) => R.success(res, await svc.updateAvatar(req.user._id, req.file),             'Avatar updated'),
  changePassword: async (req, res) => R.success(res, null, (await svc.changePassword(req.user._id, req.body)).message),
  toggleBookmark: async (req, res) => R.success(res, await svc.toggleBookmark(req.user._id, req.params.requestId)),
};