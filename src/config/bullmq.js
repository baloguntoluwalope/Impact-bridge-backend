'use strict';

const { Queue, QueueEvents, FlowProducer } = require('bullmq');
const IORedis = require('ioredis');
const logger = require('../utils/logger');

/**
 * ─────────────────────────────────────────────
 * 🔴 VALIDATE REDIS CONFIG
 * ─────────────────────────────────────────────
 */
if (!process.env.REDIS_URL) {
  throw new Error('REDIS_URL is required for BullMQ');
}

/**
 * ─────────────────────────────────────────────
 * 🔌 BASE REDIS CONNECTION (IMPORTANT FIX)
 * ─────────────────────────────────────────────
 * ✔ NO tls: {}
 * ✔ MUST use rediss:// in env for cloud Redis
 */
const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

/**
 * ─────────────────────────────────────────────
 * 📡 CONNECTION EVENTS
 * ─────────────────────────────────────────────
 */
connection.on('connect', () => {
  logger.info('✅ Redis connected');
});

connection.on('ready', () => {
  logger.info('🚀 Redis ready');
});

connection.on('error', (err) => {
  logger.error(`❌ Redis error: ${err.message}`);
});

connection.on('reconnecting', () => {
  logger.warn('⚠️ Redis reconnecting...');
});

/**
 * ─────────────────────────────────────────────
 * ⚙️ DEFAULT JOB OPTIONS
 * ─────────────────────────────────────────────
 */
const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },

  removeOnComplete: {
    count: 1000,
    age: 24 * 3600,
  },

  removeOnFail: {
    count: 5000,
    age: 7 * 24 * 3600,
  },
};

/**
 * ─────────────────────────────────────────────
 * 🧠 QUEUE FACTORY
 * ─────────────────────────────────────────────
 */
const createQueue = async (name, overrides = {}) => {
  const queue = new Queue(name, {
    connection,
    defaultJobOptions: {
      ...defaultJobOptions,
      ...overrides,
    },
  });

  const events = new QueueEvents(name, {
    connection: connection.duplicate(),
  });

  await events.waitUntilReady();

  logger.info(`[${name}] Queue ready`);

  events.on('completed', ({ jobId }) => {
    logger.info(`[${name}] Job ${jobId} completed`);
  });

  events.on('failed', ({ jobId, failedReason }) => {
    logger.error(`[${name}] Job ${jobId} failed: ${failedReason}`);
  });

  events.on('stalled', ({ jobId }) => {
    logger.warn(`[${name}] Job ${jobId} stalled`);
  });

  return {
    queue,
    events,
  };
};

/**
 * ─────────────────────────────────────────────
 * 📦 INIT ALL QUEUES
 * ─────────────────────────────────────────────
 */
const initQueues = async () => {
  return {
    email: await createQueue('email', { attempts: 5 }),
    sms: await createQueue('sms'),
    push: await createQueue('push'),

    payment: await createQueue('payment', {
      attempts: 5,
      backoff: { type: 'exponential', delay: 3000 },
    }),

    notification: await createQueue('notification', { attempts: 4 }),
    report: await createQueue('report', { attempts: 2 }),
    reconciliation: await createQueue('reconciliation'),

    deadLetter: await createQueue('dead-letter', {
      attempts: 1,
      removeOnFail: false,
    }),
  };
};

/**
 * ─────────────────────────────────────────────
 * 🌊 FLOW PRODUCER (FIXED - NO DUPLICATION)
 * ─────────────────────────────────────────────
 */
const flowProducer = new FlowProducer({
  connection,
});

/**
 * ─────────────────────────────────────────────
 * ➕ ADD JOB
 * ─────────────────────────────────────────────
 */
const addJob = async (queues, queueName, jobName, data, opts = {}) => {
  const q = queues[queueName];

  if (!q) {
    throw new Error(`Queue "${queueName}" not found`);
  }

  return q.queue.add(jobName, data, opts);
};

/**
 * ─────────────────────────────────────────────
 * ☠️ DEAD LETTER QUEUE
 * ─────────────────────────────────────────────
 */
const sendToDeadLetter = async (queues, originalQueue, data, reason) => {
  return queues.deadLetter.queue.add('dlq_job', {
    original_queue: originalQueue,
    data,
    reason,
    failed_at: new Date().toISOString(),
  });
};

/**
 * ─────────────────────────────────────────────
 * 🛑 GRACEFUL SHUTDOWN
 * ─────────────────────────────────────────────
 */
