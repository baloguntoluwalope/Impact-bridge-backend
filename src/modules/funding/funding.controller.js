'use strict';

const svc = require('./funding.service');
const R   = require('../../utils/apiResponse');

module.exports = {
  getOverview:     async (req, res) => R.success(res, await svc.getFundingOverview(),                               'Funding overview'),
  getCaseHistory:  async (req, res) => { const d = await svc.getCaseFundingHistory(req.params.requestId, req.query); R.paginated(res, d.payments, d.pagination, 'Case funding history'); },
  getAllocations:  async (req, res) => { const d = await svc.getWalletAllocations(req.query); R.paginated(res, d.wallets, d.pagination, 'Wallet allocations'); },
  reconcile:       async (req, res) => R.success(res, await svc.reconcilePayment(req.params.reference),             'Reconciliation complete'),
};