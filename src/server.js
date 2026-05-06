'use strict';

require('dotenv').config();

const connectDB = require('./config/db');
const { connectRedis, getRedisClient } = require('./config/redis');
const { initFirebase } = require('./config/firebase');
const { startReconciliationCron } = require('./jobs/cron/reconciliation.cron');
const logger = require('./utils/logger');
const mongoose = require('mongoose');

const PORT = parseInt(process.env.PORT) || 5000;

const log = {
  info: (msg) => console.log(`🔵 [INFO] ${msg}`),
  success: (msg) => console.log(`🟢 [SUCCESS] ${msg}`),
  warn: (msg) => console.log(`🟡 [WARN] ${msg}`),
  error: (msg) => console.log(`🔴 [ERROR] ${msg}`),
  start: (msg) => console.log(`🚀 [START] ${msg}`),
};

const start = async () => {
  try {
    log.start('Impact Bridge server initializing...');

    // 1. DATABASE CONNECTIONS
    await connectDB();
    log.success('MongoDB connected');

    await connectRedis();
    log.success('Redis connected');

    // 2. FIREBASE
    try {
      initFirebase();
      log.success('Firebase initialized');
    } catch (err) {
      log.warn(`Firebase disabled: ${err.message}`);
    }

    // 3. BULLMQ WORKERS (FIXED: Removed production check)
    log.start('Initializing BullMQ workers...');
    require('./jobs/worker'); 
    log.success('BullMQ workers active');

    // 4. LOAD EXPRESS APP
    const app = require('./app');

    // 5. CRON JOBS
    startReconciliationCron();
    log.success('Cron jobs started');

    // 6. START SERVER
    const server = app.listen(PORT, () => {
      console.log('\n╔══════════════════════════════════════════════════╗');
      console.log(`║   🟢 Port:        ${PORT}`);
      console.log(`║   🟢 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('╚══════════════════════════════════════════════════╝\n');
    });

    // 7. GRACEFUL SHUTDOWN
    const shutdown = async (signal) => {
      log.warn(`${signal} received — shutting down...`);
      server.close(async () => {
        try {
          await mongoose.connection.close();
          const redis = getRedisClient();
          if (redis) await redis.quit();
          
          // Properly close BullMQ infrastructure
          const { queues, connection } = require('./config/bullmq');
          await Promise.allSettled(Object.values(queues).map((q) => q.close()));
          await connection.quit(); // Close the ioredis connection
          
          log.success('Graceful shutdown complete');
          process.exit(0);
        } catch (err) {
          log.error(`Shutdown error: ${err.message}`);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (err) {
    log.error(`Server startup failed: ${err.message}`);
    process.exit(1);
  }
};

start();

