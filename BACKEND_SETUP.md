# Backend Setup Guide

This guide will help you set up and deploy the backend server for the Tlangau web portal.

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Gmail account (for email service)
- Cashfree account (for payment processing)

## Local Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `ENV_TEMPLATE.txt` to `.env` and fill in your values:

```bash
# Windows
copy ENV_TEMPLATE.txt .env

# Linux/Mac
cp ENV_TEMPLATE.txt .env
```

Edit `.env` with your configuration:

```env
# Server Configuration
PORT=3001

# Email Configuration (Gmail)
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

# Cashfree Payment Gateway
CASHFREE_APP_ID=your_cashfree_app_id
CASHFREE_SECRET_KEY=your_cashfree_secret_key
CASHFREE_ENV=sandbox  # or 'production' for live

# URLs
FRONTEND_URL=https://ruatfly.github.io/Tlangau
BACKEND_URL=https://your-backend-url.com
```

### 3. Get Gmail App Password

1. Go to [Google Account Settings](https://myaccount.google.com/)
2. Enable 2-Step Verification
3. Go to [App Passwords](https://myaccount.google.com/apppasswords)
4. Generate a new app password for "Mail"
5. Use this password in `EMAIL_PASS`

### 4. Get Cashfree Credentials

1. Sign up at [Cashfree](https://www.cashfree.com)
2. Complete KYC (for production)
3. Get your App ID and Secret Key from the dashboard
4. Use sandbox credentials for testing

### 5. Start the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:3001`

## API Endpoints

### Health Check
- `GET /api/health` - Check if server is running

### Payment
- `POST /api/create-payment` - Create a payment order
  - Body: `{ "email": "user@example.com" }`
  - Returns: `{ "success": true, "orderId": "...", "paymentUrl": "..." }`

- `POST /api/verify-payment` - Verify payment status
  - Body: `{ "orderId": "order_123" }`
  - Returns: `{ "success": true, "paymentStatus": "SUCCESS" }`

- `POST /api/payment-webhook` - Cashfree webhook endpoint
  - Called by Cashfree when payment status changes

### Access Code (for Flutter app)
- `POST /api/validate-code` - Validate access code
  - Body: `{ "code": "ABC123", "email": "user@example.com" }`

- `POST /api/get-code-info` - Get code info by email
  - Body: `{ "email": "user@example.com" }`

## Deployment

### Option 1: Railway

1. Create account at [Railway](https://railway.app)
2. Create new project
3. Connect your GitHub repository
4. Add environment variables in Railway dashboard
5. Deploy!

### Option 2: Render

1. Create account at [Render](https://render.com)
2. Create new Web Service
3. Connect your GitHub repository
4. Set build command: `npm install`
5. Set start command: `npm start`
6. Add environment variables
7. Deploy!

### Option 3: Heroku

1. Create account at [Heroku](https://heroku.com)
2. Install Heroku CLI
3. Run:
   ```bash
   heroku create your-app-name
   heroku config:set EMAIL_USER=...
   heroku config:set EMAIL_PASS=...
   heroku config:set CASHFREE_APP_ID=...
   heroku config:set CASHFREE_SECRET_KEY=...
   heroku config:set CASHFREE_ENV=production
   heroku config:set FRONTEND_URL=https://ruatfly.github.io/Tlangau
   heroku config:set BACKEND_URL=https://your-app-name.herokuapp.com
   git push heroku main
   ```

## Cashfree Webhook Configuration

1. Log in to Cashfree Dashboard
2. Go to Settings → Webhooks
3. Add webhook URL: `https://your-backend-url.com/api/payment-webhook`
4. Select events: `PAYMENT_SUCCESS`, `PAYMENT_FAILED`
5. Save

## Testing

### Test Payment Flow

1. Start the server: `npm start`
2. Open frontend: `http://localhost:3001`
3. Go to payment page
4. Enter test email
5. Complete test payment (use Cashfree test credentials)
6. Check email for access code

### Test API Endpoints

```bash
# Health check
curl http://localhost:3001/api/health

# Create payment
curl -X POST http://localhost:3001/api/create-payment \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

## Troubleshooting

### Email not sending
- Check Gmail app password is correct
- Verify 2-Step Verification is enabled
- Check email is not in spam folder

### Payment not processing
- Verify Cashfree credentials are correct
- Check CASHFREE_ENV is set correctly (sandbox/production)
- Verify webhook URL is accessible
- Check Cashfree dashboard for payment status

### Database errors
- Database file (`access_codes.db`) will be created automatically
- Ensure write permissions in the directory
- Check database file is not corrupted

## Security Notes

- Never commit `.env` file to Git
- Keep Cashfree secret keys secure
- Use HTTPS in production
- Validate all webhook signatures
- Rate limit API endpoints

## Support

For issues or questions, check:
- [Cashfree Documentation](https://docs.cashfree.com)
- [Node.js Documentation](https://nodejs.org/docs)
- [Express.js Documentation](https://expressjs.com)
