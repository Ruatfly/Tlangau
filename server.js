const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const { body, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const path = require('path');
const axios = require('axios');
const Database = require('./database');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'production';
const IS_PROD = NODE_ENV === 'production';

// ==================== SERVICE DEFINITIONS ====================
// Services available for purchase – statistics is always free
const PAID_SERVICES = {
  ring: { name: 'Ring Notification', price: 10 },
  message: { name: 'Message Notification', price: 10 },
  broadcast: { name: 'Broadcast Message', price: 10 },
};
const FREE_SERVICES = ['statistics', 'poll'];
const VALID_SERVICE_IDS = Object.keys(PAID_SERVICES);
const SERVICE_PRICE = 10; // ₹10 per service (configurable)
const ACCESS_PLANS = {
  monthly: { id: 'monthly', label: '1 Month', validityDays: 30 },
  yearly: { id: 'yearly', label: '1 Year', validityDays: 365, flatPrice: 100 },
};
const VALID_PLAN_IDS = Object.keys(ACCESS_PLANS);

// ==================== PAYMENT SESSION CONFIG ====================
const PAYMENT_SESSION_MINUTES = 10;
const ACCESS_GRACE_PERIOD_HOURS = 24;
const ACCESS_GRACE_PERIOD_MS = ACCESS_GRACE_PERIOD_HOURS * 60 * 60 * 1000;

// ==================== ADMIN PASSWORD ====================
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  console.error('❌ FATAL: ADMIN_PASSWORD environment variable is not set!');
  console.error('   Set ADMIN_PASSWORD in your .env file or environment variables.');
  if (IS_PROD) {
    console.error('   Server will NOT start without ADMIN_PASSWORD in production.');
    process.exit(1);
  } else {
    console.warn('   ⚠️  Using insecure default for development ONLY.');
  }
}
const ADMIN_PASSWORD_FINAL = ADMIN_PASSWORD || 'dev-only-change-me';

// ==================== ALLOWED ORIGINS ====================
const allowedOrigins = [
  'https://ruatfly.github.io',
  'https://tlangau.onrender.com',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:10000',
];

// ==================== SECURITY MIDDLEWARE ====================

// Trust proxy (required for Render, Railway, etc.)
app.set('trust proxy', 1);

// HTTPS redirect in production
if (IS_PROD) {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.hostname}${req.url}`);
    }
    next();
  });
}

// Helmet – secure HTTP headers with proper CSP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://tlangau.onrender.com", "https://www.instamojo.com", "http://localhost:*"],
      fontSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// Gzip compression
app.use(compression());

// Request logging
app.use((req, res, next) => {
  if (!IS_PROD || req.url.startsWith('/api/')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} | IP: ${req.ip}`);
  }
  next();
});

// CORS
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(o => origin.startsWith(o))) {
      return callback(null, true);
    }
    if (!IS_PROD) {
      console.warn(`⚠️  CORS: allowing unlisted origin in dev mode: ${origin}`);
      return callback(null, true);
    }
    console.warn(`🚫 CORS blocked origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'x-admin-password'],
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Body parsers
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

// ==================== RATE LIMITING ====================

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many payment attempts. Please wait a few minutes.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again later.' },
});

const fcmLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Notification rate limit exceeded. Please wait a few minutes.' },
});

app.use('/api/', generalLimiter);

// ==================== STATIC FILES (from public/ folder only) ====================
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: IS_PROD ? '1d' : 0,
  etag: true,
}));

// ==================== DATABASE ====================

const db = new Database();
db.init().catch(err => {
  console.error('❌ Database initialization failed:', err.message);
});

// ==================== EMAIL SERVICE ====================

const EMAIL_SERVICE = process.env.EMAIL_SERVICE || 'gmail';
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

let transporter = null;

if (EMAIL_SERVICE === 'sendgrid' && SENDGRID_API_KEY) {
  const sgMail = require('@sendgrid/mail');
  sgMail.setApiKey(SENDGRID_API_KEY);
  transporter = { type: 'sendgrid', client: sgMail };
  console.log('📧 Email service: SendGrid');
} else if (EMAIL_SERVICE === 'brevo') {
  const BREVO_PORT = parseInt(process.env.EMAIL_PORT) || 2525;
  transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: BREVO_PORT,
    secure: false,
    requireTLS: true,
    name: 'tlangau.onrender.com',
    authMethod: 'LOGIN',
    auth: {
      user: (process.env.EMAIL_USER || '').replace(/[^\x20-\x7E]/g, '').trim(),
      pass: (process.env.EMAIL_PASS || '').replace(/[^\x20-\x7E]/g, '').trim(),
    },
    tls: {
      rejectUnauthorized: IS_PROD,
      minVersion: 'TLSv1.2',
    },
    logger: false,
    debug: false,
    connectionTimeout: 15000,
  });
  console.log(`📧 Email service: Brevo (port ${BREVO_PORT})`);
} else {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: (process.env.EMAIL_USER || '').trim(),
      pass: (process.env.EMAIL_PASS || '').trim(),
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
    secure: true,
    pool: true,
    maxConnections: 1,
    maxMessages: 3,
  });
  console.log('📧 Email service: Gmail SMTP');
  if (!process.env.EMAIL_USER) {
    console.warn('   ⚠️  EMAIL_USER not set – emails will fail.');
  }
}

// Verify email config on startup
async function verifyEmailConfig() {
  if (EMAIL_SERVICE === 'sendgrid') {
    if (!SENDGRID_API_KEY) {
      console.error('❌ SENDGRID_API_KEY not set – emails will NOT work!');
      return false;
    }
    console.log('✅ SendGrid configured');
    return true;
  }

  const emailUser = (process.env.EMAIL_USER || '').replace(/[^\x20-\x7E]/g, '').trim();
  const emailPass = (process.env.EMAIL_PASS || '').replace(/[^\x20-\x7E]/g, '').trim();

  if (!emailUser || !emailPass) {
    console.error('❌ EMAIL_USER / EMAIL_PASS not set – emails will NOT work!');
    return false;
  }

  try {
    console.log(`📧 Verifying ${EMAIL_SERVICE} SMTP connection...`);
    await Promise.race([
      transporter.verify(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Verification timeout (>15s)')), 15000)),
    ]);
    console.log('✅ Email service verified and ready');
    return true;
  } catch (error) {
    console.warn('⚠️  Email verification failed (non-critical):', error.message);
    if (error.code === 'EAUTH') {
      console.error('   → Check EMAIL_USER and EMAIL_PASS');
    } else if (error.message.includes('timeout')) {
      console.error('   → Connection timeout – try EMAIL_PORT=2525 for Brevo');
    }
    return true;
  }
}

verifyEmailConfig().catch(err => {
  console.error('⚠️  Email verification error:', err.message);
});

// ==================== FIREBASE ====================

let admin = null;
let firebaseInitialized = false;

function checkFirebaseReady() {
  if (db.admin) {
    admin = db.admin;
    firebaseInitialized = true;
    return true;
  }
  return false;
}

async function waitForFirebaseReady(maxWaitMs = 15000) {
  if (checkFirebaseReady()) return true;
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    await new Promise(resolve => setTimeout(resolve, 500));
    if (checkFirebaseReady()) {
      console.log(`✅ Firebase ready after ${Date.now() - startTime}ms`);
      return true;
    }
  }
  console.error(`❌ Firebase not ready after ${maxWaitMs}ms`);
  return false;
}

const firebaseCheckInterval = setInterval(() => {
  if (checkFirebaseReady()) {
    console.log('✅ Firebase Admin confirmed ready');
    clearInterval(firebaseCheckInterval);
  }
}, 2000);
setTimeout(() => clearInterval(firebaseCheckInterval), 30000);

setTimeout(() => {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON &&
      !process.env.FIREBASE_SERVICE_ACCOUNT_PATH &&
      !require('fs').existsSync(path.join(__dirname, 'service-account-key.json'))) {
    console.warn('⚠️  FIREBASE WARNING: No service account found. Database will NOT work!');
  }
}, 3000);

// ==================== HELPERS ====================

// Cryptographically secure access code generation
function generateAccessCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.randomBytes(12);
  let code = '';
  for (let i = 0; i < 12; i++) {
    code += chars.charAt(bytes[i] % chars.length);
  }
  return code;
}

// Get human-readable service names for display
function getServiceNames(services) {
  if (!services || services.length === 0) return ['All Services'];
  return services.map(s => PAID_SERVICES[s]?.name || s);
}

function getPlanInfo(planId) {
  return ACCESS_PLANS[planId] || ACCESS_PLANS.monthly;
}

function getValidityText(validityDays) {
  if (validityDays >= 365) return '1 year';
  return `${validityDays} days`;
}

function computePlanAmount(services, planId) {
  const plan = getPlanInfo(planId);
  if (typeof plan.flatPrice === 'number') return plan.flatPrice;
  return (services?.length || 0) * SERVICE_PRICE;
}

function toTimestamp(dateLike) {
  const ts = new Date(dateLike).getTime();
  return Number.isNaN(ts) ? null : ts;
}

function getGraceWindowEnd(expiresAt) {
  const expiryTs = toTimestamp(expiresAt);
  if (expiryTs === null) return null;
  return new Date(expiryTs + ACCESS_GRACE_PERIOD_MS).toISOString();
}

function isWithinAccessWindow(expiresAt, nowTs = Date.now()) {
  const graceEndIso = getGraceWindowEnd(expiresAt);
  if (!graceEndIso) return false;
  const graceEndTs = toTimestamp(graceEndIso);
  return graceEndTs !== null && nowTs <= graceEndTs;
}

function stackExpiry(currentExpiryRaw, validityDays) {
  const durationMs = Math.max(1, Number(validityDays) || 30) * 24 * 60 * 60 * 1000;
  const currentExpiryTs = toTimestamp(currentExpiryRaw) || 0;
  const baseTs = Math.max(Date.now(), currentExpiryTs);
  return new Date(baseTs + durationMs).toISOString();
}

// Build email HTML with service info
function buildAccessCodeEmailHtml(code, services, validityDays = 30) {
  const serviceNames = getServiceNames(services);
  const servicesHtml = serviceNames.map(s => `<li style="padding: 4px 0;">✅ ${s}</li>`).join('');
  const totalAmount = (services && services.length > 0) ? services.length * SERVICE_PRICE : SERVICE_PRICE;
  const validityText = getValidityText(validityDays);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .code-box { background: #fff; border: 2px dashed #667eea; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
        .code { font-size: 24px; font-weight: bold; color: #667eea; letter-spacing: 3px; font-family: 'Courier New', monospace; }
        .services-box { background: #fff; padding: 15px 20px; margin: 15px 0; border-radius: 8px; border-left: 4px solid #48bb78; }
        .free-badge { background: #48bb78; color: white; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: bold; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 Welcome to Tlangau</h1>
        </div>
        <div class="content">
          <p>Thank you for your purchase of <strong>₹${totalAmount}</strong>!</p>
          <p>Your access code has been generated successfully.</p>
          
          <div class="code-box">
            <p style="margin: 0 0 10px 0; color: #666;">Your Access Code:</p>
            <div class="code">${code}</div>
          </div>

          <div class="services-box">
            <p style="margin: 0 0 8px 0; font-weight: bold; color: #333;">📦 Your Purchased Services:</p>
            <ul style="list-style: none; padding: 0; margin: 0;">
              ${servicesHtml}
              <li style="padding: 4px 0;">📊 Statistics & Insights <span class="free-badge">FREE</span></li>
            </ul>
          </div>
          
          <p><strong>Important:</strong></p>
          <ul>
            <li>This code can only be used once per account</li>
            <li>Enter this code in the "Access Code" field when signing in</li>
            <li>Keep this code secure and do not share it</li>
            <li>Code is valid for ${validityText} from purchase</li>
            <li>Only the services you purchased will be accessible</li>
          </ul>
          
          <p>If you have any questions, please contact our support team.</p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} Tlangau. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Send access code email with retry logic
async function sendAccessCodeEmail(email, code, services, validityDays = 30, retries = 3) {
  const emailUser = (process.env.EMAIL_USER || '').replace(/[^\x20-\x7E]/g, '').trim();
  const emailPass = (process.env.EMAIL_PASS || '').replace(/[^\x20-\x7E]/g, '').trim();

  if (EMAIL_SERVICE === 'sendgrid') {
    if (!SENDGRID_API_KEY) {
      console.error('❌ SendGrid API key not configured');
      return false;
    }
  } else {
    if (!emailUser || !emailPass) {
      console.error('❌ Email service not configured (EMAIL_USER/EMAIL_PASS missing)');
      return false;
    }
  }

  const htmlContent = buildAccessCodeEmailHtml(code, services, validityDays);

  const mailOptions = {
    from: (process.env.EMAIL_FROM || 'ruatfelachhakchhuak243@gmail.com').trim(),
    to: email,
    subject: 'Your Tlangau Access Code',
    html: htmlContent,
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`📧 Sending access code to ${email} (attempt ${attempt}/${retries})`);

      if (EMAIL_SERVICE === 'sendgrid' && transporter && transporter.type === 'sendgrid') {
        const msg = {
          to: email,
          from: process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_USER || 'noreply@tlangau.com',
          subject: 'Your Tlangau Access Code',
          html: htmlContent,
        };
        await Promise.race([
          transporter.client.send(msg),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Email timeout (30s)')), 30000)),
        ]);
        console.log(`✅ Email sent via SendGrid to ${email}`);
        return true;
      } else {
        const info = await Promise.race([
          transporter.sendMail(mailOptions),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Email timeout (30s)')), 30000)),
        ]);
        console.log(`✅ Email sent to ${email} (ID: ${info.messageId})`);
        return true;
      }
    } catch (error) {
      console.error(`❌ Email failed (attempt ${attempt}/${retries}): ${error.message}`);
      if (error.code === 'EAUTH') {
        console.error('   → Authentication failed – check EMAIL_USER/EMAIL_PASS');
        return false;
      }
      if (attempt < retries) {
        const waitTime = attempt * 2000;
        console.log(`   ⏳ Retrying in ${waitTime / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        console.error('   ❌ All retries exhausted. Email NOT sent.');
      }
    }
  }
  return false;
}

