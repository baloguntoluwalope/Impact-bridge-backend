'use strict';

// require('dotenv').config();

const { Worker }                      = require('bullmq');
const { createWorkerConnection, sendToDeadLetter, shutdown: shutdownQueues } = require('../config/bullmq');
const notifService                    = require('../modules/notifications/notification.service');
const User                            = require('../modules/users/user.model');
const paymentService                  = require('../modules/payments/payment.service');
const Payment                         = require('../modules/payments/payment.model');
const logger                          = require('../utils/logger');

// ── Job processors ────────────────────────────────────────────────────────────

const PROCESSORS = {

  // ── Email ──────────────────────────────────────────────────────────────────
  email: async (job) => {
    const { to, subject, template, data, html } = job.data;
    const ok = await notifService.sendEmail({ to, subject, template, data, html });
    if (!ok) throw new Error(`Email delivery failed to ${to}`);
    return { sent: true, to };
  },

  // ── SMS ────────────────────────────────────────────────────────────────────
  sms: async (job) => {
    const { to, message } = job.data;
    const result = await notifService.sendSMS({ to, message });
    if (!result) throw new Error(`SMS failed to ${to}`);
    return { sent: true, to };
  },

  // ── Push ───────────────────────────────────────────────────────────────────
  push: async (job) => {
    const { fcm_token, title, body, data } = job.data;
    const result = await notifService.sendPush({ fcm_token, title, body, data });
    if (!result) throw new Error('Push notification failed');
    return { sent: true };
  },

  // ── Notification (single / bulk / broadcast) ───────────────────────────────
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
      // Use a cursor instead of loading all users into memory at once.
      // User.find().lean() on a large collection can exhaust RAM and stall the worker.
      const filter = roles?.length ? { role: { $in: roles } } : {};
      const cursor = User.find(filter).select('_id').lean().cursor();
      let sent = 0;

      for await (const u of cursor) {
        try {
          await notifService.notifyUser(u._id, { event: job.name, title, body, data });
          sent++;
        } catch (err) {
          logger.error(`Broadcast notifyUser failed for ${u._id}: ${err.message}`);
        }
      }

      return { sent };
    }

    logger.warn(`[notification] Unrecognised type "${type}" in job ${job.id}`);
    return { sent: 0 };
  },

  // ── Payment verification ───────────────────────────────────────────────────
  payment: async (job) => {
    const { reference } = job.data;
    const result = await paymentService.verifyPaymentManually(reference);
    return { reference, status: result.payment?.status };
  },

  // ── Reconciliation ─────────────────────────────────────────────────────────
  reconciliation: async (job) => {
    const hours  = parseInt(process.env.PENDING_PAYMENT_HOURS || '2', 10);
    const cutoff = new Date(Date.now() - hours * 3_600_000);

    const pending = await Payment.find({
      status:           'pending',
      created_at:       { $lte: cutoff },
      webhook_verified: false,
    }).lean();

    logger.info(`[reconciliation] ${pending.length} pending payments to verify`);
    const results = { reconciled: 0, failed: 0 };

    for (const p of pending) {
      try {
        await paymentService.verifyPaymentManually(p.reference);
        results.reconciled++;
      } catch (err) {
        logger.error(`[reconciliation] Failed ${p.reference}: ${err.message}`);
        // Auto-fail payments stuck pending for more than 24 h
        const ageHours = (Date.now() - new Date(p.created_at).getTime()) / 3_600_000;
        if (ageHours > 24) {
          await Payment.findByIdAndUpdate(p._id, {
            status:         'failed',
            failure_reason: 'Auto-reconciliation: unverified after 24h',
          });
          results.failed++;
        }
      }
    }

    logger.info(`[reconciliation] Complete: ${JSON.stringify(results)}`);
    return results;
  },
};

// ── Worker concurrency budget ─────────────────────────────────────────────────
// Redis Cloud free tier: 30 connections max.
// Each Worker opens 2 ioredis connections regardless of concurrency.
// 5 workers × 2 = 10 connections. Queues + FlowProducer ≈ 3 more. Total ≈ 13.
//
// Concurrency controls how many jobs run IN PARALLEL per worker process,
// not how many Redis connections are opened — so keep these reasonable
// for your server RAM/CPU, not for Redis connection count.
//
// Previous values (email:10, rest:5) were fine for connections but
// dangerous on a small Render instance (free = 512 MB RAM).
const CONCURRENCY = {
  email:          3,  // Brevo HTTP API calls — I/O bound, 3 is plenty
  sms:            2,
  push:           2,
  notification:   2,
  payment:        2,  // Payment verification should be sequential-ish
  reconciliation: 1,  // Only ever one reconciliation job should run at a time
};

