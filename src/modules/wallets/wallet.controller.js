'use strict';

const svc = require('./wallet.service');
const R   = require('../../utils/apiResponse');

module.exports = {
  getByRequest:       async (req, res) => R.success(res, await svc.getWalletByRequest(req.params.requestId, req.user._id, req.user.role)),
  getByProject:       async (req, res) => R.success(res, await svc.getWalletByProject(req.params.projectId)),
  getGeneralFund:     async (req, res) => R.success(res, await svc.getGeneralFundWallet()),
  allocate:           async (req, res) => R.success(res, await svc.allocateFunds(req.params.walletId, req.user._id, req.body),        'Funds allocated successfully'),
  expend:             async (req, res) => R.success(res, await svc.recordExpenditure(req.params.walletId, req.user._id, req.body),    'Expenditure recorded'),
  freeze:             async (req, res) => R.success(res, await svc.freezeWallet(req.params.walletId, req.user._id, req.body.reason),  'Wallet frozen'),
  unfreeze:           async (req, res) => R.success(res, await svc.unfreezeWallet(req.params.walletId, req.user._id),                 'Wallet unfrozen'),
  getTransactions:    async (req, res) => R.success(res, await svc.getWalletTransactions(req.params.walletId, req.query)),
  getAll:             async (req, res) => R.success(res, await svc.getAllWallets(req.query)),
};