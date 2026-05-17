'use strict';

/**
 * notification.service.js
 * ─────────────────────────────────────────────────────────────
 * Email  → Brevo HTTP API  (@getbrevo/brevo)   — works on Render free tier
 * SMS    → Termii REST API (axios)
 * Push   → Firebase Cloud Messaging (admin SDK)
 * In-app → MongoDB (Notification model)
 *
 * Install:
 *   npm install @getbrevo/brevo
 *   npm uninstall nodemailer nodemailer-sendgrid-transport   ← no longer needed
 */

const axios        = require('axios');
const { admin }    = require('../../config/firebase');
const Notification = require('./notification.model');
const User         = require('../users/user.model');
const logger       = require('../../utils/logger');

// ── Brevo HTTP client ─────────────────────────────────────────────
// Uses axios directly against Brevo REST API v3 — no SDK dependency,
// works with any @getbrevo/brevo version and never breaks on SDK updates.
const BREVO_API_KEY   = process.env.BREVO_API_KEY;
const MAIL_FROM_EMAIL = process.env.BREVO_FROM_EMAIL || process.env.EMAIL_FROM;
const MAIL_FROM_NAME  = process.env.BREVO_FROM_NAME  || 'Impact Bridge';

if (!BREVO_API_KEY)   logger.error('📧 BREVO_API_KEY is not set. Email delivery will fail.');
if (!MAIL_FROM_EMAIL) logger.error('📧 BREVO_FROM_EMAIL is not set. Email delivery will fail.');

const brevoAxios = axios.create({
  baseURL: 'https://api.brevo.com/v3',
  timeout: 30_000,  // increased — Brevo can be slow from some networks
  headers: {
    'api-key':      BREVO_API_KEY,
    'Content-Type': 'application/json',
    'Accept':       'application/json',
  },
});

logger.info(`📧 Email provider: Brevo HTTP API (from: ${MAIL_FROM_NAME} <${MAIL_FROM_EMAIL}>)`);

// ── HTML template helper ──────────────────────────────────────────

/** Escape HTML special characters to prevent XSS in email templates */
const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

