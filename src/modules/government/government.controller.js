'use strict';

const svc    = require('./government.service');
const Request = require('../requests/request.model');
const Payment = require('../payments/payment.model');
const R      = require('../../utils/apiResponse');
const { Parser } = require('json2csv');

module.exports = {
  getDashboard: async (req, res) => {
    const data = await svc.getNationalDashboard(req.query.state);
    R.success(res, data, 'Government SDG Dashboard');
  },

  getStateDive: async (req, res) => {
    const data = await svc.getStateDeepDive(req.params.state);
    R.success(res, data, `Analytics for ${req.params.state}`);
  },

  getLGA: async (req, res) => {
    const data = await svc.getLGAData(req.params.state, req.params.lga);
    R.success(res, data, `Analytics for ${req.params.lga}, ${req.params.state}`);
  },

  exportCases: async (req, res) => {
    const { state, category, status, from, to } = req.query;
    const filter = {};
    if (state)    filter.state    = state;
    if (category) filter.category = category;
    if (status)   filter.status   = status;
    if (from || to) {
      filter.created_at = {};
      if (from) filter.created_at.$gte = new Date(from);
      if (to)   filter.created_at.$lte = new Date(to);
    }

    const cases  = await Request.find(filter).select('title category state lga status amount_needed amount_raised sdg_number beneficiaries_count urgency created_at').lean();
    const fields = ['title','category','state','lga','status','amount_needed','amount_raised','sdg_number','beneficiaries_count','urgency','created_at'];
    const parser = new Parser({ fields });

    res.header('Content-Type', 'text/csv');
    res.attachment(`cases_${Date.now()}.csv`);
    res.send(parser.parse(cases));
  },

  exportFunding: async (req, res) => {
    const payments = await Payment.find({ status: 'success' })
      .populate('request', 'title category state lga sdg_number')
      .select('amount fund_type gateway reference created_at')
      .lean();

    const flat   = payments.map((p) => ({ reference: p.reference, amount: p.amount, fund_type: p.fund_type, gateway: p.gateway, title: p.request?.title || 'General', category: p.request?.category || '', state: p.request?.state || '', lga: p.request?.lga || '', sdg: p.request?.sdg_number || '', date: p.created_at }));
    const parser = new Parser();
    res.header('Content-Type', 'text/csv');
    res.attachment(`funding_${Date.now()}.csv`);
    res.send(parser.parse(flat));
  },
};