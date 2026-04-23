'use strict';

const svc = require('./payment.service');
const R   = require('../../utils/apiResponse');

/**
 * Utility to ensure webhook bodies are parsed correctly regardless of 
 * middleware configuration (Buffer vs String vs Object).
 */
const parseWebhookBody = (body) => {
  if (Buffer.isBuffer(body)) return JSON.parse(body.toString());
  if (typeof body === 'string') return JSON.parse(body);
  return body;
};

module.exports = {
  /**
   * Initialize a new donation payment
   */
  initiate: async (req, res) => {
    // Pass req.user._id, the request body, and the client's IP address
    const result = await svc.initiatePayment(req.user._id, req.body, req.ip);
    return R.success(res, result, 'Payment initialized', 201);
  },

  /**
   * Manually verify a payment status (e.g., via a "Re-verify" button in UI)
   */
  verify: async (req, res) => {
    const result = await svc.verifyPaymentManually(req.params.reference);
    return R.success(res, result, 'Payment status updated');
  },

  /**
   * Get the authenticated donor's payment history
   */
  history: async (req, res) => {
    const result = await svc.getDonorHistory(req.user._id, req.query);
    return R.success(res, result, 'Donation history retrieved');
  },

  /**
   * Handle Korapay Webhooks
   */
  webhookKorapay: async (req, res) => {
    try {
      const payload   = parseWebhookBody(req.body);
      const signature = req.headers['x-korapay-signature'] || '';
      
      await svc.handleWebhook('korapay', payload, signature);
    } catch (err) {
      // Log error internally but return 200 to Korapay
      console.error(`Korapay Webhook Error: ${err.message}`);
    }
    return res.status(200).json({ status: true });
  },

  /**
   * Handle Paystack Webhooks
   */
  webhookPaystack: async (req, res) => {
    try {
      const payload   = parseWebhookBody(req.body);
      const signature = req.headers['x-paystack-signature'] || '';
      
      await svc.handleWebhook('paystack', payload, signature);
    } catch (err) {
      // Log error internally but return 200 to Paystack
      console.error(`Paystack Webhook Error: ${err.message}`);
    }
    return res.status(200).json({ status: true });
  },
};

// 'use strict';

// const svc = require('./payment.service');
// const R   = require('../../utils/apiResponse');

// const parseWebhookBody = (body) =>
//   Buffer.isBuffer(body) || typeof body === 'string' ? JSON.parse(body) : body;

// module.exports = {
//   initiate: async (req, res) =>
//     R.success(res, await svc.initiatePayment(req.user._id, req.body), 'Payment initialized'),

//   verify: async (req, res) =>
//     R.success(res, await svc.verifyPaymentManually(req.params.reference)),

//   history: async (req, res) =>
//     R.success(res, await svc.getDonorHistory(req.user._id, req.query)),

//   webhookKorapay: async (req, res) => {
//     try {
//       const payload   = parseWebhookBody(req.body);
//       const signature = req.headers['x-korapay-signature'] || '';
//       await svc.handleWebhook('korapay', payload, signature);
//     } catch (err) {
//       // Always 200 — prevents Korapay from retrying indefinitely
//     }
//     res.status(200).json({ status: true });
//   },

//   webhookPaystack: async (req, res) => {
//     try {
//       const payload   = parseWebhookBody(req.body);
//       const signature = req.headers['x-paystack-signature'] || '';
//       await svc.handleWebhook('paystack', payload, signature);
//     } catch (err) {}
//     res.status(200).json({ status: true });
//   },
// };