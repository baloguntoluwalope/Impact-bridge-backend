'use strict';

const multer   = require('multer');
const ApiError = require('../utils/apiError');

// Accepted MIME types per category
const MIME = {
  image:    ['image/jpeg','image/png','image/webp'],
  video:    ['video/mp4','video/quicktime','video/avi','video/webm'],
  audio:    ['audio/mpeg','audio/wav','audio/ogg','audio/mp4'],
  document: ['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
};

const ALL = [...MIME.image, ...MIME.video, ...MIME.audio, ...MIME.document];

// All files stored in memory buffer (uploaded to Cloudinary)
const memStore = multer.memoryStorage();

const fileFilter = (allowed) => (req, file, cb) => {
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(ApiError.badRequest(`File type not allowed: ${file.mimetype}. Allowed: ${allowed.join(', ')}`), false);
  }
};

module.exports = {
  imageUpload:    multer({ storage: memStore, limits: { fileSize: 5  * 1024 * 1024, files: 5  }, fileFilter: fileFilter(MIME.image) }),
  videoUpload:    multer({ storage: memStore, limits: { fileSize: 50 * 1024 * 1024, files: 2  }, fileFilter: fileFilter(MIME.video) }),
  audioUpload:    multer({ storage: memStore, limits: { fileSize: 10 * 1024 * 1024, files: 3  }, fileFilter: fileFilter(MIME.audio) }),
  documentUpload: multer({ storage: memStore, limits: { fileSize: 10 * 1024 * 1024, files: 5  }, fileFilter: fileFilter([...MIME.image, ...MIME.document]) }),
  mediaUpload:    multer({ storage: memStore, limits: { fileSize: 50 * 1024 * 1024, files: 10 }, fileFilter: fileFilter(ALL) }),
};