// ==================== INSTAMOJO CONFIG ====================

const INSTAMOJO_ENV = process.env.INSTAMOJO_ENV || 'test';
const INSTAMOJO_API_BASE = 'https://www.instamojo.com/api/1.1';
const INSTAMOJO_API_KEY = process.env.INSTAMOJO_API_KEY;
const INSTAMOJO_AUTH_TOKEN = process.env.INSTAMOJO_AUTH_TOKEN;
const INSTAMOJO_PRIVATE_SALT = process.env.INSTAMOJO_PRIVATE_SALT;

// Verify Instamojo webhook MAC signature
function verifyWebhookMAC(data) {
  if (!INSTAMOJO_PRIVATE_SALT) {
    if (IS_PROD) {
      console.error('❌ INSTAMOJO_PRIVATE_SALT not set – rejecting webhook in production');
      return false;
    }
    console.warn('⚠️  INSTAMOJO_PRIVATE_SALT not set – skipping MAC verification (dev only)');
    return true;
  }

  const mac = data.mac;
  if (!mac) {
    console.error('❌ Webhook missing MAC signature');
    return false;
  }

  // Build message: sort all field keys (except mac), join values with |
  const fieldsToSign = { ...data };
  delete fieldsToSign.mac;

  const sortedKeys = Object.keys(fieldsToSign).sort();
  const message = sortedKeys.map(key => fieldsToSign[key]).join('|');

  const expectedMac = crypto
    .createHmac('sha1', INSTAMOJO_PRIVATE_SALT)
    .update(message)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(mac, 'hex'),
      Buffer.from(expectedMac, 'hex')
    );
  } catch {
    return false;
  }
}

// ==================== STARTUP LOG ====================

console.log('');
console.log('═══════════════════════════════════════════');
console.log('  🚀 Tlangau Server – Starting Up');
console.log('═══════════════════════════════════════════');
console.log(`  Environment:   ${NODE_ENV}`);
console.log(`  Port:          ${PORT}`);
console.log(`  Payment:       ${INSTAMOJO_API_KEY ? `Instamojo (${INSTAMOJO_ENV})` : 'Not configured'}`);
console.log(`  Webhook MAC:   ${INSTAMOJO_PRIVATE_SALT ? 'Enabled' : 'DISABLED (set INSTAMOJO_PRIVATE_SALT)'}`);
console.log(`  Email:         ${process.env.EMAIL_USER ? EMAIL_SERVICE : 'Not configured'}`);
console.log(`  Admin:         ${ADMIN_PASSWORD ? 'Configured' : 'NOT SET!'}`);
console.log(`  Session TTL:   ${PAYMENT_SESSION_MINUTES} minutes`);
console.log(`  Services:      ${VALID_SERVICE_IDS.join(', ')} (₹${SERVICE_PRICE} each)`);
console.log(`  Plans:         monthly(30d), yearly(365d, ₹100 flat)`);
console.log('═══════════════════════════════════════════');
console.log('');

// ==================== API ROUTES ====================