// ── Rate limiter budget ───────────────────────────────────────────────────────
// Previous: { max: 50, duration: 1000 } on ALL queues including reconciliation.
// Reconciliation runs once, so a rate limiter just adds unnecessary overhead.
const RATE_LIMITS = {
  email:        { max: 10, duration: 1_000 }, // Brevo free = 300/day; 10/s is safe
  sms:          { max:  5, duration: 1_000 }, // Termii rate limit
  push:         { max: 20, duration: 1_000 },
  notification: { max: 20, duration: 1_000 },
  payment:      { max:  5, duration: 1_000 },
  // reconciliation: no limiter — runs as a scheduled batch, not high-frequency
};

// ── Create workers ────────────────────────────────────────────────────────────
const workers = [];

let workerIndex = 0;
Object.entries(PROCESSORS).forEach(([queueName, processor]) => {
  // Stagger worker connection startups to avoid overwhelming Redis connection pool
  // Each worker gets its own fresh ioredis connection via the factory.
  // This lets workers reconnect independently when their blocking connection
  // drops, without interfering with the shared queue producer connection.
  const delay = workerIndex * 500; // Stagger by 500ms per worker
  
  setTimeout(() => {
    const workerOptions = {
      connection:  createWorkerConnection(),
      prefix:      '{bull}',          // must match BULL_PREFIX in config/bullmq.js
      concurrency: CONCURRENCY[queueName] ?? 2,
      skipVersionCheck: true,
    };

    if (RATE_LIMITS[queueName]) {
      workerOptions.limiter = RATE_LIMITS[queueName];
    }

    const worker = new Worker(queueName, processor, workerOptions);

  worker.on('completed', (job) => {
    logger.info(`[${queueName}] ✅ ${job.name} (${job.id}) completed`);
  });

  worker.on('failed', async (job, err) => {
    logger.error(`[${queueName}] ❌ ${job?.name} (${job?.id}): ${err.message}`);

    // Only send to DLQ after ALL retry attempts are exhausted
    const maxAttempts = job?.opts?.attempts ?? 3;
    if (job && job.attemptsMade >= maxAttempts) {
      await sendToDeadLetter(queueName, job.data, err.message).catch((dlqErr) => {
        logger.error(`[${queueName}] DLQ write failed: ${dlqErr.message}`);
      });
      logger.warn(`[${queueName}] Job ${job.id} sent to dead-letter queue`);
    }
  });

  worker.on('error', (err) => {
    logger.error(`[${queueName}] Worker error: ${err.message}`);
  });

  workers.push(worker);
  logger.info(`⚙️  Worker started: ${queueName} (concurrency: ${CONCURRENCY[queueName] ?? 2})`);
  }, delay); // Close setTimeout

  workerIndex++;
});

logger.info(`🚀 BullMQ — ${workers.length} workers running`);

