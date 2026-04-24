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

const { errorHandler, notFound } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();

/* ─────────────────────────────────────────────
   SECURITY
───────────────────────────────────────────── */
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
  })
);

/* ─────────────────────────────────────────────
   CORS FIX (ROBUST VERSION)
───────────────────────────────────────────── */
app.use(cors());
// const allowedOrigins = [
//   'http://localhost:5173',
//   'http://127.0.0.1:5173',
//   process.env.FRONTEND_URL, // production frontend
// ].filter(Boolean);

// app.use(
//   cors({
//     origin: (origin, callback) => {
//       // allow REST tools (Postman, server-to-server)
//       if (!origin) return callback(null, true);

//       if (allowedOrigins.includes(origin)) {
//         return callback(null, true);
//       }

//       console.log('❌ CORS blocked:', origin);
//       return callback(null, false); // explicitly block
//     },
//     credentials: true,
//     methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
//     allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
//   })
// );

// // IMPORTANT: preflight must be enabled properly
// app.options('*', cors());

/* ─────────────────────────────────────────────
   BODY PARSING
───────────────────────────────────────────── */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* ─────────────────────────────────────────────
   SANITIZATION
───────────────────────────────────────────── */
app.use(mongoSanitize());
app.use(xss());

/* ─────────────────────────────────────────────
   COMPRESSION
───────────────────────────────────────────── */
app.use(compression());

/* ─────────────────────────────────────────────
   LOGGING
───────────────────────────────────────────── */
if (process.env.NODE_ENV !== 'test') {
  app.use(
    morgan('combined', {
      stream: { write: msg => logger.http(msg.trim()) },
    })
  );
}

/* ─────────────────────────────────────────────
   ROOT ROUTE
───────────────────────────────────────────── */
app.get('/api/v1', (req, res) => {
  res.json({
    success: true,
    message: 'Impact Bridge API v1 is running',
  });
});

/* ─────────────────────────────────────────────
   HEALTH CHECK
───────────────────────────────────────────── */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/* ─────────────────────────────────────────────
   SAFE REQUIRE
───────────────────────────────────────────── */
function safeRequire(path) {
  try {
    return require(path);
  } catch (err) {
    console.error(`❌ Failed to load ${path}:`, err.message);
    return null;
  }
}

/* ─────────────────────────────────────────────
   ROUTES
───────────────────────────────────────────── */
const v1 = express.Router();

const routes = [
  ['auth', safeRequire('./modules/auth/auth.routes')],
  ['users', safeRequire('./modules/users/user.routes')],
  ['requests', safeRequire('./modules/requests/request.routes')],
  ['verification', safeRequire('./modules/verification/verification.routes')],
  ['payments', safeRequire('./modules/payments/payment.routes')],
  ['wallets', safeRequire('./modules/wallets/wallet.routes')],
  ['notifications', safeRequire('./modules/notifications/notification.routes')],
  ['dashboards', safeRequire('./modules/dashboards/dashboard.routes')],
  ['contact', safeRequire('./modules/contact/contact.routes')],
  ['sdg', safeRequire('./modules/sdg/sdg.routes')],
  ['reports', safeRequire('./modules/reports/reports.routes')],
  ['admin', safeRequire('./modules/admin/admin.routes')],
  ['ngos', safeRequire('./modules/ngos/ngo.routes')],
  ['projects', safeRequire('./modules/projects/project.routes')],
  ['analytics', safeRequire('./modules/analytics/analytics.routes')],
  ['government', safeRequire('./modules/government/government.routes')],
  ['donors', safeRequire('./modules/donors/donor.routes')],
  ['whatsapp', safeRequire('./modules/whatsapp/whatsapp.routes')],
];

routes.forEach(([name, route]) => {
  if (route) {
    console.log(`✅ /api/v1/${name} loaded`);
    v1.use(`/${name}`, route);
  } else {
    console.warn(`⚠️ /api/v1/${name} skipped`);
  }
});

app.use('/api/v1', v1);

console.log('🚀 API v1 READY at /api/v1');

/* ─────────────────────────────────────────────
   ERROR HANDLERS
───────────────────────────────────────────── */
app.use(notFound);
app.use(errorHandler);

module.exports = app;


// 'use strict';

// require('express-async-errors');

