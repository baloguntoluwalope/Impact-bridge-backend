'use strict';

require('dotenv').config();

const { Worker }         = require('bullmq');
const { connection, sendToDeadLetter } = require('../config/bullmq');
const notifService       = require('../modules/notifications/notification.service');
const logger             = require('../utils/logger');

// ── Job processors ────────────────────────────────────────────────

const PROCESSORS = {

  email: async (job) => {
    const { to, subject, template, data, html } = job.data;
    const ok = await notifService.sendEmail({ to, subject, template, data, html });
    if (!ok) throw new Error(`Email delivery failed to ${to}`);
    return { sent: true, to };
  },

  sms: async (job) => {
    const { to, message } = job.data;
    const result = await notifService.sendSMS({ to, message });
    if (!result) throw new Error(`SMS failed to ${to}`);
    return { sent: true, to };
  },

  push: async (job) => {
    const { fcm_token, title, body, data } = job.data;
    const result = await notifService.sendPush({ fcm_token, title, body, data });
    if (!result) throw new Error('Push notification failed');
    return { sent: true };
  },

  notification: async (job) => {
    const { type, userId, userIds, roles, title, body, data } = job.data;

    if (type === 'single' && userId) {
      await notifService.notifyUser(userId, { event: job.name, title, body, data });
      return { sent: 1 };
    }

    if (type === 'bulk' && userIds?.length) {
      await Promise.allSettled(
        userIds.map((id) => notifService.notifyUser(id, { event: job.name, title, body, data }))
      );
      return { sent: userIds.length };
    }

    if (type === 'broadcast') {
      const User  = require('../modules/users/user.model');
      const filter = roles?.length ? { role: { $in: roles } } : {};
      const users  = await User.find(filter).select('_id').lean();
      await Promise.allSettled(
        users.map((u) => notifService.notifyUser(u._id, { event: job.name, title, body, data }))
      );
      return { sent: users.length };
    }

    return { sent: 0 };
  },

  payment: async (job) => {
    const { reference } = job.data;
    const paymentService = require('../modules/payments/payment.service');
    const result = await paymentService.verifyPaymentManually(reference);
    return { reference, status: result.payment?.status };
  },

  reconciliation: async (job) => {
    const Payment        = require('../modules/payments/payment.model');
    const paymentService = require('../modules/payments/payment.service');
    const hours   = parseInt(process.env.PENDING_PAYMENT_HOURS || 2);
    const cutoff  = new Date(Date.now() - hours * 3600000);
    const pending = await Payment.find({
      status:           'pending',
      created_at:       { $lte: cutoff },
      webhook_verified: false,
    }).lean();

    logger.info(`Reconciliation: ${pending.length} pending payments to verify`);
    const results = { reconciled: 0, failed: 0 };

    for (const p of pending) {
      try {
        await paymentService.verifyPaymentManually(p.reference);
        results.reconciled++;
      } catch (err) {
        logger.error(`Reconcile failed ${p.reference}: ${err.message}`);
        // Mark as definitively failed if pending > 24h
        const ageHours = (Date.now() - new Date(p.created_at).getTime()) / 3600000;
        if (ageHours > 24) {
          await Payment.findByIdAndUpdate(p._id, {
            status:         'failed',
            failure_reason: 'Auto-reconciliation: unverified after 24h',
          });
          results.failed++;
        }
      }
    }

    logger.info(`Reconciliation complete: ${JSON.stringify(results)}`);
    return results;
  },
};

// ── Create workers ────────────────────────────────────────────────
const workers = [];

Object.entries(PROCESSORS).forEach(([queueName, processor]) => {
  const worker = new Worker(queueName, processor, {
    connection,
    concurrency: queueName === 'email' ? 10 : 5,
    limiter:     { max: 50, duration: 1000 },
  });

  worker.on('completed', (job) => {
    logger.info(`[${queueName}] ✅ ${job.name} (${job.id}) completed`);
  });

  worker.on('failed', async (job, err) => {
    logger.error(`[${queueName}] ❌ ${job?.name} (${job?.id}): ${err.message}`);
    // Send to dead-letter queue after all retries exhausted
    if (job && job.attemptsMade >= (job.opts?.attempts || 3)) {
      await sendToDeadLetter(queueName, job.data, err.message).catch(() => {});
      logger.warn(`[${queueName}] Sent to DLQ: job ${job.id}`);
    }
  });

  worker.on('error', (err) => logger.error(`[${queueName}] Worker error: ${err.message}`));

  workers.push(worker);
  logger.info(`✅ Worker started: ${queueName}`);
});

// ── Graceful shutdown ─────────────────────────────────────────────
const shutdown = async () => {
  logger.info('Shutting down BullMQ workers...');
  await Promise.allSettled(workers.map((w) => w.close()));
  logger.info('All workers closed');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

logger.info(`🚀 BullMQ — ${workers.length} workers running`);