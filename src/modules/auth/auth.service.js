'use strict';

const crypto = require('crypto');
const jwt    = require('jsonwebtoken');
const User   = require('../users/user.model');
const { getRedisClient } = require('../../config/redis');
const { addJob }  = require('../../config/bullmq');
const { generateOTP, hashData } = require('../../utils/helpers');
const ApiError = require('../../utils/apiError');
const logger   = require('../../utils/logger');

const makeTokens = (userId, role) => ({
  accessToken:  jwt.sign({ id: userId, role }, process.env.JWT_SECRET,         { expiresIn: process.env.JWT_EXPIRES_IN         || '7d'  }),
  refreshToken: jwt.sign({ id: userId },       process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }),
});

const register = async (data) => {
  const exists = await User.findOne({ $or: [{ email: data.email }, { phone: data.phone }] });
  if (exists) {
    throw ApiError.conflict(exists.email === data.email ? 'Email already registered' : 'Phone number already registered');
  }

  const user    = await User.create(data);
  const otp     = generateOTP(6);
  const expiry  = new Date(Date.now() + parseInt(process.env.OTP_EXPIRY_MINUTES || 10) * 60000);

  await User.findByIdAndUpdate(user._id, {
    otp:         hashData(otp),
    otp_type:    'email_verification',
    otp_expires: expiry,
  });

  await addJob('email', 'send_otp', {
    to:       user.email,
    subject:  'Verify Your Email – Impact Bridge',
    template: 'otp_verification',
    data:     { name: user.first_name, otp, expiry: process.env.OTP_EXPIRY_MINUTES || 10 },
  });

  logger.info(`User registered: ${user.email} [${user.role}]`);
  return { user: { _id: user._id, email: user.email, role: user.role, full_name: `${user.first_name} ${user.last_name}` } };
};

const login = async ({ email, password }) => {
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (!user.is_active)         throw ApiError.unauthorized('Account deactivated. Contact support.');
  if (user.is_suspended)       throw ApiError.forbidden(`Account suspended: ${user.suspension_reason}`);
  if (!user.is_email_verified) throw ApiError.unauthorized('Please verify your email before logging in');

  const tokens = makeTokens(user._id, user.role);
  const redis  = getRedisClient();
  await redis.setEx(`refresh:${user._id}`, 30 * 24 * 3600, tokens.refreshToken);
  await User.findByIdAndUpdate(user._id, { last_login: new Date(), $inc: { login_count: 1 } });

  return {
    ...tokens,
    user: {
      _id:               user._id,
      email:             user.email,
      full_name:         `${user.first_name} ${user.last_name}`,
      role:              user.role,
      avatar:            user.avatar,
      is_email_verified: user.is_email_verified,
    },
  };
};

const verifyOTP = async ({ email, otp, type = 'email_verification' }) => {
const user = await User.findOne({ email }).select('+otp +otp_type +otp_expires');

// Add this log:
console.log('DEBUG OTP:', {
  providedType: type,
  storedType: user?.otp_type,
  providedOtp: otp,
  hashedProvidedOtp: hashData(otp),
  storedOtp: user?.otp
});

if (!user) throw ApiError.notFound('User not found');
if (user.otp_type !== type) throw ApiError.badRequest('Invalid OTP type');
  if (!user.otp || !user.otp_expires || user.otp_expires < new Date()) {
    throw ApiError.badRequest('OTP has expired. Please request a new one');
  }
  if (user.otp !== hashData(otp)) throw ApiError.badRequest('Invalid OTP code');

  const update = { otp: null, otp_type: null, otp_expires: null };
  if (type === 'email_verification') update.is_email_verified = true;
  if (type === 'phone_verification') update.is_phone_verified  = true;
  await User.findByIdAndUpdate(user._id, update);

  return { message: 'Verification successful' };
};

const resendOTP = async (email, type = 'email_verification') => {
  const user = await User.findOne({ email });
  if (!user) throw ApiError.notFound('User not found');

  const otp    = generateOTP(6);
  const expiry = new Date(Date.now() + parseInt(process.env.OTP_EXPIRY_MINUTES || 10) * 60000);
  await User.findByIdAndUpdate(user._id, { otp: hashData(otp), otp_type: type, otp_expires: expiry });

  await addJob('email', 'resend_otp', {
    to:       user.email,
    subject:  'New Verification Code – Impact Bridge',
    template: 'otp_verification',
    data:     { name: user.first_name, otp, expiry: process.env.OTP_EXPIRY_MINUTES || 10 },
  });

  return { message: 'OTP sent successfully' };
};

const forgotPassword = async (email) => {
  const user = await User.findOne({ email });
  // Always return the same message to prevent email enumeration
  if (!user) return { message: 'If this email exists, a reset link has been sent' };

  const token       = crypto.randomBytes(32).toString('hex');
  const hashedToken = hashData(token);
  const redis       = getRedisClient();
  await redis.setEx(`pwd_reset:${hashedToken}`, 3600, user._id.toString());

  await addJob('email', 'password_reset', {
    to:       user.email,
    subject:  'Password Reset – Impact Bridge',
    template: 'password_reset',
    data:     { name: user.first_name, resetUrl: `${process.env.APP_URL}/reset-password?token=${token}`, expiry: 60 },
  });

  return { message: 'If this email exists, a reset link has been sent' };
};

const resetPassword = async ({ token, password }) => {
  const hashedToken = hashData(token);
  const redis       = getRedisClient();
  const userId      = await redis.get(`pwd_reset:${hashedToken}`);
  if (!userId) throw ApiError.badRequest('Invalid or expired reset token');

  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');

  user.password = password;
  await user.save();
  await redis.del(`pwd_reset:${hashedToken}`);

  await addJob('email', 'password_changed', {
    to:       user.email,
    subject:  'Password Changed – Impact Bridge',
    template: 'password_changed',
    data:     { name: user.first_name },
  });

  return { message: 'Password reset successful. You can now login.' };
};

const logout = async (token, userId) => {
  const decoded = jwt.decode(token);
  const ttl     = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 7 * 86400;
  const redis   = getRedisClient();
  if (ttl > 0) await redis.setEx(`blacklist:${token}`, ttl, '1');
  await redis.del(`refresh:${userId}`);
  return { message: 'Logged out successfully' };
};

const refreshTokens = async (refreshToken) => {
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const redis   = getRedisClient();
  const stored  = await redis.get(`refresh:${decoded.id}`);
  if (!stored || stored !== refreshToken) {
    throw ApiError.unauthorized('Refresh token reuse detected. Please login again.');
  }

  const user = await User.findById(decoded.id);
  if (!user?.is_active) throw ApiError.unauthorized('User not found or deactivated');

  const tokens = makeTokens(user._id, user.role);
  await redis.setEx(`refresh:${user._id}`, 30 * 86400, tokens.refreshToken);
  return tokens;
};

module.exports = { register, login, verifyOTP, resendOTP, forgotPassword, resetPassword, logout, refreshTokens };