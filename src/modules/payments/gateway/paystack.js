'use strict';

const axios  = require('axios');
const crypto = require('crypto');
const logger = require('../../../utils/logger');

const client = axios.create({
  baseURL:  process.env.PAYSTACK_BASE_URL,
  headers:  { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
  timeout:  30000,
});

const initializePayment = async ({ email, amount, reference, metadata = {} }) => {
  try {
    const { data } = await client.post('/transaction/initialize', {
      email, amount: amount * 100, reference,
      callback_url: `${process.env.APP_URL}/payment/callback`,
      metadata,
    });
    return { checkout_url: data.data.authorization_url, payment_reference: data.data.reference, reference };
  } catch (err) {
    logger.error(`Paystack init error: ${err.message}`);
    throw err;
  }
};

const verifyPayment = async (reference) => {
  const { data } = await client.get(`/transaction/verify/${reference}`);
  return data.data;
};

const verifyWebhook = (payload, signature) => {
  const hash = crypto.createHmac('sha256', process.env.PAYSTACK_SECRET_KEY)
    .update(JSON.stringify(payload)).digest('hex');
  return hash === signature;
};

module.exports = { initializePayment, verifyPayment, verifyWebhook };