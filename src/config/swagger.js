'use strict';

const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title:       '🌍 Impact Bridge API',
      version:     '2.0.0',
      description: `
## National Social Impact Operating System

**Impact Bridge** connects individuals, students, schools, communities, NGOs, donors, corporates
and government to enable:

> **Verified needs → Transparent funding → Controlled execution → Verified impact → National SDG intelligence**

---

### 🔐 Authentication
1. Register via \`POST /auth/register\`
2. Verify email via \`POST /auth/verify-email\`
3. Login via \`POST /auth/login\` to get \`accessToken\`
4. Click **Authorize** button above → Enter: \`Bearer YOUR_ACCESS_TOKEN\`

---

### ⚡ Core Principles
- No unverified request is visible to donors
- All payments are webhook-verified (Korapay primary, Paystack/Flutterwave fallback)
- No funds disbursed without controlled allocation
- Every action is audit-logged
- State transitions strictly enforced

---

### 🌐 Rate Limits
| Endpoint | Limit |
|---|---|
| Auth (login/register) | 10 req / 15 min |
| OTP | 5 req / hour |
| Payments | 20 req / hour |
| File uploads | 30 req / hour |
| General API | 100 req / 15 min |

---

### 💡 Idempotency
Include \`X-Idempotency-Key: <uuid>\` on payment requests to prevent duplicate charges.
      `,
      contact: {
        name:  'Impact Bridge Support',
        email: 'support@impactbridge.ng',
        url:   'https://impactbridge.ng',
      },
      license: { name: 'MIT' },
    },
    servers: [
      {
        url:         `http://localhost:${process.env.PORT || 5000}/api/v1`,
        description: 'Development Server',
      },
      {
        url:         'https://api.impactbridge.ng/api/v1',
        description: 'Production Server',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type:         'http',
          scheme:       'bearer',
          bearerFormat: 'JWT',
          description:  'JWT access token from POST /auth/login',
        },
      },
      schemas: {
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string',  example: 'Operation successful' },
            data:    { type: 'object' },
          },
        },
        PaginatedResponse: {
          type: 'object',
          properties: {
            success:    { type: 'boolean', example: true },
            message:    { type: 'string' },
            data:       { type: 'array', items: { type: 'object' } },
            pagination: {
              type: 'object',
              properties: {
                total:   { type: 'integer', example: 250 },
                page:    { type: 'integer', example: 1 },
                limit:   { type: 'integer', example: 20 },
                pages:   { type: 'integer', example: 13 },
                hasNext: { type: 'boolean', example: true },
                hasPrev: { type: 'boolean', example: false },
              },
            },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string',  example: 'An error occurred' },
            errors: {
              type:  'array',
              items: {
                type: 'object',
                properties: {
                  field:   { type: 'string', example: 'email' },
                  message: { type: 'string', example: 'Invalid email format' },
                },
              },
            },
          },
        },
        RegisterBody: {
          type:     'object',
          required: ['first_name', 'last_name', 'email', 'phone', 'password', 'role', 'state', 'lga'],
          properties: {
            first_name:        { type: 'string', example: 'Amara',         minLength: 2, maxLength: 50 },
            last_name:         { type: 'string', example: 'Okafor',        minLength: 2, maxLength: 50 },
            email:             { type: 'string', format: 'email', example: 'amara@example.com' },
            phone:             { type: 'string', example: '08012345678',   description: 'Nigerian phone number' },
            password:          { type: 'string', example: 'SecurePass@1',  minLength: 8 },
            role: {
              type:    'string',
              enum:    ['individual', 'student', 'school_admin', 'community_leader', 'ngo_partner', 'donor', 'government_official', 'corporate'],
              example: 'donor',
            },
            state:             { type: 'string', example: 'Lagos' },
            lga:               { type: 'string', example: 'Ikeja' },
            organization_name: { type: 'string', example: 'ABC Corp' },
          },
        },
        LoginBody: {
          type:     'object',
          required: ['email', 'password'],
          properties: {
            email:    { type: 'string', format: 'email', example: 'amara@example.com' },
            password: { type: 'string', example: 'SecurePass@1' },
          },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            success:      { type: 'boolean', example: true },
            message:      { type: 'string',  example: 'Login successful' },
            data: {
              type: 'object',
              properties: {
                accessToken:  { type: 'string' },
                refreshToken: { type: 'string' },
                user: {
                  type: 'object',
                  properties: {
                    _id:               { type: 'string' },
                    email:             { type: 'string' },
                    full_name:         { type: 'string' },
                    role:              { type: 'string' },
                    is_email_verified: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
        User: {
          type: 'object',
          properties: {
            _id:               { type: 'string' },
            first_name:        { type: 'string' },
            last_name:         { type: 'string' },
            email:             { type: 'string' },
            phone:             { type: 'string' },
            role:              { type: 'string' },
            state:             { type: 'string' },
            lga:               { type: 'string' },
            avatar:            { type: 'string', nullable: true },
            total_donated:     { type: 'number' },
            donation_count:    { type: 'integer' },
            is_email_verified: { type: 'boolean' },
            is_active:         { type: 'boolean' },
            created_at:        { type: 'string', format: 'date-time' },
          },
        },
        CreateRequestBody: {
          type:     'object',
          required: ['title', 'description', 'category', 'amount_needed', 'state', 'lga'],
          properties: {
            title: {
              type:      'string',
              example:   'School Roof Repair for 200 Students',
              minLength: 10,
              maxLength: 200,
            },
            description: {
              type:      'string',
              minLength: 50,
              example:   'The roof of Sunshine Primary School collapsed during the rainy season and 200 students are at risk.',
            },
            category: {
              type: 'string',
              enum: [
                'no_poverty', 'zero_hunger', 'good_health', 'quality_education',
                'gender_equality', 'clean_water', 'affordable_energy', 'decent_work',
                'industry_innovation', 'reduced_inequalities', 'sustainable_cities',
                'responsible_consumption', 'climate_action', 'life_below_water',
                'life_on_land', 'peace_justice', 'partnerships',
              ],
              example: 'quality_education',
            },
            amount_needed:       { type: 'number',  example: 500000, minimum: 1000, maximum: 50000000 },
            state:               { type: 'string',  example: 'Lagos' },
            lga:                 { type: 'string',  example: 'Ikeja' },
            urgency:             { type: 'string',  enum: ['low', 'medium', 'high', 'critical'], example: 'high' },
            beneficiaries_count: { type: 'integer', example: 200 },
            fund_type: {
              type:    'string',
              enum:    ['case_funding', 'student_sponsorship', 'school_funding', 'community_project', 'sdg_club', 'general_impact'],
              example: 'case_funding',
            },
            impact_statement: { type: 'string', example: 'Will provide safe learning for 200 students' },
          },
        },
        Request: {
          type: 'object',
          properties: {
            _id:                 { type: 'string' },
            title:               { type: 'string' },
            description:         { type: 'string' },
            category:            { type: 'string' },
            sdg_number:          { type: 'integer', minimum: 1, maximum: 17 },
            amount_needed:       { type: 'number' },
            amount_raised:       { type: 'number' },
            funding_percentage:  { type: 'number' },
            status: {
              type: 'string',
              enum: ['draft', 'submitted', 'under_review', 'verified', 'rejected', 'funded', 'in_progress', 'completed', 'cancelled'],
            },
            urgency:             { type: 'string' },
            state:               { type: 'string' },
            lga:                 { type: 'string' },
            donor_count:         { type: 'integer' },
            beneficiaries_count: { type: 'integer' },
            is_featured:         { type: 'boolean' },
            created_at:          { type: 'string', format: 'date-time' },
          },
        },
        InitiatePaymentBody: {
          type:     'object',
          required: ['fund_type', 'amount'],
          properties: {
            request_id:      { type: 'string',  example: '64f1a2b3c4d5e6f7a8b9c0d1' },
            fund_type: {
              type:    'string',
              enum:    ['case_funding', 'student_sponsorship', 'school_funding', 'community_project', 'sdg_club', 'general_impact'],
              example: 'case_funding',
            },
            amount:          { type: 'number',  example: 10000, minimum: 100 },
            currency:        { type: 'string',  enum: ['NGN', 'USD'], default: 'NGN' },
            is_anonymous:    { type: 'boolean', default: false },
            message:         { type: 'string',  example: 'Keep up the amazing work!' },
            payment_gateway: { type: 'string',  enum: ['korapay', 'paystack', 'flutterwave'], default: 'korapay' },
          },
        },
        PaymentInitResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                reference:    { type: 'string', example: 'PAY-LK4F2A-8B9C0D1E' },
                checkout_url: { type: 'string', example: 'https://checkout.korapay.com/pay/xxx' },
              },
            },
          },
        },
        Payment: {
          type: 'object',
          properties: {
            _id:              { type: 'string' },
            reference:        { type: 'string' },
            amount:           { type: 'number' },
            currency:         { type: 'string' },
            status:           { type: 'string', enum: ['pending', 'processing', 'success', 'failed', 'refunded'] },
            gateway:          { type: 'string' },
            fund_type:        { type: 'string' },
            is_anonymous:     { type: 'boolean' },
            webhook_verified: { type: 'boolean' },
            created_at:       { type: 'string', format: 'date-time' },
          },
        },
        Wallet: {
          type: 'object',
          properties: {
            _id:               { type: 'string' },
            reference:         { type: 'string' },
            wallet_type:       { type: 'string', enum: ['case_wallet', 'project_wallet', 'general_fund', 'emergency_pool', 'sdg_pool'] },
            total_received:    { type: 'number', example: 500000 },
            allocated_funds:   { type: 'number', example: 200000 },
            spent_funds:       { type: 'number', example: 150000 },
            available_balance: { type: 'number', example: 300000 },
            is_frozen:         { type: 'boolean', example: false },
            utilization_rate:  { type: 'number', example: 30 },
          },
        },
        CreateProjectBody: {
          type:     'object',
          required: ['title', 'description', 'sdg_goals', 'state', 'beneficiaries_target', 'total_budget'],
          properties: {
            title:                { type: 'string',  example: 'Clean Water for 1000 Families in Zamfara' },
            description:          { type: 'string',  example: 'This project will drill 5 boreholes across 3 communities in Gusau LGA.' },
            sdg_goals:            { type: 'array',   items: { type: 'integer', minimum: 1, maximum: 17 }, example: [6, 3] },
            state:                { type: 'string',  example: 'Zamfara' },
            lga:                  { type: 'string',  example: 'Gusau' },
            target_states:        { type: 'array',   items: { type: 'string' } },
            beneficiaries_target: { type: 'integer', example: 1000 },
            total_budget:         { type: 'number',  example: 5000000 },
            start_date:           { type: 'string',  format: 'date', example: '2025-01-01' },
            end_date:             { type: 'string',  format: 'date', example: '2025-06-30' },
            impact_statement:     { type: 'string',  example: 'Provide clean water access for 1000 families' },
          },
        },
        SDG: {
          type: 'object',
          properties: {
            number:      { type: 'integer', example: 4 },
            category:    { type: 'string',  example: 'quality_education' },
            title:       { type: 'string',  example: 'Quality Education' },
            description: { type: 'string' },
            color:       { type: 'string',  example: '#C5192D' },
            icon:        { type: 'string',  example: '📚' },
          },
        },
        SDGContentBody: {
          type:     'object',
          required: ['sdg_number', 'title', 'body', 'content_type'],
          properties: {
            sdg_number:      { type: 'integer', minimum: 1, maximum: 17, example: 4 },
            title:           { type: 'string',  example: 'Why Education Matters in Nigeria' },
            body:            { type: 'string',  example: 'Education is the bedrock of development...' },
            content_type:    { type: 'string',  enum: ['text', 'video', 'audio', 'pdf', 'infographic', 'quiz'] },
            media_url:       { type: 'string',  example: 'https://res.cloudinary.com/demo/video/upload/sample.mp4' },
            target_audience: { type: 'string',  enum: ['all', 'students', 'teachers', 'community', 'ngo', 'government', 'donor'], default: 'all' },
            is_published:    { type: 'boolean', default: false },
            student_actions: { type: 'array',   items: { type: 'string' } },
            examples:        { type: 'array',   items: { type: 'string' } },
            club_activity:   { type: 'string' },
            language:        { type: 'string',  enum: ['en', 'ha', 'yo', 'ig'], default: 'en' },
          },
        },
        CreateNGOBody: {
          type:     'object',
          required: ['name'],
          properties: {
            name:                { type: 'string', example: 'Save The Children Nigeria' },
            description:         { type: 'string' },
            contact_email:       { type: 'string', format: 'email' },
            contact_phone:       { type: 'string' },
            website:             { type: 'string' },
            registration_number: { type: 'string' },
            states_of_operation: { type: 'array', items: { type: 'string' } },
            sdg_focus:           { type: 'array', items: { type: 'integer', minimum: 1, maximum: 17 } },
          },
        },
        ContactBody: {
          type:     'object',
          required: ['name', 'email', 'subject', 'message'],
          properties: {
            name:    { type: 'string',  example: 'Chidi Okeke' },
            email:   { type: 'string',  format: 'email', example: 'chidi@example.com' },
            phone:   { type: 'string',  example: '08012345678' },
            subject: { type: 'string',  example: 'Partnership Inquiry', minLength: 5, maxLength: 200 },
            message: { type: 'string',  example: 'We would like to partner with Impact Bridge.', minLength: 20, maxLength: 2000 },
            type:    { type: 'string',  enum: ['inquiry', 'case_inquiry', 'partnership', 'report', 'other'], default: 'inquiry' },
          },
        },
        Notification: {
          type: 'object',
          properties: {
            _id:        { type: 'string' },
            title:      { type: 'string' },
            body:       { type: 'string' },
            type:       { type: 'string' },
            is_read:    { type: 'boolean' },
            channel:    { type: 'string', enum: ['email', 'sms', 'push', 'in_app'] },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
      },
      parameters: {
        PageParam: {
          in: 'query', name: 'page',
          schema: { type: 'integer', default: 1, minimum: 1 },
          description: 'Page number (starts at 1)',
        },
        LimitParam: {
          in: 'query', name: 'limit',
          schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 },
          description: 'Items per page (max 100)',
        },
        IdParam: {
          in: 'path', name: 'id', required: true,
          schema: { type: 'string' },
          description: 'MongoDB ObjectId',
        },
      },
      responses: {
        Unauthorized: {
          description: '401 — Authentication required or token invalid',
          content: {
            'application/json': {
              schema:  { $ref: '#/components/schemas/ErrorResponse' },
              example: { success: false, message: 'No token provided' },
            },
          },
        },
        Forbidden: {
          description: '403 — Insufficient role permissions',
          content: {
            'application/json': {
              schema:  { $ref: '#/components/schemas/ErrorResponse' },
              example: { success: false, message: 'Role is not authorized for this action' },
            },
          },
        },
        NotFound: {
          description: '404 — Resource not found',
          content: {
            'application/json': {
              schema:  { $ref: '#/components/schemas/ErrorResponse' },
              example: { success: false, message: 'Resource not found' },
            },
          },
        },
        ValidationError: {
          description: '400 — Validation failed',
          content: {
            'application/json': {
              schema:  { $ref: '#/components/schemas/ErrorResponse' },
              example: { success: false, message: 'Validation failed', errors: [{ field: 'email', message: 'Invalid email format' }] },
            },
          },
        },
        TooManyRequests: {
          description: '429 — Rate limit exceeded',
          content: {
            'application/json': {
              schema:  { $ref: '#/components/schemas/ErrorResponse' },
              example: { success: false, message: 'Too many requests. Try again later.' },
            },
          },
        },
        Conflict: {
          description: '409 — Resource already exists',
          content: {
            'application/json': {
              schema:  { $ref: '#/components/schemas/ErrorResponse' },
              example: { success: false, message: 'email already exists' },
            },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
    tags: [
      { name: 'Health',        description: 'Service health check' },
      { name: 'Auth',          description: 'Register, login, OTP, password reset' },
      { name: 'Users',         description: 'Profile management' },
      { name: 'Requests',      description: 'Social impact cases' },
      { name: 'Verification',  description: 'Admin/NGO verification engine' },
      { name: 'Payments',      description: 'Korapay payments and webhooks' },
      { name: 'Wallets',       description: 'Escrow wallet management' },
      { name: 'Projects',      description: 'Sponsored projects — NGO/Corporate/Gov' },
      { name: 'Donors',        description: 'Donor browsing and impact tracking' },
      { name: 'NGOs',          description: 'NGO management and operations' },
      { name: 'Government',    description: 'National SDG dashboard and exports' },
      { name: 'SDG',           description: 'Dynamic SDG content CMS' },
      { name: 'Analytics',     description: 'Platform analytics and insights' },
      { name: 'Notifications', description: 'In-app notifications and broadcast' },
      { name: 'Reports',       description: 'Donation and impact reports' },
      { name: 'Contact',       description: 'Contact form management' },
      { name: 'Funding',       description: 'Funding overview and reconciliation' },
      { name: 'Dashboards',    description: 'Role-specific dashboards' },
      { name: 'WhatsApp',      description: 'WhatsApp wa.me link generation' },
      { name: 'Admin',         description: 'Super admin control panel' },
    ],
  },
  apis: ['./src/modules/**/*.routes.js', './src/app.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;