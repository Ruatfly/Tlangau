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
const FREE_SERVICES = ['statistics'];
const VALID_SERVICE_IDS = Object.keys(PAID_SERVICES);
const SERVICE_PRICE = 10; // ₹10 per service (configurable)

// ==================== PAYMENT SESSION CONFIG ====================
const PAYMENT_SESSION_MINUTES = 10;

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

// Build email HTML with service info
function buildAccessCodeEmailHtml(code, services) {
  const serviceNames = getServiceNames(services);
  const servicesHtml = serviceNames.map(s => `<li style="padding: 4px 0;">✅ ${s}</li>`).join('');
  const totalAmount = (services && services.length > 0) ? services.length * SERVICE_PRICE : SERVICE_PRICE;

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
          <h1>🎉 Welcome to Tlangau Server Access</h1>
        </div>
        <div class="content">
          <p>Thank you for your purchase of <strong>₹${totalAmount}</strong>!</p>
          <p>Your server access code has been generated successfully.</p>
          
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
            <li>Enter this code in the "Server access code" field when signing in</li>
            <li>Keep this code secure and do not share it</li>
            <li>Code is valid for 30 days from purchase</li>
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
async function sendAccessCodeEmail(email, code, services, retries = 3) {
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

  const htmlContent = buildAccessCodeEmailHtml(code, services);

  const mailOptions = {
    from: (process.env.EMAIL_FROM || 'ruatfelachhakchhuak243@gmail.com').trim(),
    to: email,
    subject: 'Your Tlangau Server Access Code',
    html: htmlContent,
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`📧 Sending access code to ${email} (attempt ${attempt}/${retries})`);

      if (EMAIL_SERVICE === 'sendgrid' && transporter && transporter.type === 'sendgrid') {
        const msg = {
          to: email,
          from: process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_USER || 'noreply@tlangau.com',
          subject: 'Your Tlangau Server Access Code',
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
    freeServices: FREE_SERVICES.map(id => ({ id, name: 'Statistics & Insights' })),
    pricePerService: SERVICE_PRICE,
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
      // Deduplicate services
      const uniqueServices = [...new Set(services)].filter(s => VALID_SERVICE_IDS.includes(s));

      if (uniqueServices.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'At least one valid service must be selected.',
        });
      }

      // Calculate amount server-side (never trust client amount)
      const amount = uniqueServices.length * SERVICE_PRICE;
      const orderId = `order_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
      const emailLower = email.toLowerCase().trim();

      const serviceNames = uniqueServices.map(s => PAID_SERVICES[s].name).join(', ');
      console.log(`📝 New payment: ${emailLower} | ₹${amount} | ${orderId} | Services: ${serviceNames}`);

      // Create order in database with services
      await db.createOrder({
        orderId,
        email: emailLower,
        amount: amount * 100, // Store in paise
        status: 'PENDING',
        services: uniqueServices,
      });

      const frontendUrl = process.env.FRONTEND_URL || 'https://tlangau.onrender.com';
      const backendUrl = process.env.BACKEND_URL || 'https://tlangau.onrender.com';

      const purposeDetail = uniqueServices.length === 3
        ? 'All Services'
        : serviceNames;

      const paymentData = {
        purpose: `Tlangau: ${purposeDetail}`,
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

  if (!existingCode) {
    const accessCode = generateAccessCode();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await db.createAccessCode({
      code: accessCode,
      email: order.email,
      orderId: order.order_id,
      paymentId: paymentId,
      used: false,
      expiresAt,
      services: orderServices,
    });
    console.log(`✅ Access code created: ${accessCode} | Services: ${orderServices.join(', ')}`);
    accessCodeToSend = accessCode;
  }

  if (accessCodeToSend) {
    const emailSent = await sendAccessCodeEmail(order.email, accessCodeToSend, orderServices);
    if (!emailSent) {
      console.error(`❌ CRITICAL: Email NOT sent to ${order.email} | Code: ${accessCodeToSend}`);
      console.error('   ⚠️  Manual intervention required!');
    }
  }

  return { verified: true, status: 'SUCCESS' };
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
        return res.json({
          success: true,
          paymentStatus: 'SUCCESS',
          services: order.services || VALID_SERVICE_IDS,
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
            services: order.services || VALID_SERVICE_IDS,
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

      const accountHasUsedCode = await db.hasAccountUsedCode(userAccountId);
      if (accountHasUsedCode) {
        return res.json({
          success: false,
          valid: false,
          message: 'This account has already used an access code. Each account can only use one code.',
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

      await db.markCodeAsUsed(codeUpper, emailLower, userAccountId);
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
        expiresAt: accessCode.expiresAt || accessCode.expires_at,
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

      const testResult = await sendAccessCodeEmail(email, 'TEST123456', ['ring', 'message']);
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
      const accessCode = await db.getCodeByEmail(emailLower);

      if (!accessCode) {
        return res.json({ success: false, valid: false, message: 'No access code found for this email' });
      }

      const codeServices = accessCode.services || VALID_SERVICE_IDS;
      const allServices = [...new Set([...codeServices, ...FREE_SERVICES])];

      res.json({
        success: true,
        code: accessCode.code,
        expiresAt: accessCode.expiresAt || accessCode.expires_at,
        used: accessCode.used,
        services: allServices,
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

      const emailSent = await sendAccessCodeEmail(emailLower, accessCode.code, accessCode.services);
      if (emailSent) {
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
      accessCode = await db.getCodeByEmail(email);
      accessCodeCache.set(email, { accessCode, cachedAt: Date.now() });
    }

    if (!accessCode) {
      return res.status(403).json({ success: false, message: 'Server access not authorized for this account.' });
    }

    const expiresAt = new Date(accessCode.expiresAt || accessCode.expires_at);
    if (expiresAt < new Date()) {
      return res.status(403).json({ success: false, message: 'Your server access code has expired.' });
    }

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

// ==================== ERROR HANDLING ====================

app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: 'API endpoint not found' });
});

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
