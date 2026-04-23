'use strict';

const notifService = require('../../modules/notifications/notification.service');
const logger       = require('../../utils/logger');

const smsProcessor = async (job) => {
  const { to, message } = job.data;
  logger.info(`[sms] Processing ${job.name} → ${to}`);
  const result = await notifService.sendSMS({ to, message });
  if (!result) throw new Error(`SMS delivery failed to ${to}`);
  return { sent: true, to };
};

module.exports = smsProcessor;