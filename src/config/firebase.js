'use strict';

const admin = require('firebase-admin');
const logger = require('../utils/logger');

let firebaseApp;

/**
 * Initialize Firebase Admin SDK.
 * Safe to call multiple times (singleton pattern).
 */
const initFirebase = () => {
  if (firebaseApp) return firebaseApp;

  const {
    FIREBASE_PROJECT_ID,
    FIREBASE_PRIVATE_KEY,
    FIREBASE_CLIENT_EMAIL,
  } = process.env;

  // Validate required env variables early
  if (!FIREBASE_PROJECT_ID || !FIREBASE_PRIVATE_KEY || !FIREBASE_CLIENT_EMAIL) {
    throw new Error('Missing Firebase environment variables');
  }

  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });

    logger.info('Firebase initialized successfully');

    return firebaseApp;
  } catch (error) {
    logger.error('Firebase initialization failed:', error.message);
    throw error;
  }
};

module.exports = {
  initFirebase,
  admin,
};
// 'use strict';

// const admin  = require('firebase-admin');
// const logger = require('../utils/logger');

// let firebaseApp;

// /**
//  * Initialize Firebase Admin SDK.
//  * Used for sending push notifications via FCM.
//  * Called once at startup. Safe to call multiple times.
//  */
// const initFirebase = () => {
//   if (firebaseApp) return firebaseApp;

//   firebaseApp = admin.initializeApp({
//     credential: admin.credential.cert({
//       projectId:   process.env.FIREBASE_PROJECT_ID,
//       privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
//       clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
//     }),
//   });

//   logger.info('✅ Firebase initialized');
//   return firebaseApp;
// };

// module.exports = { initFirebase, admin };