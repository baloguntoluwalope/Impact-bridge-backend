'use strict';

const crypto = require('crypto');

/** Generate a numeric OTP of specified length */
const generateOTP = (length = 6) =>
  Math.floor(Math.random() * Math.pow(10, length)).toString().padStart(length, '0');

/** Generate a unique payment/wallet reference with prefix */
const generateReference = (prefix = 'IB') => {
  const ts  = Date.now().toString(36).toUpperCase();
  const rnd = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${ts}-${rnd}`;
};

/** Parse and validate pagination params */
const paginate = (page = 1, limit = 20) => {
  const p = Math.max(parseInt(page)  || 1,  1);
  const l = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
  return { page: p, limit: l, skip: (p - 1) * l };
};

/** Build pagination meta object for responses */
const paginationMeta = (total, page, limit) => ({
  total,
  page,
  limit,
  pages:   Math.ceil(total / limit),
  hasNext: page < Math.ceil(total / limit),
  hasPrev: page > 1,
});

/** Normalize Nigerian phone to 234XXXXXXXXXX format */
const sanitizePhone = (phone) => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0'))   return `234${cleaned.slice(1)}`;
  if (cleaned.startsWith('234')) return cleaned;
  return `234${cleaned}`;
};

/** SHA-256 hash a string */
const hashData = (data) =>
  crypto.createHash('sha256').update(String(data)).digest('hex');

/** Timing-safe string comparison to prevent timing attacks */
const timingSafeEqual = (a, b) => {
  try {
    return crypto.timingSafeEqual(
      Buffer.from(String(a)),
      Buffer.from(String(b))
    );
  } catch {
    return false;
  }
};

/** Format amount as Nigerian Naira */
const formatNaira = (amount) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);

/** Convert string to URL-friendly slug */
const slugify = (text) =>
  String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

module.exports = {
  generateOTP,
  generateReference,
  paginate,
  paginationMeta,
  sanitizePhone,
  hashData,
  timingSafeEqual,
  formatNaira,
  slugify,
};