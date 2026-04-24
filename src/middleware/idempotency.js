'use strict';

const { getRedisClient } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Idempotency middleware
 * Prevents duplicate POST/PUT/PATCH requests using Redis caching.
 */
const idempotency = (ttlSeconds = 86400) => async (req, res, next) => {
  try {
    // Only mutating methods
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
      return next();
    }

    const idempKey = req.headers['x-idempotency-key'];

    // No key → skip protection
    if (!idempKey) return next();

    // Validate key
    if (typeof idempKey !== 'string' || idempKey.length < 8 || idempKey.length > 128) {
      return res.status(400).json({
        success: false,
        message: 'Invalid X-Idempotency-Key',
      });
    }

    const redis = getRedisClient();
    if (!redis) return next(); // Redis not ready → fail open

    const scopeId = req.user?._id?.toString() || req.ip;
    const cacheKey = `idempotency:${scopeId}:${idempKey}`;

    const existing = await redis.get(cacheKey);

    if (existing) {
      const cached = JSON.parse(existing);

      logger.info(`♻️ Idempotency cache hit: ${cacheKey}`);

      return res.status(cached.status).json(cached.body);
    }

    // Capture response
    const originalJson = res.json.bind(res);

    res.json = async (body) => {
      try {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          await redis.setEx(
            cacheKey,
            ttlSeconds,
            JSON.stringify({
              status: res.statusCode,
              body,
            })
          );
        }
      } catch (err) {
        logger.error(`Idempotency cache write failed: ${err.message}`);
      }

      return originalJson(body);
    };

    next();
  } catch (err) {
    logger.error(`Idempotency middleware error: ${err.message}`);
    next(); // fail open
  }
};

module.exports = idempotency;


// 'use strict';

// const { getRedisClient } = require('../config/redis');
// const logger = require('../utils/logger');

// /**
//  * Idempotency middleware.
//  * Client sends: X-Idempotency-Key: <uuid> header.
//  *
//  * On first request: processes normally, caches the response in Redis for ttlSeconds.
//  * On subsequent requests with same key: returns the cached response immediately.
//  *
//  * This prevents duplicate payments and duplicate submissions.
//  * Only applies to POST, PUT, PATCH methods.
//  *
//  * @param {number} ttlSeconds - How long to cache the response (default: 86400 = 24h)
//  */
// const idempotency = (ttlSeconds = 86400) => async (req, res, next) => {
//   // Only apply to mutating methods
//   if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();

//   const idempKey = req.headers['x-idempotency-key'];

//   // If no key provided, continue without idempotency protection
//   if (!idempKey) return next();

//   // Validate key format
//   if (idempKey.length < 8 || idempKey.length > 128) {
//     return res.status(400).json({
//       success: false,
//       message: 'X-Idempotency-Key must be between 8 and 128 characters',
//     });
//   }

//   // Scope by user ID (or IP for unauthenticated) + key
//   const scopeId  = req.user?._id?.toString() || req.ip;
//   const cacheKey = `idempotency:${scopeId}:${idempKey}`;

//   try {
//     const redis    = getRedisClient();
//     const existing = await redis.get(cacheKey);

//     if (existing) {
//       // Return cached response
//       const cached = JSON.parse(existing);
//       logger.info(`Idempotency hit: ${cacheKey}`);
//       return res.status(cached.status).json(cached.body);
//     }

//     // Intercept response to cache it
//     const originalJson = res.json.bind(res);
//     res.json = async (body) => {
//       if (res.statusCode < 400) {
//         await redis.setEx(cacheKey, ttlSeconds, JSON.stringify({
//           status: res.statusCode,
//           body,
//         }));
//       }
//       return originalJson(body);
//     };

//   } catch (err) {
//     // Fail open — don't block the request if Redis is down
//     logger.error(`Idempotency middleware error: ${err.message}`);
//   }

//   next();
// };

// module.exports = idempotency;