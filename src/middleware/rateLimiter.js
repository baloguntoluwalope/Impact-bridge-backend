'use strict';

const rateLimit  = require('express-rate-limit');
const RedisStore = require('rate-limit-redis').default;
const { getRedisClient } = require('../config/redis');
const ApiResponse = require('../utils/apiResponse');

/**
 * Factory to create configured rate limiters with Redis backing.
 * Falls back to in-memory store if Redis is unavailable.
 */
const makeLimiter = (windowMs, max, keyPrefix) => {
  const config = {
    windowMs,
    limit: max, 
    standardHeaders: 'draft-7',
    legacyHeaders:   false,
    // Prevents the ERR_ERL_KEY_GEN_IPV6 warning/crash
    validate: { xForwardedForHeader: false }, 
    skip:            () => process.env.NODE_ENV === 'test',
    handler:         (req, res) => ApiResponse.error(res, 'Too many requests. Please slow down and try again.', 429),
  };

  try {
    const client = getRedisClient();
    
    // Fix: Node-Redis expects an array passed to sendCommand
    config.store = new RedisStore({
      sendCommand: async (...args) => client.sendCommand(args),
      prefix:      `rl:${keyPrefix}:`,
    });
  } catch (error) {
    // Redis unavailable — fallback to memory store is handled automatically
    // when config.store is undefined.
  }

  return rateLimit(config);
};

module.exports = {
  globalLimiter:  makeLimiter(15 * 60 * 1000, 200,  'global'),
  authLimiter:    makeLimiter(15 * 60 * 1000, 10,   'auth'),
  otpLimiter:     makeLimiter(60 * 60 * 1000, 5,    'otp'),
  paymentLimiter: makeLimiter(60 * 60 * 1000, 20,   'payment'),
  uploadLimiter:  makeLimiter(60 * 60 * 1000, 30,   'upload'),
  apiLimiter:     makeLimiter(60 * 1000,       60,   'api'),
};

// 'use strict';

// const rateLimit  = require('express-rate-limit');
// const RedisStore = require('rate-limit-redis').default;
// const { getRedisClient } = require('../config/redis');
// const ApiResponse = require('../utils/apiResponse');

// /**
//  * Factory to create configured rate limiters with Redis backing.
//  * Falls back to in-memory store if Redis is unavailable.
//  *
//  * @param {number} windowMs   - Time window in milliseconds
//  * @param {number} max        - Max requests allowed in window
//  * @param {string} keyPrefix  - Redis key prefix for this limiter
//  */
// const makeLimiter = (windowMs, max, keyPrefix) => {
//   const config = {
//     windowMs,
//     max,
//     standardHeaders: true,
//     legacyHeaders:   false,
//     skip:            () => process.env.NODE_ENV === 'test',
//     keyGenerator:    (req) => `${req.ip}`,
//     handler:         (req, res) => ApiResponse.error(res, 'Too many requests. Please slow down and try again.', 429),
//   };

//   try {
//     const client  = getRedisClient();
//     config.store  = new RedisStore({
//       sendCommand: (...args) => client.sendCommand(args),
//       prefix:      `rl:${keyPrefix}:`,
//     });
//   } catch {
//     // Redis unavailable — use memory store (acceptable for development)
//   }

//   return rateLimit(config);
// };

// module.exports = {
//   /** Global API limiter — applied to all /api routes */
//   globalLimiter:  makeLimiter(15 * 60 * 1000, 200,  'global'),
//   /** Auth endpoints — strict to prevent brute force */
//   authLimiter:    makeLimiter(15 * 60 * 1000, 10,   'auth'),
//   /** OTP requests — prevent OTP flooding */
//   otpLimiter:     makeLimiter(60 * 60 * 1000, 5,    'otp'),
//   /** Payment initiation — prevent payment spam */
//   paymentLimiter: makeLimiter(60 * 60 * 1000, 20,   'payment'),
//   /** File uploads */
//   uploadLimiter:  makeLimiter(60 * 60 * 1000, 30,   'upload'),
//   /** General API calls */
//   apiLimiter:     makeLimiter(60 * 1000,       60,   'api'),
// };