// const express       = require('express');
// const helmet        = require('helmet');
// const cors          = require('cors');
// const morgan        = require('morgan');
// const mongoSanitize = require('express-mongo-sanitize');
// const xss           = require('xss-clean');
// const compression   = require('compression');
// const swaggerUi     = require('swagger-ui-express');
// const swaggerSpec   = require('./config/swagger');

// const { globalLimiter }           = require('./middleware/rateLimiter');
// const { errorHandler, notFound }  = require('./middleware/errorHandler');
// const logger = require('./utils/logger');

// // ── Import all route modules ──────────────────────────────────────
// const authRoutes         = require('./modules/auth/auth.routes');
// const userRoutes         = require('./modules/users/user.routes');
// const requestRoutes      = require('./modules/requests/request.routes');
// const verificationRoutes = require('./modules/verification/verification.routes');
// const paymentRoutes      = require('./modules/payments/payment.routes');
// const walletRoutes       = require('./modules/wallets/wallet.routes');
// const notifRoutes        = require('./modules/notifications/notification.routes');
// const dashboardRoutes    = require('./modules/dashboards/dashboard.routes');
// const contactRoutes      = require('./modules/contact/contact.routes');
// const sdgRoutes          = require('./modules/sdg/sdg.routes');
// const reportRoutes       = require('./modules/reports/reports.routes');
// const adminRoutes        = require('./modules/admin/admin.routes');
// const ngoRoutes          = require('./modules/ngos/ngo.routes');
// const projectRoutes      = require('./modules/projects/project.routes');
// const analyticsRoutes    = require('./modules/analytics/analytics.routes');
// const governmentRoutes   = require('./modules/government/government.routes');
// const donorRoutes        = require('./modules/donors/donor.routes');
// const whatsappRoutes     = require('./modules/whatsapp/whatsapp.routes');
// // const verificationRoutes = require('./modules/verification/verification.routes');

// const app = express();

// // ── 1. Security headers ───────────────────────────────────────────
// app.use(helmet({
//   crossOriginEmbedderPolicy: false,
//   contentSecurityPolicy: {
//     directives: {
//       defaultSrc: ["'self'"],
//       scriptSrc:  ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
//       styleSrc:   ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
//       imgSrc:     ["'self'", 'data:', 'res.cloudinary.com', 'cdn.jsdelivr.net'],
//       fontSrc:    ["'self'", 'cdn.jsdelivr.net'],
//       connectSrc: ["'self'"],
//     },
//   },
// }));

// // ── 2. CORS ───────────────────────────────────────────────────────
// app.use(cors({
//   origin: (origin, callback) => {
//     const allowed = (process.env.ALLOWED_ORIGINS || '')
//       .split(',')
//       .map((o) => o.trim())
//       .filter(Boolean);

//     // Allow in dev, block unknown origins in production
//     if (!origin || allowed.includes(origin) || process.env.NODE_ENV !== 'production') {
//       callback(null, true);
//     } else {
//       callback(new Error(`CORS blocked: ${origin}`));
//     }
//   },
//   methods:        ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
//   allowedHeaders: ['Content-Type','Authorization','X-Idempotency-Key'],
//   credentials:    true,
// }));

// // ── 3. Webhook raw body (MUST come before JSON parser) ────────────
// // Korapay and Paystack need the raw body for HMAC signature verification
// app.use('/api/v1/payments/webhook', express.raw({ type: 'application/json' }));

// // ── 4. Body parsing ───────────────────────────────────────────────
// app.use(express.json({ limit: '10mb' }));
// app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// // ── 5. Data sanitization ──────────────────────────────────────────
// app.use(mongoSanitize()); // Prevent MongoDB injection (removes $ and . from input)
// app.use(xss());           // Sanitize HTML to prevent XSS

// // ── 6. Compression ────────────────────────────────────────────────
// app.use(compression());

// // ── 7. HTTP request logging ───────────────────────────────────────
// if (process.env.NODE_ENV !== 'test') {
//   app.use(morgan('combined', {
//     stream: { write: (message) => logger.http(message.trim()) },
//   }));
// }

