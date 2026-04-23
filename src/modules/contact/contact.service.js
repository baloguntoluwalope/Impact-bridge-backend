'use strict';

const Contact  = require('./contact.model');
const { addJob } = require('../../config/bullmq');
const { paginate, paginationMeta } = require('../../utils/helpers');
const ApiError = require('../../utils/apiError');

const submitContact = async (body, ipAddress) => {
  const contact = await Contact.create({ ...body, ip_address: ipAddress });

  await addJob('email', 'contact_admin_notification', {
    to:      process.env.SMTP_USER,
    subject: `📬 New Contact: ${contact.subject}`,
    html: `
      <h2>New Contact Submission</h2>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:8px;background:#f5f5f5"><strong>Name</strong></td><td style="padding:8px">${contact.name}</td></tr>
        <tr><td style="padding:8px;background:#f5f5f5"><strong>Email</strong></td><td style="padding:8px">${contact.email}</td></tr>
        <tr><td style="padding:8px;background:#f5f5f5"><strong>Phone</strong></td><td style="padding:8px">${contact.phone || 'N/A'}</td></tr>
        <tr><td style="padding:8px;background:#f5f5f5"><strong>Type</strong></td><td style="padding:8px">${contact.type}</td></tr>
        <tr><td style="padding:8px;background:#f5f5f5"><strong>Subject</strong></td><td style="padding:8px">${contact.subject}</td></tr>
        <tr><td style="padding:8px;background:#f5f5f5"><strong>Message</strong></td><td style="padding:8px">${contact.message}</td></tr>
      </table>
    `,
  });

  return contact;
};

const getAllContacts = async (query) => {
  const { page, limit, status, type } = query;
  const { page: p, limit: l, skip } = paginate(page, limit);

  const filter = {};
  if (status) filter.status = status;
  if (type)   filter.type   = type;

  const [contacts, total] = await Promise.all([
    Contact.find(filter).populate('assigned_to', 'first_name last_name').sort('-created_at').skip(skip).limit(l).lean(),
    Contact.countDocuments(filter),
  ]);

  return { contacts, pagination: paginationMeta(total, p, l) };
};

const updateContact = async (contactId, body) => {
  const updates = { ...body };
  if (updates.status === 'resolved') updates.resolved_at = new Date();

  const contact = await Contact.findByIdAndUpdate(contactId, updates, { new: true });
  if (!contact) throw ApiError.notFound('Contact not found');
  return contact;
};

const getContactStats = async () => {
  const [newCount, inProgress, resolved] = await Promise.all([
    Contact.countDocuments({ status: 'new' }),
    Contact.countDocuments({ status: 'in_progress' }),
    Contact.countDocuments({ status: 'resolved' }),
  ]);
  return { new: newCount, in_progress: inProgress, resolved };
};

module.exports = { submitContact, getAllContacts, updateContact, getContactStats };