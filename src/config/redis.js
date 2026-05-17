'use strict';

const { createClient } = require('redis');
const logger           = require('../utils/logger');

let redisClient   = null;
let isConnected   = false;
let isDisabled    = false;

/**
 * Connect to Redis (node-redis client).
 * Used for: caching, rate limiting, token blacklisting, idempotency keys.
 * BullMQ uses a SEPARATE ioredis connection — see config/bullmq.js.
 *
 * Graceful degradation: if Redis is unavailable the app still starts;
 * callers should check isCacheAvailable() before using the client.
 */
const connectRedis = async () => {
  if (!process.env.REDIS_URL) {
    logger.warn('⚠️  REDIS_URL not set — Redis disabled. Caching and rate-limiting will be skipped.');
    isDisabled = true;
    return null;
  }

  redisClient = createClient({
    url:      process.env.REDIS_URL,
    password: process.env.REDIS_PASSWORD || undefined,
    socket: {
      connectTimeout: 10_000,
      // Exponential backoff capped at 3 s, stops after 10 retries
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          logger.error('🔴 Redis: max reconnect attempts reached — giving up');
          isConnected = false;
          // Return false to stop reconnecting (prevents infinite connection churn)
          return false;
        }
        const delay = Math.min(retries * 200, 3_000);
        logger.warn(`🔄 Redis reconnecting (attempt ${retries}) in ${delay}ms…`);
        return delay;
      },
    },
  });

  redisClient.on('connect',      ()    => { isConnected = true;  logger.info('✅ Redis connected'); });
  redisClient.on('ready',        ()    => { isConnected = true;  logger.info('✅ Redis ready'); });
  redisClient.on('error',        (err) => { isConnected = false; logger.error(`🔴 Redis error: ${err.message}`); });
  redisClient.on('reconnecting', ()    => { isConnected = false; logger.warn('🔄 Redis reconnecting…'); });
  redisClient.on('end',          ()    => { isConnected = false; logger.warn('🔴 Redis connection closed'); });

  try {
    await redisClient.connect();
    isConnected = true;
    return redisClient;
  } catch (err) {
    isConnected = false;
    // Log but DO NOT throw — app continues without Redis
    logger.error(`❌ Redis connection failed: ${err.message}`);
    logger.warn('⚠️  App will continue without Redis. Caching and rate-limiting are disabled.');
    return null;
  }
};

/**
 * Returns the active Redis client.
 * Returns null (instead of throwing) when Redis is unavailable so callers
 * can degrade gracefully without a try/catch at every call site.
 */
const getRedisClient = () => {
  if (isDisabled || !redisClient || !isConnected) return null;
  return redisClient;
};

/**
 * Convenience check for features that depend on Redis.
 * Use this before calling getRedisClient() when you want to skip
 * the operation silently rather than handle a null client.
 */
const isCacheAvailable = () => !isDisabled && isConnected && !!redisClient;

/**
 * Safe wrapper around Redis operations.
 * Returns fallbackValue if Redis is down instead of throwing.
 *
 * @example
 * const cached = await safeRedis(r => r.get('my:key'), null);
 */
const safeRedis = async (fn, fallbackValue = null) => {
  const client = getRedisClient();
  if (!client) return fallbackValue;
  try {
    return await fn(client);
  } catch (err) {
    logger.error(`Redis operation failed: ${err.message}`);
    return fallbackValue;
  }
};

module.exports = { connectRedis, getRedisClient, isCacheAvailable, safeRedis };



// // 'use strict';

// // const { createClient } = require('redis');
// // const logger = require('../utils/logger');

// // let redisClient;

// // const connectRedis = async () => {
// //   if (!process.env.REDIS_URL) {
// //     logger.warn('⚠️ REDIS_URL not set — Redis disabled');
// //     return null;
// //   }

// //   redisClient = createClient({
// //     url: process.env.REDIS_URL,
// //     password: process.env.REDIS_PASSWORD || undefined,
// //     socket: {
// //       reconnectStrategy: (retries) => {
// //         if (retries > 10) {
// //           logger.error('Redis: max reconnect attempts reached');
// //           return new Error('Too many Redis retries');
// //         }
// //         return Math.min(retries * 100, 3000);
// //       },
// //     },
// //   });

// //   redisClient.on('connect', () =>
// //     logger.info('✅ Redis connected')
// //   );

// //   redisClient.on('error', (err) =>
// //     logger.error(`Redis error: ${err.message}`)
// //   );

// //   redisClient.on('reconnecting', () =>
// //     logger.warn('Redis reconnecting...')
// //   );

// //   try {
// //     await redisClient.connect();
// //     return redisClient;
// //   } catch (err) {
// //     logger.error(`❌ Redis connection failed: ${err.message}`);
// //     return null;
// //   }
// // };

// // const getRedisClient = () => {
// //   if (!redisClient) {
// //     throw new Error('Redis not initialized. Call connectRedis() first.');
// //   }
// //   return redisClient;
// // };

// // module.exports = { connectRedis, getRedisClient };

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