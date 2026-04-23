'use strict';

const cloudinary = require('../../config/cloudinary');
const ApiError   = require('../../utils/apiError');
const logger     = require('../../utils/logger');

/**
 * Upload a single file buffer to Cloudinary.
 * Images are resized to max 1200px width.
 * Returns { url, public_id, type }.
 */
const uploadSingle = (file, folder = 'impact-bridge') =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto',
        quality:       'auto',
        fetch_format:  'auto',
        transformation: file.mimetype?.startsWith('image')
          ? [{ width: 1200, crop: 'limit' }]
          : undefined,
      },
      (err, result) => {
        if (err) {
          logger.error(`Cloudinary upload error: ${err.message}`);
          reject(ApiError.internal('File upload failed'));
        } else {
          const type =
            result.resource_type === 'image' ? 'image' :
            result.resource_type === 'video' ? 'video' : 'document';

          resolve({ url: result.secure_url, public_id: result.public_id, type });
        }
      }
    );
    stream.end(file.buffer);
  });

/**
 * Upload multiple files concurrently.
 * Returns only successful uploads (ignores failed ones).
 */
const uploadMultiple = async (files, folder) => {
  const results = await Promise.allSettled(
    files.map((f) => uploadSingle(f, folder))
  );
  return results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value);
};

/**
 * Delete a file from Cloudinary by public_id.
 */
const deleteFile = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId);
    return true;
  } catch (err) {
    logger.error(`Cloudinary delete error: ${err.message}`);
    return false;
  }
};

module.exports = { uploadSingle, uploadMultiple, deleteFile };