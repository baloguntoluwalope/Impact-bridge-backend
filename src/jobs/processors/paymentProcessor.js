'use strict';

const Payment        = require('../../modules/payments/payment.model');
const paymentService = require('../../modules/payments/payment.service');
const logger         = require('../../utils/logger');

const paymentProcessor = async (job) => {
  const { reference } = job.data;
  logger.info(`[payment] Reconciling ${reference}`);

  const payment = await Payment.findOne({ reference });
  if (!payment) { logger.warn(`Payment not found: ${reference}`); return { skipped: true }; }
  if (payment.status === 'success') { logger.info(`Already processed: ${reference}`); return { skipped: true }; }

  const result = await paymentService.verifyPaymentManually(reference);
  return { reference, status: result.payment?.status };
};

module.exports = paymentProcessor;