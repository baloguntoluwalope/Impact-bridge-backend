'use strict';

const axios  = require('axios');
const logger = require('../../../utils/logger');

const client = axios.create({
  baseURL:  process.env.FLUTTERWAVE_BASE_URL,
  headers:  { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`, 'Content-Type': 'application/json' },
  timeout:  30000,
});

const initializePayment = async ({ email, amount, reference, metadata = {} }) => {
  try {
    const { data } = await client.post('/payments', {
      tx_ref:       reference,
      amount,
      currency:     'NGN',
      redirect_url: `${process.env.APP_URL}/payment/callback`,
      customer:     { email },
      meta:         metadata,
    });
    return { checkout_url: data.data.link, payment_reference: reference, reference };
  } catch (err) {
    logger.error(`Flutterwave init error: ${err.message}`);
    throw err;
  }
};

const verifyPayment = async (id) => {
  const { data } = await client.get(`/transactions/${id}/verify`);
  return data.data;
};

// Flutterwave uses secret hash header for webhook verification
const verifyWebhook = (payload, signature) =>
  signature === process.env.FLUTTERWAVE_SECRET_KEY;

module.exports = { initializePayment, verifyPayment, verifyWebhook };