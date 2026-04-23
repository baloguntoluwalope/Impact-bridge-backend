'use strict';

const Payment   = require('./payment.model');
const Wallet    = require('../wallets/wallet.model');
const Request   = require('../requests/request.model');
const User      = require('../users/user.model');
const { addJob }           = require('../../config/bullmq');
const { generateReference }= require('../../utils/helpers');
const ApiError = require('../../utils/apiError');
const korapay  = require('./gateway/korapay');
const paystack = require('./gateway/paystack');
const flutterwave = require('./gateway/flutterwave');
const logger   = require('../../utils/logger');

const getGateway = (name) => ({ korapay, paystack, flutterwave }[name] || korapay);

/**
 * Initiates a payment process
 * @param {string} donorId - ID of the donor
 * @param {object} body - Request body containing payment details
 * @param {string} clientIp - The IP address of the donor (passed from controller)
 */
const initiatePayment = async (donorId, body, clientIp) => {
  const { 
    request_id, 
    fund_type, 
    amount, 
    currency = 'NGN', 
    is_anonymous, 
    message, 
    payment_gateway = 'korapay' 
  } = body;

  // 1. Validate Donor
  const donor = await User.findById(donorId);
  if (!donor) throw ApiError.notFound('Donor not found');

  // 2. Validate Funding Request (if applicable)
  if (request_id) {
    const fundingRequest = await Request.findById(request_id);
    if (!fundingRequest) throw ApiError.notFound('Request not found');
    if (fundingRequest.status !== 'verified') {
      throw ApiError.badRequest('This request is not currently accepting donations');
    }
  }

  const reference = generateReference('PAY');
  let gateway = payment_gateway;

  // 3. Create pending payment record
  const payment = await Payment.create({
    reference,
    donor: donorId,
    request: request_id || null,
    amount,
    currency,
    fund_type,
    gateway,
    status: 'pending',
    is_anonymous,
    donor_message: message,
    ip_address: clientIp, // Fixed the ReferenceError here
    metadata: { donor_name: `${donor.first_name} ${donor.last_name}` },
  });

  // 4. Initialize Payment with Gateway
  let checkoutData;
  try {
    checkoutData = await getGateway(gateway).initializePayment({
      email: donor.email,
      amount,
      reference,
      metadata: { payment_id: payment._id.toString(), fund_type },
    });
  } catch (primaryErr) {
    logger.warn(`${gateway} failed → trying paystack fallback`);
    try {
      const fbRef = `${reference}-FB`;
      checkoutData = await paystack.initializePayment({
        email: donor.email,
        amount,
        reference: fbRef,
        metadata: { payment_id: payment._id.toString() },
      });
      gateway = 'paystack';
      await Payment.findByIdAndUpdate(payment._id, { gateway, reference: fbRef });
    } catch (fallbackErr) {
      await Payment.findByIdAndUpdate(payment._id, { 
        status: 'failed', 
        failure_reason: 'All gateways unavailable' 
      });
      throw ApiError.internal('Payment gateways unavailable. Please try again later.');
    }
  }

  return { 
    reference: payment.reference, 
    checkout_url: checkoutData.checkout_url 
  };
};

const handleWebhook = async (gateway, payload, signature) => {
  const gw = getGateway(gateway);
  if (!gw.verifyWebhook(payload, signature)) {
    throw ApiError.unauthorized('Invalid webhook signature');
  }

  const rawRef = payload.data?.reference || payload.data?.tx_ref || payload.data?.txRef;
  const baseRef = rawRef?.replace('-FB', '');

  const payment = await Payment.findOne({ reference: { $regex: baseRef, $options: 'i' } });
  if (!payment) { 
    logger.warn(`Webhook: payment not found for ref ${rawRef}`); 
    return { received: true }; 
  }
  
  if (payment.status === 'success') { 
    logger.info(`Webhook: ${rawRef} already processed`); 
    return { received: true }; 
  }

  const verification = await gw.verifyPayment(rawRef);
  const isSuccess = ['success','successful','completed'].includes(verification.status?.toLowerCase());

  await Payment.findByIdAndUpdate(payment._id, {
    status: isSuccess ? 'success' : 'failed',
    gateway_reference: verification.id || verification.reference,
    gateway_response: verification,
    webhook_verified: true,
    payment_method: verification.payment_method || verification.channel,
    ...(!isSuccess && { failure_reason: verification.message }),
  });

  if (isSuccess) await processSuccess(payment);
  return { received: true };
};