// Health check
app.get('/api/health', (req, res) => {
  checkFirebaseReady();
  res.json({
    status: 'ok',
    message: 'Tlangau Server API is running',
    firebaseReady: firebaseInitialized,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Service info endpoint (for frontend to know available services & pricing)
app.get('/api/services', (req, res) => {
  res.json({
    success: true,
    services: Object.entries(PAID_SERVICES).map(([id, info]) => ({
      id,
      name: info.name,
      price: info.price,
    })),
    freeServices: FREE_SERVICES.map(id => ({
      id,
      name: id === 'statistics' ? 'Statistics & Insights' : id === 'poll' ? 'Community Poll' : id,
    })),
    pricePerService: SERVICE_PRICE,
    plans: Object.values(ACCESS_PLANS).map(plan => ({
      id: plan.id,
      label: plan.label,
      validityDays: plan.validityDays,
      flatPrice: plan.flatPrice ?? null,
    })),
    currency: 'INR',
  });
});

// ==================== PAYMENT ROUTES ====================

// Create payment link with service selection
app.post(
  '/api/create-payment',
  paymentLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('services').isArray({ min: 1 }).withMessage('At least one service must be selected'),
    body('services.*').isIn(VALID_SERVICE_IDS).withMessage('Invalid service selected'),
    body('planDuration').optional().isIn(VALID_PLAN_IDS).withMessage('Invalid plan selected'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const firstError = errors.array()[0];
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          message: firstError?.msg || 'Invalid request data',
        });
      }

      if (!INSTAMOJO_API_KEY || !INSTAMOJO_AUTH_TOKEN) {
        return res.status(500).json({
          success: false,
          error: 'Payment gateway not configured.',
        });
      }

      const { email, services } = req.body;
      const planDuration = VALID_PLAN_IDS.includes(req.body.planDuration)
        ? req.body.planDuration
        : 'monthly';
      const plan = getPlanInfo(planDuration);
      // Deduplicate services
      const uniqueServices = [...new Set(services)].filter(s => VALID_SERVICE_IDS.includes(s));

      if (uniqueServices.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'At least one valid service must be selected.',
        });
      }

      // Calculate amount server-side (never trust client amount)
      const amount = computePlanAmount(uniqueServices, plan.id);
      const orderId = `order_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
      const emailLower = email.toLowerCase().trim();

      const serviceNames = uniqueServices.map(s => PAID_SERVICES[s].name).join(', ');
      console.log(`📝 New payment: ${emailLower} | ₹${amount} | ${orderId} | Plan: ${plan.id} | Services: ${serviceNames}`);

      // Create order in database with services
      await db.createOrder({
        orderId,
        email: emailLower,
        amount: amount * 100, // Store in paise
        status: 'PENDING',
        services: uniqueServices,
        plan_duration: plan.id,
        validity_days: plan.validityDays,
      });

      const frontendUrl = process.env.FRONTEND_URL || 'https://tlangau.onrender.com';
      const backendUrl = process.env.BACKEND_URL || 'https://tlangau.onrender.com';

      const purposeDetail = uniqueServices.length === 3
        ? 'All Services'
        : serviceNames;

      const paymentData = {
        purpose: `Tlangau (${plan.label}): ${purposeDetail}`,
        amount: amount,
        currency: 'INR',
        buyer_name: emailLower.split('@')[0],
        email: emailLower,
        redirect_url: `${frontendUrl}/success.html?order_id=${orderId}`,
        webhook: `${backendUrl}/api/payment-webhook`,
        allow_repeated_payments: false,
      };

      try {
        const instamojoResponse = await axios.post(
          `${INSTAMOJO_API_BASE}/payment-requests/`,
          paymentData,
          {
            headers: {
              'X-Api-Key': INSTAMOJO_API_KEY,
              'X-Auth-Token': INSTAMOJO_AUTH_TOKEN,
            },
            timeout: 15000,
          }
        );

        if (instamojoResponse.data.success) {
          const paymentLink = instamojoResponse.data.payment_request;
          console.log(`✅ Payment link created: ${paymentLink.id}`);

          await db.updateOrder(orderId, {
            payment_request_id: paymentLink.id,
          });

          res.json({
            success: true,
            orderId: orderId,
            paymentId: paymentLink.id,
            paymentUrl: paymentLink.longurl,
            amount: amount,
            services: uniqueServices,
            planDuration: plan.id,
            validityDays: plan.validityDays,
            currency: 'INR',
          });
        } else {
          throw new Error(instamojoResponse.data.message || 'Failed to create payment link');
        }
      } catch (error) {
        console.error('❌ Instamojo error:', error.response?.data || error.message);
        await db.updateOrder(orderId, { status: 'FAILED' });

        let errorMessage = 'Failed to create payment link';
        const instamojoError = error.response?.data;
        if (instamojoError) {
          if (instamojoError.message && typeof instamojoError.message === 'object') {
            const errorFields = Object.keys(instamojoError.message);
            const firstError = instamojoError.message[errorFields[0]];
            errorMessage = Array.isArray(firstError) ? firstError[0] : String(firstError);
          } else if (typeof instamojoError.message === 'string') {
            errorMessage = instamojoError.message;
          } else if (instamojoError.error) {
            errorMessage = typeof instamojoError.error === 'string'
              ? instamojoError.error
              : JSON.stringify(instamojoError.error);
          }
        } else {
          errorMessage = error.message || errorMessage;
        }

        res.status(error.response?.status || 500).json({
          success: false,
          error: errorMessage,
          message: `Payment gateway error: ${errorMessage}`,
        });
      }
    } catch (error) {
      console.error('❌ Error in create-payment:', error.message);
      res.status(500).json({ success: false, error: 'An unexpected error occurred. Please try again.' });
    }
  }
);

// Payment webhook (Instamojo) – with MAC verification
app.post('/api/payment-webhook', async (req, res) => {
  try {
    const webhookData = req.body;
    console.log('📥 Payment webhook received:', webhookData.payment_request_id || 'unknown');

    // Verify webhook MAC signature
    if (!verifyWebhookMAC(webhookData)) {
      console.error('❌ Webhook MAC verification FAILED – possible forgery!');
      return res.status(403).json({ success: false, message: 'Invalid webhook signature' });
    }

    const { payment_request_id, payment_id } = webhookData;

    if (!payment_request_id) {
      return res.status(400).json({ success: false, message: 'Missing payment_request_id' });
    }

    let order = await db.getOrderByPaymentRequestId(payment_request_id);

    // Fallback: find by email via payment details
    if (!order && payment_id) {
      try {
        const paymentResponse = await axios.get(
          `${INSTAMOJO_API_BASE}/payments/${payment_id}/`,
          {
            headers: {
              'X-Api-Key': INSTAMOJO_API_KEY,
              'X-Auth-Token': INSTAMOJO_AUTH_TOKEN,
            },
            timeout: 10000,
          }
        );
        if (paymentResponse.data.success) {
          const payment = paymentResponse.data.payment;
          const buyerEmail = payment.buyer_email || payment.email || payment.buyer;
          if (buyerEmail) {
            order = await db.getOrderByEmail(buyerEmail);
          }
        }
      } catch (error) {
        console.error('❌ Error fetching payment details:', error.message);
      }
    }

    if (!order) {
      console.error('❌ Order not found for payment_request_id:', payment_request_id);
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Verify payment with Instamojo
    if (payment_id) {
      try {
        const paymentResponse = await axios.get(
          `${INSTAMOJO_API_BASE}/payments/${payment_id}/`,
          {
            headers: {
              'X-Api-Key': INSTAMOJO_API_KEY,
              'X-Auth-Token': INSTAMOJO_AUTH_TOKEN,
            },
            timeout: 10000,
          }
        );

        if (paymentResponse.data.success) {
          const payment = paymentResponse.data.payment;
          const result = await verifyAndFulfillPayment(order, payment, payment_id);
          if (result.verified) {
            console.log('✅ Webhook: Payment verified and fulfilled');
          } else {
            console.log(`📋 Webhook: Payment status = ${result.status}`);
          }
        }
      } catch (error) {
        console.error('❌ Error checking payment status:', error.message);
      }
    }

    res.json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    console.error('❌ Error processing webhook:', error.message);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Helper: verify payment and fulfill order (reusable for webhook + verify-payment)
async function verifyAndFulfillPayment(order, payment, paymentId) {
  const expectedAmount = order.amount / 100;
  const paymentAmount = parseFloat(payment.amount);
  const paymentStatus = payment.status;
  const paymentRequestId = payment.payment_request?.id || payment.payment_request_id;

  if (paymentStatus !== 'Credit') {
    if (paymentStatus === 'Failed') {
      await db.updateOrder(order.order_id, { status: 'FAILED', payment_id: paymentId });
    }
    return { verified: false, status: paymentStatus };
  }

  if (Math.abs(paymentAmount - expectedAmount) > 0.01) {
    console.error(`❌ Amount mismatch: expected ${expectedAmount}, got ${paymentAmount}`);
    return { verified: false, status: 'AMOUNT_MISMATCH' };
  }

  if (paymentRequestId && order.payment_request_id && paymentRequestId !== order.payment_request_id) {
    console.error('❌ Payment request ID mismatch');
    return { verified: false, status: 'REQUEST_ID_MISMATCH' };
  }

  // All checks passed
  await db.updateOrder(order.order_id, { status: 'SUCCESS', payment_id: paymentId });

  const existingCode = await db.getCodeByOrderId(order.order_id);
  let accessCodeToSend = existingCode?.code || null;
  const orderServices = order.services || VALID_SERVICE_IDS; // Backward compat: old orders get all services
  const plan = getPlanInfo(order.plan_duration);
  const validityDays = plan.validityDays || 30;
  let expiresAt = existingCode?.expiresAt || existingCode?.expires_at || null;

  if (!existingCode) {
    const accessCode = generateAccessCode();
    expiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000).toISOString();
    await db.createAccessCode({
      code: accessCode,
      email: order.email,
      orderId: order.order_id,
      paymentId: paymentId,
      used: false,
      expiresAt,
      services: orderServices,
      plan_duration: plan.id,
      validity_days: validityDays,
    });
    console.log(`✅ Access code created: ${accessCode} | Services: ${orderServices.join(', ')}`);
    accessCodeToSend = accessCode;
  }

  if (accessCodeToSend) {
    const emailSent = await sendAccessCodeEmail(order.email, accessCodeToSend, orderServices, validityDays);
    await db.updateOrder(order.order_id, {
      access_code: accessCodeToSend,
      access_code_expires_at: expiresAt,
      code_email_sent: emailSent === true,
      code_email_last_attempt_at: new Date().toISOString(),
      plan_duration: plan.id,
      validity_days: validityDays,
    });
    if (!emailSent) {
      console.error(`❌ CRITICAL: Email NOT sent to ${order.email} | Code: ${accessCodeToSend}`);
      console.error('   ⚠️  Manual intervention required!');
    }
    order.code_email_sent = emailSent === true;
  }

  return {
    verified: true,
    status: 'SUCCESS',
    accessCode: accessCodeToSend,
    expiresAt,
    planDuration: plan.id,
    validityDays,
    services: orderServices,
    codeEmailSent: order.code_email_sent === true,
  };
}

// Verify payment (for frontend callback / success page polling)
app.post(
  '/api/verify-payment',
  [body('orderId').notEmpty()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { orderId } = req.body;
      console.log(`🔍 Verifying payment: ${orderId}`);

      const order = await db.getOrder(orderId);
      if (!order) {
        return res.json({ success: false, message: 'Order not found' });
      }

      if (order.status === 'SUCCESS') {
        const codeByOrder = await db.getCodeByOrderId(order.order_id || orderId);
        const plan = getPlanInfo(order.plan_duration);
        return res.json({
          success: true,
          paymentStatus: 'SUCCESS',
          services: order.services || VALID_SERVICE_IDS,
          accessCode: order.access_code || codeByOrder?.code || null,
          expiresAt: order.access_code_expires_at || codeByOrder?.expiresAt || codeByOrder?.expires_at || null,
          planDuration: order.plan_duration || codeByOrder?.plan_duration || plan.id,
          validityDays: order.validity_days || codeByOrder?.validity_days || plan.validityDays,
          codeEmailSent: order.code_email_sent === true,
          message: 'Payment verified successfully',
        });
      }

      if (order.status === 'EXPIRED') {
        return res.json({ success: true, paymentStatus: 'EXPIRED', message: 'Payment session expired. Please try again.' });
      }

      if (order.status === 'FAILED') {
        return res.json({ success: true, paymentStatus: 'FAILED', message: 'Payment failed.' });
      }

      // Try to verify via payment_id
      let payment = null;
      let paymentId = order.payment_id;

      if (paymentId) {
        try {
          const paymentResponse = await axios.get(
            `${INSTAMOJO_API_BASE}/payments/${paymentId}/`,
            {
              headers: {
                'X-Api-Key': INSTAMOJO_API_KEY,
                'X-Auth-Token': INSTAMOJO_AUTH_TOKEN,
              },
              timeout: 10000,
            }
          );
          if (paymentResponse.data.success) {
            payment = paymentResponse.data.payment;
            paymentId = payment.id || payment.payment_id || paymentId;
          }
        } catch (error) {
          console.error('❌ Error checking payment by payment_id:', error.message);
        }
      }

      // Fallback: try via payment_request_id
      if (!payment && order.payment_request_id) {
        try {
          const prResponse = await axios.get(
            `${INSTAMOJO_API_BASE}/payment-requests/${order.payment_request_id}/`,
            {
              headers: {
                'X-Api-Key': INSTAMOJO_API_KEY,
                'X-Auth-Token': INSTAMOJO_AUTH_TOKEN,
              },
              timeout: 10000,
            }
          );
          if (prResponse.data.success) {
            const pr = prResponse.data.payment_request;
            if (pr.payments && pr.payments.length > 0) {
              const successfulPayment = pr.payments.find(p => p.status === 'Credit');
              if (successfulPayment) {
                payment = successfulPayment;
                paymentId = successfulPayment.payment_id || successfulPayment.id;
              }
            }
          }
        } catch (error) {
          console.error('❌ Error checking payment_request:', error.message);
        }
      }

      if (payment) {
        const result = await verifyAndFulfillPayment(order, payment, paymentId);
        if (result.verified) {
          return res.json({
            success: true,
            paymentStatus: 'SUCCESS',
            services: result.services || order.services || VALID_SERVICE_IDS,
            accessCode: result.accessCode || null,
            expiresAt: result.expiresAt || null,
            planDuration: result.planDuration || order.plan_duration || 'monthly',
            validityDays: result.validityDays || order.validity_days || ACCESS_PLANS.monthly.validityDays,
            codeEmailSent: result.codeEmailSent === true,
            message: 'Payment verified successfully',
          });
        }
        if (result.status === 'Failed') {
          return res.json({ success: true, paymentStatus: 'FAILED', message: 'Payment failed' });
        }
        if (result.status === 'AMOUNT_MISMATCH' || result.status === 'REQUEST_ID_MISMATCH') {
          return res.json({ success: false, paymentStatus: 'FAILED', message: `Verification failed: ${result.status}` });
        }
      }

      res.json({
        success: true,
        paymentStatus: order.status,
        message: order.status === 'PENDING' ? 'Payment is still being processed...' : 'Payment status unknown',
      });
    } catch (error) {
      console.error('❌ Error verifying payment:', error.message);
      res.status(500).json({ success: false, error: 'Failed to verify payment. Please try again.' });
    }
  }
);

// Resend access code email for a successful order (customer self-service fallback)
app.post(
  '/api/resend-access-code',
  paymentLimiter,
  [
    body('orderId').notEmpty().withMessage('orderId is required'),
    body('email').isEmail().normalizeEmail(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const orderId = req.body.orderId;
      const emailLower = req.body.email.toLowerCase().trim();
      const order = await db.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found.' });
      }
      if ((order.email || '').toLowerCase().trim() !== emailLower) {
        return res.status(403).json({ success: false, message: 'Email does not match this order.' });
      }
      if (order.status !== 'SUCCESS') {
        return res.status(400).json({ success: false, message: 'Payment is not completed yet.' });
      }

      const codeByOrder = await db.getCodeByOrderId(order.order_id || orderId);
      const codeToSend = codeByOrder?.code || order.access_code;
      if (!codeToSend) {
        return res.status(404).json({ success: false, message: 'Access code not generated yet. Please retry shortly.' });
      }
      const validityDays = codeByOrder?.validity_days || order.validity_days || ACCESS_PLANS.monthly.validityDays;
      const services = codeByOrder?.services || order.services || VALID_SERVICE_IDS;
      const emailSent = await sendAccessCodeEmail(emailLower, codeToSend, services, validityDays);
      await db.updateOrder(order.order_id || orderId, {
        code_email_sent: emailSent === true,
        code_email_last_attempt_at: new Date().toISOString(),
      });

      if (!emailSent) {
        return res.status(500).json({
          success: false,
          message: 'We could not resend the email right now.',
          accessCode: codeToSend,
          expiresAt: codeByOrder?.expiresAt || codeByOrder?.expires_at || order.access_code_expires_at || null,
          services,
          planDuration: (codeByOrder?.plan_duration || order.plan_duration || 'monthly'),
          validityDays,
        });
      }

      res.json({
        success: true,
        message: 'Access code email resent.',
        accessCode: codeToSend,
        expiresAt: codeByOrder?.expiresAt || codeByOrder?.expires_at || order.access_code_expires_at || null,
        services,
        planDuration: (codeByOrder?.plan_duration || order.plan_duration || 'monthly'),
        validityDays,
      });
    } catch (error) {
      console.error('❌ Resend access code error:', error.message);
      res.status(500).json({ success: false, message: 'Failed to resend access code.' });
    }
  }
);

// ==================== ACCESS CODE ROUTES ====================

// Validate access code (for Flutter app) – returns services array
app.post(
  '/api/validate-code',
  [
    body('code').notEmpty().trim(),
    body('email').isEmail().normalizeEmail(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { code, email, accountId } = req.body;
      const userAccountId = accountId || email;
      const codeUpper = code.trim().toUpperCase();
      const emailLower = email.toLowerCase().trim();

      console.log(`🔍 Validating code: ${codeUpper} for ${emailLower}`);

      const accessCode = await db.getCodeByCode(codeUpper);

      if (!accessCode) {
        return res.json({ success: false, valid: false, message: 'Invalid access code' });
      }

      const expiresAt = new Date(accessCode.expiresAt || accessCode.expires_at);
      if (expiresAt < new Date()) {
        return res.json({
          success: false,
          valid: false,
          message: 'This access code has expired. Please purchase a new code.',
        });
      }

      if (accessCode.used) {
        return res.json({
          success: false,
          valid: false,
          message: 'This access code has already been used',
        });
      }

      const codeEmail = accessCode.email.toLowerCase().trim();
      if (codeEmail !== emailLower) {
        return res.json({
          success: false,
          valid: false,
          message: 'This access code is not associated with your email. Please use the email address you used to purchase the code.',
        });
      }

      const plan = getPlanInfo(accessCode.plan_duration);
      const validityDays = accessCode.validity_days || plan.validityDays || ACCESS_PLANS.monthly.validityDays;
      const latestUsedEntitlement = await db.getLatestUsedCodeForIdentity(emailLower, userAccountId);
      const stackedExpiry = stackExpiry(
        latestUsedEntitlement?.expiresAt || latestUsedEntitlement?.expires_at,
        validityDays
      );

      await db.markCodeAsUsed(codeUpper, emailLower, userAccountId);
      await db.updateAccessCode(codeUpper, {
        expires_at: stackedExpiry,
        expiresAt: stackedExpiry,
        plan_duration: accessCode.plan_duration || plan.id,
        validity_days: validityDays,
      });
      accessCode.used = true;
      accessCode.used_at = new Date().toISOString();
      accessCode.expires_at = stackedExpiry;
      accessCode.expiresAt = stackedExpiry;
      await maybeSendAutomatedAccessCodeMails(emailLower, accessCode, {
        sendWelcome: true,
        codeKey: codeUpper,
      });
      console.log(`✅ Code validated and used: ${codeUpper} by ${userAccountId}`);

      // Return services – backward compat: codes without services get all
      const codeServices = accessCode.services || VALID_SERVICE_IDS;
      // Always include free services
      const allServices = [...new Set([...codeServices, ...FREE_SERVICES])];

      res.json({
        success: true,
        valid: true,
        message: 'Access code is valid',
        code: codeUpper,
        expiresAt: getGraceWindowEnd(accessCode.expiresAt || accessCode.expires_at),
        accessExpiryAt: accessCode.expiresAt || accessCode.expires_at,
        gracePeriodHours: ACCESS_GRACE_PERIOD_HOURS,
        graceEndsAt: getGraceWindowEnd(accessCode.expiresAt || accessCode.expires_at),
        services: allServices,
      });
    } catch (error) {
      console.error('❌ Error validating code:', error.message);
      res.status(500).json({ success: false, message: 'Failed to validate code. Please try again.' });
    }
  }
);

// Test email endpoint
app.post(
  '/api/test-email',
  [body('email').isEmail().normalizeEmail()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { email } = req.body;
      if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        return res.status(500).json({
          success: false,
          message: 'Email service not configured.',
        });
      }

      const testResult = await sendAccessCodeEmail(email, 'TEST123456', ['ring', 'message'], 30);
      if (testResult) {
        res.json({ success: true, message: 'Test email sent! Check your inbox.' });
      } else {
        res.status(500).json({ success: false, message: 'Failed to send test email. Check server logs.' });
      }
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Get access code info by email
app.post(
  '/api/get-code-info',
  [body('email').isEmail().normalizeEmail()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { email } = req.body;
      const emailLower = email.toLowerCase().trim();
      let accessCode = await db.getLatestUsedCodeByEmail(emailLower);
      if (!accessCode) {
        accessCode = await db.getCodeByEmail(emailLower);
      }

      if (!accessCode) {
        return res.json({ success: false, valid: false, message: 'No access code found for this email' });
      }

      const codeServices = accessCode.services || VALID_SERVICE_IDS;
      const allServices = [...new Set([...codeServices, ...FREE_SERVICES])];
      const rawExpiry = accessCode.expiresAt || accessCode.expires_at;
      const accessStillValid = isWithinAccessWindow(rawExpiry);
      await maybeSendAutomatedAccessCodeMails(emailLower, accessCode, {
        sendWelcome: false,
        sendExpiredNotice: accessStillValid === false,
      });

      res.json({
        success: true,
        code: accessCode.code,
        expiresAt: getGraceWindowEnd(rawExpiry),
        accessExpiryAt: rawExpiry,
        gracePeriodHours: ACCESS_GRACE_PERIOD_HOURS,
        graceEndsAt: getGraceWindowEnd(rawExpiry),
        used: accessCode.used,
        services: allServices,
        planDuration: accessCode.plan_duration || 'monthly',
        validityDays: accessCode.validity_days || ACCESS_PLANS.monthly.validityDays,
        message: 'Access code info retrieved',
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// ==================== ADMIN ROUTES ====================

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

const ADMIN_PASSWORD_HASH = hashPassword(ADMIN_PASSWORD_FINAL);

const checkAdminAuth = (req, res, next) => {
  const providedPassword = req.headers['x-admin-password'] || req.body.password || req.query.password;
  if (!providedPassword) {
    return res.status(401).json({ success: false, error: 'Unauthorized', message: 'Admin password required' });
  }
  const providedHash = hashPassword(providedPassword);
  if (crypto.timingSafeEqual(Buffer.from(providedHash), Buffer.from(ADMIN_PASSWORD_HASH))) {
    next();
  } else {
    console.warn(`⚠️  Failed admin login from: ${req.ip}`);
    return res.status(401).json({ success: false, error: 'Unauthorized', message: 'Invalid admin password' });
  }
};

// Admin login
app.post('/api/admin/login', authLimiter, [
  body('password').notEmpty().withMessage('Password is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    const { password } = req.body;
    const providedHash = hashPassword(password);
    if (crypto.timingSafeEqual(Buffer.from(providedHash), Buffer.from(ADMIN_PASSWORD_HASH))) {
      console.log(`✅ Admin login from: ${req.ip}`);
      res.json({ success: true, message: 'Login successful' });
    } else {
      console.warn(`⚠️  Failed admin login from: ${req.ip}`);
      res.status(401).json({ success: false, error: 'Invalid password' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Get all orders
app.get('/api/admin/orders', checkAdminAuth, async (req, res) => {
  try {
    const orders = await db.getAllOrders();
    res.json({ success: true, orders, count: orders.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Get all access codes
app.get('/api/admin/access-codes', checkAdminAuth, async (req, res) => {
  try {
    const codes = await db.getAllAccessCodes();
    res.json({ success: true, codes, count: codes.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Resend access code email
app.post(
  '/api/admin/resend-email',
  checkAdminAuth,
  [body('email').isEmail().normalizeEmail()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }
      const emailLower = req.body.email.toLowerCase().trim();
      console.log(`📧 Admin resending email to: ${emailLower}`);

      const accessCode = await db.getCodeByEmail(emailLower);
      if (!accessCode) {
        return res.status(404).json({ success: false, message: 'No access code found for this email' });
      }

      const emailSent = await sendAccessCodeEmail(
        emailLower,
        accessCode.code,
        accessCode.services,
        accessCode.validity_days || ACCESS_PLANS.monthly.validityDays,
      );
      if (emailSent) {
        if (accessCode.order_id) {
          await db.updateOrder(accessCode.order_id, {
            code_email_sent: true,
            code_email_last_attempt_at: new Date().toISOString(),
          });
        }
        res.json({ success: true, message: 'Email resent successfully', code: accessCode.code });
      } else {
        res.status(500).json({ success: false, message: 'Failed to send email', code: accessCode.code });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Admin: Delete access code
app.delete('/api/admin/access-codes/:code', checkAdminAuth, async (req, res) => {
  try {
    const codeUpper = req.params.code.toUpperCase();
    const result = await db.deleteAccessCode(codeUpper);
    if (result.deleted) {
      console.log(`✅ Admin deleted code: ${codeUpper}`);
      res.json({ success: true, message: 'Access code deleted' });
    } else {
      res.status(404).json({ success: false, message: 'Access code not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Delete order
app.delete('/api/admin/orders/:orderId', checkAdminAuth, async (req, res) => {
  try {
    const result = await db.deleteOrder(req.params.orderId);
    if (result.deleted) {
      console.log(`✅ Admin deleted order: ${req.params.orderId}`);
      res.json({ success: true, message: 'Order and associated codes deleted' });
    } else {
      res.status(404).json({ success: false, message: 'Order not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Delete user by email
app.delete('/api/admin/users/:email', checkAdminAuth, async (req, res) => {
  try {
    const emailLower = req.params.email.toLowerCase().trim();
    const result = await db.deleteUserByEmail(emailLower);
    if (result.deleted) {
      console.log(`✅ Admin deleted user: ${emailLower}`);
      res.json({
        success: true,
        message: 'User data deleted',
        deletedOrders: result.deletedOrders,
        deletedCodes: result.deletedCodes,
      });
    } else {
      res.status(404).json({ success: false, message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Get statistics
app.get('/api/admin/statistics', checkAdminAuth, async (req, res) => {
  try {
    const stats = await db.getStatistics();
    res.json({ success: true, statistics: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Get all users
app.get('/api/admin/users', checkAdminAuth, async (req, res) => {
  try {
    const orders = await db.getAllOrders();
    const userMap = new Map();
    orders.forEach(order => {
      if (!order || !order.email) return;
      const email = order.email.toLowerCase().trim();
      if (!userMap.has(email)) {
        userMap.set(email, {
          email,
          totalOrders: 0,
          successfulOrders: 0,
          totalSpent: 0,
          firstOrder: order.created_at || order.updated_at || new Date().toISOString(),
          lastOrder: order.created_at || order.updated_at || new Date().toISOString(),
        });
      }
      const user = userMap.get(email);
      user.totalOrders++;
      if (order.status === 'SUCCESS') {
        user.successfulOrders++;
        const amt = parseFloat(order.amount);
        if (!isNaN(amt)) user.totalSpent += amt / 100;
      }
      const orderDate = order.created_at || order.updated_at;
      if (orderDate) {
        if (new Date(orderDate) < new Date(user.firstOrder)) user.firstOrder = orderDate;
        if (new Date(orderDate) > new Date(user.lastOrder)) user.lastOrder = orderDate;
      }
    });

    const users = Array.from(userMap.values()).sort((a, b) => new Date(b.lastOrder) - new Date(a.lastOrder));
    res.json({ success: true, users, count: users.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== BUNDLES & TOPICS ADMIN ====================

app.get('/api/admin/bundles', checkAdminAuth, async (req, res) => {
  try {
    checkFirebaseReady();
    if (!firebaseInitialized || !admin) {
      return res.status(503).json({ success: false, error: 'Firebase Admin not initialized' });
    }

    const fbDb = admin.database();
    const snapshot = await fbDb.ref('bundles').once('value');

    if (!snapshot.exists()) {
      return res.json({ success: true, bundles: [], count: 0 });
    }

    const bundlesData = snapshot.val();
    const bundles = [];
    for (const [bundleId, bundleData] of Object.entries(bundlesData)) {
      const topics = [];
      if (bundleData.topics) {
        for (const [topicId, topicData] of Object.entries(bundleData.topics)) {
          topics.push({
            id: topicId,
            name: topicData.name || 'Unknown',
            fcmTopicName: topicData.fcmTopicName || '',
            subscribers: topicData.subscribers ? Object.keys(topicData.subscribers).length : 0,
          });
        }
      }
      bundles.push({
        id: bundleId,
        name: bundleData.name || 'Unknown',
        topics,
        topicsCount: topics.length,
      });
    }

    res.json({ success: true, bundles, count: bundles.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/admin/bundles/:bundleId', checkAdminAuth, async (req, res) => {
  try {
    if (!firebaseInitialized || !admin) {
      return res.status(503).json({ success: false, error: 'Firebase Admin not initialized' });
    }
    await admin.database().ref(`bundles/${req.params.bundleId}`).remove();
    console.log(`✅ Admin deleted bundle: ${req.params.bundleId}`);
    res.json({ success: true, message: 'Bundle and all its topics deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/admin/bundles/:bundleId/topics/:topicId', checkAdminAuth, async (req, res) => {
  try {
    if (!firebaseInitialized || !admin) {
      return res.status(503).json({ success: false, error: 'Firebase Admin not initialized' });
    }
    await admin.database().ref(`bundles/${req.params.bundleId}/topics/${req.params.topicId}`).remove();
    console.log(`✅ Admin deleted topic: ${req.params.topicId} from bundle: ${req.params.bundleId}`);
    res.json({ success: true, message: 'Topic deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== FCM NOTIFICATION ENDPOINTS ====================

const tokenCache = new Map();
const TOKEN_CACHE_TTL_MS = 10 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of tokenCache) {
    if (now > entry.expiresAt) tokenCache.delete(token);
  }
}, 5 * 60 * 1000);

const accessCodeCache = new Map();
const ACCESS_CODE_CACHE_TTL_MS = 5 * 60 * 1000;

function normalizeEmail(email) {
  return (email || '').toString().toLowerCase().trim();
}

function toSafeEmailKey(email) {
  return normalizeEmail(email).replace(/[.#$/\[\]]/g, '_');
}

async function maybeSendAutomatedAccessCodeMails(email, accessCode, options = {}) {
  try {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !accessCode) return;

    const codeKey = accessCode.code || options.codeKey;
    if (!codeKey) return;

    const expiresAtRaw = accessCode.expiresAt || accessCode.expires_at;
    if (!expiresAtRaw) return;

    const expiresAt = new Date(expiresAtRaw);
    if (isNaN(expiresAt.getTime())) return;

    const now = new Date();
    const diffMs = expiresAt.getTime() - now.getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const sevenDaysMs = 7 * oneDayMs;
    const purchaseLink = process.env.PURCHASE_WEB_LINK || 'https://tlangau.onrender.com';
    const updates = {};

    // Welcome mail: send once when user first activates/logs in with a valid code.
    if (options.sendWelcome === true && !accessCode.welcome_mail_sent_at) {
      await db.createDevMail({
        title: 'Welcome to Tlangau',
        body:
          'Welcome! Your access code is active and your server dashboard is ready.\n\nIf you need help, open the Mailbox anytime for developer updates.',
        pinned: false,
        target_email: normalizedEmail,
        category: 'system_welcome',
        system_generated: true,
      });
      updates.welcome_mail_sent_at = new Date().toISOString();
    }

    // Expiry warnings: each milestone sends once.
    if (diffMs > 0 && diffMs <= sevenDaysMs && !accessCode.expiry_warning_7d_sent_at) {
      await db.createDevMail({
        title: 'Access code expires in 7 days',
        body:
          'Your server access code will expire in about one week. Please renew before expiry to avoid interruption.',
        pinned: true,
        target_email: normalizedEmail,
        category: 'system_expiry_7d',
        system_generated: true,
      });
      updates.expiry_warning_7d_sent_at = new Date().toISOString();
    }

    if (diffMs > 0 && diffMs <= oneDayMs && !accessCode.expiry_warning_1d_sent_at) {
      await db.createDevMail({
        title: 'Access code expires tomorrow',
        body:
          'Reminder: your server access code is about to expire in less than 24 hours. Please renew today to keep access active.',
        pinned: true,
        target_email: normalizedEmail,
        category: 'system_expiry_1d',
        system_generated: true,
      });
      updates.expiry_warning_1d_sent_at = new Date().toISOString();
    }

    // Expired notice: sent when user is moved back to client dashboard due to expiry.
    if (
      options.sendExpiredNotice === true &&
      diffMs <= 0 &&
      accessCode.used === true &&
      !accessCode.expired_notice_sent_at
    ) {
      await db.createDevMail({
        title: 'Your access code has expired',
        body:
          `Your access code has expired, so your app has switched to Client Dashboard.\n\n` +
          `You can purchase a new access code [here](${purchaseLink}).`,
        pinned: true,
        target_email: normalizedEmail,
        category: 'system_expired',
        system_generated: true,
      });
      updates.expired_notice_sent_at = new Date().toISOString();
    }

    if (Object.keys(updates).length > 0) {
      await db.updateAccessCode(codeKey, updates);
      Object.assign(accessCode, updates);
      accessCodeCache.set(normalizedEmail, { accessCode, cachedAt: Date.now() });
    }
  } catch (error) {
    console.error('⚠️ Automated mail check failed:', error.message);
  }
}

async function verifyGoogleAuth(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];

  const cached = tokenCache.get(token);
  if (cached && Date.now() < cached.expiresAt) return cached.email;

  try {
    const response = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { 'Authorization': `Bearer ${token}` },
      timeout: 10000,
    });
    if (response.data && response.data.email) {
      const email = response.data.email.toLowerCase().trim();
      tokenCache.set(token, { email, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
      return email;
    }
    return null;
  } catch (error) {
    console.error('❌ Google auth failed:', error.response?.status || error.message);
    return null;
  }
}

// Server auth middleware – now also checks service permissions
async function requireServerAuth(req, res, next) {
  const fbReady = await waitForFirebaseReady(15000);
  if (!fbReady) {
    return res.status(503).json({
      success: false,
      message: 'Server is starting up. Please try again in a few seconds.',
    });
  }

  const email = await verifyGoogleAuth(req);
  if (!email) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please sign in with Google.',
    });
  }

  try {
    let accessCode;
    const cachedAccess = accessCodeCache.get(email);
    if (cachedAccess && (Date.now() - cachedAccess.cachedAt) < ACCESS_CODE_CACHE_TTL_MS) {
      accessCode = cachedAccess.accessCode;
    } else {
      // Primary source: used/activated entitlement; fallback keeps backward compatibility.
      accessCode = await db.getLatestUsedCodeByEmail(email);
      if (!accessCode) {
        accessCode = await db.getCodeByEmail(email);
      }
      accessCodeCache.set(email, { accessCode, cachedAt: Date.now() });
    }

    if (!accessCode) {
      return res.status(403).json({ success: false, message: 'Access not authorized for this account.' });
    }

    const rawExpiry = accessCode.expiresAt || accessCode.expires_at;
    if (!isWithinAccessWindow(rawExpiry)) {
      await maybeSendAutomatedAccessCodeMails(email, accessCode, {
        sendWelcome: false,
        sendExpiredNotice: true,
      });
      return res.status(403).json({
        success: false,
        message: `Your access code has expired (including ${ACCESS_GRACE_PERIOD_HOURS}h grace period).`,
      });
    }

    await maybeSendAutomatedAccessCodeMails(email, accessCode, { sendWelcome: false });
    req.userEmail = email;
    req.userServices = accessCode.services || VALID_SERVICE_IDS; // Backward compat
    next();
  } catch (error) {
    console.error('❌ Auth check error:', error.message);
    return res.status(500).json({ success: false, message: 'Server error during authorization.' });
  }
}

// Service gate middleware factory
function requireService(serviceId) {
  return (req, res, next) => {
    const userServices = req.userServices || [];
    if (!userServices.includes(serviceId)) {
      return res.status(403).json({
        success: false,
        message: `You do not have access to the ${PAID_SERVICES[serviceId]?.name || serviceId} service. Please purchase this service to use it.`,
        requiredService: serviceId,
      });
    }
    next();
  };
}

// Send ring notification – requires 'ring' service
app.post('/api/send-ring', fcmLimiter, requireServerAuth, requireService('ring'), async (req, res) => {
  try {
    const { fcmTopicName, bundleName, topicName, ringType } = req.body;
    if (!fcmTopicName || !bundleName || !topicName) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: fcmTopicName, bundleName, topicName',
      });
    }

    const ringTypeValue = ringType || 'wet';
    console.log(`📤 Ring: ${bundleName}/${topicName} (${ringTypeValue}) by ${req.userEmail}`);

    const message = {
      topic: fcmTopicName,
      data: {
        type: 'ring',
        ringType: ringTypeValue,
        priority: 'high',
        timestamp: Date.now().toString(),
        bundleName,
        topicName,
      },
      android: { priority: 'high', ttl: 300000 },
      apns: {
        headers: { 'apns-priority': '10', 'apns-push-type': 'alert' },
        payload: {
          aps: {
            alert: {
              title: `Ring Alert: ${bundleName}`,
              body: `${topicName} - ${ringTypeValue === 'dry' ? 'Ṭawihthei lo' : 'Ṭawihthei'}`,
            },
            sound: 'default',
            'content-available': 1,
            'interruption-level': 'time-sensitive',
          },
        },
      },
      webpush: { headers: { Urgency: 'high' } },
    };

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = await admin.messaging().send(message);
        console.log(`✅ Ring sent: ${result}`);
        return res.json({ success: true, messageId: result });
      } catch (error) {
        console.error(`❌ Ring failed (${attempt}/2):`, error.code || error.message);
        if (attempt < 2) await new Promise(r => setTimeout(r, 500));
      }
    }

    res.status(500).json({ success: false, message: 'Failed to send ring notification' });
  } catch (error) {
    console.error('❌ Error in send-ring:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Send message notification – requires 'message' OR 'broadcast' depending on mode
app.post('/api/send-message', fcmLimiter, requireServerAuth, async (req, res) => {
  try {
    const {
      fcmTopicName, fcmTopicNames, bundleName, messageText,
      attachmentUrl, locationLatitude, locationLongitude, locationAddress,
      documentUrl, documentName, audioUrl, audioDuration,
      isBroadcast,
    } = req.body;

    const userServices = req.userServices || [];

    // Service gate: broadcast mode needs 'broadcast', normal mode needs 'message'
    if (isBroadcast) {
      if (!userServices.includes('broadcast')) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to the Broadcast Message service. Please purchase this service to use it.',
          requiredService: 'broadcast',
        });
      }
    } else {
      if (!userServices.includes('message')) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to the Message Notification service. Please purchase this service to use it.',
          requiredService: 'message',
        });
      }
    }

    const topicNames = fcmTopicNames || (fcmTopicName ? [fcmTopicName] : []);
    if (topicNames.length === 0 || !bundleName || !messageText) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: fcmTopicName(s), bundleName, messageText',
      });
    }

    console.log(`📤 Message to "${bundleName}" (${topicNames.length} topics) by ${req.userEmail}`);

    const dataPayload = {
      type: 'message',
      messageText,
      priority: 'high',
      timestamp: Date.now().toString(),
      bundleName,
      topicName: bundleName,
    };
    if (attachmentUrl) dataPayload.attachmentUrl = attachmentUrl;
    if (locationLatitude) dataPayload.locationLatitude = locationLatitude;
    if (locationLongitude) dataPayload.locationLongitude = locationLongitude;
    if (documentUrl) dataPayload.documentUrl = documentUrl;
    if (documentName) dataPayload.documentName = documentName;
    if (locationAddress) dataPayload.locationAddress = locationAddress;
    if (audioUrl) dataPayload.audioUrl = audioUrl;
    if (audioDuration) dataPayload.audioDuration = audioDuration.toString();

    const previewText = messageText.length > 100 ? messageText.substring(0, 97) + '...' : messageText;

    const messages = topicNames.map(topic => ({
      topic,
      data: { ...dataPayload },
      android: { priority: 'high', ttl: 2419200000 },
      apns: {
        headers: { 'apns-priority': '10', 'apns-push-type': 'alert' },
        payload: {
          aps: {
            alert: { title: bundleName, body: previewText },
            sound: 'default',
            'content-available': 1,
            'mutable-content': 1,
          },
        },
      },
      webpush: { headers: { Urgency: 'high' } },
    }));

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        let successCount = 0, failCount = 0;
        const messageIds = [];

        if (messages.length === 1) {
          const result = await admin.messaging().send(messages[0]);
          successCount = 1;
          messageIds.push(result);
        } else {
          const batchResult = await admin.messaging().sendEach(messages);
          batchResult.responses.forEach((resp, idx) => {
            if (resp.success) {
              successCount++;
              messageIds.push(resp.messageId);
            } else {
              failCount++;
              console.error(`  ❌ Topic "${topicNames[idx]}" failed:`, resp.error?.code || resp.error?.message);
            }
          });
        }

        console.log(`✅ Message sent: ${successCount}/${topicNames.length}`);
        return res.json({
          success: successCount > 0,
          messageIds,
          sent: successCount,
          failed: failCount,
          total: topicNames.length,
        });
      } catch (error) {
        console.error(`❌ Message failed (${attempt}/2):`, error.code || error.message);
        if (attempt < 2) await new Promise(r => setTimeout(r, 500));
      }
    }

    res.status(500).json({ success: false, message: 'Failed to send message notification' });
  } catch (error) {
    console.error('❌ Error in send-message:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== STALE ORDER CLEANUP ====================
setInterval(async () => {
  try {
    if (!db.db) return;
    const orders = await db.getAllOrders();
    const cutoff = Date.now() - 30 * 60 * 1000;
    let expiredCount = 0;
    for (const order of orders) {
      if (order.status === 'PENDING' && new Date(order.created_at).getTime() < cutoff) {
        await db.updateOrder(order.order_id, { status: 'EXPIRED' });
        expiredCount++;
      }
    }
    if (expiredCount > 0) {
      console.log(`⏰ Expired ${expiredCount} stale PENDING order(s)`);
    }
  } catch (err) {
    // Silent fail – cleanup is best-effort
  }
}, 15 * 60 * 1000);

let automatedMailScanRunning = false;
async function runAutomatedAccessCodeMailScan() {
  if (automatedMailScanRunning) return;
  automatedMailScanRunning = true;
  try {
    const codes = await db.getAllAccessCodes();
    for (const code of codes) {
      const codeEmail = normalizeEmail(code.email || code.used_by_email);
      if (!codeEmail) continue;
      await maybeSendAutomatedAccessCodeMails(codeEmail, code, {
        sendWelcome: false,
        codeKey: code.code,
      });
    }
  } catch (error) {
    console.error('⚠️ Automated access-code scan failed:', error.message);
  } finally {
    automatedMailScanRunning = false;
  }
}

// Background scan so expiry reminders are created even if users don't open the app daily.
setInterval(runAutomatedAccessCodeMailScan, 6 * 60 * 60 * 1000);
setTimeout(runAutomatedAccessCodeMailScan, 30 * 1000);

// ==================== POLL ENDPOINTS (Free for all users) ====================

// Simple Google auth for any signed-in user (client or server)
async function requireAnyAuth(req, res, next) {
  const fbReady = await waitForFirebaseReady(15000);
  if (!fbReady) {
    return res.status(503).json({ success: false, message: 'Server starting up.' });
  }
  const email = await verifyGoogleAuth(req);
  if (!email) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }
  req.userEmail = email;
  next();
}

// Create one-time client welcome mail on first install/login per account.
app.post('/api/client-welcome', requireAnyAuth, async (req, res) => {
  try {
    const userEmail = normalizeEmail(req.userEmail);
    if (!userEmail) {
      return res.status(400).json({ success: false, message: 'Missing account email.' });
    }
    const safeKey = toSafeEmailKey(userEmail);
    const flagRef = admin.database().ref(`user_flags/${safeKey}/client_welcome_sent_at`);
    const flagSnap = await flagRef.once('value');
    if (flagSnap.exists()) {
      return res.json({ success: true, created: false, message: 'Client welcome already sent.' });
    }

    await db.createDevMail({
      title: 'Welcome to Tlangau',
      body: 'Welcome to Tlangau client dashboard. You are all set to subscribe and receive updates.',
      pinned: false,
      target_email: userEmail,
      category: 'system_client_welcome',
      system_generated: true,
    });
    await flagRef.set(new Date().toISOString());
    return res.json({ success: true, created: true, message: 'Client welcome created.' });
  } catch (error) {
    console.error('❌ Client welcome mail error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to create client welcome mail.' });
  }
});

// Create poll (any authenticated user)
app.post('/api/polls', fcmLimiter, requireAnyAuth, [
  body('question').trim().notEmpty().withMessage('Question is required'),
  body('options').isArray({ min: 2 }).withMessage('At least 2 options required'),
  body('duration_type').isIn(['24h', '1week', 'custom']).withMessage('Invalid duration type'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  }

  try {
    const { question, options, duration_type, expires_at, anonymous } = req.body;

    // Calculate expiry
    let expiresAt;
    if (duration_type === '24h') {
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    } else if (duration_type === '1week') {
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    } else {
      // custom — client sends expires_at
      if (!expires_at) {
        return res.status(400).json({ success: false, message: 'Custom expiry date required.' });
      }
      expiresAt = new Date(expires_at).toISOString();
    }

    const formattedOptions = options.map((text, idx) => ({
      id: idx,
      text: typeof text === 'string' ? text.trim() : text.text?.trim() || `Option ${idx + 1}`,
      votes: 0,
    }));

    const pollId = await db.createPoll({
      question: question.trim(),
      options: formattedOptions,
      created_by: req.userEmail,
      expires_at: expiresAt,
      duration_type,
      anonymous: anonymous === true,
    });

    console.log(`📊 Poll created by ${req.userEmail}: "${question.trim()}" (${formattedOptions.length} options, ${duration_type})`);

    res.json({ success: true, pollId, message: 'Poll created successfully.' });
  } catch (error) {
    console.error('❌ Create poll error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to create poll.' });
  }
});

// Get all polls (any authenticated user)
app.get('/api/polls', requireAnyAuth, async (req, res) => {
  try {
    const polls = await db.getAllPolls();
    const now = new Date();

    // Auto-close expired polls
    for (const poll of polls) {
      if (poll.status === 'active' && new Date(poll.expires_at) <= now) {
        poll.status = 'closed';
        await db.updatePoll(poll.id, { status: 'closed' });
      }
    }

    // Enrich polls with per-user info & enforce anonymous mode
    for (const poll of polls) {
      const choice = await db.getVoterChoice(poll.id, req.userEmail);
      poll.user_voted = choice !== null;
      poll.user_choice = choice;
      poll.is_creator = (poll.created_by === req.userEmail);
      // Strip voter map (privacy)
      delete poll.voters;

      // Anonymous poll: hide vote counts & percentages from non-creators
      if (poll.anonymous && !poll.is_creator) {
        for (const opt of (poll.options || [])) {
          opt.votes = 0;
        }
        poll.total_votes = 0;
      }
    }

    res.json({ success: true, polls });
  } catch (error) {
    console.error('❌ Get polls error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch polls.' });
  }
});

// Vote on a poll (any authenticated user)
app.post('/api/polls/:id/vote', fcmLimiter, requireAnyAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { optionId } = req.body;

    if (optionId === undefined || optionId === null) {
      return res.status(400).json({ success: false, message: 'Option ID required.' });
    }

    const poll = await db.getPoll(id);
    if (!poll) {
      return res.status(404).json({ success: false, message: 'Poll not found.' });
    }

    // Poll creators cannot vote on their own polls
    if (poll.created_by === req.userEmail) {
      return res.status(403).json({ success: false, message: 'Poll creators cannot vote on their own polls.' });
    }

    // Check if expired
    if (new Date(poll.expires_at) <= new Date()) {
      if (poll.status !== 'closed') {
        await db.updatePoll(id, { status: 'closed' });
      }
      return res.status(400).json({ success: false, message: 'This poll has expired.' });
    }

    if (poll.status !== 'active') {
      return res.status(400).json({ success: false, message: 'This poll is closed.' });
    }

    // Validate option ID
    if (optionId < 0 || optionId >= poll.options.length) {
      return res.status(400).json({ success: false, message: 'Invalid option.' });
    }

    const result = await db.votePoll(id, optionId, req.userEmail);
    if (!result.success) {
      return res.status(409).json({ success: false, message: result.message });
    }

    // Fetch updated poll to return latest counts
    const updated = await db.getPoll(id);
    delete updated.voters;
    updated.user_voted = true;
    updated.user_choice = optionId;
    updated.is_creator = false; // voter is never the creator

    // Anonymous poll: hide counts from voter
    if (updated.anonymous) {
      for (const opt of (updated.options || [])) {
        opt.votes = 0;
      }
      updated.total_votes = 0;
    }

    console.log(`🗳️ Vote on "${poll.question}" by ${req.userEmail}: option ${optionId}`);
    res.json({ success: true, message: 'Vote recorded!', poll: updated });
  } catch (error) {
    console.error('❌ Vote error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to record vote.' });
  }
});

// Publish / unpublish results (poll creator only)
app.post('/api/polls/:id/publish', requireAnyAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { publish } = req.body;

    const poll = await db.getPoll(id);
    if (!poll) {
      return res.status(404).json({ success: false, message: 'Poll not found.' });
    }
    if (poll.created_by !== req.userEmail) {
      return res.status(403).json({ success: false, message: 'Only the poll creator can publish results.' });
    }

    await db.updatePoll(id, { publish_results: publish === true });
    console.log(`📊 Poll "${poll.question}" results ${publish ? 'published' : 'unpublished'} by ${req.userEmail}`);
    res.json({ success: true, message: publish ? 'Results published.' : 'Results unpublished.' });
  } catch (error) {
    console.error('❌ Publish poll error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update poll.' });
  }
});

// Close poll early (poll creator only)
app.post('/api/polls/:id/close', requireAnyAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const poll = await db.getPoll(id);
    if (!poll) {
      return res.status(404).json({ success: false, message: 'Poll not found.' });
    }
    if (poll.created_by !== req.userEmail) {
      return res.status(403).json({ success: false, message: 'Only the poll creator can close the poll.' });
    }

    await db.updatePoll(id, { status: 'closed' });
    console.log(`📊 Poll "${poll.question}" closed early by ${req.userEmail}`);
    res.json({ success: true, message: 'Poll closed.' });
  } catch (error) {
    console.error('❌ Close poll error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to close poll.' });
  }
});

// Delete poll (poll creator only)
app.delete('/api/polls/:id', requireAnyAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const poll = await db.getPoll(id);
    if (!poll) {
      return res.status(404).json({ success: false, message: 'Poll not found.' });
    }
    if (poll.created_by !== req.userEmail) {
      return res.status(403).json({ success: false, message: 'Only the poll creator can delete the poll.' });
    }

    await db.deletePoll(id);
    console.log(`🗑️ Poll "${poll.question}" deleted by ${req.userEmail}`);
    res.json({ success: true, message: 'Poll deleted.' });
  } catch (error) {
    console.error('❌ Delete poll error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to delete poll.' });
  }
});

// ==================== ADMIN POLL ENDPOINTS ====================

// Admin: list all polls
app.get('/api/admin/polls', checkAdminAuth, async (req, res) => {
  try {
    const polls = await db.getAllPolls();
    const now = new Date();
    for (const poll of polls) {
      if (poll.status === 'active' && new Date(poll.expires_at) <= now) {
        poll.status = 'closed';
        await db.updatePoll(poll.id, { status: 'closed' });
      }
      delete poll.voters;
    }
    res.json({ success: true, polls });
  } catch (error) {
    console.error('❌ Admin get polls error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch polls.' });
  }
});

// Admin: create poll
app.post('/api/admin/polls', checkAdminAuth, [
  body('question').trim().notEmpty().withMessage('Question is required'),
  body('options').isArray({ min: 2 }).withMessage('At least 2 options required'),
  body('duration_type').isIn(['24h', '1week', 'custom']).withMessage('Invalid duration type'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  }

  try {
    const { question, options, duration_type, expires_at, anonymous, created_by } = req.body;

    let expiresAt;
    if (duration_type === '24h') {
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    } else if (duration_type === '1week') {
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    } else {
      if (!expires_at) {
        return res.status(400).json({ success: false, message: 'Custom expiry date required.' });
      }
      expiresAt = new Date(expires_at).toISOString();
    }

    const formattedOptions = options.map((text, idx) => ({
      id: idx,
      text: typeof text === 'string' ? text.trim() : text.text?.trim() || `Option ${idx + 1}`,
      votes: 0,
    }));

    const pollId = await db.createPoll({
      question: question.trim(),
      options: formattedOptions,
      created_by: (typeof created_by === 'string' && created_by.trim()) ? created_by.trim() : 'admin@panel',
      expires_at: expiresAt,
      duration_type,
      anonymous: anonymous === true,
    });

    console.log(`📊 Admin created poll: "${question.trim()}" (${pollId})`);
    res.json({ success: true, pollId, message: 'Poll created successfully.' });
  } catch (error) {
    console.error('❌ Admin create poll error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to create poll.' });
  }
});

// Admin: update poll fields (status / publish_results)
app.put('/api/admin/polls/:id', checkAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const poll = await db.getPoll(id);
    if (!poll) {
      return res.status(404).json({ success: false, message: 'Poll not found.' });
    }

    const updates = {};
    if (typeof req.body.publish_results === 'boolean') {
      updates.publish_results = req.body.publish_results;
    }
    if (req.body.status === 'active' || req.body.status === 'closed') {
      updates.status = req.body.status;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update.' });
    }

    await db.updatePoll(id, updates);
    res.json({ success: true, message: 'Poll updated successfully.' });
  } catch (error) {
    console.error('❌ Admin update poll error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update poll.' });
  }
});

// Admin: delete poll
app.delete('/api/admin/polls/:id', checkAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.deletePoll(id);
    if (!result.deleted) {
      return res.status(404).json({ success: false, message: 'Poll not found.' });
    }
    res.json({ success: true, message: 'Poll deleted successfully.' });
  } catch (error) {
    console.error('❌ Admin delete poll error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to delete poll.' });
  }
});

// ==================== DEV MAIL ENDPOINTS ====================

// Admin: Create a new dev mail
app.post('/api/admin/dev-mails', checkAdminAuth, [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('body').trim().notEmpty().withMessage('Body is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  }
  try {
    const { title, body: mailBody, pinned } = req.body;
    const mailId = await db.createDevMail({ title, body: mailBody, pinned });
    console.log(`📧 Admin created dev mail: "${title}" (${mailId})`);
    res.json({ success: true, mailId });
  } catch (error) {
    console.error('❌ Create dev mail error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to create mail.' });
  }
});

// Admin: Get all dev mails
app.get('/api/admin/dev-mails', checkAdminAuth, async (req, res) => {
  try {
    const mails = await db.getAllDevMails();
    res.json({ success: true, mails, count: mails.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Update a dev mail
app.put('/api/admin/dev-mails/:id', checkAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, body: mailBody, pinned } = req.body;
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (mailBody !== undefined) updates.body = mailBody;
    if (pinned !== undefined) updates.pinned = pinned;
    await db.updateDevMail(id, updates);
    console.log(`📧 Admin updated dev mail: ${id}`);
    res.json({ success: true, message: 'Mail updated.' });
  } catch (error) {
    console.error('❌ Update dev mail error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update mail.' });
  }
});

// Admin: Delete a dev mail
app.delete('/api/admin/dev-mails/:id', checkAdminAuth, async (req, res) => {
  try {
    const result = await db.deleteDevMail(req.params.id);
    if (result.deleted) {
      console.log(`🗑️ Admin deleted dev mail: ${req.params.id}`);
      res.json({ success: true, message: 'Mail deleted.' });
    } else {
      res.status(404).json({ success: false, message: 'Mail not found.' });
    }
  } catch (error) {
    console.error('❌ Delete dev mail error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to delete mail.' });
  }
});

// Public: Get all dev mails (any authenticated user)
app.get('/api/dev-mails', requireAnyAuth, async (req, res) => {
  try {
    const mails = await db.getAllDevMails();
    const userEmail = normalizeEmail(req.userEmail);
    const visibleMails = mails.filter((mail) => {
      const targetEmail = normalizeEmail(mail.target_email);
      return !targetEmail || targetEmail === userEmail;
    });
    res.json({ success: true, mails: visibleMails });
  } catch (error) {
    console.error('❌ Get dev mails error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch mails.' });
  }
});

// ==================== ERROR HANDLING ====================

app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: 'API endpoint not found' });
});

// ==================== ERROR HANDLER ====================

app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err.message);
  res.status(500).json({
    success: false,
    error: IS_PROD ? 'An unexpected error occurred' : err.message,
    message: 'An unexpected error occurred. Please try again.',
  });
});

// ==================== START SERVER ====================

const server = app.listen(PORT, () => {
  console.log('');
  console.log(`🚀 Tlangau Server running on port ${PORT}`);
  console.log(`🌐 http://localhost:${PORT}`);
  console.log('');
});

// Graceful shutdown
function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('⚠️  Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message);
  server.close(() => process.exit(1));
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
});
