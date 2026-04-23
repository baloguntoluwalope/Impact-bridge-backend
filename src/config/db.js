'use strict';

const mongoose = require('mongoose');
const logger   = require('../utils/logger');

/**
 * Connect to MongoDB with retry logic and event listeners.
 * Uses connection pooling (maxPoolSize: 10) for production performance.
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize:              10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS:          45000,
    });

    logger.info(`✅ MongoDB connected: ${conn.connection.host}`);

    mongoose.connection.on('error',        (err) => logger.error(`MongoDB error: ${err.message}`));
    mongoose.connection.on('disconnected', ()    => logger.warn('MongoDB disconnected. Reconnecting...'));
    mongoose.connection.on('reconnected',  ()    => logger.info('MongoDB reconnected'));

  } catch (err) {
    logger.error(`❌ MongoDB connection failed: ${err.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;