'use strict';

require('dotenv').config();

const mongoose = require('mongoose');

const connectDB = require('./config/db');
const { connectRedis, getRedisClient } = require('./config/redis');
const { initFirebase } = require('./config/firebase');
const { startReconciliationCron } = require('./jobs/cron/reconciliation.cron');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 5000;

/**
 * Simple logger (kept clean)
 */
const log = {
  info:    (msg) => console.log(`🔵 ${msg}`),
  success: (msg) => console.log(`🟢 ${msg}`),
  warn:    (msg) => console.log(`🟡 ${msg}`),
  error:   (msg) => console.log(`🔴 ${msg}`),
};

/**
 * SAFE QUEUE LOADER
 */
const loadQueues = () => {
  try {
    const { queues } = require('./config/bullmq');

    if (!queues || Object.keys(queues).length === 0) {
      log.warn('No BullMQ queues found');
      return null;
    }

    log.success('BullMQ queues loaded');
    return queues;
  } catch (err) {
    log.warn(`Queues not initialized: ${err.message}`);
    return null;
  }
};

/**
 * START SERVER
 */
const startServer = async () => {
  try {
    log.info('Starting Impact Bridge backend...');

    /**
     * 1. DATABASE
     */
    await connectDB();
    log.success('MongoDB connected');

    /**
     * 2. REDIS
     */
    await connectRedis();
    log.success('Redis connected');

    /**
     * 3. FIREBASE (optional)
     */
    try {
      initFirebase();
      log.success('Firebase initialized');
    } catch (err) {
      log.warn(`Firebase skipped: ${err.message}`);
    }

    /**
     * 4. EXPRESS APP
     */
    const app = require('./app');

    /**
     * 5. QUEUES (SAFE LOAD)
     */
    const queues = loadQueues();

    /**
     * 6. WORKERS (ONLY DEV)
     */
    if (process.env.NODE_ENV !== 'production') {
      try {
        require('./jobs/worker');
        log.success('Workers started (dev)');
      } catch (err) {
        log.warn(`Workers not started: ${err.message}`);
      }
    }

    /**
     * 7. CRON JOBS (SAFE)
     */
    try {
      startReconciliationCron();
      log.success('Cron jobs started');
    } catch (err) {
      log.warn(`Cron failed: ${err.message}`);
    }

    /**
     * 8. START LISTENING
     */
    const server = app.listen(PORT, () => {
      console.log('\n═══════════════════════════════════════');
      console.log('🌍 IMPACT BRIDGE BACKEND RUNNING');
      console.log('═══════════════════════════════════════');
      console.log(`🚀 Port:        ${PORT}`);
      console.log(`🌐 Base URL:    /api/v1`);
      console.log(`❤️ Health:      /health`);
      console.log(`📘 Docs:        /api/docs`);
      console.log('═══════════════════════════════════════\n');
    });

    /**
     * 9. GRACEFUL SHUTDOWN
     */
    const shutdown = async (signal) => {
      log.warn(`${signal} received. Shutting down...`);

      server.close(async () => {
        try {
          await mongoose.connection.close();
          log.success('MongoDB disconnected');

          const redis = getRedisClient();
          if (redis) {
            await redis.quit();
            log.success('Redis disconnected');
          }

          if (queues) {
            await Promise.allSettled(
              Object.values(queues).map((q) => q.close())
            );
            log.success('Queues closed');
          }

          log.success('Shutdown complete');
          process.exit(0);
        } catch (err) {
          log.error(`Shutdown error: ${err.message}`);
          process.exit(1);
        }
      });

      setTimeout(() => {
        log.error('Forced shutdown');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    /**
     * 10. GLOBAL ERRORS
     */
    process.on('unhandledRejection', (err) => {
      log.error(`Unhandled Rejection: ${err}`);
    });

    process.on('uncaughtException', (err) => {
      log.error(`Uncaught Exception: ${err.message}`);
      process.exit(1);
    });

  } catch (err) {
    log.error(`Startup failed: ${err.message}`);
    process.exit(1);
  }
};

startServer();



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