'use strict';

const Request = require('../requests/request.model');
const Project = require('../projects/project.model');
const ApiError = require('../../utils/apiError');

const PHONE = process.env.WHATSAPP_PHONE || '2349016806482';

const buildLink = (message) =>
  `https://wa.me/${PHONE}?text=${encodeURIComponent(message)}`;

const getContactLink = (type = 'general', subject = '') => {
  const messages = {
    general:     'Hello Impact Bridge! 👋\nI would like to get in touch.',
    partnership: 'Hello Impact Bridge! 🤝\nI am interested in a partnership opportunity.',
    donation:    'Hello Impact Bridge! 💰\nI would like to discuss donation options.',
    ngo:         'Hello Impact Bridge! 🏢\nI represent an NGO and would like to learn more.',
    support:     `Hello Impact Bridge! 🆘\nI need support regarding: ${subject}`,
    volunteer:   'Hello Impact Bridge! 🙋\nI would like to volunteer with your organisation.',
  };

  const text = messages[type] || messages.general;
  return { wa_link: buildLink(text), phone: PHONE };
};

const getCaseLink = async (requestId) => {
  const request = await Request.findById(requestId)
    .select('title state amount_needed amount_raised is_visible category sdg_number donor_count')
    .lean();

  if (!request || !request.is_visible) throw ApiError.notFound('Case not found or not publicly accessible');

  const message =
    `Hello Impact Bridge! 🌍\n\n` +
    `I would like to inquire about this case:\n` +
    `📌 *${request.title}*\n` +
    `📍 Location: ${request.state}\n` +
    `🎯 SDG: ${request.sdg_number} — ${request.category.replace(/_/g,' ')}\n` +
    `💰 Target:  ₦${request.amount_needed?.toLocaleString()}\n` +
    `✅ Raised:  ₦${request.amount_raised?.toLocaleString()}\n` +
    `👥 Donors:  ${request.donor_count}\n\n` +
    `Case ID: ${requestId}\n\n` +
    `How can I contribute?`;

  return { wa_link: buildLink(message), phone: PHONE };
};

const getProjectLink = async (projectId) => {
  const project = await Project.findById(projectId)
    .select('title total_budget amount_funded sdg_goals state is_public creator_type')
    .lean();

  if (!project || !project.is_public) throw ApiError.notFound('Project not found or not publicly accessible');

  const message =
    `Hello Impact Bridge! 🌍\n\n` +
    `I would like to learn more about this project:\n` +
    `📁 *${project.title}*\n` +
    `💰 Budget:    ₦${project.total_budget?.toLocaleString()}\n` +
    `✅ Funded:    ₦${project.amount_funded?.toLocaleString()}\n` +
    `📍 State:     ${project.state}\n` +
    `🎯 SDGs:      ${project.sdg_goals?.join(', ')}\n` +
    `🏢 Type:      ${project.creator_type}\n\n` +
    `Project ID: ${projectId}`;

  return { wa_link: buildLink(message), phone: PHONE };
};

module.exports = { getContactLink, getCaseLink, getProjectLink };