const processSuccess = async (payment) => {
  // Update wallet and Request progress
  if (payment.request) {
    await Wallet.findOneAndUpdate(
      { request: payment.request },
      {
        $inc: { total_received: payment.amount, available_balance: payment.amount },
        $push: { 
          transactions: { 
            type: 'credit', 
            amount: payment.amount, 
            reference: payment.reference, 
            description: 'Donation received', 
            payment: payment._id 
          } 
        },
      }
    );

    const reqDoc = await Request.findByIdAndUpdate(
      payment.request,
      { $inc: { amount_raised: payment.amount, donor_count: 1 } },
      { new: true }
    );

    // Auto-transition to funded if goal reached
    if (reqDoc?.amount_raised >= reqDoc?.amount_needed && reqDoc?.status === 'verified') {
      await Request.findByIdAndUpdate(payment.request, { status: 'funded' });
      await addJob('notification', 'funding_complete', {
        type: 'single',
        userId: reqDoc.requester.toString(),
        title: '🎊 Your request is fully funded!',
        body: `"${reqDoc.title}" has reached its fundraising goal!`,
      });
    }
  }

  // Update donor profile stats
  await User.findByIdAndUpdate(payment.donor, { 
    $inc: { total_donated: payment.amount, donation_count: 1 } 
  });

  // Queue Donation Receipt Email
  const donor = await User.findById(payment.donor);
  if (donor) {
    await addJob('email', 'donation_receipt', {
      to: donor.email, 
      subject: '🧡 Donation Confirmed – Impact Bridge',
      template: 'donation_receipt',
      data: { 
        name: donor.first_name, 
        amount: payment.amount, 
        reference: payment.reference, 
        date: new Date().toLocaleDateString('en-NG') 
      },
    });
  }
};

const verifyPaymentManually = async (reference) => {
  const payment = await Payment.findOne({ reference });
  if (!payment) throw ApiError.notFound('Payment not found');
  if (payment.status === 'success') return { already_processed: true, payment };

  const gw = getGateway(payment.gateway);
  const verification = await gw.verifyPayment(reference);
  const isSuccess = ['success','successful'].includes(verification.status?.toLowerCase());

  if (isSuccess && payment.status !== 'success') {
    await Payment.findByIdAndUpdate(payment._id, { status: 'success', webhook_verified: true });
    await processSuccess(payment);
  }

  return { payment: await Payment.findById(payment._id).lean(), verification };
};

const getDonorHistory = async (donorId, { page = 1, limit = 20, status }) => {
  const skip = (+page - 1) * +limit;
  const filter = { donor: donorId };
  if (status) filter.status = status;
  
  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .populate('request', 'title category status')
      .sort('-createdAt')
      .skip(skip)
      .limit(+limit)
      .lean(),
    Payment.countDocuments(filter),
  ]);
  
  return { payments, total, page: +page, limit: +limit };
};

module.exports = { 
  initiatePayment, 
  handleWebhook, 
  verifyPaymentManually, 
  getDonorHistory 
};

// 'use strict';

// const Payment  = require('./payment.model');
// const Wallet   = require('../wallets/wallet.model');
// const Request  = require('../requests/request.model');
// const User     = require('../users/user.model');
// const { addJob }           = require('../../config/bullmq');
// const { generateReference }= require('../../utils/helpers');
// const ApiError = require('../../utils/apiError');
// const korapay  = require('./gateway/korapay');
// const paystack = require('./gateway/paystack');
// const flutterwave = require('./gateway/flutterwave');
// const logger   = require('../../utils/logger');

// const getGateway = (name) => ({ korapay, paystack, flutterwave }[name] || korapay);

// const initiatePayment = async (donorId, body) => {
//   const { request_id, fund_type, amount, currency = 'NGN', is_anonymous, message, payment_gateway = 'korapay' } = body;

//   const donor = await User.findById(donorId);
//   if (!donor) throw ApiError.notFound('Donor not found');

//   if (request_id) {
//     const req = await Request.findById(request_id);
//     if (!req)                   throw ApiError.notFound('Request not found');
//     if (req.status !== 'verified') throw ApiError.badRequest('This request is not currently accepting donations');
//   }

//   const reference = generateReference('PAY');
//   let   gateway   = payment_gateway;

//   // Create pending payment record first (idempotent)
//   const payment = await Payment.create({
//     reference, donor: donorId, request: request_id || null,
//     amount, currency, fund_type, gateway,
//     status: 'pending', is_anonymous, donor_message: message,
//     ip_address: req?.ip,
//     metadata: { donor_name: `${donor.first_name} ${donor.last_name}` },
//   });

//   // Try primary gateway, then fallback
//   let checkoutData;
//   try {
//     checkoutData = await getGateway(gateway).initializePayment({
//       email: donor.email, amount, reference,
//       metadata: { payment_id: payment._id.toString(), fund_type },
//     });
//   } catch (primaryErr) {
//     logger.warn(`${gateway} failed → trying paystack fallback`);
//     try {
//       const fbRef  = `${reference}-FB`;
//       checkoutData = await paystack.initializePayment({
//         email: donor.email, amount, reference: fbRef,
//         metadata: { payment_id: payment._id.toString() },
//       });
//       gateway = 'paystack';
//       await Payment.findByIdAndUpdate(payment._id, { gateway, reference: fbRef });
//     } catch (fallbackErr) {
//       await Payment.findByIdAndUpdate(payment._id, { status: 'failed', failure_reason: 'All gateways unavailable' });
//       throw ApiError.internal('Payment gateways unavailable. Please try again later.');
//     }
//   }

