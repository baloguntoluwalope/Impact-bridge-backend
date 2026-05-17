'use strict';

/**
 * config/bullmq.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Single shared ioredis connection for ALL queues, workers, and FlowProducer.
 *
 * CONNECTION COUNT BUDGET (Redis Cloud free = 30 max):
 *   Previous code:  1 connection × 8 queues × ~2 internal BullMQ conns = 16+
 *   With QueueEvents (old commented code): add 8 more = 24+
 *   Workers (worker.js) adding their own IORedis: +8 more = 32+ → OVER LIMIT
 *
 *   This file:  1 shared connection total for all producers
 *   Workers:    import `connection` from here — no new IORedis in worker.js
 *   Total:      ~3–4 connections regardless of queue count ✅
 *
 * Rule: never call `new IORedis()` anywhere else in the codebase.
 *       Always import `connection` from this file.
 */

const { Queue, FlowProducer } = require('bullmq');
const IORedis                 = require('ioredis');
const logger                  = require('../utils/logger');

// ── Build Redis URL ───────────────────────────────────────────────────────────
const redisUrl = process.env.REDIS_URL
  || `redis://${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || 6379}`;

const isTLS = redisUrl.startsWith('rediss://');

// ── Single shared ioredis connection ─────────────────────────────────────────
const connection = new IORedis(redisUrl, {
  // ── Required by BullMQ ──────────────────────────────────────────
  maxRetriesPerRequest: null,   // BullMQ uses blocking commands; must be null
  enableReadyCheck:     false,  // Prevents startup hangs on slow Redis

  // ── TLS (Redis Cloud uses rediss://) ────────────────────────────
  ...(isTLS && { tls: { rejectUnauthorized: false } }),

  // ── Connection resilience ────────────────────────────────────────
  // Stop retrying after 10 attempts — prevents the reconnect storm
  // that exhausted your 30-connection free tier limit
  retryStrategy: (times) => {
    if (times > 10) {
      logger.error('🔴 BullMQ Redis: max reconnect attempts reached — stopping');
      return null; // null = stop retrying, do not crash the process
    }
    const delay = Math.min(times * 300, 5_000);
    logger.warn(`🔄 BullMQ Redis reconnecting (attempt ${times}) in ${delay}ms…`);
    return delay;
  },

  // Only trigger a reconnect on READONLY errors (primary/replica failover)
  // NOT on every error — this was causing extra connections on your free tier
  reconnectOnError: (err) => err.message.includes('READONLY'),

  connectTimeout: 15_000,
  // commandTimeout intentionally not set — BullMQ uses blocking commands
  // (BRPOPLPUSH / BLMOVE) that legitimately run for seconds waiting for jobs.
  // Setting commandTimeout causes those commands to time out and triggers the
  // "[worker] Command timed out" spam you saw in logs. Remove it entirely.
  lazyConnect:     false,
});

connection.on('connect',      ()    => logger.info(`✅ BullMQ connected to Redis via ${isTLS ? 'TLS' : 'TCP'}`));
connection.on('ready',        ()    => logger.info('✅ BullMQ Redis ready'));
connection.on('error',        (err) => logger.error(`❌ BullMQ Redis error: ${err.message}`));
connection.on('close',        ()    => logger.warn('🔴 BullMQ Redis connection closed'));
connection.on('reconnecting', ()    => logger.warn('🔄 BullMQ Redis reconnecting…'));

// ── Worker connection factory ─────────────────────────────────────────────────
// OPTIMIZATION: Use shared connection for workers on Redis Cloud free tier (30 conn limit)
// BullMQ can handle blocking commands on shared connections — it's the recommended
// approach for production Redis Cloud instances with limited connections.
//
// If you need isolated worker connections, comment this out and use createWorkerConnection()
const USE_SHARED_CONNECTION_FOR_WORKERS = true;