const getEmailHTML = (template, data) => {
  const bodies = {
    otp_verification: `
      <h2 style="color:#E85D04">Welcome to Impact Bridge 🌍</h2>
      <p>Hi <strong>${esc(data?.name)}</strong>,</p>
      <p>Your email verification code is:</p>
      <div style="background:#f4f4f4;padding:20px;text-align:center;border-radius:8px;margin:20px 0">
        <h1 style="color:#E85D04;letter-spacing:12px;font-size:36px;margin:0">${esc(data?.otp)}</h1>
      </div>
      <p>This code expires in <strong>${esc(data?.expiry)} minutes</strong>.</p>
      <p>If you did not request this, please ignore this email.</p>
    `,

    password_reset: `
      <h2 style="color:#E85D04">Password Reset Request 🔐</h2>
      <p>Hi <strong>${esc(data?.name)}</strong>,</p>
      <p>Click the button below to reset your password. This link expires in <strong>${esc(data?.expiry)} minutes</strong>.</p>
      <div style="text-align:center;margin:30px 0">
        <a href="${esc(data?.resetUrl)}"
           style="background:#E85D04;color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:bold">
          Reset Password
        </a>
      </div>
      <p style="color:#999;font-size:12px">
        If you did not request this, your account is safe — just ignore this email.
      </p>
    `,

    password_changed: `
      <h2 style="color:#E85D04">Password Changed ✅</h2>
      <p>Hi <strong>${esc(data?.name)}</strong>,</p>
      <p>Your Impact Bridge password was successfully changed.</p>
      <p>If you did not make this change, please contact support immediately at
         <a href="mailto:support@impactbridge.ng">support@impactbridge.ng</a>.
      </p>
    `,

    donation_receipt: `
      <h2 style="color:#E85D04">Donation Confirmed 🧡</h2>
      <p>Hi <strong>${esc(data?.name)}</strong>,</p>
      <p>Thank you for your generous donation of
         <strong style="color:#E85D04">₦${esc(data?.amount?.toLocaleString())}</strong>.
      </p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0">
        <tr>
          <td style="padding:8px;border:1px solid #eee;background:#f9f9f9"><strong>Reference</strong></td>
          <td style="padding:8px;border:1px solid #eee">${esc(data?.reference)}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #eee;background:#f9f9f9"><strong>Amount</strong></td>
          <td style="padding:8px;border:1px solid #eee">₦${esc(data?.amount?.toLocaleString())}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #eee;background:#f9f9f9"><strong>Date</strong></td>
          <td style="padding:8px;border:1px solid #eee">${esc(data?.date)}</td>
        </tr>
      </table>
      <p>Your donation is traceable and goes directly to the cause. Thank you for building impact! 🌍</p>
    `,

    more_info: `
      <h2 style="color:#E85D04">Additional Information Required 📋</h2>
      <p>Hi <strong>${esc(data?.name)}</strong>,</p>
      <p>Regarding your request: <strong>${esc(data?.requestTitle)}</strong></p>
      <p>Our verification team needs the following additional information:</p>
      <div style="background:#fff3cd;padding:16px;border-radius:6px;border-left:4px solid #E85D04;margin:16px 0">
        <p style="margin:0">${esc(data?.message)}</p>
      </div>
      <p>Please reply to this email or log in to your account to provide the required information.</p>
    `,
  };

  const content = bodies[template] || `<p>${esc(data?.body) || 'Notification from Impact Bridge'}</p>`;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f0f0f0">
      <div style="max-width:600px;margin:20px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.1)">
        <div style="background:#E85D04;padding:24px;text-align:center">
          <h1 style="color:white;margin:0;font-size:24px">🌍 Impact Bridge</h1>
          <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:13px">
            National Social Impact Operating System
          </p>
        </div>
        <div style="padding:32px">
          ${content}
        </div>
        <div style="background:#f9f9f9;padding:20px;text-align:center;border-top:1px solid #eee">
          <p style="color:#999;font-size:12px;margin:0">
            © ${new Date().getFullYear()} Impact Bridge ·
            <a href="https://impactbridge.ng" style="color:#E85D04">impactbridge.ng</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// ── Send Functions ────────────────────────────────────────────────

/**
 * Send a transactional email via Brevo HTTP API.
 * Uses HTTPS (port 443) — works on Render free tier.
 *
 * @param {object} opts
 * @param {string}  opts.to        - Recipient email address
 * @param {string}  opts.subject   - Email subject
 * @param {string} [opts.template] - Template key (e.g. 'otp_verification')
 * @param {object} [opts.data]     - Template data
 * @param {string} [opts.html]     - Raw HTML (overrides template)
 * @returns {Promise<boolean>}
 */
const sendEmail = async ({ to, subject, template, data, html }) => {
  const payload = {
    sender:      { name: MAIL_FROM_NAME, email: MAIL_FROM_EMAIL },
    to:          [{ email: to }],
    subject,
    htmlContent: html || getEmailHTML(template, data),
  };

  // Retry up to 3 times with exponential backoff before giving up.
  // BullMQ also retries the whole job, but having inner retries here
  // avoids burning through job attempts on transient network blips.
  const MAX_TRIES = 3;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      await brevoAxios.post('/smtp/email', payload);
      logger.info(`📧 Email sent → ${to} [${template || 'custom'}]`);
      return true;
    } catch (err) {
      const detail  = err.response?.data?.message || err.message;
      const isLast  = attempt === MAX_TRIES;
      const isRetry = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT'
                   || err.code === 'ECONNRESET'   || err.response?.status >= 500;

      if (isLast || !isRetry) {
        logger.error(`📧 Email failed → ${to} (attempt ${attempt}): ${detail}`);
        return false;
      }

      const delay = attempt * 2_000; // 2s, 4s
      logger.warn(`📧 Email attempt ${attempt} failed (${detail}), retrying in ${delay}ms…`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  return false;
};

/**
 * Send an SMS via Termii.
 *
 * @param {object} opts
 * @param {string} opts.to      - Recipient phone (E.164 format, e.g. +2348012345678)
 * @param {string} opts.message - SMS body
 * @returns {Promise<object|null>}
 */
const sendSMS = async ({ to, message }) => {
  // Basic E.164 guard — Termii silently drops malformed numbers
  if (!to || !/^\+?[1-9]\d{7,14}$/.test(to.replace(/\s/g, ''))) {
    logger.warn(`📱 SMS skipped — invalid number: ${to}`);
    return null;
  }

  try {
    const res = await axios.post(
      `${process.env.TERMII_BASE_URL}/sms/send`,
      {
        to,
        from:    process.env.TERMII_SENDER_ID,
        sms:     message,
        type:    'plain',
        channel: 'generic',
        api_key: process.env.TERMII_API_KEY,
      },
      { timeout: 10_000 },
    );
    logger.info(`📱 SMS sent → ${to}`);
    return res.data;
  } catch (err) {
    logger.error(`📱 SMS failed → ${to}: ${err.message}`);
    return null;
  }
};

/**
 * Send a Firebase push notification.
 *
 * @param {object} opts
 * @param {string} opts.fcm_token - Device FCM token
 * @param {string} opts.title     - Notification title
 * @param {string} opts.body      - Notification body
 * @param {object} [opts.data]    - Extra key-value payload (all values stringified)
 * @returns {Promise<string|null>} FCM message ID or null on failure
 */
const sendPush = async ({ fcm_token, title, body, data = {} }) => {
  if (!fcm_token) return null;

  try {
    const result = await admin.messaging().send({
      token:        fcm_token,
      notification: { title, body },
      // FCM data payload requires all values to be strings
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
      android: { notification: { sound: 'default' } },
      apns:    { payload: { aps: { sound: 'default' } } },
    });
    logger.info(`🔔 Push sent: ${result}`);
    return result;
  } catch (err) {
    logger.error(`🔔 Push failed: ${err.message}`);
    return null;
  }
};

/**
 * Create an in-app notification record in MongoDB.
 */
const createInApp = (userId, { title, body, type, data }) =>
  Notification.create({ user: userId, title, body, type, data, channel: 'in_app' });

/**
 * Notify a single user across all their preferred channels
 * (in-app always, email and push depending on preferences).
 *
 * @param {string} userId
 * @param {object} opts
 * @param {string}  opts.event  - Event key (maps to email template)
 * @param {string}  opts.title  - Notification title
 * @param {string}  opts.body   - Notification body text
 * @param {string} [opts.email] - Override recipient email (defaults to user.email)
 * @param {object} [opts.data]  - Template / push data payload
 */
const notifyUser = async (userId, { event, title, body, email, data = {} }) => {
  try {
    const user = await User.findById(userId)
      .select('email phone fcm_token notification_preferences')
      .lean();
    if (!user) {
      logger.warn(`notifyUser: user ${userId} not found`);
      return;
    }

    const prefs = user.notification_preferences || {};
    const tasks = [
      // In-app is always created regardless of preferences
      createInApp(userId, { title, body, type: event, data }),
    ];

    if (prefs.email !== false) {
      tasks.push(
        sendEmail({ to: email || user.email, subject: title, template: event, data })
      );
    }

    if (prefs.push !== false && user.fcm_token) {
      tasks.push(
        sendPush({ fcm_token: user.fcm_token, title, body, data })
      );
    }

    // allSettled so one channel failing doesn't kill the others
    const results = await Promise.allSettled(tasks);
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        logger.error(`notifyUser task[${i}] rejected for ${userId}: ${r.reason}`);
      }
    });
  } catch (err) {
    logger.error(`notifyUser error for ${userId}: ${err.message}`);
  }
};

