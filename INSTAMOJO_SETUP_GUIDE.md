# Instamojo Payment Gateway Setup Guide

Complete guide to set up and integrate Instamojo payment gateway with QR code and UPI ID support.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Instamojo Account Setup](#instamojo-account-setup)
3. [Get API Credentials](#get-api-credentials)
4. [Configure Environment Variables](#configure-environment-variables)
5. [Install Dependencies](#install-dependencies)
6. [Webhook Configuration](#webhook-configuration)
7. [Testing](#testing)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- Node.js installed (v14 or higher)
- Instamojo account (free to create)
- Publicly accessible backend URL (for webhooks)
- Gmail account for sending access codes

---

## Instamojo Account Setup

### Step 1: Create Instamojo Account

1. Go to [Instamojo](https://www.instamojo.com/)
2. Click **"Sign Up"** or **"Get Started"**
3. Choose **"Individual"** or **"Business"** account
4. Fill in your details:
   - Name
   - Email
   - Phone number
   - Password
5. Verify your email address

### Step 2: Complete KYC (Know Your Customer)

1. Log in to your Instamojo dashboard
2. Go to **Settings** → **Account Details**
3. Complete the KYC process:
   - Upload PAN card
   - Upload address proof (Aadhaar, Passport, etc.)
   - Add bank account details
   - Verify phone number

**Note:** KYC approval usually takes 1-3 business days. You can test payments in test mode while waiting.

### Step 3: Enable Payment Methods

1. Go to **Settings** → **Payment Methods**
2. Enable:
   - ✅ UPI
   - ✅ Credit/Debit Cards
   - ✅ Net Banking
   - ✅ Wallets

---

## Get API Credentials

### Step 1: Access Developer Section

1. Log in to your Instamojo dashboard
2. Go to **Settings** → **API & Plugins**
3. Click **"API Keys"**

### Step 2: Generate API Keys

1. You'll see two keys:
   - **API Key** (Public Key)
   - **Auth Token** (Private Key)

2. **For Testing:**
   - Use **Test Mode** keys (automatically generated)
   - Test mode URL: `https://test.instamojo.com/api/1.1`

3. **For Production:**
   - After KYC approval, use **Live Mode** keys
   - Production URL: `https://www.instamojo.com/api/1.1`

### Step 3: Copy Your Credentials

Copy both keys and save them securely. You'll need them in the next step.

**Example:**
```
API Key: test_1234567890abcdef
Auth Token: test_abcdef1234567890
```

---

## Configure Environment Variables

### Step 1: Create `.env` File

In your `tlangau-web` directory, create a `.env` file:

```bash
# Copy from ENV_TEMPLATE.txt
cp ENV_TEMPLATE.txt .env
```

### Step 2: Update `.env` File

Open `.env` and fill in your credentials:

```env
# Server Configuration
PORT=3001

# Email Configuration (Gmail)
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_gmail_app_password

# Instamojo Payment Gateway Configuration
INSTAMOJO_API_KEY=test_1234567890abcdef
INSTAMOJO_AUTH_TOKEN=test_abcdef1234567890
INSTAMOJO_ENV=test
# Use 'test' for testing, 'production' for live payments

# Frontend and Backend URLs
FRONTEND_URL=https://ruatfly.github.io/Tlangau
BACKEND_URL=https://your-backend-url.com
# For local testing with webhooks, use ngrok: https://ngrok.com/
```

### Step 3: Get Gmail App Password

1. Go to [Google Account Settings](https://myaccount.google.com/)
2. Navigate to **Security** → **2-Step Verification** (enable if not already)
3. Go to **App Passwords**
4. Generate a new app password for "Mail"
5. Copy the 16-character password
6. Paste it in `.env` as `EMAIL_PASS`

---

## Install Dependencies

### Step 1: Install Node Packages

```bash
cd tlangau-web
npm install
```

This will install:
- `axios` - For making HTTP requests to Instamojo API
- `qrcode` - For generating QR codes
- Other required dependencies

### Step 2: Verify Installation

```bash
npm list axios qrcode
```

You should see both packages listed.

---

## Webhook Configuration

Webhooks allow Instamojo to notify your server when a payment is completed.

### Step 1: Get Public URL for Backend

**For Production:**
- Deploy your backend to a service like:
  - Railway: https://railway.app/
  - Heroku: https://www.heroku.com/
  - Render: https://render.com/
  - DigitalOcean: https://www.digitalocean.com/

**For Local Testing:**
- Use **ngrok** to create a public tunnel:
  1. Download ngrok: https://ngrok.com/download
  2. Run: `ngrok http 3001`
  3. Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)

### Step 2: Configure Webhook in Instamojo

1. Go to **Settings** → **API & Plugins** → **Webhooks**
2. Click **"Add Webhook"**
3. Enter webhook URL:
   ```
   https://your-backend-url.com/api/payment-webhook
   ```
4. Select events:
   - ✅ Payment Completed
   - ✅ Payment Failed
5. Click **"Save"**

### Step 3: Update BACKEND_URL in `.env`

```env
BACKEND_URL=https://your-backend-url.com
# Or for ngrok: https://abc123.ngrok.io
```

---

## Testing

### Step 1: Start Your Server

```bash
cd tlangau-web
npm start
```

You should see:
```
🚀 Tlangau Server Access Portal API running on port 3001
🌐 Frontend available at http://localhost:3001
📧 Email service: Configured
💳 Payment gateway: Configured (Instamojo)
```

### Step 2: Test Payment Flow

1. Open your payment page: `http://localhost:3001/payment.html`
2. Enter your email address
3. Choose payment method:
   - **Scan QR Code**: QR code will be displayed
   - **Enter UPI ID**: Enter a test UPI ID (e.g., `test@paytm`)
4. Click **"Proceed to Payment"**

### Step 3: Test Payment (Test Mode)

**For QR Code:**
1. Scan the QR code with any UPI app
2. Use test credentials:
   - UPI ID: `success@razorpay` (simulates success)
   - Or use your real UPI app in test mode

**For UPI ID:**
1. Enter your UPI ID
2. Instamojo will send a payment request to that UPI ID
3. Complete payment in your UPI app

### Step 4: Verify Webhook

1. Check your server logs for:
   ```
   📥 Payment webhook received: {...}
   ✅ Payment successful, generating access code
   ✅ Access code created: ABC123XYZ456
   ✅ Access code email sent to user@example.com
   ```

### Step 5: Check Email

- You should receive an email with the access code
- The code should be 12 characters long
- Email should include expiry information (30 days)

---

## Production Deployment

### Step 1: Complete KYC

- Ensure your Instamojo account KYC is approved
- All documents are verified

### Step 2: Switch to Production Mode

1. Get production API keys from Instamojo dashboard
2. Update `.env`:
   ```env
   INSTAMOJO_API_KEY=live_1234567890abcdef
   INSTAMOJO_AUTH_TOKEN=live_abcdef1234567890
   INSTAMOJO_ENV=production
   ```

### Step 3: Update Webhook URL

1. Go to Instamojo dashboard → Webhooks
2. Update webhook URL to your production backend URL
3. Test the webhook

### Step 4: Deploy Backend

Deploy your backend to a hosting service:
- Railway (recommended for Node.js)
- Heroku
- Render
- DigitalOcean

### Step 5: Test Production Payments

1. Make a small test payment (₹1)
2. Verify webhook receives payment notification
3. Check access code is generated and emailed
4. Verify code works in your Flutter app

---

## Troubleshooting

### Issue: "Invalid API Key" Error

**Solution:**
- Verify you're using the correct API key and auth token
- Check if you're using test keys in production mode (or vice versa)
- Ensure there are no extra spaces in `.env` file

### Issue: Webhook Not Receiving Notifications

**Solution:**
- Verify webhook URL is publicly accessible
- Check webhook URL in Instamojo dashboard is correct
- Test webhook URL manually: `curl https://your-backend-url.com/api/payment-webhook`
- Check server logs for incoming requests

### Issue: QR Code Not Displaying

**Solution:**
- Check browser console for errors
- Verify `qrcode` package is installed: `npm list qrcode`
- Check backend logs for QR code generation errors
- Ensure payment link is created successfully

### Issue: UPI ID Validation Failing

**Solution:**
- UPI ID format: `username@provider`
- Valid examples: `yourname@paytm`, `yourname@phonepe`, `yourname@ybl`
- Check JavaScript console for validation errors
- Ensure UPI ID input field is visible when "Enter UPI ID" is selected

### Issue: Access Code Not Sent via Email

**Solution:**
- Verify Gmail app password is correct
- Check email service is configured: `EMAIL_USER` and `EMAIL_PASS`
- Check server logs for email sending errors
- Verify email address is valid
- Check spam folder

### Issue: Payment Status Not Updating

**Solution:**
- Verify webhook is configured correctly
- Check payment status in Instamojo dashboard
- Manually verify payment: Use `/api/verify-payment` endpoint
- Check database for order status updates

---

## API Endpoints Reference

### Create Payment Link
```
POST /api/create-payment
Body: {
  "email": "user@example.com",
  "upiId": "optional@paytm", // Optional, only for UPI ID method
  "amount": 1
}
```

### Verify Payment
```
POST /api/verify-payment
Body: {
  "orderId": "order_1234567890"
}
```

### Payment Webhook (Instamojo calls this)
```
POST /api/payment-webhook
Body: {
  "payment_request_id": "...",
  "payment_id": "...",
  "status": "Credit"
}
```

---

## Support

- **Instamojo Support**: https://support.instamojo.com/
- **Instamojo API Docs**: https://docs.instamojo.com/
- **Email Issues**: Check Gmail app password setup
- **Webhook Issues**: Verify public URL accessibility

---

## Security Best Practices

1. ✅ Never commit `.env` file to Git
2. ✅ Use environment variables for all sensitive data
3. ✅ Enable HTTPS for production
4. ✅ Verify webhook signatures (optional but recommended)
5. ✅ Keep API keys secure and rotate them periodically
6. ✅ Monitor payment logs for suspicious activity

---

## Next Steps

1. ✅ Complete Instamojo account setup
2. ✅ Get API credentials
3. ✅ Configure environment variables
4. ✅ Install dependencies
5. ✅ Set up webhook
6. ✅ Test payment flow
7. ✅ Deploy to production
8. ✅ Monitor payments and access code generation

---

**Need Help?** Check the troubleshooting section or contact support.
