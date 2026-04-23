'use strict';

const AuditLog = require('../modules/admin/auditLog.model');
const logger   = require('../utils/logger');

/**
 * Audit log middleware.
 * Intercepts the response and logs the action to the database after success.
 * Only logs for authenticated users (req.user must exist).
 * Strips sensitive fields (password, otp, token) from the logged request body.
 *
 * @param {string} action   - Action label e.g. 'CREATE', 'APPROVE', 'REJECT'
 * @param {string} resource - Resource label e.g. 'Request', 'Payment', 'User'
 */
const auditLog = (action, resource) => async (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = async (body) => {
    // Only log successful mutations for authenticated users
    if (res.statusCode < 400 && req.user) {
      try {
        const { password, otp, token, otp_expires, ...safeBody } = req.body || {};
        await AuditLog.create({
          user:            req.user._id,
          user_role:       req.user.role,
          action,
          resource,
          resource_id:     req.params.id || body?.data?._id,
          ip_address:      req.ip,
          user_agent:      req.get('User-Agent'),
          request_body:    safeBody,
          response_status: res.statusCode,
          timestamp:       new Date(),
        });
      } catch (err) {
        // Never let audit logging block the response
        logger.error(`Audit log error: ${err.message}`);
      }
    }
    return originalJson(body);
  };

  next();
};

module.exports = auditLog;