'use strict';

require('dotenv').config();

const connectDB = require('./config/db');
const { connectRedis, getRedisClient } = require('./config/redis');
const { initFirebase } = require('./config/firebase');
const { startReconciliationCron } = require('./jobs/cron/reconciliation.cron');
const logger = require('./utils/logger');

const PORT = parseInt(process.env.PORT) || 5000;

const start = async () => {
  try {
    // ─────────────────────────────────────────────
    // 1. DATABASE CONNECTION
    // ─────────────────────────────────────────────
    await connectDB();

    // ─────────────────────────────────────────────
    // 2. REDIS CONNECTION
    // ─────────────────────────────────────────────
    await connectRedis();

    // ─────────────────────────────────────────────
    // 3. LOAD EXPRESS APP (AFTER INFRA READY)
    // ─────────────────────────────────────────────
    const app = require('./app');

    // ─────────────────────────────────────────────
    // 4. FIREBASE (NON-CRITICAL)
    // ─────────────────────────────────────────────
    try {
      initFirebase();
    } catch (err) {
      logger.warn(
        `Firebase skipped (push notifications disabled): ${err.message}`
      );
    }

    // ─────────────────────────────────────────────
    // 5. BULLMQ WORKERS (DEV MODE ONLY)
    // ─────────────────────────────────────────────
    if (process.env.NODE_ENV !== 'production') {
      try {
        require('./jobs/worker');
        logger.info('BullMQ workers started in dev mode');
      } catch (err) {
        logger.warn(`BullMQ worker failed to start: ${err.message}`);
      }
    }

    // ─────────────────────────────────────────────
    // 6. CRON JOBS
    // ─────────────────────────────────────────────
    startReconciliationCron();

    // ─────────────────────────────────────────────
    // 7. SEED CHECK (SDGs)
    // ─────────────────────────────────────────────
    const SDG = require('./modules/sdg/sdg.model');
    const sdgCount = await SDG.countDocuments();

    if (sdgCount === 0) {
      logger.info(
        'No SDGs found. Run: POST /api/v1/sdg/seed (super_admin required)'
      );
    }

    // ─────────────────────────────────────────────
    // 8. START SERVER
    // ─────────────────────────────────────────────
    const server = app.listen(PORT, () => {
      console.log('\n');
      console.log('╔══════════════════════════════════════════════════╗');
      console.log('║       🌍  IMPACT BRIDGE  —  RUNNING              ║');
      console.log('╠══════════════════════════════════════════════════╣');
      console.log(`║  Port:        ${PORT}                               ║`);
      console.log(
        `║  Environment: ${(process.env.NODE_ENV || 'development').padEnd(34)}║`
      );
      console.log(`║  API Base:    http://localhost:${PORT}/api/v1       ║`);
      console.log(`║  Swagger UI:  http://localhost:${PORT}/api/docs     ║`);
      console.log(`║  JSON Spec:   http://localhost:${PORT}/api/docs.json║`);
      console.log(`║  Health:      http://localhost:${PORT}/health       ║`);
      console.log('╚══════════════════════════════════════════════════╝\n');
    });

    // ─────────────────────────────────────────────
    // 9. GRACEFUL SHUTDOWN
    // ─────────────────────────────────────────────
    const shutdown = async (signal) => {
      logger.info(`${signal} received — shutting down...`);

      server.close(async () => {
        try {
          // MongoDB shutdown
          await require('mongoose').connection.close();
          logger.info('✅ MongoDB disconnected');
        } catch (err) {
          logger.warn(`MongoDB shutdown error: ${err.message}`);
        }

        try {
          // Redis shutdown (SAFE)
          const redis = getRedisClient();
          if (redis?.isOpen) {
            await redis.quit();
            logger.info('✅ Redis disconnected');
          }
        } catch (err) {
          logger.warn(`Redis shutdown error: ${err.message}`);
        }

        try {
          // BullMQ shutdown (SAFE)
          let queues = {};
          try {
            ({ queues } = require('./config/bullmq'));
          } catch {
            logger.warn('BullMQ not initialized');
          }

          if (queues && Object.keys(queues).length > 0) {
            await Promise.allSettled(
              Object.values(queues).map((q) => q?.close?.())
            );
            logger.info('✅ BullMQ queues closed');
          }
        } catch (err) {
          logger.warn(`BullMQ shutdown error: ${err.message}`);
        }

        logger.info('✅ Graceful shutdown complete');
        process.exit(0);
      });

      // Force shutdown fallback
      setTimeout(() => {
        logger.error('⚠️ Force shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // ─────────────────────────────────────────────
    // 10. GLOBAL ERROR HANDLERS
    // ─────────────────────────────────────────────
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Promise Rejection:', reason);
    });

    process.on('uncaughtException', (err) => {
      logger.error(`Uncaught Exception: ${err.message}`);
      process.exit(1);
    });
  } catch (err) {
    logger.error(`Server startup failed: ${err.message}`);
    process.exit(1);
  }
};

start();


// 'use strict';

// require('dotenv').config();

// // const app          = require('./app');
// const connectDB    = require('./config/db');
// const { connectRedis }      = require('./config/redis');
// const { initFirebase }      = require('./config/firebase');
// const { startReconciliationCron } = require('./jobs/cron/reconciliation.cron');
// const logger = require('./utils/logger');

// const PORT = parseInt(process.env.PORT) || 5000;

// const start = async () => {
//   try {
//     // ── 1. Connect databases ────────────────────────────────────
//     await connectDB();
//     await connectRedis();


//     const app = require('./app');
//     // ── 2. Initialize Firebase (non-critical) ───────────────────
//     try {
//       initFirebase();
//     } catch (err) {
//       logger.warn(`Firebase skipped (push notifications disabled): ${err.message}`);
//     }

//     // ── 3. Start BullMQ workers ─────────────────────────────────
//     // In development: run in the same process for convenience
//     // In production: run as a SEPARATE process: node src/jobs/worker.js
//     if (process.env.NODE_ENV !== 'production') {
//       require('./jobs/worker');
//       logger.info('BullMQ workers started in-process (dev mode)');
//     }

//     // ── 4. Start cron jobs ──────────────────────────────────────
//     startReconciliationCron();

//     // ── 5. Auto-seed SDGs on first run ──────────────────────────
//     const SDG = require('./modules/sdg/sdg.model');
//     const sdgCount = await SDG.countDocuments();
//     if (sdgCount === 0) {
//       logger.info('No SDGs found. Run: POST /api/v1/sdg/seed (super_admin token required)');
//     }

//     // ── 6. Start HTTP server ────────────────────────────────────
//     const server = app.listen(PORT, () => {
//       console.log('\n');
//       console.log('╔══════════════════════════════════════════════════╗');
//       console.log('║       🌍  IMPACT BRIDGE  —  RUNNING              ║');
//       console.log('╠══════════════════════════════════════════════════╣');
//       console.log(`║  Port:        ${PORT}                               ║`);
//       console.log(`║  Environment: ${(process.env.NODE_ENV || 'development').padEnd(34)}║`);
//       console.log(`║  API Base:    http://localhost:${PORT}/api/v1       ║`);
//       console.log(`║  Swagger UI:  http://localhost:${PORT}/api/docs     ║`);
//       console.log(`║  JSON Spec:   http://localhost:${PORT}/api/docs.json║`);
//       console.log(`║  Health:      http://localhost:${PORT}/health       ║`);
//       console.log('╚══════════════════════════════════════════════════╝\n');
//     });

//     // ── 7. Graceful shutdown ────────────────────────────────────
//     const shutdown = async (signal) => {
//       logger.info(`${signal} received — starting graceful shutdown...`);

//       server.close(async () => {
//         // Close MongoDB
//         await require('mongoose').connection.close();
//         logger.info('✅ MongoDB disconnected');

//         // Close Redis
//         try {
//           const { getRedisClient } = require('./config/redis');
//           await getRedisClient().quit();
//           logger.info('✅ Redis disconnected');
//         } catch {}

//         // Close BullMQ queues
//         const { queues } = require('./config/bullmq');
//         await Promise.allSettled(Object.values(queues).map((q) => q.close()));
//         logger.info('✅ BullMQ queues closed');

//         logger.info('✅ Graceful shutdown complete');
//         process.exit(0);
//       });

//       // Force exit if graceful shutdown takes more than 30 seconds
//       setTimeout(() => {
//         logger.error('⚠️  Force exit after 30s timeout');
//         process.exit(1);
//       }, 30000);
//     };

//     process.on('SIGTERM', () => shutdown('SIGTERM'));
//     process.on('SIGINT',  () => shutdown('SIGINT'));

//     // ── 8. Unhandled rejections / exceptions ─────────────────────
//     process.on('unhandledRejection', (reason) => {
//       logger.error(`Unhandled Promise Rejection: ${reason}`);
//     });

//     process.on('uncaughtException', (err) => {
//       logger.error(`Uncaught Exception: ${err.message}\n${err.stack}`);
//       process.exit(1);
//     });

//   } catch (err) {
//     logger.error(`Server startup failed: ${err.message}`);
//     process.exit(1);
//   }
// };

// start();