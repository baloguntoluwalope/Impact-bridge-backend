'use strict';

const logger   = require('../utils/logger');
const ApiError = require('../utils/apiError');

/**
 * Global Express error handler.
 * Must be the LAST middleware registered in app.js.
 * Converts Mongoose/JWT errors to ApiError equivalents.
 */
const errorHandler = (err, req, res, next) => {
  let error = err;

  // Mongoose: invalid ObjectId
  if (err.name === 'CastError') {
    error = ApiError.badRequest(`Invalid ${err.path}: "${err.value}"`);
  }

  // Mongoose: validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => ({
      field:   e.path,
      message: e.message,
    }));
    error = new ApiError('Validation failed', 400, errors);
  }

  // MongoDB: duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    error = ApiError.conflict(`${field} already exists`);
  }

  // JWT
  if (err.name === 'JsonWebTokenError') error = ApiError.unauthorized('Invalid token');
  if (err.name === 'TokenExpiredError') error = ApiError.unauthorized('Token expired');

  // Multer file size
  if (err.code === 'LIMIT_FILE_SIZE') error = ApiError.badRequest('File too large');

  const statusCode = error.statusCode || 500;
  const message    = error.message    || 'Internal Server Error';

  // Log 5xx as errors, 4xx as warnings
  if (statusCode >= 500) {
    logger.error(`[${req.method}] ${req.path} → ${statusCode} | ${err.stack}`);
  } else {
    logger.warn(`[${req.method}] ${req.path} → ${statusCode} | ${message}`);
  }

  const body = { success: false, message };
  if (error.errors)                          body.errors = error.errors;
  if (process.env.NODE_ENV === 'development') body.stack = err.stack;

  res.status(statusCode).json(body);
};

/**
 * 404 handler — registered just before errorHandler.
 */
const notFound = (req, res, next) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

module.exports = { errorHandler, notFound };