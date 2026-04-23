'use strict';

const admin  = require('firebase-admin');
const logger = require('../utils/logger');

let firebaseApp;

/**
 * Initialize Firebase Admin SDK.
 * Used for sending push notifications via FCM.
 * Called once at startup. Safe to call multiple times.
 */
const initFirebase = () => {
  if (firebaseApp) return firebaseApp;

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });

  logger.info('✅ Firebase initialized');
  return firebaseApp;
};

module.exports = { initFirebase, admin };