// ── Graceful shutdown ─────────────────────────────────────────────────────────
const shutdown = async () => {
  logger.info('🛑 Shutting down BullMQ workers…');
  // Close workers first (finish in-progress jobs), then queues, then Redis
  await Promise.allSettled(workers.map((w) => w.close()));
  await shutdownQueues(); // closes all Queue instances + connection.quit()
  logger.info('✅ All workers and queues closed');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

// 'use strict';

// require('dotenv').config();

// const { Worker }         = require('bullmq');
// const { connection, sendToDeadLetter } = require('../config/bullmq');
// const notifService       = require('../modules/notifications/notification.service');
// const logger             = require('../utils/logger');

// // ── Job processors ────────────────────────────────────────────────

// const PROCESSORS = {

//   email: async (job) => {
//     const { to, subject, template, data, html } = job.data;
//     const ok = await notifService.sendEmail({ to, subject, template, data, html });
//     if (!ok) throw new Error(`Email delivery failed to ${to}`);
//     return { sent: true, to };
//   },

//   sms: async (job) => {
//     const { to, message } = job.data;
//     const result = await notifService.sendSMS({ to, message });
//     if (!result) throw new Error(`SMS failed to ${to}`);
//     return { sent: true, to };
//   },

//   push: async (job) => {
//     const { fcm_token, title, body, data } = job.data;
//     const result = await notifService.sendPush({ fcm_token, title, body, data });
//     if (!result) throw new Error('Push notification failed');
//     return { sent: true };
//   },

//   notification: async (job) => {
//     const { type, userId, userIds, roles, title, body, data } = job.data;

//     if (type === 'single' && userId) {
//       await notifService.notifyUser(userId, { event: job.name, title, body, data });
//       return { sent: 1 };
//     }

//     if (type === 'bulk' && userIds?.length) {
//       await Promise.allSettled(
//         userIds.map((id) => notifService.notifyUser(id, { event: job.name, title, body, data }))
//       );
//       return { sent: userIds.length };
//     }

//     if (type === 'broadcast') {
//       const User  = require('../modules/users/user.model');
//       const filter = roles?.length ? { role: { $in: roles } } : {};
//       const users  = await User.find(filter).select('_id').lean();
//       await Promise.allSettled(
//         users.map((u) => notifService.notifyUser(u._id, { event: job.name, title, body, data }))
//       );
//       return { sent: users.length };
//     }

//     return { sent: 0 };
//   },

//   payment: async (job) => {
//     const { reference } = job.data;
//     const paymentService = require('../modules/payments/payment.service');
//     const result = await paymentService.verifyPaymentManually(reference);
//     return { reference, status: result.payment?.status };
//   },

//   reconciliation: async (job) => {
//     const Payment        = require('../modules/payments/payment.model');
//     const paymentService = require('../modules/payments/payment.service');
//     const hours   = parseInt(process.env.PENDING_PAYMENT_HOURS || 2);
//     const cutoff  = new Date(Date.now() - hours * 3600000);
//     const pending = await Payment.find({
//       status:           'pending',
//       created_at:       { $lte: cutoff },
//       webhook_verified: false,
//     }).lean();

//     logger.info(`Reconciliation: ${pending.length} pending payments to verify`);
//     const results = { reconciled: 0, failed: 0 };

//     for (const p of pending) {
//       try {
//         await paymentService.verifyPaymentManually(p.reference);
//         results.reconciled++;
//       } catch (err) {
//         logger.error(`Reconcile failed ${p.reference}: ${err.message}`);
//         // Mark as definitively failed if pending > 24h
//         const ageHours = (Date.now() - new Date(p.created_at).getTime()) / 3600000;
//         if (ageHours > 24) {
//           await Payment.findByIdAndUpdate(p._id, {
//             status:         'failed',
//             failure_reason: 'Auto-reconciliation: unverified after 24h',
//           });
//           results.failed++;
//         }
//       }
//     }

//     logger.info(`Reconciliation complete: ${JSON.stringify(results)}`);
//     return results;
//   },
// };

// // ── Create workers ────────────────────────────────────────────────
// const workers = [];

// Object.entries(PROCESSORS).forEach(([queueName, processor]) => {
//   const worker = new Worker(queueName, processor, {
//     connection,
//     concurrency: queueName === 'email' ? 10 : 5,
//     limiter:     { max: 50, duration: 1000 },
//   });

//   worker.on('completed', (job) => {
//     logger.info(`[${queueName}] ✅ ${job.name} (${job.id}) completed`);
//   });

//   worker.on('failed', async (job, err) => {
//     logger.error(`[${queueName}] ❌ ${job?.name} (${job?.id}): ${err.message}`);
//     // Send to dead-letter queue after all retries exhausted
//     if (job && job.attemptsMade >= (job.opts?.attempts || 3)) {
//       await sendToDeadLetter(queueName, job.data, err.message).catch(() => {});
//       logger.warn(`[${queueName}] Sent to DLQ: job ${job.id}`);
//     }
//   });

//   worker.on('error', (err) => logger.error(`[${queueName}] Worker error: ${err.message}`));

//   workers.push(worker);
//   logger.info(`✅ Worker started: ${queueName}`);
// });

// // ── Graceful shutdown ─────────────────────────────────────────────
// const shutdown = async () => {
//   logger.info('Shutting down BullMQ workers...');
//   await Promise.allSettled(workers.map((w) => w.close()));
//   logger.info('All workers closed');
//   process.exit(0);
// };

// process.on('SIGTERM', shutdown);
// process.on('SIGINT',  shutdown);

// logger.info(`🚀 BullMQ — ${workers.length} workers running`);