const createWorkerConnection = () => {
  if (USE_SHARED_CONNECTION_FOR_WORKERS) {
    return connection; // Reuse shared connection to save connection slots
  }
  
  // Fallback: create individual worker connections (requires more connection budget)
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck:     false,
    ...(isTLS && { tls: { rejectUnauthorized: false } }),
    retryStrategy: (times) => {
      if (times > 10) return null;
      return Math.min(times * 300, 5_000);
    },
    reconnectOnError: (err) => err.message.includes('READONLY'),
    connectTimeout: 20_000, // Increased for slower cloud connections
  });
};

// ── Default job options ───────────────────────────────────────────────────────
const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2_000 },
  // Keep completed jobs for 24 h (max 1000) — avoids Redis memory bloat on 30MB plan
  removeOnComplete: { count: 1_000, age: 24 * 3_600 },
  // Keep failed jobs for 7 days (max 5000) for debugging
  removeOnFail:     { count: 5_000, age: 7 * 24 * 3_600 },
};

// ── Queue factory ─────────────────────────────────────────────────────────────
// NOTE: Do NOT attach QueueEvents here — each one opens its own blocking
// ioredis connection, adding 8 extra connections on your free tier.
//
// KEY PREFIX — Redis Cloud free tier only has DB 0 (no multi-DB support).
// We namespace BullMQ keys with "bull:" to keep them separate from cache keys.
//   Cache keys : sdg:*, rate:*, token:*, etc.
//   BullMQ keys: bull:email:*, bull:payment:*, etc.
//
// skipVersionCheck on the Queue suppresses the "Eviction policy should be
// noeviction" warning. We intentionally keep volatile-lru on the Redis instance
// so cache keys (all have TTLs) can be evicted under memory pressure.
// BullMQ job keys have NO TTL, so volatile-lru never touches them — safe.
const BULL_PREFIX = '{bull}'; // braces required for Redis Cluster slot alignment

const _createQueue = (name, overrides = {}) =>
  new Queue(name, {
    connection,
    prefix:            BULL_PREFIX,
    skipVersionCheck:  true,          // suppresses eviction policy warning
    defaultJobOptions: { ...defaultJobOptions, ...overrides },
  });

// ── All application queues ────────────────────────────────────────────────────
const queues = {
  email:          _createQueue('email',          { attempts: 5 }),
  sms:            _createQueue('sms'),
  push:           _createQueue('push'),
  payment:        _createQueue('payment',        { attempts: 5, backoff: { type: 'exponential', delay: 3_000 } }),
  notification:   _createQueue('notification',   { attempts: 4 }),
  report:         _createQueue('report'),
  reconciliation: _createQueue('reconciliation'),
  deadLetter:     _createQueue('dead-letter',    { attempts: 1, removeOnFail: false }),
};

logger.info(`📋 BullMQ queues registered: ${Object.keys(queues).join(', ')}`);

// ── FlowProducer (shared connection) ─────────────────────────────────────────
const flowProducer = new FlowProducer({ connection });
flowProducer.on('error', (err) => logger.error(`❌ FlowProducer error: ${err.message}`));

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Add a job to a named queue.
 *
 * @param {string} queueName  - Key from the queues object above
 * @param {string} jobName    - Job type identifier (e.g. 'send_otp')
 * @param {object} data       - Job payload
 * @param {object} [opts]     - BullMQ job options (override defaults)
 * @returns {Promise<Job>}
 *
 * @example
 * await addJob('email', 'send_otp', { to: 'user@example.com', otp: '123456' });
 */
const addJob = async (queueName, jobName, data, opts = {}) => {
  const q = queues[queueName];
  if (!q) {
    throw new Error(`Queue "${queueName}" not found. Available: ${Object.keys(queues).join(', ')}`);
  }
  return q.add(jobName, data, opts);
};

/**
 * Move an exhausted job to the dead-letter queue for manual review.
 *
 * @param {string} originalQueue - Queue the job originally came from
 * @param {object} data          - Original job payload
 * @param {string} reason        - Failure reason / error message
 */
const sendToDeadLetter = async (originalQueue, data, reason) =>
  queues.deadLetter.add('dlq_job', {
    original_queue: originalQueue,
    data,
    reason,
    failed_at: new Date().toISOString(),
  });

