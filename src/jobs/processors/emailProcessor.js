'use strict';

const notifService = require('../../modules/notifications/notification.service');
const logger       = require('../../utils/logger');

const emailProcessor = async (job) => {
  const { to, subject, template, data, html } = job.data;
  logger.info(`[email] Processing ${job.name} → ${to}`);
  const ok = await notifService.sendEmail({ to, subject, template, data, html });
  if (!ok) throw new Error(`Email delivery failed to ${to}`);
  return { sent: true, to };
};

module.exports = emailProcessor;