//   return { reference: payment.reference, checkout_url: checkoutData.checkout_url };
// };

// const handleWebhook = async (gateway, payload, signature) => {
//   const gw = getGateway(gateway);
//   if (!gw.verifyWebhook(payload, signature)) {
//     throw ApiError.unauthorized('Invalid webhook signature');
//   }

//   const rawRef = payload.data?.reference || payload.data?.tx_ref || payload.data?.txRef;
//   const baseRef = rawRef?.replace('-FB', '');

//   const payment = await Payment.findOne({ reference: { $regex: baseRef, $options: 'i' } });
//   if (!payment) { logger.warn(`Webhook: payment not found for ref ${rawRef}`); return { received: true }; }
//   if (payment.status === 'success') { logger.info(`Webhook: ${rawRef} already processed`); return { received: true }; }

//   const verification = await gw.verifyPayment(rawRef);
//   const isSuccess    = ['success','successful','completed'].includes(verification.status?.toLowerCase());

//   await Payment.findByIdAndUpdate(payment._id, {
//     status:            isSuccess ? 'success' : 'failed',
//     gateway_reference: verification.id || verification.reference,
//     gateway_response:  verification,
//     webhook_verified:  true,
//     payment_method:    verification.payment_method || verification.channel,
//     ...(!isSuccess && { failure_reason: verification.message }),
//   });

//   if (isSuccess) await processSuccess(payment);
//   return { received: true };
// };

// const processSuccess = async (payment) => {
//   // Update wallet
//   if (payment.request) {
//     await Wallet.findOneAndUpdate(
//       { request: payment.request },
//       {
//         $inc: { total_received: payment.amount, available_balance: payment.amount },
//         $push: { transactions: { type: 'credit', amount: payment.amount, reference: payment.reference, description: 'Donation received', payment: payment._id } },
//       }
//     );

//     const req = await Request.findByIdAndUpdate(
//       payment.request,
//       { $inc: { amount_raised: payment.amount, donor_count: 1 } },
//       { new: true }
//     );

//     // Auto-transition to funded
//     if (req?.amount_raised >= req?.amount_needed && req?.status === 'verified') {
//       await Request.findByIdAndUpdate(payment.request, { status: 'funded' });
//       await addJob('notification', 'funding_complete', {
//         type:   'single',
//         userId: req.requester.toString(),
//         title:  '🎊 Your request is fully funded!',
//         body:   `"${req.title}" has reached its fundraising goal!`,
//       });
//     }
//   }

//   // Update donor stats
//   await User.findByIdAndUpdate(payment.donor, { $inc: { total_donated: payment.amount, donation_count: 1 } });

//   // Send receipt
//   const donor = await User.findById(payment.donor);
//   if (donor) {
//     await addJob('email', 'donation_receipt', {
//       to: donor.email, subject: '🧡 Donation Confirmed – Impact Bridge',
//       template: 'donation_receipt',
//       data: { name: donor.first_name, amount: payment.amount, reference: payment.reference, date: new Date().toLocaleDateString('en-NG') },
//     });
//   }
// };

// const verifyPaymentManually = async (reference) => {
//   const payment = await Payment.findOne({ reference });
//   if (!payment) throw ApiError.notFound('Payment not found');
//   if (payment.status === 'success') return { already_processed: true, payment };

//   const gw           = getGateway(payment.gateway);
//   const verification = await gw.verifyPayment(reference);
//   const isSuccess    = ['success','successful'].includes(verification.status?.toLowerCase());

//   if (isSuccess && payment.status !== 'success') {
//     await Payment.findByIdAndUpdate(payment._id, { status: 'success', webhook_verified: true });
//     await processSuccess(payment);
//   }

//   return { payment: await Payment.findById(payment._id).lean(), verification };
// };

// const getDonorHistory = async (donorId, { page = 1, limit = 20, status }) => {
//   const skip   = (+page - 1) * +limit;
//   const filter = { donor: donorId };
//   if (status) filter.status = status;
//   const [payments, total] = await Promise.all([
//     Payment.find(filter).populate('request','title category status').sort('-created_at').skip(skip).limit(+limit).lean(),
//     Payment.countDocuments(filter),
//   ]);
//   return { payments, total, page: +page, limit: +limit };
// };

// module.exports = { initiatePayment, handleWebhook, verifyPaymentManually, getDonorHistory };