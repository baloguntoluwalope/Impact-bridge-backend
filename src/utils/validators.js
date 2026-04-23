'use strict';

const Joi = require('joi');

// ── Custom Joi types ─────────────────────────────────────────────
const nigerianPhone = Joi.string()
  .pattern(/^(\+234|234|0)[789][01]\d{8}$/)
  .messages({ 'string.pattern.base': 'Invalid Nigerian phone number (e.g. 08012345678)' });

const strongPassword = Joi.string()
  .min(8)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
  .messages({
    'string.min': 'Password must be at least 8 characters',
    'string.pattern.base': 'Password must include uppercase, lowercase, number and special character (@$!%*?&)',
  });

const SDG_CATEGORIES = [
  'no_poverty','zero_hunger','good_health','quality_education','gender_equality',
  'clean_water','affordable_energy','decent_work','industry_innovation',
  'reduced_inequalities','sustainable_cities','responsible_consumption',
  'climate_action','life_below_water','life_on_land','peace_justice','partnerships',
];

const USER_ROLES = [
  'individual','student','school_admin','community_leader',
  'ngo_partner','donor','government_official','corporate',
];

// ── Validation schemas ───────────────────────────────────────────
const schemas = {

  register: Joi.object({
    first_name:        Joi.string().trim().min(2).max(50).required(),
    last_name:         Joi.string().trim().min(2).max(50).required(),
    email:             Joi.string().email().lowercase().required(),
    phone:             nigerianPhone.required(),
    password:          strongPassword.required(),
    role:              Joi.string().valid(...USER_ROLES).required(),
    state:             Joi.string().required(),
    lga:               Joi.string().required(),
    organization_name: Joi.string().optional(),
  }),

  login: Joi.object({
    email:    Joi.string().email().lowercase().required(),
    password: Joi.string().required(),
  }),

  verifyOtp: Joi.object({
    email: Joi.string().email().required(),
    otp:   Joi.string().length(6).required(),
    type:  Joi.string().valid('email_verification','phone_verification','password_reset').default('email_verification'),
  }),

  forgotPassword: Joi.object({
    email: Joi.string().email().required(),
  }),

  resetPassword: Joi.object({
    token:    Joi.string().required(),
    password: strongPassword.required(),
  }),

  createRequest: Joi.object({
    title:               Joi.string().trim().min(10).max(200).required(),
    description:         Joi.string().trim().min(50).max(5000).required(),
    category:            Joi.string().valid(...SDG_CATEGORIES).required(),
    amount_needed:       Joi.number().positive().max(50000000).required(),
    state:               Joi.string().required(),
    lga:                 Joi.string().required(),
    address:             Joi.string().optional(),
    urgency:             Joi.string().valid('low','medium','high','critical').default('medium'),
    beneficiaries_count: Joi.number().integer().positive().optional(),
    fund_type:           Joi.string().valid('case_funding','student_sponsorship','school_funding','community_project','sdg_club','general_impact').default('case_funding'),
    impact_statement:    Joi.string().max(500).optional(),
    tags:                Joi.array().items(Joi.string()).optional(),
    coordinates:         Joi.object({ lat: Joi.number(), lng: Joi.number() }).optional(),
  }),

  initiatePayment: Joi.object({
    request_id:      Joi.string().optional(),
    fund_type:       Joi.string().valid('case_funding','student_sponsorship','school_funding','community_project','sdg_club','general_impact').required(),
    amount:          Joi.number().positive().min(100).required(),
    currency:        Joi.string().valid('NGN','USD').default('NGN'),
    is_anonymous:    Joi.boolean().default(false),
    message:         Joi.string().max(500).optional(),
    payment_gateway: Joi.string().valid('korapay','paystack','flutterwave').default('korapay'),
  }),

  createProject: Joi.object({
    title:                Joi.string().trim().min(10).max(200).required(),
    description:          Joi.string().trim().min(50).max(5000).required(),
    sdg_goals:            Joi.array().items(Joi.number().integer().min(1).max(17)).min(1).required(),
    state:                Joi.string().required(),
    lga:                  Joi.string().optional(),
    target_states:        Joi.array().items(Joi.string()).optional(),
    beneficiaries_target: Joi.number().integer().positive().required(),
    total_budget:         Joi.number().positive().required(),
    start_date:           Joi.date().optional(),
    end_date:             Joi.date().optional(),
    impact_statement:     Joi.string().max(500).optional(),
    tags:                 Joi.array().items(Joi.string()).optional(),
  }),

  sdgContent: Joi.object({
    sdg_number:      Joi.number().integer().min(1).max(17).required(),
    title:           Joi.string().trim().min(5).max(200).required(),
    body:            Joi.string().trim().min(20).required(),
    content_type:    Joi.string().valid('text','video','audio','pdf','infographic','quiz').required(),
    media_url:       Joi.string().uri().optional(),
    target_audience: Joi.string().valid('all','students','teachers','community','ngo','government','donor').default('all'),
    is_published:    Joi.boolean().default(false),
    student_actions: Joi.array().items(Joi.string()).optional(),
    examples:        Joi.array().items(Joi.string()).optional(),
    club_activity:   Joi.string().optional(),
    read_time:       Joi.number().min(1).optional(),
    language:        Joi.string().valid('en','ha','yo','ig').default('en'),
    tags:            Joi.array().items(Joi.string()).optional(),
  }),

  contact: Joi.object({
    name:    Joi.string().trim().min(2).max(100).required(),
    email:   Joi.string().email().required(),
    phone:   nigerianPhone.optional(),
    subject: Joi.string().trim().min(5).max(200).required(),
    message: Joi.string().trim().min(20).max(2000).required(),
    type:    Joi.string().valid('inquiry','case_inquiry','partnership','report','other').default('inquiry'),
  }),
};

/**
 * Express middleware factory.
 * Usage: validate('register')
 * Validates req.body against the named schema.
 * Sets req.body to the stripped/coerced value on success.
 */
const validate = (schemaName) => (req, res, next) => {
  const schema = schemas[schemaName];
  if (!schema) return next();

  const { error, value } = schema.validate(req.body, {
    abortEarly:    false,
    stripUnknown:  true,
    convert:       true,
  });

  if (error) {
    const errors = error.details.map((d) => ({
      field:   d.path.join('.'),
      message: d.message.replace(/['"]/g, ''),
    }));
    return res.status(400).json({ success: false, message: 'Validation failed', errors });
  }

  req.body = value;
  next();
};

module.exports = { validate, schemas };