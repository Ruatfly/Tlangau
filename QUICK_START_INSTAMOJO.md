# Quick Start: Instamojo Integration

Quick setup guide to get Instamojo payment gateway working in 5 minutes.

## 🚀 Quick Setup Steps

### 1. Get Instamojo API Keys (2 minutes)

1. Go to [Instamojo Dashboard](https://www.instamojo.com/)
2. Sign up or log in
3. Go to **Settings** → **API & Plugins** → **API Keys**
4. Copy your **API Key** and **Auth Token** (Test mode keys work for testing)

### 2. Configure Environment (1 minute)

1. Copy `ENV_TEMPLATE.txt` to `.env`:
   ```bash
   cp ENV_TEMPLATE.txt .env
   ```

2. Edit `.env` and add your credentials:
   ```env
   INSTAMOJO_API_KEY=test_your_api_key_here
   INSTAMOJO_AUTH_TOKEN=test_your_auth_token_here
   INSTAMOJO_ENV=test
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASS=your_gmail_app_password
   BACKEND_URL=http://localhost:3001
   ```

### 3. Install Dependencies (1 minute)

```bash
cd tlangau-web
npm install
```

### 4. Start Server (1 minute)

```bash
npm start
```

### 5. Test Payment

1. Open: `http://localhost:3001/payment.html`
2. Enter email and choose payment method
3. Click "Proceed to Payment"
4. QR code will appear (or payment link for UPI ID)

## ✅ That's It!

Your Instamojo integration is ready for testing!

## 📝 Next Steps

- **For Production**: Complete KYC and switch to production keys
- **For Webhooks**: Set up public URL (use ngrok for local testing)
- **Full Guide**: See `INSTAMOJO_SETUP_GUIDE.md` for detailed instructions

## 🔧 Common Issues

- **"Invalid API Key"**: Check your keys in `.env` file
- **QR Code not showing**: Run `npm install` to ensure `qrcode` package is installed
- **Webhook not working**: Use ngrok for local testing: `ngrok http 3001`

## 📚 More Help

- Full setup guide: `INSTAMOJO_SETUP_GUIDE.md`
- Instamojo docs: https://docs.instamojo.com/
- Support: Check troubleshooting section in setup guide
