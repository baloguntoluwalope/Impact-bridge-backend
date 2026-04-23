'use strict';

const Payment        = require('../../modules/payments/payment.model');
const paymentService = require('../../modules/payments/payment.service');
const logger         = require('../../utils/logger');

const reconciliationProcessor = async (job) => {
  const hours   = parseInt(process.env.PENDING_PAYMENT_HOURS) || 2;
  const cutoff  = new Date(Date.now() - hours * 3600000);

  const pending = await Payment.find({
    status:           'pending',
    created_at:       { $lte: cutoff },
    webhook_verified: false,
  }).lean();

  logger.info(`[reconciliation] Found ${pending.length} pending payments`);

  const results = { reconciled: 0, failed_auto: 0, skipped: 0 };

  for (const payment of pending) {
    try {
      await paymentService.verifyPaymentManually(payment.reference);
      results.reconciled++;
    } catch (err) {
      logger.error(`Reconcile failed ${payment.reference}: ${err.message}`);

      const ageHours = (Date.now() - new Date(payment.created_at).getTime()) / 3600000;
      if (ageHours > 24) {
        await Payment.findByIdAndUpdate(payment._id, {
          status:         'failed',
          failure_reason: 'Auto-reconciliation: not confirmed after 24h',
        });
        results.failed_auto++;
      } else {
        results.skipped++;
      }
    }
  }

  logger.info(`[reconciliation] Complete: ${JSON.stringify(results)}`);
  return results;
};

module.exports = reconciliationProcessor;