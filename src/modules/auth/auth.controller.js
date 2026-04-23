'use strict';

const svc = require('./auth.service');
const R   = require('../../utils/apiResponse');

module.exports = {
  register:       async (req, res) => R.created(res,  await svc.register(req.body),                              'Registration successful. Please check your email for OTP.'),
  login:          async (req, res) => R.success(res,  await svc.login(req.body),                                 'Login successful'),
  verifyEmail:    async (req, res) => R.success(res,  await svc.verifyOTP(req.body),                             'Email verified successfully'),
  resendOTP:      async (req, res) => R.success(res,  await svc.resendOTP(req.body.email, req.body.type),        'OTP sent'),
  forgotPassword: async (req, res) => R.success(res,  null, (await svc.forgotPassword(req.body.email)).message),
  resetPassword:  async (req, res) => R.success(res,  null, (await svc.resetPassword(req.body)).message),
  logout:         async (req, res) => R.success(res,  null, (await svc.logout(req.token, req.user._id)).message),
  refresh:        async (req, res) => R.success(res,  await svc.refreshTokens(req.body.refresh_token),           'Tokens refreshed'),
};