/**
 * Gracefully shut down all queues and the Redis connection.
 * Call this in your SIGTERM / SIGINT handler.
 */
const shutdown = async () => {
  logger.info('Shutting down BullMQ…');
  try {
    await Promise.all(Object.values(queues).map((q) => q.close()));
    await flowProducer.close();
    await connection.quit();
    logger.info('✅ BullMQ shut down cleanly');
  } catch (err) {
    logger.error(`BullMQ shutdown error: ${err.message}`);
  }
};

module.exports = {
  connection,              // shared connection for Queue producers and FlowProducer
  createWorkerConnection,  // factory — use this in worker.js for Worker instances
  queues,
  flowProducer,
  addJob,
  sendToDeadLetter,
  shutdown,
};



// 'use strict';

// const { Queue, FlowProducer } = require('bullmq');
// const IORedis = require('ioredis');
// const logger = require('../utils/logger');

// const redisUrl = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || 6379}`;
// const redisOptions = {
//   maxRetriesPerRequest: null,
//   enableReadyCheck: false,
// };

// if (redisUrl.startsWith('rediss://')) {
//   redisOptions.tls = { rejectUnauthorized: false };
// }

// /**
//  * 🔌 REDIS CONNECTION
//  * BullMQ requires maxRetriesPerRequest: null
//  */
// const connection = new IORedis(redisUrl, redisOptions);
// connection.on('connect', () => logger.info(`✅ BullMQ connected to Redis via ${redisUrl.startsWith('rediss://') ? 'TLS' : 'TCP'}`));
// connection.on('error', (err) => logger.error(`BullMQ Redis error: ${err.message}`));
// connection.on('close', () => logger.warn('BullMQ Redis connection closed'));
// connection.on('reconnecting', () => logger.warn('BullMQ Redis reconnecting...'));

// const defaultJobOptions = {
//   attempts: 3,
//   backoff: { type: 'exponential', delay: 2000 },
//   removeOnComplete: { count: 1000, age: 24 * 3600 },
//   removeOnFail: { count: 5000, age: 7 * 24 * 3600 },
// };

// /**
//  * 🧠 QUEUE INSTANTIATION
//  * We create these immediately so they can be exported synchronously.
//  */
// const createQueue = (name, overrides = {}) => {
//   return new Queue(name, {
//     connection,
//     defaultJobOptions: { ...defaultJobOptions, ...overrides },
//   });
// };

// const queues = {
//   email:          createQueue('email', { attempts: 5 }),
//   sms:            createQueue('sms'),
//   push:           createQueue('push'),
//   payment:        createQueue('payment', { attempts: 5 }),
//   notification:   createQueue('notification', { attempts: 4 }),
//   report:         createQueue('report'),
//   reconciliation: createQueue('reconciliation'),
//   deadLetter:     createQueue('dead-letter', { attempts: 1, removeOnFail: false }),
// };

// /**
//  * ➕ ADD JOB HELPER
//  * Signature: addJob(queueName, jobName, data, opts)
//  */
// const addJob = async (queueName, jobName, data, opts = {}) => {
//   const q = queues[queueName];
//   if (!q) {
//     throw new Error(`Queue "${queueName}" not found. Available: ${Object.keys(queues).join(', ')}`);
//   }
//   return q.add(jobName, data, opts);
// };

// /**
//  * ☠️ DEAD LETTER HELPER
//  */
// const sendToDeadLetter = async (originalQueue, data, reason) => {
//   return queues.deadLetter.add('dlq_job', {
//     original_queue: originalQueue,
//     data,
//     reason,
//     failed_at: new Date().toISOString(),
//   });
// };

// const flowProducer = new FlowProducer({ connection });
// flowProducer.on('error', (err) => logger.error(`FlowProducer error: ${err.message}`));

// module.exports = {
//   queues,
//   addJob,
//   sendToDeadLetter,
//   flowProducer,
//   connection, // Exported for worker.js
// };





// // 'use strict';

