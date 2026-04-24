// 'use strict';

// const cron = require('node-cron');
// const { queues } = require('../../config/bullmq');
// const logger = require('../../utils/logger');

// const startReconciliationCron = () => {
//   const schedule = process.env.RECONCILIATION_CRON || '0 */6 * * *';

//   if (!cron.validate(schedule)) {
//     logger.error(`❌ Invalid CRON expression: ${schedule}`);
//     return;
//   }

//   // 🔥 SAFETY CHECK (IMPORTANT FIX)
//   const reconciliationQueue = queues?.reconciliation;

//   if (!reconciliationQueue) {
//     logger.warn('⚠️ Reconciliation queue is not defined in BullMQ config');
//     return;
//   }

//   cron.schedule(schedule, async () => {
//     logger.info('⏰ Reconciliation cron triggered');

//     try {
//       await reconciliationQueue.add(
//         'auto_reconcile',
//         {
//           triggered_at: new Date().toISOString(),
//         },
//         {
//           jobId: `reconcile-${Date.now()}`,
//           removeOnComplete: true,
//         }
//       );

//       logger.info('✅ Reconciliation job queued');
//     } catch (err) {
//       logger.error(`❌ Reconciliation cron failed: ${err.message}`);
//     }
//   });

//   logger.info(`✅ Reconciliation cron scheduled: ${schedule}`);
// };

// module.exports = { startReconciliationCron };


// 'use strict';

// const cron = require('node-cron');
// const { queues } = require('../../config/bullmq');
// const logger = require('../../utils/logger');

// /**
//  * Reconciliation cron job.
//  * Runs on schedule defined in RECONCILIATION_CRON env var.
//  * Default: every 6 hours
//  */
// const startReconciliationCron = () => {
//   // Remove the cron string from the comment if it keeps tripping up your IDE/Linter
//   const schedule = process.env.RECONCILIATION_CRON || '0 */6 * * *';

//   if (!cron.validate(schedule)) {
//     logger.error(`Invalid RECONCILIATION_CRON expression: ${schedule}`);
//     return;
//   }

//   cron.schedule(schedule, async () => {
//     logger.info('⏰ Reconciliation cron triggered');
//     try {
//       await queues.reconciliation.add(
//         'auto_reconcile',
//         { triggered_at: new Date().toISOString() },
//         {
//           jobId: `reconcile-${Date.now()}`,
//           removeOnComplete: true,
//         }
//       );
//       logger.info('✅ Reconciliation job queued');
//     } catch (err) {
//       logger.error(`Reconciliation cron failed to queue: ${err.message}`);
//     }
//   });

//   logger.info(`✅ Reconciliation cron scheduled: "${schedule}"`);
// };

// module.exports = { startReconciliationCron };


// 'use strict';

// const cron   = require('node-cron');
// const { queues } = require('../../config/bullmq');
// const logger = require('../../utils/logger');

// // /**
// //  * Reconciliation cron job.
// //  * Runs on schedule defined in RECONCILIATION_CRON env var.
// //  * Default: every 6 hours (0 */6 * * *)
// //  *
// //  * Adds a reconciliation job to the BullMQ queue.
// //  * The queue worker (reconciliationProcessor) handles the actual work.
// //  * This separation ensures the cron doesn't block even if Redis is slow.
// //  */
// const startReconciliationCron = () => {
//   const schedule = process.env.RECONCILIATION_CRON || '0 */6 * * *';

//   if (!cron.validate(schedule)) {
//     logger.error(`Invalid RECONCILIATION_CRON expression: ${schedule}`);
//     return;
//   }

//   cron.schedule(schedule, async () => {
//     logger.info('⏰ Reconciliation cron triggered');
//     try {
//       await queues.reconciliation.add(
//         'auto_reconcile',
//         { triggered_at: new Date().toISOString() },
//         {
//           jobId:           `reconcile-${Date.now()}`,
//           removeOnComplete: true,
//         }
//       );
//       logger.info('✅ Reconciliation job queued');
//     } catch (err) {
//       logger.error(`Reconciliation cron failed to queue: ${err.message}`);
//     }
//   });

//   logger.info(`✅ Reconciliation cron scheduled: "${schedule}"`);
// };

// module.exports = { startReconciliationCron };'use strict';

const cron   = require('node-cron');
const { queues } = require('../../config/bullmq');
const logger = require('../../utils/logger');

// /**
//  * Reconciliation cron job.
//  * Runs on schedule defined in RECONCILIATION_CRON env var.
//  * Default: every 6 hours (0 */6 * * *)
//  *
//  * Adds a reconciliation job to the BullMQ queue.
//  * The queue worker (reconciliationProcessor) handles the actual work.
//  * This separation ensures the cron doesn't block even if Redis is slow.
//  */
const startReconciliationCron = () => {
  const schedule = process.env.RECONCILIATION_CRON || '0 */6 * * *';

  if (!cron.validate(schedule)) {
    logger.error(`Invalid RECONCILIATION_CRON expression: ${schedule}`);
    return;
  }

  cron.schedule(schedule, async () => {
    logger.info('⏰ Reconciliation cron triggered');
    try {
      await queues.reconciliation.add(
        'auto_reconcile',
        { triggered_at: new Date().toISOString() },
        {
          jobId:           `reconcile-${Date.now()}`,
          removeOnComplete: true,
        }
      );
      logger.info('✅ Reconciliation job queued');
    } catch (err) {
      logger.error(`Reconciliation cron failed to queue: ${err.message}`);
    }
  });

  logger.info(`✅ Reconciliation cron scheduled: "${schedule}"`);
};

module.exports = { startReconciliationCron };