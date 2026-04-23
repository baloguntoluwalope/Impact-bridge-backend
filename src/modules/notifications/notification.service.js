'use strict';

const nodemailer   = require('nodemailer');
const axios        = require('axios');
const { admin }    = require('../../config/firebase');
const Notification = require('./notification.model');
const User         = require('../users/user.model');
const logger       = require('../../utils/logger');

// ── Email Transporter ─────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host:    process.env.SMTP_HOST,
  port:    parseInt(process.env.SMTP_PORT) || 587,
  secure:  false,
  auth:    { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  pool:    true,
  maxConnections: 5,
});

// ── Email HTML Templates ──────────────────────────────────────────
const getEmailHTML = (template, data) => {
  const body = {
    otp_verification: `
      <h2 style="color:#E85D04">Welcome to Impact Bridge 🌍</h2>
      <p>Hi <strong>${data?.name}</strong>,</p>
      <p>Your email verification code is:</p>
      <div style="background:#f4f4f4;padding:20px;text-align:center;border-radius:8px;margin:20px 0">
        <h1 style="color:#E85D04;letter-spacing:12px;font-size:36px;margin:0">${data?.otp}</h1>
      </div>
      <p>This code expires in <strong>${data?.expiry} minutes</strong>.</p>
      <p>If you did not request this, please ignore this email.</p>
    `,
    password_reset: `
      <h2 style="color:#E85D04">Password Reset Request 🔐</h2>
      <p>Hi <strong>${data?.name}</strong>,</p>
      <p>Click the button below to reset your password. This link expires in <strong>${data?.expiry} minutes</strong>.</p>
      <div style="text-align:center;margin:30px 0">
        <a href="${data?.resetUrl}" style="background:#E85D04;color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:bold">Reset Password</a>
      </div>
      <p style="color:#999;font-size:12px">If you did not request this, your account is safe — just ignore this email.</p>
    `,
    password_changed: `
      <h2 style="color:#E85D04">Password Changed ✅</h2>
      <p>Hi <strong>${data?.name}</strong>,</p>
      <p>Your Impact Bridge password was successfully changed.</p>
      <p>If you did not make this change, please contact support immediately at support@impactbridge.ng</p>
    `,
    donation_receipt: `
      <h2 style="color:#E85D04">Donation Confirmed 🧡</h2>
      <p>Hi <strong>${data?.name}</strong>,</p>
      <p>Thank you for your generous donation of <strong style="color:#E85D04">₦${data?.amount?.toLocaleString()}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0">
        <tr><td style="padding:8px;border:1px solid #eee;background:#f9f9f9"><strong>Reference</strong></td><td style="padding:8px;border:1px solid #eee">${data?.reference}</td></tr>
        <tr><td style="padding:8px;border:1px solid #eee;background:#f9f9f9"><strong>Amount</strong></td><td style="padding:8px;border:1px solid #eee">₦${data?.amount?.toLocaleString()}</td></tr>
        <tr><td style="padding:8px;border:1px solid #eee;background:#f9f9f9"><strong>Date</strong></td><td style="padding:8px;border:1px solid #eee">${data?.date}</td></tr>
      </table>
      <p>Your donation is traceable and goes directly to the cause. Thank you for building impact! 🌍</p>
    `,
    more_info: `
      <h2 style="color:#E85D04">Additional Information Required 📋</h2>
      <p>Hi <strong>${data?.name}</strong>,</p>
      <p>Regarding your request: <strong>${data?.requestTitle}</strong></p>
      <p>Our verification team needs the following additional information:</p>
      <div style="background:#fff3cd;padding:16px;border-radius:6px;border-left:4px solid #E85D04;margin:16px 0">
        <p style="margin:0">${data?.message}</p>
      </div>
      <p>Please reply to this email or log in to your account to provide the required information.</p>
    `,
  };

  const content = body[template] || `<p>${data?.body || 'Notification from Impact Bridge'}</p>`;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
    <body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f0f0f0">
      <div style="max-width:600px;margin:20px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.1)">
        <div style="background:#E85D04;padding:24px;text-align:center">
          <h1 style="color:white;margin:0;font-size:24px">🌍 Impact Bridge</h1>
          <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:13px">National Social Impact Operating System</p>
        </div>
        <div style="padding:32px">
          ${content}
        </div>
        <div style="background:#f9f9f9;padding:20px;text-align:center;border-top:1px solid #eee">
          <p style="color:#999;font-size:12px;margin:0">© ${new Date().getFullYear()} Impact Bridge · <a href="https://impactbridge.ng" style="color:#E85D04">impactbridge.ng</a></p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// ── Send Functions ────────────────────────────────────────────────

const sendEmail = async ({ to, subject, template, data, html }) => {
  try {
    await transporter.sendMail({
      from:    process.env.EMAIL_FROM,
      to,
      subject,
      html:    html || getEmailHTML(template, data),
    });
    logger.info(`📧 Email sent → ${to}`);
    return true;
  } catch (err) {
    logger.error(`📧 Email failed → ${to}: ${err.message}`);
    return false;
  }
};

const sendSMS = async ({ to, message }) => {
  try {
    const res = await axios.post(`${process.env.TERMII_BASE_URL}/sms/send`, {
      to,
      from:    process.env.TERMII_SENDER_ID,
      sms:     message,
      type:    'plain',
      channel: 'generic',
      api_key: process.env.TERMII_API_KEY,
    });
    logger.info(`📱 SMS sent → ${to}`);
    return res.data;
  } catch (err) {
    logger.error(`📱 SMS failed → ${to}: ${err.message}`);
    return null;
  }
};

const sendPush = async ({ fcm_token, title, body, data = {} }) => {
  if (!fcm_token) return null;
  try {
    const result = await admin.messaging().send({
      token:        fcm_token,
      notification: { title, body },
      data:         Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android:      { notification: { sound: 'default' } },
      apns:         { payload: { aps: { sound: 'default' } } },
    });
    logger.info(`🔔 Push sent: ${result}`);
    return result;
  } catch (err) {
    logger.error(`🔔 Push failed: ${err.message}`);
    return null;
  }
};

const createInApp = (userId, { title, body, type, data }) =>
  Notification.create({ user: userId, title, body, type, data, channel: 'in_app' });

/**
 * Notify a user across all their preferred channels (in-app, email, push).
 * Respects notification_preferences.
 */
const notifyUser = async (userId, { event, title, body, email, data = {} }) => {
  try {
    const user = await User.findById(userId)
      .select('email phone fcm_token notification_preferences')
      .lean();
    if (!user) return;

    const prefs = user.notification_preferences || {};
    const tasks = [createInApp(userId, { title, body, type: event, data })];

    if (prefs.email !== false) {
      tasks.push(sendEmail({ to: email || user.email, subject: title, template: event, data }));
    }
    if (prefs.push !== false && user.fcm_token) {
      tasks.push(sendPush({ fcm_token: user.fcm_token, title, body, data }));
    }

    await Promise.allSettled(tasks);
  } catch (err) {
    logger.error(`notifyUser error for ${userId}: ${err.message}`);
  }
};

const getUserNotifications = async (userId, { page = 1, limit = 20, is_read }) => {
  const skip   = (+page - 1) * +limit;
  const filter = { user: userId };
  if (is_read !== undefined) filter.is_read = is_read === 'true';

  const [notifications, total, unread_count] = await Promise.all([
    Notification.find(filter).sort('-created_at').skip(skip).limit(+limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: userId, is_read: false }),
  ]);
  return { notifications, total, unread_count };
};

const markRead    = (id, userId)  => Notification.findOneAndUpdate({ _id: id, user: userId }, { is_read: true, read_at: new Date() }, { new: true });
const markAllRead = (userId)      => Notification.updateMany({ user: userId, is_read: false }, { is_read: true, read_at: new Date() });

const broadcast = async (adminId, { title, body, roles, type }) => {
  const filter = roles?.length ? { role: { $in: roles } } : {};
  const users  = await User.find(filter).select('_id').lean();
  await Promise.allSettled(
    users.map((u) => createInApp(u._id, { title, body, type: type || 'broadcast', data: {} }))
  );
  return { sent: users.length };
};

module.exports = {
  sendEmail,
  sendSMS,
  sendPush,
  createInApp,
  notifyUser,
  getUserNotifications,
  markRead,
  markAllRead,
  broadcast,
};