// // ── 8. Swagger UI ─────────────────────────────────────────────────
// if (process.env.SWAGGER_ENABLED !== 'false') {
//   // Interactive API documentation UI
//   app.use(
//     '/api/docs',
//     swaggerUi.serve,
//     swaggerUi.setup(swaggerSpec, {
//       customSiteTitle: '🌍 Impact Bridge API Docs',
//       swaggerOptions: {
//         persistAuthorization: true,       // Token persists on page refresh
//         displayRequestDuration: true,     // Show response time per request
//         filter:                 true,     // Enable search/filter by tag
//         docExpansion:           'none',   // Collapse all tags by default
//         tagsSorter:             'alpha',  // Sort tags alphabetically
//         operationsSorter:       'alpha',  // Sort operations alphabetically
//         tryItOutEnabled:        true,     // Enable "Try it out" by default
//       },
//       customCss: `
//         /* Brand the Swagger UI with Impact Bridge colors */
//         .swagger-ui .topbar                    { background: #E85D04; padding: 10px 0; }
//         .swagger-ui .topbar-wrapper .link span { display: none; }
//         .swagger-ui .topbar-wrapper .link::before {
//           content: '🌍 IMPACT BRIDGE API';
//           color: white;
//           font-size: 20px;
//           font-weight: bold;
//           letter-spacing: 1px;
//         }
//         .swagger-ui .topbar-wrapper img     { display: none; }
//         .swagger-ui .info .title            { color: #E85D04; }
//         .swagger-ui .btn.execute            { background: #E85D04; border-color: #E85D04; }
//         .swagger-ui .btn.execute:hover      { background: #c24e02; }
//         .swagger-ui .opblock.opblock-post   { border-color: #E85D04; }
//         .swagger-ui .opblock-summary-method { background: #E85D04 !important; }
//       `,
//     })
//   );

//   // Raw OpenAPI JSON spec — import into Postman/Insomnia
//   app.get('/api/docs.json', (req, res) => {
//     res.setHeader('Content-Type', 'application/json');
//     res.send(swaggerSpec);
//   });

//   logger.info('📖 Swagger UI: /api/docs | JSON spec: /api/docs.json');
// }

// // ── 9. Global rate limiter ────────────────────────────────────────
// app.use('/api/', globalLimiter);

// // ── 10. Health check ──────────────────────────────────────────────
// /**
//  * @swagger
//  * /health:
//  *   get:
//  *     summary: Service health check
//  *     description: Returns server status, version and uptime. No authentication required.
//  *     tags: [Health]
//  *     security: []
//  *     responses:
//  *       200:
//  *         description: Server is healthy
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 status:      { type: string,  example: healthy }
//  *                 platform:    { type: string,  example: Impact Bridge }
//  *                 version:     { type: string,  example: v1 }
//  *                 environment: { type: string,  example: production }
//  *                 timestamp:   { type: string,  format: date-time }
//  *                 uptime:      { type: integer, description: Seconds since server started }
//  */
// app.get('/health', (req, res) => {
//   res.status(200).json({
//     status:      'healthy',
//     platform:    'Impact Bridge',
//     version:     process.env.API_VERSION || 'v1',
//     environment: process.env.NODE_ENV    || 'development',
//     timestamp:   new Date().toISOString(),
//     uptime:      Math.floor(process.uptime()),
//   });
// });

// const v1 = express.Router();

// try {
//   v1.use('/auth', authRoutes);
//   v1.use('/users', userRoutes);
//   v1.use('/requests', requestRoutes);
//   v1.use('/verification', verificationRoutes);
//   v1.use('/payments', paymentRoutes);
//   v1.use('/wallets', walletRoutes);
//   v1.use('/notifications', notifRoutes);
//   v1.use('/dashboards', dashboardRoutes);
//   v1.use('/contact', contactRoutes);
//   v1.use('/sdg', sdgRoutes);
//   v1.use('/reports', reportRoutes);
//   v1.use('/admin', adminRoutes);
//   v1.use('/ngos', ngoRoutes);
//   v1.use('/projects', projectRoutes);
//   v1.use('/analytics', analyticsRoutes);
//   v1.use('/government', governmentRoutes);
//   v1.use('/donors', donorRoutes);
//   v1.use('/whatsapp', whatsappRoutes);

//   logger.info("✅ All v1 routes mounted successfully");
// } catch (err) {
//   logger.error("❌ v1 route loading failed:", err.message);
// }

// app.use('/api/v1', v1);

// // ── 12. 404 + Global error handler ────────────────────────────────
// app.use(notFound);
// app.use(errorHandler);

// module.exports = app;