const shutdown = async (queues) => {
  logger.info('🛑 Shutting down BullMQ...');

  const tasks = [];

  for (const key in queues) {
    const q = queues[key];

    tasks.push(q.queue.close());
    tasks.push(q.events.close());
  }

  tasks.push(connection.quit());
  tasks.push(flowProducer.close());

  await Promise.allSettled(tasks);

  logger.info('✅ BullMQ shutdown complete');
};

module.exports = {
  initQueues,
  addJob,
  sendToDeadLetter,
  flowProducer,
  shutdown,
};
// 'use strict';

// const { Queue, Worker, QueueEvents, FlowProducer } = require('bullmq');
// const IORedis = require('ioredis');
// const logger  = require('../utils/logger');

// /**
//  * BullMQ requires ioredis (not the standard redis client).
//  * maxRetriesPerRequest: null is REQUIRED by BullMQ.
//  * enableReadyCheck: false prevents startup timeout issues.
//  */
// const connection = new IORedis({
//   host:                 process.env.REDIS_HOST || '127.0.0.1',
//   port:                 parseInt(process.env.REDIS_PORT) || 6379,
//   password:             process.env.REDIS_PASSWORD || undefined,
//   maxRetriesPerRequest: null,
//   enableReadyCheck:     false,
// });

// connection.on('connect', ()    => logger.info('✅ BullMQ IORedis connected'));
// connection.on('error',   (err) => logger.error(`BullMQ IORedis error: ${err.message}`));

// /**
//  * Default job options applied to all queues.
//  * removeOnComplete: keep last 1000 completed jobs, delete after 24h.
//  * removeOnFail: keep last 5000 failed jobs for 7 days (for debugging).
//  */
// const defaultJobOptions = {
//   removeOnComplete: { count: 1000, age: 24 * 3600 },
//   removeOnFail:     { count: 5000, age: 7 * 24 * 3600 },
//   attempts:         3,
//   backoff:          { type: 'exponential', delay: 2000 },
// };

// /**
//  * Factory to create a named BullMQ queue with event listeners.
//  */
// const createQueue = (name, overrides = {}) => {
//   const queue  = new Queue(name, {
//     connection,
//     defaultJobOptions: { ...defaultJobOptions, ...overrides },
//   });

//   const events = new QueueEvents(name, { connection });
//   events.on('completed', ({ jobId })              => logger.info(`[${name}] ✅ Job ${jobId} completed`));
//   events.on('failed',    ({ jobId, failedReason }) => logger.error(`[${name}] ❌ Job ${jobId}: ${failedReason}`));
//   events.on('stalled',   ({ jobId })              => logger.warn(`[${name}]  ⚠️  Job ${jobId} stalled`));

//   return queue;
// };

// // ── All application queues ────────────────────────────────────────
// const queues = {
//   email:          createQueue('email',          { attempts: 5 }),
//   sms:            createQueue('sms',            { attempts: 3 }),
//   push:           createQueue('push',           { attempts: 3 }),
//   payment:        createQueue('payment',        { attempts: 5, backoff: { type: 'exponential', delay: 3000 } }),
//   notification:   createQueue('notification',   { attempts: 4 }),
//   report:         createQueue('report',         { attempts: 2 }),
//   reconciliation: createQueue('reconciliation', { attempts: 3 }),
//   deadLetter:     createQueue('dead-letter',    { attempts: 1, removeOnFail: false }),
// };

// const flowProducer = new FlowProducer({ connection });

// /**
//  * Add a job to a named queue.
//  * @param {string} queueName - Name of the queue
//  * @param {string} jobName   - Job type identifier
//  * @param {object} data      - Job payload
//  * @param {object} opts      - Optional BullMQ job options
//  */
// const addJob = async (queueName, jobName, data, opts = {}) => {
//   const queue = queues[queueName];
//   if (!queue) throw new Error(`Queue "${queueName}" does not exist`);
//   return queue.add(jobName, data, opts);
// };

// /**
//  * Send an exhausted (all retries failed) job to the dead-letter queue.
//  * Dead-letter jobs are kept forever for manual review.
//  */
// const sendToDeadLetter = async (originalQueue, data, reason) => {
//   return queues.deadLetter.add('dlq_job', {
//     original_queue: originalQueue,
//     data,
//     reason,
//     failed_at: new Date().toISOString(),
//   });
// };

// module.exports = { queues, connection, addJob, sendToDeadLetter, flowProducer };