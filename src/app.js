'use strict';

require('express-async-errors');

const express       = require('express');
const helmet        = require('helmet');
const cors          = require('cors');
const morgan        = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const xss           = require('xss-clean');
const compression   = require('compression');
const swaggerUi     = require('swagger-ui-express');
const swaggerSpec   = require('./config/swagger');

const { globalLimiter }          = require('./middleware/rateLimiter');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();

/* ─────────────────────────────────────────────
   SECURITY HEADERS
───────────────────────────────────────────── */
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
        styleSrc:   ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
        imgSrc:     ["'self'", 'data:', 'res.cloudinary.com', 'cdn.jsdelivr.net'],
        fontSrc:    ["'self'", 'cdn.jsdelivr.net'],
        connectSrc: ["'self'"],
      },
    },
  })
);

/* ─────────────────────────────────────────────
   CORS
───────────────────────────────────────────── */
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://impact-bridge-frontend.vercel.app',
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // allow tools like Postman

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.log('❌ CORS blocked:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
};

app.use(cors(corsOptions));

// ✅ THIS IS THE KEY FIX
app.options('*', cors(corsOptions));

/* ─────────────────────────────────────────────
   WEBHOOK RAW BODY
   Must come BEFORE express.json() so payment
   providers can verify HMAC signatures
───────────────────────────────────────────── */
app.use('/api/v1/payments/webhook', express.raw({ type: 'application/json' }));

/* ─────────────────────────────────────────────
   BODY PARSING
───────────────────────────────────────────── */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* ─────────────────────────────────────────────
   SANITIZATION
───────────────────────────────────────────── */
app.use(mongoSanitize()); // block MongoDB injection
app.use(xss());           // strip XSS payloads

/* ─────────────────────────────────────────────
   COMPRESSION
───────────────────────────────────────────── */
app.use(compression());

/* ─────────────────────────────────────────────
   HTTP LOGGING
───────────────────────────────────────────── */
if (process.env.NODE_ENV !== 'test') {
  app.use(
    morgan('combined', {
      stream: { write: msg => logger.http(msg.trim()) },
    })
  );
}

/* ─────────────────────────────────────────────
   SWAGGER UI
───────────────────────────────────────────── */
if (process.env.SWAGGER_ENABLED !== 'false') {
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: '🌍 Pathbridge API Docs',
      swaggerOptions: {
        persistAuthorization:    true,   // token survives page refresh
        displayRequestDuration:  true,   // show response time
        filter:                  true,   // tag search
        docExpansion:            'none', // collapsed by default
        tagsSorter:              'alpha',
        operationsSorter:        'alpha',
        tryItOutEnabled:         true,
      },
      customCss: `
        .swagger-ui .topbar { background: #E85D04; padding: 10px 0; }
        .swagger-ui .topbar-wrapper .link span { display: none; }
        .swagger-ui .topbar-wrapper .link::before {
          content: '🌍 PATHBRIDGE API';
          color: white; font-size: 20px; font-weight: bold; letter-spacing: 1px;
        }
        .swagger-ui .topbar-wrapper img          { display: none; }
        .swagger-ui .info .title                 { color: #E85D04; }
        .swagger-ui .btn.execute                 { background: #E85D04; border-color: #E85D04; }
        .swagger-ui .btn.execute:hover           { background: #c24e02; }
        .swagger-ui .opblock.opblock-post        { border-color: #E85D04; }
        .swagger-ui .opblock-summary-method      { background: #E85D04 !important; }
      `,
    })
  );

  // Raw OpenAPI JSON — import into Postman / Insomnia
  app.get('/api/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  logger.info('📖 Swagger UI: /api/docs  |  JSON spec: /api/docs.json');
}

/* ─────────────────────────────────────────────
   GLOBAL RATE LIMITER
───────────────────────────────────────────── */
app.use('/api/', globalLimiter);

/* ─────────────────────────────────────────────
   ROOT + HEALTH
───────────────────────────────────────────── */
/**
 * @swagger
 * /health:
 *   get:
 *     summary: Service health check
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:      { type: string,  example: healthy }
 *                 platform:    { type: string,  example: Pathbridge }
 *                 version:     { type: string,  example: v1 }
 *                 environment: { type: string,  example: production }
 *                 timestamp:   { type: string,  format: date-time }
 *                 uptime:      { type: integer }
 */
app.get('/health', (req, res) => {
  res.status(200).json({
    status:      'healthy',
    platform:    'Pathbridge',
    version:     process.env.API_VERSION || 'v1',
    environment: process.env.NODE_ENV    || 'development',
    timestamp:   new Date().toISOString(),
    uptime:      Math.floor(process.uptime()),
  });
});

app.get('/api/v1', (req, res) => {
  res.json({ success: true, message: 'Pathbridge API v1 is running' });
});

/* ─────────────────────────────────────────────
   SAFE REQUIRE HELPER
───────────────────────────────────────────── */
function safeRequire(path) {
  try {
    return require(path);
  } catch (err) {
    logger.error(`Failed to load ${path}: ${err.message}`);
    return null;
  }
}

/* ─────────────────────────────────────────────
   ROUTES
───────────────────────────────────────────── */
const v1 = express.Router();

const routes = [
  ['auth',         safeRequire('./modules/auth/auth.routes')],
  ['users',        safeRequire('./modules/users/user.routes')],
  ['requests',     safeRequire('./modules/requests/request.routes')],
  ['verification', safeRequire('./modules/verification/verification.routes')],
  ['payments',     safeRequire('./modules/payments/payment.routes')],
  ['wallets',      safeRequire('./modules/wallets/wallet.routes')],
  ['notifications',safeRequire('./modules/notifications/notification.routes')],
  ['dashboards',   safeRequire('./modules/dashboards/dashboard.routes')],
  ['contact',      safeRequire('./modules/contact/contact.routes')],
  ['sdg',          safeRequire('./modules/sdg/sdg.routes')],
  ['reports',      safeRequire('./modules/reports/reports.routes')],
  ['admin',        safeRequire('./modules/admin/admin.routes')],
  ['ngos',         safeRequire('./modules/ngos/ngo.routes')],
  ['projects',     safeRequire('./modules/projects/project.routes')],
  ['analytics',    safeRequire('./modules/analytics/analytics.routes')],
  ['government',   safeRequire('./modules/government/government.routes')],
  ['donors',       safeRequire('./modules/donors/donor.routes')],
  ['whatsapp',     safeRequire('./modules/whatsapp/whatsapp.routes')],
];

routes.forEach(([name, route]) => {
  if (route) {
    logger.info(`✅ /api/v1/${name} loaded`);
    v1.use(`/${name}`, route);
  } else {
    logger.warn(`⚠️  /api/v1/${name} skipped (module failed to load)`);
  }
});

app.use('/api/v1', v1);
logger.info('🚀 API v1 ready at /api/v1');

/* ─────────────────────────────────────────────
   ERROR HANDLERS (must be last)
───────────────────────────────────────────── */
app.use(notFound);
app.use(errorHandler);

module.exports = app;