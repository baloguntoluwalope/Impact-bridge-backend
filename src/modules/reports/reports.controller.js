'use strict';

const svc    = require('./reports.service');
const R      = require('../../utils/apiResponse');
const { Parser } = require('json2csv');

module.exports = {
  getDonations: async (req, res) => {
    const { format = 'json' } = req.query;
    const data = await svc.getDonationReport(req.query);

    if (format === 'csv') {
      const fields = ['reference','amount','currency','gateway','fund_type','created_at'];
      const parser = new Parser({ fields });
      res.header('Content-Type', 'text/csv');
      res.attachment(`donations_report_${Date.now()}.csv`);
      return res.send(parser.parse(data.payments));
    }

    R.success(res, data, 'Donation report');
  },

  getImpact: async (req, res) => {
    const { format = 'json' } = req.query;
    const data = await svc.getImpactReport(req.query);

    if (format === 'csv') {
      const parser = new Parser();
      res.header('Content-Type', 'text/csv');
      res.attachment(`impact_report_${Date.now()}.csv`);
      return res.send(parser.parse(data.requests));
    }

    R.success(res, data, 'Impact report');
  },

  getSDG: async (req, res) => {
    const data = await svc.getSDGReport();
    R.success(res, data, 'SDG report');
  },
};