/**
 * Fetch paginated notifications for a user.
 */
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

/** Mark a single notification as read (scoped to the owning user). */
const markRead = (id, userId) =>
  Notification.findOneAndUpdate(
    { _id: id, user: userId },
    { is_read: true, read_at: new Date() },
    { new: true }
  );

/** Mark all of a user's notifications as read. */
const markAllRead = (userId) =>
  Notification.updateMany(
    { user: userId, is_read: false },
    { is_read: true, read_at: new Date() }
  );

/**
 * Broadcast an in-app notification to all users matching given roles.
 * Uses a cursor to avoid loading the entire user collection into memory.
 *
 * @param {string}   adminId
 * @param {object}   opts
 * @param {string}   opts.title
 * @param {string}   opts.body
 * @param {string[]} [opts.roles] - If empty/omitted, targets all users
 * @param {string}   [opts.type]
 * @returns {Promise<{ sent: number }>}
 */
const broadcast = async (adminId, { title, body, roles, type }) => {
  const filter = roles?.length ? { role: { $in: roles } } : {};
  const cursor  = User.find(filter).select('_id').lean().cursor();

  let sent = 0;
  for await (const user of cursor) {
    try {
      await createInApp(user._id, { title, body, type: type || 'broadcast', data: {} });
      sent++;
    } catch (err) {
      logger.error(`broadcast: failed to notify user ${user._id}: ${err.message}`);
    }
  }

  logger.info(`📣 Broadcast sent to ${sent} users`);
  return { sent };
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

// 'use strict';

// const nodemailer   = require('nodemailer');
// const sgTransport  = require('nodemailer-sendgrid-transport');
// const axios        = require('axios');
// const { admin }    = require('../../config/firebase');
// const Notification = require('./notification.model');
// const User         = require('../users/user.model');
// const logger       = require('../../utils/logger');

// // ── Email Transporter ─────────────────────────────────────────────
// let transporter;

// const EMAIL_PROVIDER = (process.env.EMAIL_PROVIDER || 'smtp').toLowerCase();
// const BREVO_FROM = process.env.BREVO_FROM || process.env.BREVO_FROM_EMAIL;
// const MAIL_FROM = process.env.SENDGRID_FROM || BREVO_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER;
// const SENDGRID_ENABLED = process.env.SENDGRID_API_KEY && process.env.SENDGRID_API_KEY.startsWith('SG.') && process.env.SENDGRID_API_KEY.length > 20;
// const BREVO_SMTP_HOST = process.env.BREVO_SMTP_HOST || 'smtp-relay.sendinblue.com';
// const BREVO_SMTP_PORT = parseInt(process.env.BREVO_SMTP_PORT || '587', 10);
// const BREVO_SMTP_USER = process.env.BREVO_SMTP_USER;
// const BREVO_SMTP_PASS = process.env.BREVO_SMTP_PASS;

// const createSmtpTransport = (options) => nodemailer.createTransport(options);

// const createBrevoTransport = () => createSmtpTransport({
//   host: BREVO_SMTP_HOST,
//   port: BREVO_SMTP_PORT,
//   secure: BREVO_SMTP_PORT === 465,
//   requireTLS: true,
//   auth: { user: BREVO_SMTP_USER, pass: BREVO_SMTP_PASS },
//   pool: true,
//   maxConnections: 5,
// });

// if (EMAIL_PROVIDER === 'brevo') {
//   if (!BREVO_SMTP_USER || !BREVO_SMTP_PASS) {
//     logger.error('📧 BREVO email provider selected but BREVO_SMTP_USER/BREVO_SMTP_PASS are missing. Falling back to SMTP.');
//   } else {
//     transporter = createBrevoTransport();
//     logger.info(`📧 Using Brevo SMTP for email delivery (from ${MAIL_FROM})`);
//   }
// }

// if (!transporter) {
//   if (EMAIL_PROVIDER === 'sendgrid' && SENDGRID_ENABLED) {
//     transporter = nodemailer.createTransport(sgTransport({
//       auth: { api_key: process.env.SENDGRID_API_KEY }
//     }));
//     logger.info(`📧 Using SendGrid for email delivery (from ${MAIL_FROM})`);
//     if (!process.env.SENDGRID_FROM && MAIL_FROM?.toLowerCase().includes('@gmail.com')) {
//       logger.warn('📧 SendGrid is enabled but your from address is a Gmail address. Verify this sender identity in SendGrid or set SENDGRID_FROM to a verified address.');
//     }
//   }
// }

// if (!transporter) {
//   transporter = createSmtpTransport({
//     host:    process.env.SMTP_HOST,
//     port:    parseInt(process.env.SMTP_PORT, 10) || 587,
//     secure:  false,
//     requireTLS: true,
//     auth:    { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
//     pool:    true,
//     maxConnections: 5,
//   });
//   logger.info(`📧 Using SMTP for email delivery (from ${MAIL_FROM})`);
// }

// transporter.verify((error, success) => {
//   if (error) {
//     logger.error('📧 Email transporter verification failed:', error);
//   } else {
//     logger.info('📧 Email transporter is ready to send messages');
//   }
// });

// // ── Email HTML Templates ──────────────────────────────────────────
// const getEmailHTML = (template, data) => {
//   const body = {
//     otp_verification: `
//       <h2 style="color:#E85D04">Welcome to Impact Bridge 🌍</h2>
//       <p>Hi <strong>${data?.name}</strong>,</p>
//       <p>Your email verification code is:</p>
//       <div style="background:#f4f4f4;padding:20px;text-align:center;border-radius:8px;margin:20px 0">
//         <h1 style="color:#E85D04;letter-spacing:12px;font-size:36px;margin:0">${data?.otp}</h1>
//       </div>
//       <p>This code expires in <strong>${data?.expiry} minutes</strong>.</p>
//       <p>If you did not request this, please ignore this email.</p>
//     `,
//     password_reset: `
//       <h2 style="color:#E85D04">Password Reset Request 🔐</h2>
//       <p>Hi <strong>${data?.name}</strong>,</p>
//       <p>Click the button below to reset your password. This link expires in <strong>${data?.expiry} minutes</strong>.</p>
//       <div style="text-align:center;margin:30px 0">
//         <a href="${data?.resetUrl}" style="background:#E85D04;color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:bold">Reset Password</a>
//       </div>
//       <p style="color:#999;font-size:12px">If you did not request this, your account is safe — just ignore this email.</p>
//     `,
//     password_changed: `
//       <h2 style="color:#E85D04">Password Changed ✅</h2>
//       <p>Hi <strong>${data?.name}</strong>,</p>
//       <p>Your Impact Bridge password was successfully changed.</p>
//       <p>If you did not make this change, please contact support immediately at support@impactbridge.ng</p>
//     `,
//     donation_receipt: `
//       <h2 style="color:#E85D04">Donation Confirmed 🧡</h2>
//       <p>Hi <strong>${data?.name}</strong>,</p>
//       <p>Thank you for your generous donation of <strong style="color:#E85D04">₦${data?.amount?.toLocaleString()}</strong>.</p>
//       <table style="width:100%;border-collapse:collapse;margin:20px 0">
//         <tr><td style="padding:8px;border:1px solid #eee;background:#f9f9f9"><strong>Reference</strong></td><td style="padding:8px;border:1px solid #eee">${data?.reference}</td></tr>
//         <tr><td style="padding:8px;border:1px solid #eee;background:#f9f9f9"><strong>Amount</strong></td><td style="padding:8px;border:1px solid #eee">₦${data?.amount?.toLocaleString()}</td></tr>
//         <tr><td style="padding:8px;border:1px solid #eee;background:#f9f9f9"><strong>Date</strong></td><td style="padding:8px;border:1px solid #eee">${data?.date}</td></tr>
//       </table>
//       <p>Your donation is traceable and goes directly to the cause. Thank you for building impact! 🌍</p>
//     `,
//     more_info: `
//       <h2 style="color:#E85D04">Additional Information Required 📋</h2>
//       <p>Hi <strong>${data?.name}</strong>,</p>
//       <p>Regarding your request: <strong>${data?.requestTitle}</strong></p>
//       <p>Our verification team needs the following additional information:</p>
//       <div style="background:#fff3cd;padding:16px;border-radius:6px;border-left:4px solid #E85D04;margin:16px 0">
//         <p style="margin:0">${data?.message}</p>
//       </div>
//       <p>Please reply to this email or log in to your account to provide the required information.</p>
//     `,
//   };

//   const content = body[template] || `<p>${data?.body || 'Notification from Impact Bridge'}</p>`;

//   return `
//     <!DOCTYPE html>
//     <html lang="en">
//     <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
//     <body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f0f0f0">
//       <div style="max-width:600px;margin:20px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.1)">
//         <div style="background:#E85D04;padding:24px;text-align:center">
//           <h1 style="color:white;margin:0;font-size:24px">🌍 Impact Bridge</h1>
//           <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:13px">National Social Impact Operating System</p>
//         </div>
//         <div style="padding:32px">
//           ${content}
//         </div>
//         <div style="background:#f9f9f9;padding:20px;text-align:center;border-top:1px solid #eee">
//           <p style="color:#999;font-size:12px;margin:0">© ${new Date().getFullYear()} Impact Bridge · <a href="https://impactbridge.ng" style="color:#E85D04">impactbridge.ng</a></p>
//         </div>
//       </div>
//     </body>
//     </html>
//   `;
// };

// // ── Send Functions ────────────────────────────────────────────────

// const sendEmail = async ({ to, subject, template, data, html }) => {
//   const mailOptions = {
//     to,
//     subject,
//     html: html || getEmailHTML(template, data),
//     from: MAIL_FROM,
//   };

//   try {
//     await transporter.sendMail(mailOptions);
//     logger.info(`📧 Email sent → ${to}`);
//     return true;
//   } catch (err) {
//     logger.error(`📧 Email failed → ${to}: ${err.message}`);

//     if (EMAIL_PROVIDER === 'sendgrid' && SENDGRID_ENABLED && err.message?.includes('verified Sender Identity') && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
//       logger.warn('📧 SendGrid sender identity rejected. Retrying via SMTP fallback.');
//       try {
//         const smtpTransport = createSmtpTransport({
//           host:    process.env.SMTP_HOST,
//           port:    parseInt(process.env.SMTP_PORT, 10) || 587,
//           secure:  false,
//           requireTLS: true,
//           auth:    { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
//           pool:    true,
//           maxConnections: 5,
//         });
//         await smtpTransport.sendMail(mailOptions);
//         logger.info(`📧 Email sent via SMTP fallback → ${to}`);
//         return true;
//       } catch (fallbackErr) {
//         logger.error(`📧 SMTP fallback failed → ${to}: ${fallbackErr.message}`);
//       }
//     }

//     return false;
//   }
// };

// const sendSMS = async ({ to, message }) => {
//   try {
//     const res = await axios.post(`${process.env.TERMII_BASE_URL}/sms/send`, {
//       to,
//       from:    process.env.TERMII_SENDER_ID,
//       sms:     message,
//       type:    'plain',
//       channel: 'generic',
//       api_key: process.env.TERMII_API_KEY,
//     });
//     logger.info(`📱 SMS sent → ${to}`);
//     return res.data;
//   } catch (err) {
//     logger.error(`📱 SMS failed → ${to}: ${err.message}`);
//     return null;
//   }
// };

// const sendPush = async ({ fcm_token, title, body, data = {} }) => {
//   if (!fcm_token) return null;
//   try {
//     const result = await admin.messaging().send({
//       token:        fcm_token,
//       notification: { title, body },
//       data:         Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
//       android:      { notification: { sound: 'default' } },
//       apns:         { payload: { aps: { sound: 'default' } } },
//     });
//     logger.info(`🔔 Push sent: ${result}`);
//     return result;
//   } catch (err) {
//     logger.error(`🔔 Push failed: ${err.message}`);
//     return null;
//   }
// };

// const createInApp = (userId, { title, body, type, data }) =>
//   Notification.create({ user: userId, title, body, type, data, channel: 'in_app' });

// /**
//  * Notify a user across all their preferred channels (in-app, email, push).
//  * Respects notification_preferences.
//  */
// const notifyUser = async (userId, { event, title, body, email, data = {} }) => {
//   try {
//     const user = await User.findById(userId)
//       .select('email phone fcm_token notification_preferences')
//       .lean();
//     if (!user) return;

//     const prefs = user.notification_preferences || {};
//     const tasks = [createInApp(userId, { title, body, type: event, data })];

//     if (prefs.email !== false) {
//       tasks.push(sendEmail({ to: email || user.email, subject: title, template: event, data }));
//     }
//     if (prefs.push !== false && user.fcm_token) {
//       tasks.push(sendPush({ fcm_token: user.fcm_token, title, body, data }));
//     }

//     await Promise.allSettled(tasks);
//   } catch (err) {
//     logger.error(`notifyUser error for ${userId}: ${err.message}`);
//   }
// };

// const getUserNotifications = async (userId, { page = 1, limit = 20, is_read }) => {
//   const skip   = (+page - 1) * +limit;
//   const filter = { user: userId };
//   if (is_read !== undefined) filter.is_read = is_read === 'true';

//   const [notifications, total, unread_count] = await Promise.all([
//     Notification.find(filter).sort('-created_at').skip(skip).limit(+limit).lean(),
//     Notification.countDocuments(filter),
//     Notification.countDocuments({ user: userId, is_read: false }),
//   ]);
//   return { notifications, total, unread_count };
// };

// const markRead    = (id, userId)  => Notification.findOneAndUpdate({ _id: id, user: userId }, { is_read: true, read_at: new Date() }, { new: true });
// const markAllRead = (userId)      => Notification.updateMany({ user: userId, is_read: false }, { is_read: true, read_at: new Date() });

// const broadcast = async (adminId, { title, body, roles, type }) => {
//   const filter = roles?.length ? { role: { $in: roles } } : {};
//   const users  = await User.find(filter).select('_id').lean();
//   await Promise.allSettled(
//     users.map((u) => createInApp(u._id, { title, body, type: type || 'broadcast', data: {} }))
//   );
//   return { sent: users.length };
// };

// module.exports = {
//   sendEmail,
//   sendSMS,
//   sendPush,
//   createInApp,
//   notifyUser,
//   getUserNotifications,
//   markRead,
//   markAllRead,
//   broadcast,
// };