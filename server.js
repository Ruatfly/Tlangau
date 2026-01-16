const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { body, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const path = require('path');
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
db.init();

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

// Cashfree API configuration
const CASHFREE_API_BASE = process.env.CASHFREE_ENV === 'production' 
  ? 'https://api.cashfree.com' 
  : 'https://sandbox.cashfree.com';
const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID;
const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY;

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Tlangau Server Access Portal API is running' });
});

// Create payment order (Cashfree)
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
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { email } = req.body;
      const amount = 100; // ₹1 in paise
      const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const emailLower = email.toLowerCase().trim();

      console.log('📝 Create payment request received:', { email: emailLower, amount, orderId });

      // Create order in database
      await db.createOrder({
        orderId,
        email: emailLower,
        amount,
        status: 'PENDING',
      });

      // Create payment order with Cashfree
      try {
        const frontendUrl = process.env.FRONTEND_URL || 'https://ruatfly.github.io/Tlangau';
        const backendUrl = process.env.BACKEND_URL || `http://localhost:${PORT}`;
        
        const cashfreeResponse = await fetch(`${CASHFREE_API_BASE}/pg/orders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-client-id': CASHFREE_APP_ID,
            'x-client-secret': CASHFREE_SECRET_KEY,
            'x-api-version': '2023-08-01',
          },
          body: JSON.stringify({
            order_id: orderId,
            order_amount: amount,
            order_currency: 'INR',
            customer_details: {
              customer_id: emailLower,
              customer_email: emailLower,
              customer_name: emailLower.split('@')[0],
            },
            order_meta: {
              return_url: `${frontendUrl}/success.html?order_id={order_id}`,
              notify_url: `${backendUrl}/api/payment-webhook`,
            },
          }),
        });

        if (!cashfreeResponse.ok) {
          const errorData = await cashfreeResponse.json();
          console.error('❌ Cashfree API error:', errorData);
          throw new Error(errorData.message || 'Failed to create payment order');
        }

        const cashfreeData = await cashfreeResponse.json();
        console.log('✅ Cashfree payment order created:', cashfreeData);

        // Construct payment URL
        const paymentUrl = process.env.CASHFREE_ENV === 'production'
          ? `https://payments.cashfree.com/forms/${cashfreeData.payment_session_id}`
          : `https://sandbox.cashfree.com/pg/checkout/${cashfreeData.payment_session_id}`;

        res.json({
          success: true,
          orderId: orderId,
          paymentSessionId: cashfreeData.payment_session_id,
          paymentUrl: paymentUrl,
          amount: amount,
          currency: 'INR',
        });
      } catch (error) {
        console.error('❌ Error creating Cashfree payment:', error);
        // Update order status to failed
        await db.updateOrder(orderId, { status: 'FAILED' });
        res.status(500).json({
          success: false,
          error: error.message || 'Failed to create payment order',
        });
      }
    } catch (error) {
      console.error('❌ Error in create-payment:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Payment webhook (Cashfree)
app.post('/api/payment-webhook', async (req, res) => {
  try {
    const webhookData = req.body;
    console.log('📥 Payment webhook received:', webhookData);

    // Verify webhook signature (Cashfree sends signature in headers)
    const signature = req.headers['x-cashfree-signature'];
    if (signature) {
      // Verify signature if needed (implement based on Cashfree docs)
      // For now, we'll process the webhook
    }

    const { order_id, order_amount, payment_status, payment_message, cf_payment_id } = webhookData;

    if (!order_id) {
      console.error('❌ Webhook missing order_id');
      return res.status(400).json({ success: false, message: 'Missing order_id' });
    }

    // Get order from database
    const order = await db.getOrder(order_id);
    if (!order) {
      console.error('❌ Order not found:', order_id);
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Update order status
    await db.updateOrder(order_id, {
      status: payment_status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
      payment_id: cf_payment_id || webhookData.payment_id,
    });

    // If payment successful, generate and send access code
    if (payment_status === 'SUCCESS') {
      console.log('✅ Payment successful, generating access code for order:', order_id);

      // Check if access code already exists for this order
      const existingCode = await db.getCodeByCode(order_id);
      if (!existingCode) {
        // Generate access code
        const accessCode = generateAccessCode();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

        // Create access code in database
        await db.createAccessCode({
          code: accessCode,
          email: order.email,
          orderId: order_id,
          paymentId: cf_payment_id || webhookData.payment_id || 'webhook_payment',
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

      // Check payment status with Cashfree
      try {
        const cashfreeResponse = await fetch(`${CASHFREE_API_BASE}/pg/orders/${orderId}/payments`, {
          method: 'GET',
          headers: {
            'x-client-id': CASHFREE_APP_ID,
            'x-client-secret': CASHFREE_SECRET_KEY,
            'x-api-version': '2023-08-01',
          },
        });

        if (cashfreeResponse.ok) {
          const paymentData = await cashfreeResponse.json();
          const payment = paymentData[0]; // Get first payment

          if (payment && payment.payment_status === 'SUCCESS') {
            // Update order status
            await db.updateOrder(orderId, {
              status: 'SUCCESS',
              payment_id: payment.cf_payment_id,
            });

            // Check if access code exists, if not generate one
            const accessCode = await db.getCodeByEmail(order.email);
            if (!accessCode || accessCode.order_id !== orderId) {
              const newAccessCode = generateAccessCode();
              const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

              await db.createAccessCode({
                code: newAccessCode,
                email: order.email,
                orderId: orderId,
                paymentId: payment.cf_payment_id,
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
          }
        }
      } catch (error) {
        console.error('❌ Error checking Cashfree payment status:', error);
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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Tlangau Server Access Portal API running on port ${PORT}`);
  console.log(`🌐 Frontend available at http://localhost:${PORT}`);
  console.log(`📧 Email service: ${process.env.EMAIL_USER ? 'Configured' : 'Not configured'}`);
  console.log(`💳 Payment gateway: ${CASHFREE_APP_ID ? 'Configured (Cashfree)' : 'Not configured'}`);
});
