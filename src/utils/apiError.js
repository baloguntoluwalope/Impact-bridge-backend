'use strict';

/**
 * Custom operational error class.
 * isOperational = true means this is a known, handled error (not a bug).
 * The global error handler uses this flag to decide how to log.
 */
class ApiError extends Error {
  constructor(message, statusCode = 500, errors = null) {
    super(message);
    this.statusCode    = statusCode;
    this.errors        = errors;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, errors = null) { return new ApiError(message, 400, errors); }
  static unauthorized(message = 'Unauthorized') { return new ApiError(message, 401); }
  static forbidden(message = 'Forbidden')       { return new ApiError(message, 403); }
  static notFound(message = 'Not found')        { return new ApiError(message, 404); }
  static conflict(message = 'Conflict')         { return new ApiError(message, 409); }
  static internal(message = 'Internal error')   { return new ApiError(message, 500); }
}

module.exports = ApiError;