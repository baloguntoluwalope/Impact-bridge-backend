'use strict';

const notifService = require('../../modules/notifications/notification.service');
const logger       = require('../../utils/logger');

const pushProcessor = async (job) => {
  const { fcm_token, title, body, data } = job.data;
  logger.info(`[push] Processing ${job.name}`);
  const result = await notifService.sendPush({ fcm_token, title, body, data });
  if (!result) throw new Error('Push notification delivery failed');
  return { sent: true };
};

module.exports = pushProcessor;