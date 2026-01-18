const express = require('express');
const cors = require('cors');
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

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files (frontend)
app.use(express.static(path.join(__dirname)));

// Initialize database
const db = new Database();
db.init().catch(err => {
  console.error('❌ Database initialization failed:', err);
  process.exit(1);
});

// Initialize email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Generate random access code
function generateAccessCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 12; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Send email with access code
async function sendAccessCodeEmail(email, code) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Your Tlangau Server Access Code',
    html: `
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
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Welcome to Tlangau Server Access</h1>
          </div>
          <div class="content">
            <p>Thank you for your purchase!</p>
            <p>Your server access code has been generated successfully. Use this code to access the server dashboard in the Tlangau app.</p>
            
            <div class="code-box">
              <p style="margin: 0 0 10px 0; color: #666;">Your Access Code:</p>
              <div class="code">${code}</div>
            </div>
            
            <p><strong>Important:</strong></p>
            <ul>
              <li>This code can only be used once per account</li>
              <li>Enter this code in the "Server access code" field when signing in</li>
              <li>Keep this code secure and do not share it</li>
              <li>Code is valid for 30 days from purchase</li>
            </ul>
            
            <p>If you have any questions, please contact our support team.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Tlangau. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Access code email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('❌ Error sending email:', error);
    return false;
  }
}

// Instamojo API configuration
const INSTAMOJO_ENV = process.env.INSTAMOJO_ENV || 'test';
// Instamojo uses the same API URL for both test and production
// Test/production is determined by the API keys you use
// Using API v1.1 which is the stable version
const INSTAMOJO_API_BASE = 'https://www.instamojo.com/api/1.1';
const INSTAMOJO_API_KEY = process.env.INSTAMOJO_API_KEY;
const INSTAMOJO_AUTH_TOKEN = process.env.INSTAMOJO_AUTH_TOKEN;

// Log configuration on startup
console.log('🔧 Configuration:');
console.log('  PORT:', PORT);
console.log('  INSTAMOJO_ENV:', INSTAMOJO_ENV);
console.log('  INSTAMOJO_API_BASE:', INSTAMOJO_API_BASE);
console.log('  INSTAMOJO_API_KEY:', INSTAMOJO_API_KEY ? 'Set' : 'Not set');
console.log('  INSTAMOJO_AUTH_TOKEN:', INSTAMOJO_AUTH_TOKEN ? 'Set' : 'Not set');
console.log('  EMAIL_USER:', process.env.EMAIL_USER ? 'Set' : 'Not set');
console.log('  FRONTEND_URL:', process.env.FRONTEND_URL || 'Not set');
console.log('  BACKEND_URL:', process.env.BACKEND_URL || 'Not set');

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Tlangau Server Access Portal API is running' });
});

// Create payment link (Instamojo)
app.post(
  '/api/create-payment',
  [
    body('email').isEmail().normalizeEmail(),
    body('amount').optional().isNumeric(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.error('❌ Validation errors:', JSON.stringify(errors.array(), null, 2));
        console.error('❌ Request body:', JSON.stringify(req.body, null, 2));
        return res.status(400).json({ 
          success: false, 
          error: 'Validation failed',
          errors: errors.array(),
          message: errors.array()[0]?.msg || 'Invalid request data',
          received: req.body
        });
      }

      // Check if Instamojo credentials are configured
      if (!INSTAMOJO_API_KEY || !INSTAMOJO_AUTH_TOKEN) {
        console.error('❌ Instamojo credentials not configured');
        return res.status(500).json({
          success: false,
          error: 'Payment gateway not configured. Please set INSTAMOJO_API_KEY and INSTAMOJO_AUTH_TOKEN environment variables.',
        });
      }

      const { email } = req.body;
      const amount = 10; // ₹10
      const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const emailLower = email.toLowerCase().trim();

      console.log('📝 Create payment request received:', { email: emailLower, amount, orderId });

      // Create order in database (will update with payment_request_id after creation)
      await db.createOrder({
        orderId,
        email: emailLower,
        amount: amount * 100, // Store in paise
        status: 'PENDING',
      });

      // Create payment link with Instamojo
      try {
        const frontendUrl = process.env.FRONTEND_URL || 'https://ruatfly.github.io/Tlangau';
        const backendUrl = process.env.BACKEND_URL || `http://localhost:${PORT}`;

        // Prepare Instamojo payment link data
        const paymentData = {
          purpose: 'Tlangau Server Access Code',
          amount: amount,
          currency: 'INR',
          buyer_name: emailLower.split('@')[0],
          email: emailLower,
          redirect_url: `${frontendUrl}/success.html?order_id=${orderId}`,
          webhook: `${backendUrl}/api/payment-webhook`,
          allow_repeated_payments: false,
        };

        // Create payment link via Instamojo API
        const instamojoResponse = await axios.post(
          `${INSTAMOJO_API_BASE}/payment-requests/`,
          paymentData,
          {
            headers: {
              'X-Api-Key': INSTAMOJO_API_KEY,
              'X-Auth-Token': INSTAMOJO_AUTH_TOKEN,
            },
          }
        );

        if (instamojoResponse.data.success) {
          const paymentLink = instamojoResponse.data.payment_request;
          console.log('✅ Instamojo payment link created:', paymentLink);

          // Update order with payment_request_id
          await db.updateOrder(orderId, {
            payment_request_id: paymentLink.id,
          });

          res.json({
            success: true,
            orderId: orderId,
            paymentId: paymentLink.id,
            paymentUrl: paymentLink.longurl,
            amount: amount,
            currency: 'INR',
          });
        } else {
          throw new Error(instamojoResponse.data.message || 'Failed to create payment link');
        }
      } catch (error) {
        console.error('❌ Error creating Instamojo payment:', error.response?.data || error.message);
        console.error('❌ Full error:', JSON.stringify(error.response?.data || error.message, null, 2));
        // Update order status to failed
        await db.updateOrder(orderId, { status: 'FAILED' });
        
        // Extract error message from Instamojo response
        let errorMessage = 'Failed to create payment link';
        const instamojoError = error.response?.data;
        
        if (instamojoError) {
          // Instamojo returns errors in different formats
          if (instamojoError.message && typeof instamojoError.message === 'object') {
            // Error is an object with field-specific errors (e.g., {amount: ["Amount cannot be less than INR 9.00."]})
            const errorFields = Object.keys(instamojoError.message);
            const firstError = instamojoError.message[errorFields[0]];
            errorMessage = Array.isArray(firstError) ? firstError[0] : String(firstError);
          } else if (instamojoError.message && typeof instamojoError.message === 'string') {
            errorMessage = instamojoError.message;
          } else if (instamojoError.error) {
            errorMessage = typeof instamojoError.error === 'string' 
              ? instamojoError.error 
              : JSON.stringify(instamojoError.error);
          } else if (instamojoError.success === false && instamojoError.message) {
            errorMessage = typeof instamojoError.message === 'string'
              ? instamojoError.message
              : JSON.stringify(instamojoError.message);
          }
        } else {
          errorMessage = error.message || 'Failed to create payment link';
        }
        
        res.status(error.response?.status || 500).json({
          success: false,
          error: errorMessage,
          details: instamojoError || {},
          message: `Payment gateway error: ${errorMessage}`,
        });
      }
    } catch (error) {
      console.error('❌ Error in create-payment:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Payment webhook (Instamojo)
app.post('/api/payment-webhook', async (req, res) => {
  try {
    const webhookData = req.body;
    console.log('📥 Payment webhook received:', webhookData);

    // Instamojo sends payment_request_id and payment_id
    const { payment_request_id, payment_id } = webhookData;

    if (!payment_request_id) {
      console.error('❌ Webhook missing payment_request_id');
      return res.status(400).json({ success: false, message: 'Missing payment_request_id' });
    }

    // Find order by payment_request_id
    let order = await db.getOrderByPaymentRequestId(payment_request_id);

    // If not found, try to get payment details and find by email
    if (!order && payment_id) {
      try {
        const paymentResponse = await axios.get(
          `${INSTAMOJO_API_BASE}/payments/${payment_id}/`,
          {
            headers: {
              'X-Api-Key': INSTAMOJO_API_KEY,
              'X-Auth-Token': INSTAMOJO_AUTH_TOKEN,
            },
          }
        );

        if (paymentResponse.data.success) {
          const payment = paymentResponse.data.payment;
          const buyerEmail = payment.buyer_email || payment.email || payment.buyer;

          if (buyerEmail) {
            // Find order by email (most recent pending order)
            order = await db.getOrderByEmail(buyerEmail);
          }
        }
      } catch (error) {
        console.error('❌ Error fetching payment details:', error.response?.data || error.message);
      }
    }

    if (!order) {
      console.error('❌ Order not found for payment_request_id:', payment_request_id);
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Check payment status with Instamojo API
    try {
      if (payment_id) {
        const paymentResponse = await axios.get(
          `${INSTAMOJO_API_BASE}/payments/${payment_id}/`,
          {
            headers: {
              'X-Api-Key': INSTAMOJO_API_KEY,
              'X-Auth-Token': INSTAMOJO_AUTH_TOKEN,
            },
          }
        );

        if (paymentResponse.data.success) {
          const payment = paymentResponse.data.payment;

          // CRITICAL VERIFICATION: Verify payment status, amount, and payment_request_id
          const expectedAmount = order.amount / 100; // Convert from paise to rupees
          const paymentAmount = parseFloat(payment.amount);
          const paymentStatus = payment.status;
          const paymentRequestId = payment.payment_request?.id || payment.payment_request_id;

          console.log('🔍 Payment verification:', {
            paymentStatus,
            expectedAmount,
            paymentAmount,
            paymentRequestId,
            orderPaymentRequestId: order.payment_request_id,
          });

          // Verify payment status is 'Credit'
          if (paymentStatus !== 'Credit') {
            console.log('⚠️ Payment status is not Credit:', paymentStatus);
            if (paymentStatus === 'Failed') {
              await db.updateOrder(order.order_id, {
                status: 'FAILED',
                payment_id: payment_id,
              });
            }
            return res.json({ success: true, message: 'Webhook processed - payment not successful' });
          }

          // Verify amount matches
          if (Math.abs(paymentAmount - expectedAmount) > 0.01) {
            console.error('❌ Amount mismatch:', {
              expected: expectedAmount,
              received: paymentAmount,
            });
            return res.status(400).json({ 
              success: false, 
              message: 'Payment amount mismatch' 
            });
          }

          // Verify payment_request_id matches
          if (paymentRequestId && order.payment_request_id && paymentRequestId !== order.payment_request_id) {
            console.error('❌ Payment request ID mismatch:', {
              expected: order.payment_request_id,
              received: paymentRequestId,
            });
            return res.status(400).json({ 
              success: false, 
              message: 'Payment request ID mismatch' 
            });
          }

          // All verifications passed - Payment is successful
          console.log('✅ Payment verification passed - all checks successful');
          
          await db.updateOrder(order.order_id, {
            status: 'SUCCESS',
            payment_id: payment_id,
          });

          // Check if access code already exists for this order
          const existingCode = await db.getCodeByOrderId(order.order_id);
          if (!existingCode) {
            // Generate access code
            const accessCode = generateAccessCode();
            const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

            // Create access code in database
            await db.createAccessCode({
              code: accessCode,
              email: order.email,
              orderId: order.order_id,
              paymentId: payment_id,
              used: false,
              expiresAt: expiresAt,
            });

            console.log('✅ Access code created:', accessCode);

            // Send email with access code
            await sendAccessCodeEmail(order.email, accessCode);
          } else {
            console.log('ℹ️ Access code already exists for this order');
          }
        }
      }
    } catch (error) {
      console.error('❌ Error checking Instamojo payment status:', error.response?.data || error.message);
    }

    res.json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Verify payment (for frontend callback)
app.post(
  '/api/verify-payment',
  [
    body('orderId').notEmpty(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { orderId } = req.body;
      console.log('🔍 Verifying payment for order:', orderId);

      // Get order from database
      const order = await db.getOrder(orderId);
      if (!order) {
        return res.json({ success: false, message: 'Order not found' });
      }

      // If order is already successful, return immediately
      if (order.status === 'SUCCESS') {
        return res.json({
          success: true,
          paymentStatus: 'SUCCESS',
          message: 'Payment verified successfully',
        });
      }

      // Check payment status with Instamojo using payment_id if available
      if (order.payment_id) {
        try {
          const paymentResponse = await axios.get(
            `${INSTAMOJO_API_BASE}/payments/${order.payment_id}/`,
            {
              headers: {
                'X-Api-Key': INSTAMOJO_API_KEY,
                'X-Auth-Token': INSTAMOJO_AUTH_TOKEN,
              },
            }
          );

          if (paymentResponse.data.success) {
            const payment = paymentResponse.data.payment;

            // CRITICAL VERIFICATION: Verify payment status, amount, and payment_request_id
            const expectedAmount = order.amount / 100; // Convert from paise to rupees
            const paymentAmount = parseFloat(payment.amount);
            const paymentStatus = payment.status;
            const paymentRequestId = payment.payment_request?.id || payment.payment_request_id;

            console.log('🔍 Payment verification (redirect):', {
              paymentStatus,
              expectedAmount,
              paymentAmount,
              paymentRequestId,
              orderPaymentRequestId: order.payment_request_id,
            });

            // Verify payment status is 'Credit'
            if (paymentStatus === 'Credit') {
              // Verify amount matches
              if (Math.abs(paymentAmount - expectedAmount) > 0.01) {
                console.error('❌ Amount mismatch:', {
                  expected: expectedAmount,
                  received: paymentAmount,
                });
                return res.json({
                  success: false,
                  paymentStatus: 'FAILED',
                  message: 'Payment amount mismatch',
                });
              }

              // Verify payment_request_id matches
              if (paymentRequestId && order.payment_request_id && paymentRequestId !== order.payment_request_id) {
                console.error('❌ Payment request ID mismatch:', {
                  expected: order.payment_request_id,
                  received: paymentRequestId,
                });
                return res.json({
                  success: false,
                  paymentStatus: 'FAILED',
                  message: 'Payment request ID mismatch',
                });
              }

              // All verifications passed - Payment is successful
              console.log('✅ Payment verification passed - all checks successful');
              
              // Update order status
              await db.updateOrder(orderId, {
                status: 'SUCCESS',
                payment_id: payment.id,
              });

              // Check if access code exists, if not generate one
              const accessCode = await db.getCodeByOrderId(orderId);
              if (!accessCode) {
                const newAccessCode = generateAccessCode();
                const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

                await db.createAccessCode({
                  code: newAccessCode,
                  email: order.email,
                  orderId: orderId,
                  paymentId: payment.id,
                  used: false,
                  expiresAt: expiresAt,
                });

                await sendAccessCodeEmail(order.email, newAccessCode);
              }

              return res.json({
                success: true,
                paymentStatus: 'SUCCESS',
                message: 'Payment verified successfully',
              });
            } else if (paymentStatus === 'Failed') {
              await db.updateOrder(orderId, {
                status: 'FAILED',
                payment_id: payment.id,
              });
              return res.json({
                success: true,
                paymentStatus: 'FAILED',
                message: 'Payment failed',
              });
            }
          }
        } catch (error) {
          console.error('❌ Error checking Instamojo payment status:', error.response?.data || error.message);
        }
      }

      // Return current order status
      res.json({
        success: true,
        paymentStatus: order.status,
        message: order.status === 'SUCCESS' ? 'Payment successful' : 'Payment pending or failed',
      });
    } catch (error) {
      console.error('❌ Error verifying payment:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Validate access code (for Flutter app)
app.post(
  '/api/validate-code',
  [
    body('code').notEmpty().trim(),
    body('email').isEmail().normalizeEmail(),
  ],
  async (req, res) => {
    try {
      console.log('🔍 Validate code request received:', {
        code: req.body.code,
        email: req.body.email,
        accountId: req.body.accountId,
      });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.error('❌ Validation errors:', errors.array());
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { code, email, accountId } = req.body;
      const userAccountId = accountId || email; // Use email as account ID if not provided
      const codeUpper = code.trim().toUpperCase();
      const emailLower = email.toLowerCase().trim();

      console.log('🔍 Looking for code:', codeUpper);
      console.log('🔍 For email:', emailLower);
      console.log('🔍 Account ID:', userAccountId);

      // Get code from database
      const accessCode = await db.getCodeByCode(codeUpper);

      if (!accessCode) {
        console.log('❌ Code not found in database:', codeUpper);
        return res.json({ success: false, valid: false, message: 'Invalid access code' });
      }

      console.log('✅ Code found in database:', {
        code: accessCode.code,
        email: accessCode.email,
        used: accessCode.used,
        expires_at: accessCode.expires_at,
      });

      // Check if code has expired (1 month validity)
      const expiresAt = new Date(accessCode.expires_at);
      const now = new Date();
      if (expiresAt < now) {
        console.log('❌ Code expired:', {
          expiresAt: expiresAt.toISOString(),
          now: now.toISOString(),
        });
        return res.json({ 
          success: false, 
          valid: false, 
          message: 'This access code has expired. Please purchase a new code.' 
        });
      }

      if (accessCode.used) {
        console.log('❌ Code already used');
        return res.json({
          success: false,
          valid: false,
          message: 'This access code has already been used',
        });
      }

      // Check if this account has already used a code
      const accountHasUsedCode = await db.hasAccountUsedCode(userAccountId);
      if (accountHasUsedCode) {
        console.log('❌ Account has already used a code:', userAccountId);
        return res.json({ 
          success: false, 
          valid: false, 
          message: 'This account has already used an access code. Each account can only use one code.' 
        });
      }

      // Check if email matches
      const codeEmail = accessCode.email.toLowerCase().trim();
      if (codeEmail !== emailLower) {
        console.log('❌ Email mismatch:', {
          codeEmail: codeEmail,
          providedEmail: emailLower,
        });
        return res.json({
          success: false,
          valid: false,
          message: 'This access code is not associated with your email. Please use the email address you used to purchase the code.',
        });
      }

      // Mark code as used with account ID
      await db.markCodeAsUsed(codeUpper, emailLower, userAccountId);
      console.log('✅ Code marked as used for account:', userAccountId);

      res.json({
        success: true,
        valid: true,
        message: 'Access code is valid',
        code: codeUpper,
        expiresAt: accessCode.expires_at, // Return expiry date for client
      });
    } catch (error) {
      console.error('❌ Error validating code:', error);
      res.status(500).json({ success: false, message: 'Failed to validate code: ' + error.message });
    }
  }
);

// Get access code info for already-authorized users (by email)
app.post(
  '/api/get-code-info',
  [
    body('email').isEmail().normalizeEmail(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { email } = req.body;
      const emailLower = email.toLowerCase().trim();

      console.log('🔍 Getting code info for email:', emailLower);

      // Get the most recent code for this email (even if used)
      const accessCode = await db.getCodeByEmail(emailLower);

      if (!accessCode) {
        console.log('❌ No code found for email:', emailLower);
        return res.json({
          success: false,
          message: 'No access code found for this email',
        });
      }

      console.log('✅ Code info found:', {
        code: accessCode.code,
        email: accessCode.email,
        used: accessCode.used,
        expires_at: accessCode.expires_at,
      });

      res.json({
        success: true,
        code: accessCode.code,
        expiresAt: accessCode.expires_at,
        used: accessCode.used,
        message: 'Access code info retrieved',
      });
    } catch (error) {
      console.error('❌ Error getting code info:', error);
      res.status(500).json({ success: false, message: 'Failed to get code info: ' + error.message });
    }
  }
);

// ==================== ADMIN ROUTES ====================
// Secure password-based admin authentication
// Password: RUATfela44..
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'RUATfela44..';

// Hash password for secure comparison (using SHA-256)
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Store hashed password (hash once at startup)
const ADMIN_PASSWORD_HASH = hashPassword(ADMIN_PASSWORD);

// Middleware to check admin password
const checkAdminAuth = (req, res, next) => {
  const providedPassword = req.headers['x-admin-password'] || req.body.password || req.query.password;
  
  if (!providedPassword) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Admin password required',
    });
  }

  // Hash provided password and compare
  const providedHash = hashPassword(providedPassword);
  
  // Use constant-time comparison to prevent timing attacks
  if (crypto.timingSafeEqual(Buffer.from(providedHash), Buffer.from(ADMIN_PASSWORD_HASH))) {
    next();
  } else {
    // Log failed attempt (for security monitoring)
    console.warn('⚠️ Failed admin login attempt from:', req.ip);
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid admin password',
    });
  }
};

// Admin login (returns success if password is correct)
app.post('/api/admin/login', [
  body('password').notEmpty().withMessage('Password is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { password } = req.body;
    const providedHash = hashPassword(password);
    
    // Constant-time comparison
    if (crypto.timingSafeEqual(Buffer.from(providedHash), Buffer.from(ADMIN_PASSWORD_HASH))) {
      console.log('✅ Admin login successful from:', req.ip);
      res.json({
        success: true,
        message: 'Login successful',
      });
    } else {
      console.warn('⚠️ Failed admin login attempt from:', req.ip);
      res.status(401).json({
        success: false,
        error: 'Invalid password',
      });
    }
  } catch (error) {
    console.error('❌ Error in admin login:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all orders (admin only)
app.get('/api/admin/orders', checkAdminAuth, async (req, res) => {
  try {
    const orders = await db.getAllOrders();
    res.json({
      success: true,
      orders: orders,
      count: orders.length,
    });
  } catch (error) {
    console.error('❌ Error fetching orders:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all access codes (admin only)
app.get('/api/admin/access-codes', checkAdminAuth, async (req, res) => {
  try {
    const codes = await db.getAllAccessCodes();
    res.json({
      success: true,
      codes: codes,
      count: codes.length,
    });
  } catch (error) {
    console.error('❌ Error fetching access codes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete access code (admin only)
app.delete('/api/admin/access-codes/:code', checkAdminAuth, async (req, res) => {
  try {
    const { code } = req.params;
    const codeUpper = code.toUpperCase();
    const result = await db.deleteAccessCode(codeUpper);
    
    if (result.deleted) {
      console.log(`✅ Admin deleted access code: ${codeUpper} from IP: ${req.ip}`);
      res.json({
        success: true,
        message: 'Access code deleted successfully',
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Access code not found',
      });
    }
  } catch (error) {
    console.error('❌ Error deleting access code:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete order and associated access codes (admin only)
app.delete('/api/admin/orders/:orderId', checkAdminAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const result = await db.deleteOrder(orderId);
    
    if (result.deleted) {
      console.log(`✅ Admin deleted order: ${orderId} from IP: ${req.ip}`);
      res.json({
        success: true,
        message: 'Order and associated access codes deleted successfully',
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }
  } catch (error) {
    console.error('❌ Error deleting order:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete user by email (all orders and access codes) (admin only)
app.delete('/api/admin/users/:email', checkAdminAuth, async (req, res) => {
  try {
    const { email } = req.params;
    const emailLower = email.toLowerCase().trim();
    const result = await db.deleteUserByEmail(emailLower);
    
    if (result.deleted) {
      console.log(`✅ Admin deleted user data for: ${emailLower} from IP: ${req.ip}`);
      res.json({
        success: true,
        message: 'User data deleted successfully',
        deletedOrders: result.deletedOrders,
        deletedCodes: result.deletedCodes,
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
  } catch (error) {
    console.error('❌ Error deleting user:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get statistics (admin only)
app.get('/api/admin/statistics', checkAdminAuth, async (req, res) => {
  try {
    const stats = await db.getStatistics();
    res.json({
      success: true,
      statistics: stats,
    });
  } catch (error) {
    console.error('❌ Error fetching statistics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all unique users/emails (admin only)
app.get('/api/admin/users', checkAdminAuth, async (req, res) => {
  try {
    const orders = await db.getAllOrders();
    // Get unique emails with their order counts
    const userMap = new Map();
    orders.forEach(order => {
      const email = order.email.toLowerCase().trim();
      if (!userMap.has(email)) {
        userMap.set(email, {
          email: email,
          totalOrders: 0,
          successfulOrders: 0,
          totalSpent: 0,
          firstOrder: order.created_at,
          lastOrder: order.created_at,
        });
      }
      const user = userMap.get(email);
      user.totalOrders++;
      if (order.status === 'SUCCESS') {
        user.successfulOrders++;
        user.totalSpent += order.amount / 100; // Convert from paise to rupees
      }
      if (new Date(order.created_at) < new Date(user.firstOrder)) {
        user.firstOrder = order.created_at;
      }
      if (new Date(order.created_at) > new Date(user.lastOrder)) {
        user.lastOrder = order.created_at;
      }
    });

    const users = Array.from(userMap.values()).sort((a, b) => 
      new Date(b.lastOrder) - new Date(a.lastOrder)
    );

    res.json({
      success: true,
      users: users,
      count: users.length,
    });
  } catch (error) {
    console.error('❌ Error fetching users:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Note: Bundles and topics deletion endpoints can be added here when Firebase integration is available
// For now, these would require Firebase Admin SDK to delete from Firebase Realtime Database

// Error handling middleware (must be last)
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
    message: 'An unexpected error occurred',
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Tlangau Server Access Portal API running on port ${PORT}`);
  console.log(`🌐 Frontend available at http://localhost:${PORT}`);
  console.log(`📧 Email service: ${process.env.EMAIL_USER ? 'Configured' : 'Not configured'}`);
  console.log(`💳 Payment gateway: ${INSTAMOJO_API_KEY ? 'Configured (Instamojo)' : 'Not configured'}`);
});

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  server.close(() => {
    process.exit(1);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