// // const { Queue, Worker, QueueEvents, FlowProducer } = require('bullmq');
// // const IORedis = require('ioredis');
// // const logger  = require('../utils/logger');

// // /**
// //  * BullMQ requires ioredis (not the standard redis client).
// //  * maxRetriesPerRequest: null is REQUIRED by BullMQ.
// //  * enableReadyCheck: false prevents startup timeout issues.
// //  */
// // const connection = new IORedis({
// //   host:                 process.env.REDIS_HOST || '127.0.0.1',
// //   port:                 parseInt(process.env.REDIS_PORT) || 6379,
// //   password:             process.env.REDIS_PASSWORD || undefined,
// //   maxRetriesPerRequest: null,
// //   enableReadyCheck:     false,
// // });

// // connection.on('connect', ()    => logger.info('✅ BullMQ IORedis connected'));
// // connection.on('error',   (err) => logger.error(`BullMQ IORedis error: ${err.message}`));

// // /**
// //  * Default job options applied to all queues.
// //  * removeOnComplete: keep last 1000 completed jobs, delete after 24h.
// //  * removeOnFail: keep last 5000 failed jobs for 7 days (for debugging).
// //  */
// // const defaultJobOptions = {
// //   removeOnComplete: { count: 1000, age: 24 * 3600 },
// //   removeOnFail:     { count: 5000, age: 7 * 24 * 3600 },
// //   attempts:         3,
// //   backoff:          { type: 'exponential', delay: 2000 },
// // };

// // /**
// //  * Factory to create a named BullMQ queue with event listeners.
// //  */
// // const createQueue = (name, overrides = {}) => {
// //   const queue  = new Queue(name, {
// //     connection,
// //     defaultJobOptions: { ...defaultJobOptions, ...overrides },
// //   });

// //   const events = new QueueEvents(name, { connection });
// //   events.on('completed', ({ jobId })              => logger.info(`[${name}] ✅ Job ${jobId} completed`));
// //   events.on('failed',    ({ jobId, failedReason }) => logger.error(`[${name}] ❌ Job ${jobId}: ${failedReason}`));
// //   events.on('stalled',   ({ jobId })              => logger.warn(`[${name}]  ⚠️  Job ${jobId} stalled`));

// //   return queue;
// // };

// // // ── All application queues ────────────────────────────────────────
// // const queues = {
// //   email:          createQueue('email',          { attempts: 5 }),
// //   sms:            createQueue('sms',            { attempts: 3 }),
// //   push:           createQueue('push',           { attempts: 3 }),
// //   payment:        createQueue('payment',        { attempts: 5, backoff: { type: 'exponential', delay: 3000 } }),
// //   notification:   createQueue('notification',   { attempts: 4 }),
// //   report:         createQueue('report',         { attempts: 2 }),
// //   reconciliation: createQueue('reconciliation', { attempts: 3 }),
// //   deadLetter:     createQueue('dead-letter',    { attempts: 1, removeOnFail: false }),
// // };

// // const flowProducer = new FlowProducer({ connection });

// // /**
// //  * Add a job to a named queue.
// //  * @param {string} queueName - Name of the queue
// //  * @param {string} jobName   - Job type identifier
// //  * @param {object} data      - Job payload
// //  * @param {object} opts      - Optional BullMQ job options
// //  */
// // const addJob = async (queueName, jobName, data, opts = {}) => {
// //   const queue = queues[queueName];
// //   if (!queue) throw new Error(`Queue "${queueName}" does not exist`);
// //   return queue.add(jobName, data, opts);
// // };

// // /**
// //  * Send an exhausted (all retries failed) job to the dead-letter queue.
// //  * Dead-letter jobs are kept forever for manual review.
// //  */
// // const sendToDeadLetter = async (originalQueue, data, reason) => {
// //   return queues.deadLetter.add('dlq_job', {
// //     original_queue: originalQueue,
// //     data,
// //     reason,
// //     failed_at: new Date().toISOString(),
// //   });
// // };

// // module.exports = { queues, connection, addJob, sendToDeadLetter, flowProducer };