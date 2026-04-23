'use strict';

const { createClient } = require('redis');
const logger = require('../utils/logger');

let redisClient;

const connectRedis = async () => {
  if (!process.env.REDIS_URL) {
    logger.warn('⚠️ REDIS_URL not set — Redis disabled');
    return null;
  }

  redisClient = createClient({
    url: process.env.REDIS_URL,
    password: process.env.REDIS_PASSWORD || undefined,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          logger.error('Redis: max reconnect attempts reached');
          return new Error('Too many Redis retries');
        }
        return Math.min(retries * 100, 3000);
      },
    },
  });

  redisClient.on('connect', () =>
    logger.info('✅ Redis connected')
  );

  redisClient.on('error', (err) =>
    logger.error(`Redis error: ${err.message}`)
  );

  redisClient.on('reconnecting', () =>
    logger.warn('Redis reconnecting...')
  );

  try {
    await redisClient.connect();
    return redisClient;
  } catch (err) {
    logger.error(`❌ Redis connection failed: ${err.message}`);
    return null;
  }
};

const getRedisClient = () => {
  if (!redisClient) {
    throw new Error('Redis not initialized. Call connectRedis() first.');
  }
  return redisClient;
};

module.exports = { connectRedis, getRedisClient };

// 'use strict';

// const { createClient } = require('redis');
// const logger           = require('../utils/logger');

// let redisClient;

// /**
//  * Connect to Redis using the standard redis client.
//  * This client is used for: caching, rate limiting, token blacklisting, idempotency.
//  * BullMQ uses a separate ioredis connection (see bullmq.js).
//  */
// const connectRedis = async () => {
//   redisClient = createClient({
//     url:      process.env.REDIS_URL || 'redis://127.0.0.1:6379',
//     password: process.env.REDIS_PASSWORD || undefined,
//     socket: {
//       reconnectStrategy: (retries) => {
//         if (retries > 10) {
//           logger.error('Redis: max reconnect attempts reached');
//           return new Error('Too many Redis retries');
//         }
//         return Math.min(retries * 100, 3000);
//       },
//     },
//   });

//   redisClient.on('connect',      ()    => logger.info('✅ Redis connected'));
//   redisClient.on('error',        (err) => logger.error(`Redis error: ${err.message}`));
//   redisClient.on('reconnecting', ()    => logger.warn('Redis reconnecting...'));

//   await redisClient.connect();
//   return redisClient;
// };

// /**
//  * Returns the active Redis client.
//  * Throws if connectRedis() has not been called yet.
//  */
// const getRedisClient = () => {
//   if (!redisClient) throw new Error('Redis not initialized. Call connectRedis() first.');
//   return redisClient;
// };

// module.exports = { connectRedis, getRedisClient };