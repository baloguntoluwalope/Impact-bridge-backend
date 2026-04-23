'use strict';

const axios  = require('axios');
const crypto = require('crypto');
const logger = require('../../../utils/logger');

const client = axios.create({
  baseURL:  process.env.KORAPAY_BASE_URL,
  headers:  { Authorization: `Bearer ${process.env.KORAPAY_SECRET_KEY}`, 'Content-Type': 'application/json' },
  timeout:  30000,
});

const initializePayment = async ({ email, amount, reference, metadata = {} }) => {
  try {
    const { data } = await client.post('/charges/initialize', {
      reference, amount, currency: 'NGN',
      customer: { email },
      redirect_url: `${process.env.APP_URL}/payment/callback`,
      channels:    ['card','bank_transfer','pay_with_bank'],
      metadata:    { ...metadata, platform: 'ImpactBridge' },
    });
    if (!data.status) throw new Error(data.message || 'Korapay initialization failed');
    return { checkout_url: data.data.checkout_url, payment_reference: data.data.payment_reference, reference };
  } catch (err) {
    logger.error(`Korapay init error: ${err.response?.data?.message || err.message}`);
    throw err;
  }
};

const verifyPayment = async (reference) => {
  const { data } = await client.get(`/charges/${reference}`);
  return data.data;
};

const verifyWebhook = (payload, signature) => {
  try {
    const computed = crypto.createHmac('sha256', process.env.KORAPAY_WEBHOOK_SECRET)
      .update(JSON.stringify(payload)).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch { return false; }
};

module.exports = { initializePayment, verifyPayment, verifyWebhook };