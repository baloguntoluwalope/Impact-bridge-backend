'use strict';

const jwt      = require('jsonwebtoken');
const User     = require('../modules/users/user.model');
const ApiError = require('../utils/apiError');
const { getRedisClient } = require('../config/redis');

/**
 * Authenticate — verifies JWT, checks blacklist, validates user status.
 * Attaches req.user and req.token on success.
 */
const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw ApiError.unauthorized('No token provided');

    const token = header.split(' ')[1];

    // Check if token was blacklisted (logout / security revoke)
    const redis       = getRedisClient();
    const blacklisted = await redis.get(`blacklist:${token}`);
    if (blacklisted)  throw ApiError.unauthorized('Token has been invalidated');

    // Verify and decode
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Load user (exclude sensitive fields)
    const user = await User.findById(decoded.id)
      .select('-password -otp -otp_type -otp_expires')
      .lean();

    if (!user)           throw ApiError.unauthorized('User not found');
    if (!user.is_active) throw ApiError.unauthorized('Account has been deactivated');
    if (user.is_suspended) {
      throw ApiError.forbidden(`Account suspended: ${user.suspension_reason || 'Contact support'}`);
    }

    req.user  = user;
    req.token = token;
    next();

  } catch (err) {
    if (err.name === 'JsonWebTokenError') return next(ApiError.unauthorized('Invalid token'));
    if (err.name === 'TokenExpiredError') return next(ApiError.unauthorized('Token expired. Please login again'));
    next(err);
  }
};

/**
 * Authorize — RBAC role check.
 * Must be used AFTER authenticate.
 * Usage: authorize('super_admin', 'ngo_partner')
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized('Not authenticated'));
  if (!roles.includes(req.user.role)) {
    return next(ApiError.forbidden(`Role '${req.user.role}' cannot perform this action`));
  }
  next();
};

/**
 * Optional auth — attaches req.user if token is valid, but does not block if no token.
 * Used on public routes that show extra data for logged-in users.
 */
const optionalAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      const token   = header.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user    = await User.findById(decoded.id).select('-password').lean();
      if (user?.is_active && !user.is_suspended) req.user = user;
    }
  } catch {
    // Silently ignore errors — user remains unauthenticated
  }
  next();
};

module.exports = { authenticate, authorize, optionalAuth };