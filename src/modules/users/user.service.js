'use strict';

const User         = require('./user.model');
const mediaService = require('../media/media.service');
const ApiError     = require('../../utils/apiError');

const getProfile = async (userId) => {
  const user = await User.findById(userId)
    .populate('ngo_profile', 'name logo is_verified')
    .lean();
  if (!user) throw ApiError.notFound('User not found');
  return user;
};

const updateProfile = async (userId, body) => {
  const allowed = ['first_name','last_name','bio','address','organization_name','fcm_token','notification_preferences'];
  const updates = {};
  allowed.forEach((f) => { if (body[f] !== undefined) updates[f] = body[f]; });
  return User.findByIdAndUpdate(userId, updates, { new: true, runValidators: true }).lean();
};

const updateAvatar = async (userId, file) => {
  if (!file) throw ApiError.badRequest('No image file provided');
  const uploaded = await mediaService.uploadSingle(file, 'avatars');
  const user     = await User.findByIdAndUpdate(userId, { avatar: uploaded.url }, { new: true }).lean();
  return { avatar: user.avatar };
};

const changePassword = async (userId, { current_password, new_password }) => {
  const user = await User.findById(userId).select('+password');
  if (!(await user.comparePassword(current_password))) {
    throw ApiError.badRequest('Current password is incorrect');
  }
  user.password = new_password;
  await user.save();
  return { message: 'Password changed successfully' };
};

const toggleBookmark = async (userId, requestId) => {
  const user    = await User.findById(userId).select('bookmarked_cases').lean();
  const already = user.bookmarked_cases?.some((id) => id.toString() === requestId);
  await User.findByIdAndUpdate(userId, {
    [already ? '$pull' : '$addToSet']: { bookmarked_cases: requestId },
  });
  return { bookmarked: !already, message: already ? 'Removed from bookmarks' : 'Added to bookmarks' };
};

module.exports = { getProfile, updateProfile, updateAvatar, changePassword, toggleBookmark };