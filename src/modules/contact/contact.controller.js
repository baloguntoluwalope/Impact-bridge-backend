'use strict';

const svc = require('./contact.service');
const R   = require('../../utils/apiResponse');

module.exports = {
  submit:     async (req, res) => R.created(res, null, 'Your message has been received. We will respond within 48 hours.'),
  getAll:     async (req, res) => { const d = await svc.getAllContacts(req.query); R.paginated(res, d.contacts, d.pagination); },
  update:     async (req, res) => R.success(res, await svc.updateContact(req.params.id, req.body), 'Contact updated'),
  getStats:   async (req, res) => R.success(res, await svc.getContactStats(), 'Contact statistics'),

  // Override submit to actually call service
  submitFull: async (req, res) => {
    await svc.submitContact(req.body, req.ip);
    R.created(res, null, 'Your message has been received. We will respond within 48 hours.');
  },
};