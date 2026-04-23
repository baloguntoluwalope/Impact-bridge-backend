'use strict';

const Wallet   = require('./wallet.model');
const Request  = require('../requests/request.model');
const { generateReference } = require('../../utils/helpers');
const ApiError = require('../../utils/apiError');
const logger   = require('../../utils/logger');

const getWalletByRequest = async (requestId, userId, userRole) => {
  const request = await Request.findById(requestId).lean();
  if (!request) throw ApiError.notFound('Request not found');

  const isOwner = request.requester.toString() === userId.toString();
  const isAdmin = ['super_admin'].includes(userRole);
  const isNGO   = ['ngo_partner'].includes(userRole);

  if (!isOwner && !isAdmin && !isNGO) throw ApiError.forbidden('Access denied to this wallet');

  const wallet = await Wallet.findOne({ request: requestId }).lean();
  if (!wallet) throw ApiError.notFound('Wallet not found for this request');

  return wallet;
};

const getWalletByProject = async (projectId) => {
  const wallet = await Wallet.findOne({ project: projectId }).lean();
  if (!wallet) throw ApiError.notFound('Wallet not found for this project');
  return wallet;
};

const getGeneralFundWallet = async () => {
  let wallet = await Wallet.findOne({ wallet_type: 'general_fund' });
  if (!wallet) {
    wallet = await Wallet.create({
      wallet_type: 'general_fund',
      reference:   generateReference('GF'),
      currency:    'NGN',
    });
    logger.info('General fund wallet created');
  }
  return wallet;
};

const allocateFunds = async (walletId, adminId, { amount, description }) => {
  if (!amount || amount <= 0) throw ApiError.badRequest('Amount must be a positive number');
  if (!description)           throw ApiError.badRequest('Description is required for allocation');

  const wallet = await Wallet.findById(walletId);
  if (!wallet) throw ApiError.notFound('Wallet not found');
  if (wallet.is_frozen) throw ApiError.badRequest('Wallet is frozen and cannot process transactions');
  if (amount > wallet.available_balance) {
    throw ApiError.badRequest(`Insufficient balance. Available: ₦${wallet.available_balance.toLocaleString()}`);
  }

  const newBalance = wallet.available_balance - amount;

  return Wallet.findByIdAndUpdate(
    walletId,
    {
      $inc:  { allocated_funds: amount, available_balance: -amount },
      $push: {
        transactions: {
          type:          'allocation',
          amount,
          reference:     generateReference('ALLOC'),
          description,
          performed_by:  adminId,
          balance_after: newBalance,
        },
      },
    },
    { new: true }
  );
};

const recordExpenditure = async (walletId, adminId, { amount, description, reference }) => {
  if (!amount || amount <= 0) throw ApiError.badRequest('Amount must be a positive number');

  const wallet = await Wallet.findById(walletId);
  if (!wallet) throw ApiError.notFound('Wallet not found');
  if (wallet.is_frozen) throw ApiError.badRequest('Wallet is frozen');
  if (amount > wallet.allocated_funds) {
    throw ApiError.badRequest(`Amount exceeds allocated funds. Allocated: ₦${wallet.allocated_funds.toLocaleString()}`);
  }

  return Wallet.findByIdAndUpdate(
    walletId,
    {
      $inc:  { spent_funds: amount, allocated_funds: -amount },
      $push: {
        transactions: {
          type:          'debit',
          amount,
          reference:     reference || generateReference('EXP'),
          description:   description || 'Fund expenditure',
          performed_by:  adminId,
          balance_after: wallet.total_received - wallet.spent_funds - amount,
        },
      },
    },
    { new: true }
  );
};

const freezeWallet = async (walletId, adminId, reason) => {
  if (!reason) throw ApiError.badRequest('Freeze reason is required');

  const wallet = await Wallet.findByIdAndUpdate(
    walletId,
    { is_frozen: true, freeze_reason: reason, frozen_by: adminId, frozen_at: new Date() },
    { new: true }
  );

  if (!wallet) throw ApiError.notFound('Wallet not found');
  return wallet;
};

const unfreezeWallet = async (walletId, adminId) => {
  const wallet = await Wallet.findByIdAndUpdate(
    walletId,
    { is_frozen: false, freeze_reason: null, frozen_by: null, frozen_at: null },
    { new: true }
  );
  if (!wallet) throw ApiError.notFound('Wallet not found');
  return wallet;
};

const getWalletTransactions = async (walletId, { page = 1, limit = 20, type }) => {
  const wallet = await Wallet.findById(walletId).lean();
  if (!wallet) throw ApiError.notFound('Wallet not found');

  let txs = wallet.transactions || [];
  if (type) txs = txs.filter((t) => t.type === type);

  txs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const total  = txs.length;
  const skip   = (+page - 1) * +limit;
  const paged  = txs.slice(skip, skip + +limit);

  return { transactions: paged, total, page: +page, limit: +limit };
};

const getAllWallets = async ({ page = 1, limit = 20, wallet_type }) => {
  const filter = {};
  if (wallet_type) filter.wallet_type = wallet_type;

  const skip = (+page - 1) * +limit;

  const [wallets, total] = await Promise.all([
    Wallet.find(filter)
      .populate('request', 'title status category')
      .populate('project', 'title status')
      .sort('-created_at')
      .skip(skip)
      .limit(+limit)
      .lean(),
    Wallet.countDocuments(filter),
  ]);

  return { wallets, total, page: +page, limit: +limit };
};

module.exports = {
  getWalletByRequest,
  getWalletByProject,
  getGeneralFundWallet,
  allocateFunds,
  recordExpenditure,
  freezeWallet,
  unfreezeWallet,
  getWalletTransactions,
  getAllWallets,
};