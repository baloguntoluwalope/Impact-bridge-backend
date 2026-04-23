'use strict';

const notifService = require('../../modules/notifications/notification.service');
const User         = require('../../modules/users/user.model');
const logger       = require('../../utils/logger');

const notificationProcessor = async (job) => {
  const { type, userId, userIds, roles, title, body, data } = job.data;
  logger.info(`[notification] Processing ${job.name} (type: ${type})`);

  if (type === 'single' && userId) {
    await notifService.notifyUser(userId, { event: job.name, title, body, data });
    return { sent: 1 };
  }

  if (type === 'bulk' && userIds?.length) {
    await Promise.allSettled(
      userIds.map((id) => notifService.notifyUser(id, { event: job.name, title, body, data }))
    );
    return { sent: userIds.length };
  }

  if (type === 'broadcast') {
    const filter = roles?.length ? { role: { $in: roles } } : {};
    const users  = await User.find(filter).select('_id').lean();
    await Promise.allSettled(
      users.map((u) => notifService.notifyUser(u._id, { event: job.name, title, body, data }))
    );
    return { sent: users.length };
  }

  logger.warn(`Unknown notification type: ${type}`);
  return { sent: 0 };

};

// Example logic inside your BullMQ worker
const handleStatusChangeNotification = async (jobData) => {
  const { userId, status, title, reason } = jobData;
  const user = await User.findById(userId);

  let emailTemplate = '';
  let subject = '';

  if (status === 'verified') {
    subject = '🎉 Your request has been verified!';
    emailTemplate = 'request_verified'; // Points to your HTML template
  } else if (status === 'rejected') {
    subject = 'Update regarding your request';
    emailTemplate = 'request_rejected';
  }

  // Send Email via your email utility
  await emailService.send({
    to: user.email,
    subject: subject,
    template: emailTemplate,
    context: {
      name: user.first_name,
      reason: reason,
      title: title
    }
  });
};

module.exports = notificationProcessor;